import gplay from 'google-play-scraper';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {recentRelease, mergeApps} from './normalize.mjs';
import {enrichGenres} from './enrich-genres.mjs';
import {appleCountries,googleCountries,worldCountries} from '../assets/regions.js';
import {acquireCollection} from './collection-lock.mjs';
import {enrichMedia} from './enrich-media.mjs';

const now = new Date();
const stamp = now.toISOString();
const countries = worldCountries;
const json = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
await mkdir('data', {recursive:true});
try{await acquireCollection(process.cwd());}catch(error){console.error(error.message);process.exit(error.code==='COLLECTION_RUNNING'?75:1);}
const report=(phase,current,total)=>console.log('APPWHERE_PROGRESS '+JSON.stringify({phase,current,total}));
const old = await json('data/apps.json', {apps:[], sources:{}});
const cache = await json('data/checked.json', {});
const scanState = await json('data/scan-state.json', {androidCursor:0,androidCountries:{},pending:[]});
const found = [];
const sources = {};
const pause = ms => new Promise(r => setTimeout(r, ms));
async function pool(items, count, fn) {
  let next = 0;
  await Promise.all(Array.from({length:count}, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
async function fetchJSON(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        if ([400,403,404].includes(response.status)) error.permanent=true;
        throw error;
      }
      return await response.json();
    } catch (error) { if(error.permanent)throw error;last = error; await pause(1000 * (attempt + 1)); }
  }
  throw last;
}

async function apple() {
  report('apple',0,appleCountries.length);
  let successes = 0, failures = 0, valid = 0;
  const genres = ['6014'];
  const scannedCountries=[];
  const jobs = appleCountries.flatMap(country => genres.map(genre => ({country, genre})));
  await pool(jobs, 3, async ({country, genre}) => {
    try {
      const url = `https://itunes.apple.com/${country}/rss/newapplications/limit=100/${genre ? `genre=${genre}/` : ''}json`;
      const response = await fetchJSON(url);
      const entries = response.feed?.entry || [];
      if (!entries.length) throw new Error('Empty Apple feed');
      successes++;
      scannedCountries.push(country);
      for (const e of entries) {
        const releaseDate = recentRelease(e['im:releaseDate']?.label, now);
        const id = e.id?.attributes?.['im:id'];
        if (!id || !releaseDate) continue;
        const category = e.category?.attributes;
        if (category?.['im:id'] !== '6014') continue;
        const price = Number(e['im:price']?.attributes?.amount);
        found.push({
          id:`ios:${id}`, storeId:id, store:'ios', name:e['im:name']?.label || id,
          developer:e['im:artist']?.label || '', category:category?.label || 'Other',
          kind:'game',
          releaseDate, sourceReleaseDate:e['im:releaseDate']?.label, icon:e['im:image']?.at(-1)?.label || '',
          url:e.id.label, price:Number.isFinite(price) ? price : null,
          currency:e['im:price']?.attributes?.currency || '',
          countries:[country], firstSeenAt:stamp, checkedAt:stamp
        });
        valid++;
      }
    } catch (error) { failures++; console.warn(`Apple ${country}/${genre}: ${error.message}`); }
    if((successes+failures)%25===0||successes+failures===jobs.length)report('apple',successes+failures,jobs.length);
    await pause(500);
  });
  sources.ios = {status: successes && valid ? failures ? 'partial' : 'ok' : 'error',
    lastAttemptAt:stamp, lastSuccessAt:valid ? stamp : old.sources.ios?.lastSuccessAt || null,
    successfulRequests:successes, failedRequests:failures, scannedCountries:scannedCountries.sort(),targetCountries:appleCountries.length, method:'Apple newapplications RSS'};
  console.log(`Apple: ${successes} feeds, ${valid} recent records, ${failures} failed feeds`);
}

async function android() {
  report('google');
  // Search discovers candidates; only the store's original "released" date is eligible.
  // Discovery is sampled. It is not a complete or chronological Google Play feed.
  const terms = [`new games ${now.getUTCFullYear()}`,'new puzzle games','new casual games',
    'new simulation games','new strategy games','new action games',
    'new racing games','new adventure games','new arcade games','new role playing games'];
  const candidates = new Map((scanState.pending || []).map(candidate=>[candidate.key,candidate]));
  for (const app of old.apps.filter(a=>a.store==='android' && !a.sourceReleaseDate)) {
    const country=app.countries[0] || 'us';
    const key=`${app.storeId}:${country}`;
    candidates.set(key,{appId:app.storeId,country,key});
  }
  let searches = 0, searchErrors = 0, details = 0, detailErrors = 0, valid = 0;
  const appleNew = [...new Map(found.filter(a=>a.store==='ios').map(a=>[a.id,a])).values()]
    .sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate));
  const names = appleNew.filter(a=>a.kind==='game').slice(0,12).map(a=>a.name);
  const start = scanState.androidCursor % googleCountries.length;
  const batchCountries = Array.from({length:8},(_,index)=>googleCountries[(start+index)%googleCountries.length]);
  const jobs = [...batchCountries.map((country,index)=>({country,term:terms[(Math.floor(start/8)+index)%terms.length],num:30,worldIndex:(start+index)%googleCountries.length})),...names.map(term=>({country:batchCountries[0],term,num:5}))];
  let rateLimited = false;
  await pool(jobs, 1, async ({country,term,num,worldIndex}) => {
    if (rateLimited) return;
    try {
      const apps = await gplay.search({term,country,lang:'en',num,
        requestOptions:{timeout:30000}});
      if (!apps.length && num===30) throw new Error('Empty search result');
      searches++;
      scanState.androidCountries[country]=stamp;
      if(worldIndex!==undefined)scanState.androidCursor=(worldIndex+1)%googleCountries.length;
      for (const a of apps) {
        if (!a.appId) continue;
        const key = `${a.appId}:${country}`;
        const checked = cache[key];
        if (checked && now - new Date(checked) < 3 * 86400000 && !old.apps.some(existing=>existing.id===`android:${a.appId}`)) continue;
        candidates.set(key,{appId:a.appId,country,key});
      }
    } catch (error) {
      searchErrors++;
      if (String(error.message).includes('429')) rateLimited = true;
      else if(worldIndex!==undefined)scanState.androidCursor=(worldIndex+1)%googleCountries.length;
      console.warn(`Google search ${country}/${term}: ${error.message}`);
    }
    await pause(2500);
  });
  console.log(`Google: ${candidates.size} candidates from ${searches} searches`);
  if (rateLimited && candidates.size) await pause(45000);
  let detailRateLimited = false;
  const pending = new Map(candidates);
  report('details',0,Math.min(candidates.size,160));
  await pool([...candidates.values()].slice(0,160), 2, async ({appId,country,key}) => {
    if (detailRateLimited) return;
    try {
      const a = await gplay.app({appId,country,lang:'en',requestOptions:{timeout:30000}});
      details++;
      pending.delete(key);
      cache[key] = stamp;
      const releaseDate = recentRelease(a.released, now);
      if (!releaseDate || !a.genreId?.startsWith('GAME') || a.preregister || a.earlyAccessEnabled) return;
      found.push({id:`android:${appId}`,storeId:appId,store:'android',name:a.title,
        developer:a.developer || '', category:a.genre || 'Other',
        kind:a.genreId?.startsWith('GAME') ? 'game' : 'app', releaseDate, sourceReleaseDate:a.released,
        icon:a.icon || '',screenshots:(a.screenshots||[]).slice(0,3),url:a.url || `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`,
        price:typeof a.price === 'number' ? a.price : null,currency:a.currency || '',
        countries:[country],firstSeenAt:stamp,checkedAt:stamp});
      valid++;
    } catch (error) {
      detailErrors++;
      if (String(error.message).includes('429')) detailRateLimited = true;
      else pending.delete(key);
      console.warn(`Google detail ${appId}: ${error.message}`);
    }
    finally { if((details+detailErrors)%20===0)report('details',details+detailErrors,Math.min(candidates.size,160));await pause(1000); }
  });
  const cached = old.apps.some(a => a.store === 'android');
  scanState.pending=[...pending.values()];
  const healthy = searches > 0 && (details > 0 || (candidates.size === 0 && cached));
  sources.android = {status:healthy ? searchErrors || detailErrors ? 'partial' : 'ok' : 'error',
    lastAttemptAt:stamp,lastSuccessAt:healthy ? stamp : old.sources.android?.lastSuccessAt || null,
    successfulSearches:searches,failedRequests:searchErrors+detailErrors,checkedApps:details,
    scannedCountries:Object.keys(scanState.androidCountries).sort(),targetCountries:googleCountries.length,
    pendingDetails:scanState.pending.length,mode:'rotating-country-batches',
    method:'Google Play public search + original release date'};
  console.log(`Google: ${details} details, ${valid} recent records, ${detailErrors} failed details`);
}

await apple();
await android();
const apps = mergeApps(old.apps, found).filter(a=>a.kind==='game');
if (!apps.length) throw new Error('No valid store data. Existing files preserved.');
if (Object.values(sources).every(s => s.status === 'error')) throw new Error('Both sources failed. Existing files preserved.');
report('genres');
await enrichGenres(apps);
report('media');
await enrichMedia(apps);
report('saving');
const output = {schemaVersion:1,updatedAt:stamp,countries,sources,
  coverage:'Games only. Sampled discovery from Apple new-release feeds and Google Play searches. Not all game releases are covered. Dates are original store release dates, not update or discovery dates.', apps};
await writeFile('data/apps.json.tmp', JSON.stringify(output,null,2)+'\n');
await rename('data/apps.json.tmp','data/apps.json');
await writeFile('data/checked.json',JSON.stringify(cache)+'\n');
await writeFile('data/scan-state.json',JSON.stringify(scanState,null,2)+'\n');
console.log(`Saved ${apps.length} unique apps (${apps.filter(a=>a.store==='ios').length} iOS / ${apps.filter(a=>a.store==='android').length} Android).`);

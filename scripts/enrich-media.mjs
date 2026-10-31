import {readFile,writeFile,rename} from 'node:fs/promises';
import gplay from 'google-play-scraper';
import {appleGameTags,normalizeTags} from '../assets/genres.js';

export function storeScreenshots(values) {
  return [...new Set((values||[]).filter(value=>{
    try{const u=new URL(value);return u.protocol==='https:'&&['mzstatic.com','googleusercontent.com','ggpht.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}
  }))].slice(0,3);
}
export function appPageScreenshots(html,id) {
  const raw=html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if(!raw)return [];
  const payload=JSON.parse(raw);
  const page=payload.data?.find(entry=>String(entry.intent?.id)===String(id));
  const images=[];
  for(const [key,shelf] of Object.entries(page?.data?.shelfMapping||{})) {
    if(!key.startsWith('product_media'))continue;
    for(const item of shelf.items||[]) {
      const shot=item.screenshot;
      if(!shot?.template||!shot.width||!shot.height)continue;
      const width=shot.width>shot.height?960:480;
      const height=Math.round(width*shot.height/shot.width);
      images.push(shot.template.replace('{w}',width).replace('{h}',height).replace('{c}','bb').replace('{f}','jpg'));
    }
  }
  return storeScreenshots(images);
}
export async function enrichMedia(apps) {
  let cache;
  try{cache=JSON.parse(await readFile('assets/media.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;cache={schemaVersion:1,apps:{}};}
  const now=new Date();
  const pending=apps.filter(app=>!cache.apps[app.id] || now-new Date(cache.apps[app.id].checkedAt)>7*86400000);
  let requests=0,enriched=0,limited=false;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const remaining=new Set(pending.filter(app=>app.store==='ios'));
  async function apple(group,country) {
    for(let start=0;start<group.length;start+=100) {
      if(limited)return;
      const batch=group.slice(start,start+100);
      try {
        const url=new URL('https://itunes.apple.com/lookup');
        url.search=new URLSearchParams({id:batch.map(app=>app.storeId).join(','),country,entity:'software',limit:'200',lang:'en_us'});
        const response=await fetch(url,{signal:AbortSignal.timeout(30000)});requests++;
        if(!response.ok){if(response.status===429)limited=true;throw new Error(`HTTP ${response.status}`);}
        const data=await response.json();
        const byId=new Map((data.results||[]).map(app=>[String(app.trackId),app]));
        for(const app of batch) {
          const record=byId.get(String(app.storeId));if(!record)continue;
          const screenshots=storeScreenshots([...(record.screenshotUrls||[]),...(record.ipadScreenshotUrls||[]),...(record.appletvScreenshotUrls||[])]);
          cache.apps[app.id]={screenshots,tags:appleGameTags(record),checkedAt:now.toISOString()};
          remaining.delete(app);enriched++;
        }
      }catch(error){console.warn(`Store media (${country}): ${error.message}`);}
      if(requests%5===0)console.log(`Store media: ${enriched} games enriched…`);
      await pause(3200);
    }
  }
  await apple([...remaining],'us');
  const regionalCountry=app=>app.countries.includes('us')?'us':app.countries[0];
  for(const country of [...new Set([...remaining].map(regionalCountry))].filter(c=>c!=='us')) {
    if(limited)break;
    await apple([...remaining].filter(app=>regionalCountry(app)===country),country);
  }
  // Vision Pro, Apple Watch and some TV screenshots are exposed only on the
  // app's own product-media shelves, not in the iPhone/iPad lookup fields.
  for(const app of apps.filter(app=>app.store==='ios')) {
    const media=cache.apps[app.id];
    if(limited)break;
    if(!media || media.screenshots.length===3 || (media.pageCheckedAt && now-new Date(media.pageCheckedAt)<7*86400000))continue;
    try {
      const country=regionalCountry(app);
      const response=await fetch(`https://apps.apple.com/${country}/app/id${app.storeId}`,{signal:AbortSignal.timeout(30000)});
      if(!response.ok){if(response.status===429)limited=true;throw new Error(`HTTP ${response.status}`);}
      const screenshots=appPageScreenshots(await response.text(),app.storeId);
      if(screenshots.length>media.screenshots.length)media.screenshots=screenshots;
      media.pageCheckedAt=now.toISOString();
    }catch(error){console.warn(`Apple product media ${app.storeId}: ${error.message}`);}
    await pause(750);
  }
  let androidLimited=false;
  for(const app of pending.filter(app=>app.store==='android')) {
    if(androidLimited)break;
    try {
      const record=await gplay.app({appId:app.storeId,country:app.countries.includes('us')?'us':app.countries[0],lang:'en',requestOptions:{timeout:30000}});
      cache.apps[app.id]={screenshots:storeScreenshots(record.screenshots),tags:normalizeTags([record.genre]),checkedAt:now.toISOString()};enriched++;
    }catch(error){if(String(error.message).includes('429'))androidLimited=true;console.warn(`Google media ${app.storeId}: ${error.message}`);}
    await pause(1000);
  }
  // Keep a cached image when an upstream lookup fails; never invent a screenshot.
  for(const app of apps) {
    const media=cache.apps[app.id];
    if(media){app.screenshots=media.screenshots;app.tags=media.tags;}
  }
  cache.updatedAt=now.toISOString();
  await writeFile('assets/media.json.tmp',JSON.stringify(cache)+'\n');
  await rename('assets/media.json.tmp','assets/media.json');
  console.log(`Store media complete: ${enriched} enriched; ${apps.filter(app=>cache.apps[app.id]?.screenshots.length===3).length}/${apps.length} games have 3 screenshots.`);
  return cache;
}

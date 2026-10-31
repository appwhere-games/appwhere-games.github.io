import {gameTags} from './assets/genres.js';
import {worldCountries,countryName} from './assets/regions.js';
import {currentDay,untilNextDay} from './assets/day.js';
import {hosting} from './assets/hosting.js';
import {githubUpdateStatus,workflowPage} from './assets/github-updater.js';
const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat('tr-TR');
const longDate = new Intl.DateTimeFormat('tr-TR', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const shortDate = new Intl.DateTimeFormat('tr-TR', {day:'numeric',month:'long',timeZone:'UTC'});
const weekday = new Intl.DateTimeFormat('tr-TR',{weekday:'long',timeZone:'UTC'});
const dateObj = day => new Date(`${day}T12:00:00Z`);
let today = currentDay();
const formatTime = value => value ? new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(value)) : 'Henüz başarılı tarama yok';
const state = {store:'all',limit:24,apps:[],meta:null};
const fields = ['search','period','genre','country','price','from','to'];

function safeURL(value, hosts) {
  try {const url = new URL(value);return url.protocol === 'https:' && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;}
  catch {return null;}
}
function selected() {
  return Object.fromEntries(fields.map(id=>[id,$(`#${id}`).value]));
}
function baseFilter(app, filters, includeDates = true) {
  const query = filters.search.trim().toLocaleLowerCase('tr-TR');
  if (query && !`${app.name} ${app.developer}`.toLocaleLowerCase('tr-TR').includes(query)) return false;
  if (app.kind !== 'game') return false;
  if (filters.genre !== 'all' && !gameTags(app).includes(filters.genre)) return false;
  if (filters.country !== 'all' && !app.countries.includes(filters.country)) return false;
  if (filters.price === 'free' && app.price !== 0) return false;
  if (filters.price === 'paid' && !(app.price > 0)) return false;
  if (!includeDates) return true;
  if (filters.period === 'today') {
    return app.releaseDate===today;
  } else if (filters.period === 'custom') {
    if (filters.from && app.releaseDate < filters.from) return false;
    if (filters.to && app.releaseDate > filters.to) return false;
  } else if (filters.period !== 'all') {
    const cutoff = new Date(dateObj(today).getTime() - (Number(filters.period)-1)*86400000).toISOString().slice(0,10);
    if (app.releaseDate < cutoff) return false;
  }
  return app.releaseDate <= today;
}
function text(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}
function resetFilters() {
  $('#search').value='';$('#period').value='today';$('#genre').value='all';$('#country').value='all';$('#price').value='all';$('#from').value='';$('#to').value='';
  state.store='all';state.limit=24;render();
}
function emptyState(title, message, retry=false) {
  const el=text('div','empty');
  el.append(text('span','empty-icon','⌕'),text('h3','',title),text('p','',message));
  const button=text('button','',retry?'Yeniden dene':'Filtreleri sıfırla');
  button.addEventListener('click',retry?load:resetFilters);el.append(button);return el;
}
function appCard(app) {
  const card=$('#card-template').content.firstElementChild.cloneNode(true);
  const img=card.querySelector('img');
  const fallback=card.querySelector('.app-icon>span');
  fallback.textContent=app.name.charAt(0).toLocaleUpperCase('tr-TR');
  const useFallback=()=>{img.hidden=true;fallback.hidden=false;};
  img.addEventListener('error',useFallback,{once:true});
  const icon=safeURL(app.icon,['mzstatic.com','googleusercontent.com','ggpht.com']);
  if(icon) img.src=icon;else useFallback();
  const badge=card.querySelector('.store-badge');badge.textContent=app.store==='ios'?'App Store':'Google Play';
  badge.classList.toggle('android',app.store==='android');
  const link=card.querySelector('.app-name');link.textContent=app.name;link.title=app.name;
  const url=safeURL(app.url,app.store==='ios'?['apps.apple.com']:['play.google.com']);
  if(url) link.href=url;
  const storeLink=card.querySelector('.store-link');
  if(url)storeLink.href=url;
  storeLink.setAttribute('aria-label',`${app.name} — mağazada aç (yeni sekme)`);
  link.setAttribute('aria-label',`${app.name} — ${app.store==='ios'?'App Store':'Google Play'} mağazasında aç (yeni sekme)`);
  card.querySelector('.developer').textContent=app.developer;
  card.querySelector('.developer').title=app.developer;
  const tags=card.querySelector('.category');
  const genres=gameTags(app);
  tags.classList.add('genre-tags');
  if(!genres.length) tags.append(text('span','genre-unknown','Tür belirtilmemiş'));
  for(const genre of genres) {
    const tag=text('button','genre-tag',genre);
    tag.type='button';tag.setAttribute('aria-label',`${genre} türüne göre filtrele`);
    tag.addEventListener('click',()=>{$('#genre').value=genre;state.limit=24;render();});
    tags.append(tag);
  }
  let price='Ücret bilinmiyor';
  if(app.price===0) price='Ücretsiz';
  else if(app.price>0) {try{price=new Intl.NumberFormat('tr-TR',{style:'currency',currency:app.currency}).format(app.price);}catch{price=String(app.price);}}
  card.querySelector('.app-price').textContent=price;
  const pictures=[...new Set((app.screenshots||[]).map(value=>safeURL(value,['mzstatic.com','googleusercontent.com','ggpht.com'])).filter(Boolean))].slice(0,3);
  const gallery=card.querySelector('.screenshots');
  for(let index=0;index<3;index++) {
    const frame=text('button','screenshot-frame');frame.type='button';
    if(pictures[index]) {
      frame.setAttribute('aria-label',`${app.name} — mağaza görseli ${index+1}`);
      const shot=document.createElement('img');shot.src=pictures[index];shot.alt='';shot.loading='lazy';shot.decoding='async';shot.width=160;shot.height=284;
      shot.addEventListener('load',()=>{if(index===0&&shot.naturalWidth>shot.naturalHeight*1.15)gallery.classList.add('landscape');frame.classList.add('loaded');},{once:true});
      shot.addEventListener('error',()=>{shot.hidden=true;frame.disabled=true;frame.classList.add('missing');frame.append(text('span','screenshot-placeholder','Görsel yüklenemedi'));},{once:true});
      frame.append(shot,text('span','screenshot-index',`${index+1} / ${pictures.length}`));
      frame.addEventListener('click',()=>openGallery(app,pictures,index,url));
    } else {
      frame.classList.add('missing');frame.disabled=true;
      frame.setAttribute('aria-label','Mağazada bu görsel bulunmuyor');
      frame.append(text('span','screenshot-placeholder','Görsel yok'));
    }
    gallery.append(frame);
  }
  return card;
}
function updateArchive(filters) {
  const counts=new Map();
  for(const app of state.apps) {
    if(!baseFilter(app,filters,false) || (state.store!=='all' && state.store!==app.store)) continue;
    counts.set(app.releaseDate,(counts.get(app.releaseDate)||0)+1);
  }
  const fragment=document.createDocumentFragment();
  for(const [day,count] of [...counts.entries()].filter(([day])=>day!==today).slice(0,8)) {
    const button=text('button','');
    button.append(text('span','',shortDate.format(dateObj(day))),text('span','',number.format(count)));
    const chosen=filters.period==='custom' && filters.from===day && filters.to===day;
    button.classList.toggle('chosen',chosen);button.setAttribute('aria-pressed',String(chosen));
    button.addEventListener('click',()=>{$('#period').value='custom';$('#from').value=day;$('#to').value=day;state.limit=24;render();$('#feed').scrollIntoView({behavior:'instant'});});
    fragment.append(button);
  }
  if(!fragment.childNodes.length) fragment.append(text('p','muted','Geçmiş günlere ait kayıt yok.'));
  $('#archive').replaceChildren(fragment);
}
function render() {
  if(!state.meta)return;
  const filters=selected();
  const invalid=filters.period==='custom' && filters.from && filters.to && filters.from>filters.to;
  $('#date-error').hidden=!invalid;
  $('#custom-dates').hidden=filters.period!=='custom';
  const base=invalid?[]:state.apps.filter(app=>baseFilter(app,filters));
  for(const store of ['all','ios','android']) {
    const count=store==='all'?base.length:base.filter(a=>a.store===store).length;
    $(`#count-${store}`).textContent=number.format(count);
    const tab=$(`[data-store="${store}"]`);tab.classList.toggle('selected',state.store===store);tab.setAttribute('aria-pressed',String(state.store===store));
  }
  const matches=base.filter(app=>state.store==='all'||app.store===state.store);
  $('#result-count').textContent=number.format(matches.length);
  $('#reset').hidden=!(state.store!=='all'||filters.search||filters.period!=='today'||filters.genre!=='all'||filters.country!=='all'||filters.price!=='all');
  const todaySelected=filters.period==='today'||(filters.period==='custom'&&filters.from===today&&filters.to===today);
  const oneDay=filters.period==='custom'&&filters.from&&filters.from===filters.to;
  $('#view-kicker').textContent=todaySelected?'TODAY':oneDay?'ARŞİV':'KEŞFET';
  $('#heading').textContent=todaySelected?'Bugünün oyunları':oneDay?`${shortDate.format(dateObj(filters.from))} oyunları`:'Yeni çıkan oyunlar';
  $('#today-view').classList.toggle('active',todaySelected);
  $('#today-view').setAttribute('aria-pressed',String(todaySelected));
  $('#today-view').title=`${longDate.format(dateObj(today))} · Bugünün oyunları`;
  $('#today-count').textContent=number.format(state.apps.filter(app=>app.releaseDate===today).length);
  updateArchive(filters);
  const fragment=document.createDocumentFragment();
  const groups=new Map();
  const allCounts=new Map();
  for(const app of matches)allCounts.set(app.releaseDate,(allCounts.get(app.releaseDate)||0)+1);
  for(const app of matches.slice(0,state.limit)) {
    if(!groups.has(app.releaseDate))groups.set(app.releaseDate,[]);
    groups.get(app.releaseDate).push(app);
  }
  for(const [day,apps] of groups) {
    const section=text('section','day-group');
    const heading=text('div','day-heading');
    heading.append(text('h2','',longDate.format(dateObj(day))),text('span','day-week',weekday.format(dateObj(day))),text('span','day-line'),text('span','day-count',`${number.format(allCounts.get(day))} oyun`));
    const grid=text('div','app-grid');for(const app of apps)grid.append(appCard(app));
    section.append(heading,grid);fragment.append(section);
  }
  if(!matches.length)fragment.append(emptyState(invalid?'Tarih aralığını kontrol et':todaySelected?'Bugün için henüz oyun bulunamadı.':'Bu filtrelerde keşif yok.',invalid?'Bitiş tarihini başlangıç tarihinden sonraya al.':todaySelected?'Filtreleri değiştirebilir veya Oyunları güncelle ile yeni bir tarama başlatabilirsin.':'Başka bir gün veya mağaza seçerek keşfetmeye devam edebilirsin.'));
  $('#results').replaceChildren(fragment);$('#results').setAttribute('aria-busy','false');
  $('#more').hidden=matches.length<=state.limit;
  $('#more').firstChild.textContent=`Daha fazla göster (${number.format(Math.max(0,matches.length-state.limit))}) `;
}
async function load() {
  $('#results').setAttribute('aria-busy','true');
  try {
    const catalogURL=new URL('./data/apps.json',import.meta.url);
    const mediaURL=new URL('./assets/media.json',import.meta.url);
    if(hosting.mode==='github-pages'){const version=Date.now();catalogURL.searchParams.set('v',version);mediaURL.searchParams.set('v',version);}
    const [response,media]=await Promise.all([
      fetch(catalogURL,{cache:'no-cache'}),
      fetch(mediaURL,{cache:'no-cache'}).then(response=>response.ok?response.json():null).catch(()=>null)
    ]);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data.apps)||data.schemaVersion!==1)throw new Error('Invalid catalog');
    state.meta=data;
    const previousCountry=$('#country').value;
    const countryCodes=[...new Set([...worldCountries,...data.apps.flatMap(app=>app.countries||[])])];
    countryCodes.sort((a,b)=>countryName(a).localeCompare(countryName(b),'tr'));
    $('#country').replaceChildren(new Option('Tüm dünya','all'),...countryCodes.map(code=>new Option(countryName(code),code)));
    if(countryCodes.includes(previousCountry))$('#country').value=previousCountry;
    state.apps=data.apps.map(app=>{const cached=media?.apps?.[app.id];return {...app,screenshots:cached?.screenshots||app.screenshots||[],tags:cached?.tags||app.tags};})
      .filter(a=>a.kind==='game'&&typeof a.name==='string'&&['ios','android'].includes(a.store)&&/^\d{4}-\d{2}-\d{2}$/.test(a.releaseDate)&&Array.isArray(a.countries)&&a.releaseDate<=today)
      .sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate)||a.name.localeCompare(b.name));
    const genres=[...new Set(state.apps.flatMap(gameTags))].sort();
    const previousGenre=$('#genre').value;
    $('#genre').replaceChildren(new Option('Tüm oyun türleri','all'),...genres.map(genre=>new Option(genre,genre)));
    if(genres.includes(previousGenre)) $('#genre').value=previousGenre;
    $('#stat-total').textContent=number.format(state.apps.length);
    $('#sync-label').textContent=`Son tarama: ${formatTime(data.updatedAt)}`;
    const scanned = store => data.sources?.[store]?.scannedCountries?.length || new Set(data.apps.filter(app=>app.store===store).flatMap(app=>app.countries)).size;
    $('#world-coverage').textContent=`Dünya kapsamı · App Store: ${number.format(scanned('ios'))} ülke/bölge · Google Play: ${number.format(scanned('android'))} ülke/bölge tarandı. Google Play taraması ülkeler arasında sırayla ilerler.`;
    const issues=[];
    for(const store of ['ios','android']) {
      const source=data.sources?.[store];
      const label=store==='ios'?'App Store':'Google Play';
      const status=source?.status==='ok'?'Başarılı tarama':source?.status==='partial'?'Bazı istekler tamamlanamadı':'Son tarama başarısız';
      $(`#${store}-health`).textContent=`${status} · ${formatTime(source?.lastSuccessAt)} (TSİ)`;
      if(source?.status!=='ok')issues.push(`${label}: ${status.toLocaleLowerCase('tr-TR')}. Son başarılı kayıtlar gösteriliyor.`);
    }
    if(Date.now()-new Date(data.updatedAt).getTime()>48*3600000)issues.push('Veriler 48 saatten eski; son tarama anını yansıtıyor.');
    $('#source-warning').textContent=issues.join(' ');$('#source-warning').hidden=!issues.length;
    $('#about .source-dot').hidden=!issues.length;
    $('#about').title=issues.length?'Bazı kaynaklar güncellenemedi':'Veri kaynakları';
    render();
  } catch(error) {
    console.error('Catalog load failed:',error);
    $('#sync-label').textContent='Veriler alınamadı';
    $('#results').replaceChildren(emptyState('Akışa şu an ulaşılamıyor.','Bağlantını kontrol edip yeniden deneyebilirsin.',true));
    $('#results').setAttribute('aria-busy','false');
  }
}
for(const id of fields)$(`#${id}`).addEventListener(id==='search'?'input':'change',()=>{state.limit=24;render();});
for(const tab of document.querySelectorAll('[data-store]'))tab.addEventListener('click',()=>{state.store=tab.dataset.store;state.limit=24;render();});
$('#more').addEventListener('click',()=>{state.limit+=24;render();});
$('#reset').addEventListener('click',resetFilters);
$('#today-view').addEventListener('click',()=>{today=currentDay();resetFilters();$('#feed').scrollIntoView({behavior:'instant'});});
let dayTimer;
function syncDay() {
  clearTimeout(dayTimer);
  const next=currentDay();
  if(next!==today){today=next;state.limit=24;render();}
  dayTimer=setTimeout(syncDay,untilNextDay());
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDay();});
window.addEventListener('focus',syncDay);
syncDay();
for(const id of ['about'])$(`#${id}`).addEventListener('click',()=>$('#sources-dialog').showModal());
$('#close-dialog').addEventListener('click',()=>$('#sources-dialog').close());
$('#sources-dialog').addEventListener('click',e=>{if(e.target===$('#sources-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
let updateTimer=null;
let displayedUpdateId=null;
let observedUpdate=false;
let noticeTimer;
let githubLaunchUntil=0;
let githubBaseline=null;
let lastGithubRunId=null;
function showUpdate(job) {
  const running=job.status==='running';
  if(running)observedUpdate=true;
  clearTimeout(noticeTimer);
  $('#update-games').disabled=running;
  $('#update-games').setAttribute('aria-busy',String(running));
  $('#update-label').textContent=running?'Taranıyor…':'Güncelle';
  $('#update-status').hidden=!job.message||(job.status==='success'&&!observedUpdate);
  $('#update-status').textContent=job.message || '';
  $('#update-status').classList.toggle('update-error',job.status==='error');
  if(job.status==='success'&&observedUpdate)noticeTimer=setTimeout(()=>{$('#update-status').hidden=true;},6000);
}
async function checkUpdateStatus() {
  clearTimeout(updateTimer);
  try {
    if(hosting.mode==='github-pages') {
      const job=await githubUpdateStatus(hosting);
      if(githubLaunchUntil>Date.now()&&job.status!=='running'&&(job.id===githubBaseline||!githubBaseline)) {
        if(!githubBaseline)githubBaseline=job.id;
        updateTimer=setTimeout(checkUpdateStatus,30000);return;
      }
      lastGithubRunId=job.id;
      if(job.status==='running')githubLaunchUntil=0;
      showUpdate(job);
      if(job.status==='running')updateTimer=setTimeout(checkUpdateStatus,30000);
      if(job.status==='success'&&job.id!==displayedUpdateId){displayedUpdateId=job.id;await load();}
      return;
    }
    const response=await fetch('./api/update',{cache:'no-store'});
    if(response.status===404||response.status===405){showUpdate({status:'error',message:'Güncelleme için Appwhere yerel sunucusunu yeniden başlat.'});$('#update-games').disabled=true;return;}
    if(!response.ok)throw new Error('Update status unavailable');
    const job=await response.json();
    showUpdate(job);
    if(job.status==='running')updateTimer=setTimeout(checkUpdateStatus,3000);
    if(job.status==='success'&&job.id!==displayedUpdateId){displayedUpdateId=job.id;await load();}
  }catch {
    if(hosting.mode==='github-pages') {
      showUpdate({status:'idle',message:observedUpdate?'Tarama durumu şu an alınamıyor. Güncelle butonuyla GitHub tarama sayfasını açabilirsin.':''});
      return;
    }
    showUpdate({status:'running',message:'Tarama durumuna ulaşılamıyor. Bağlantı yeniden kontrol ediliyor…'});
    updateTimer=setTimeout(checkUpdateStatus,5000);
  }
}
$('#update-games').addEventListener('click',async()=>{
  clearTimeout(updateTimer);
  if(hosting.mode==='github-pages') {
    githubBaseline=lastGithubRunId;githubLaunchUntil=Date.now()+10*60000;
    window.open(workflowPage(hosting),'_blank','noopener,noreferrer');
    showUpdate({status:'idle',message:'GitHub sayfası açıldı. Run workflow ile taramayı başlatabilirsin. Oyunlar ayrıca her saat otomatik taranır.'});
    updateTimer=setTimeout(checkUpdateStatus,15000);
    return;
  }
  showUpdate({status:'running',message:'Tarama başlatılıyor. Bu işlem birkaç dakika sürebilir; oyunlara bakmaya devam edebilirsin.'});
  try {
    const response=await fetch('./api/update',{method:'POST',headers:{'X-Appwhere-Update':'1'}});
    if(!response.ok)throw new Error('Update could not be started');
    showUpdate(await response.json());
    updateTimer=setTimeout(checkUpdateStatus,1000);
  }catch{await checkUpdateStatus();}
});
let galleryState=null;
function displayGallery() {
  if(!galleryState)return;
  const {app,pictures,index,url}=galleryState;
  $('#media-title').textContent=app.name;
  const picture=pictures[index];
  $('#media-image').src=new URL(picture).hostname.endsWith('mzstatic.com')?picture.replace(/\/\d+x\d+bb\.(jpg|png|webp)(\?.*)?$/,'/1200x1600bb.$1$2'):picture;
  $('#media-image').alt=`${app.name} — mağaza ekran görüntüsü ${index+1}`;
  $('#media-counter').textContent=`${index+1} / ${pictures.length}`;
  $('#media-prev').disabled=index===0;
  $('#media-next').disabled=index===pictures.length-1;
  $('#media-store').hidden=!url;if(url)$('#media-store').href=url;
}
function openGallery(app,pictures,index,url) {
  galleryState={app,pictures,index,url};displayGallery();$('#media-dialog').showModal();
}
function moveGallery(delta) {
  if(!galleryState)return;
  galleryState.index=Math.max(0,Math.min(galleryState.pictures.length-1,galleryState.index+delta));displayGallery();
}
$('#close-media').addEventListener('click',()=>$('#media-dialog').close());
$('#media-prev').addEventListener('click',()=>moveGallery(-1));
$('#media-next').addEventListener('click',()=>moveGallery(1));
$('#media-dialog').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();moveGallery(event.key==='ArrowLeft'?-1:1);}});
$('#media-dialog').addEventListener('click',event=>{if(event.target===$('#media-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
load().then(checkUpdateStatus);

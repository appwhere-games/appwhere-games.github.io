import {appleGameTags,normalizeTags} from '../assets/genres.js';

export async function enrichGenres(apps) {
  const now = new Date();
  for(const app of apps) if(app.store==='android') app.tags=normalizeTags([app.category]);
  const pending=apps.filter(a=>a.store==='ios' && (!a.tagsCheckedAt || now-new Date(a.tagsCheckedAt)>7*86400000));
  let enriched=0,rateLimited=false;
  const remaining=new Set(pending);
  const lookupCountry = app => app.countries.includes('us')?'us':app.countries[0];
  async function lookupGroup(group,country) {
    for(let start=0;start<group.length;start+=100) {
      if(rateLimited)return;
      const batch=group.slice(start,start+100);
      try {
        const url=new URL('https://itunes.apple.com/lookup');
        url.search=new URLSearchParams({id:batch.map(a=>a.storeId).join(','),country,entity:'software',limit:'200'});
        const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
        if(!response.ok){if(response.status===429)rateLimited=true;throw new Error(`HTTP ${response.status}`);}
        const data=await response.json();
        if(!Array.isArray(data.results))throw new Error('Invalid Apple lookup');
        const byId=new Map(data.results.map(a=>[String(a.trackId),a]));
        for(const app of batch) {
          const result=byId.get(String(app.storeId));
          if(!result)continue;
          app.tags=appleGameTags(result);
          app.tagsCheckedAt=now.toISOString();
          remaining.delete(app);
          enriched++;
        }
      } catch(error) {console.warn(`Apple genre lookup (${country}): ${error.message}`);}
      await new Promise(resolve=>setTimeout(resolve,3200));
    }
  }
  // Most titles are also present in the US catalog. Resolve those in shared
  // batches, then use regional lookups only for titles that remain unavailable.
  await lookupGroup(pending,'us');
  for(const country of [...new Set([...remaining].map(lookupCountry))].filter(code=>code!=='us')) {
    if(rateLimited)break;
    await lookupGroup([...remaining].filter(app=>lookupCountry(app)===country),country);
  }
  const failed=remaining.size;
  console.log(`Game genres: ${enriched} iOS records enriched, ${failed} unavailable; existing tags preserved on failures.`);
  return {enriched,failed};
}

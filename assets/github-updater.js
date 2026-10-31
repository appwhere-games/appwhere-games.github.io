export function workflowPage(config) {
  return `https://github.com/${config.repository}/actions/workflows/${config.workflow}`;
}
export async function githubUpdateStatus(config,request=fetch) {
  const response=await request(`https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflow}/runs?per_page=1`,{headers:{Accept:'application/vnd.github+json'},cache:'no-cache'});
  if(!response.ok)throw new Error(`GitHub status ${response.status}`);
  const data=await response.json();
  const run=data.workflow_runs?.[0];
  if(!run)return {status:'idle',id:null,message:''};
  const base={id:`github-${run.id}`,url:run.html_url,startedAt:run.run_started_at};
  if(run.status!=='completed')return {...base,status:'running',message:'Yeni oyunlar taranıyor. Tamamlandığında liste yenilenecek.'};
  if(run.conclusion==='success')return {...base,status:'success',message:'Oyun listesi güncellendi.',updatedAt:run.updated_at};
  return {...base,status:'error',message:'Son tarama tamamlanamadı. Mevcut oyun listesi gösteriliyor.'};
}

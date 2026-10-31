import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubUpdateStatus,workflowPage} from '../assets/github-updater.js';
const config={repository:'appwhere-games/appwhere-games.github.io',workflow:'collect.yml'};
const request=run=>async url=>{assert.ok(url.includes('/appwhere-games/appwhere-games.github.io/actions/workflows/collect.yml/runs'));return new Response(JSON.stringify({workflow_runs:run?[run]:[]}));};
test('published site observes a running collection until the deployment finishes',async()=>{
  const job=await githubUpdateStatus(config,request({id:12,status:'in_progress'}));
  assert.equal(job.status,'running');assert.equal(job.id,'github-12');
  const done=await githubUpdateStatus(config,request({id:12,status:'completed',conclusion:'success'}));
  assert.equal(done.status,'success');assert.equal(done.id,job.id);
});
test('an empty run history stays idle and failed scans retain a useful error state',async()=>{
  assert.equal((await githubUpdateStatus(config,request(null))).status,'idle');
  assert.equal((await githubUpdateStatus(config,request({id:13,status:'completed',conclusion:'failure'}))).status,'error');
  await assert.rejects(githubUpdateStatus(config,async()=>new Response('',{status:403})),/GitHub status 403/);
});
test('manual live scans open the repository workflow without exposing credentials',()=>{
  assert.equal(workflowPage(config),'https://github.com/appwhere-games/appwhere-games.github.io/actions/workflows/collect.yml');
});

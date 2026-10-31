import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createAppServer} from '../scripts/serve.mjs';
import {createUpdater} from '../scripts/update-manager.mjs';

async function setup(t,fail=false) {
  const work=path.resolve('work');await mkdir(work,{recursive:true});
  const root=await mkdtemp(path.join(work,'update-test-'));
  await mkdir(path.join(root,'data'));
  await writeFile(path.join(root,'data','apps.json'),JSON.stringify({apps:[{id:'original'}],updatedAt:'old'}));
  const collector=path.join(root,'fixture.mjs');
  const lockModule=pathToFileURL(path.resolve('scripts/collection-lock.mjs')).href;
  await writeFile(collector,`import {appendFile,writeFile} from 'node:fs/promises';
import {acquireCollection} from ${JSON.stringify(lockModule)};
await acquireCollection(process.cwd());
await appendFile('runs.txt','run\\n');
console.log('APPWHERE_PROGRESS '+JSON.stringify({phase:'apple',current:25,total:175}));
await new Promise(resolve=>setTimeout(resolve,500));
${fail?"process.exit(1);":"await writeFile('data/apps.json',JSON.stringify({apps:[{id:'original'},{id:'new'}],updatedAt:new Date().toISOString()}));"}`);
  const updater=createUpdater(root,{collector});
  const server=createAppServer({root,updater});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(extra={})=>fetch(`${base}/api/update`,{method:'POST',headers:{'X-Appwhere-Update':'1',Origin:base,...extra}});
  const status=async()=>(await fetch(`${base}/api/update`)).json();
  t.after(async()=>{
    updater.stop();await new Promise(resolve=>server.close(resolve));
    if(!root.startsWith(work+path.sep))throw new Error('Unsafe test cleanup target');
    await rm(root,{recursive:true,force:true});
  });
  return {root,base,post,status,collector};
}
async function until(fn,predicate) {
  const deadline=Date.now()+8000;
  while(Date.now()<deadline){const value=await fn();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,30));}
  throw new Error('Update did not reach expected state');
}
test('the HTTP button starts one real child, reports progress and completes with a new catalog',async t=>{
  const {root,base,post,status}=await setup(t);
  assert.equal((await post({Origin:'https://unrelated.example'})).status,403);
  assert.equal((await fetch(`${base}/api/update`,{method:'POST'})).status,403);
  assert.equal((await fetch(`${base}/api/update`,{method:'DELETE'})).status,405);
  assert.equal((await status()).status,'idle');
  const starts=await Promise.all([post(),post(),post()]);
  const jobs=await Promise.all(starts.map(r=>{assert.equal(r.status,202);return r.json();}));
  assert.equal(new Set(jobs.map(job=>job.id)).size,1);
  const progress=await until(status,job=>job.phase==='apple');
  assert.ok(progress.message.includes('25/175'));
  assert.equal((await status()).id,jobs[0].id);
  const done=await until(status,job=>job.status==='success');
  assert.equal(done.total,2);
  assert.ok(done.message.includes('1 yeni oyun'));
  assert.equal((await readFile(path.join(root,'runs.txt'),'utf8')).trim(),'run');
  assert.equal(JSON.parse(await(await fetch(`${base}/data/apps.json`)).text()).apps.length,2);
  assert.equal((await fetch(`${base}/data/checked.json`)).status,404);
  assert.equal((await fetch(`${base}/data/.collection.lock`)).status,404);
});
test('a failed collection preserves the catalog and allows another attempt',async t=>{
  const {root,post,status}=await setup(t,true);
  const first=await(await post()).json();
  await until(status,job=>job.status==='error');
  assert.equal(JSON.parse(await readFile(path.join(root,'data/apps.json'),'utf8')).apps.length,1);
  const second=await(await post()).json();
  assert.notEqual(first.id,second.id);
  await until(status,job=>job.status==='error');
});
test('a manually launched scan is adopted after a page or server reload; stale locks recover',async t=>{
  const {root,post,status,collector}=await setup(t);
  await writeFile(path.join(root,'data','.collection.lock'),JSON.stringify({pid:2147483647,startedAt:new Date().toISOString()}));
  const manual=spawn(process.execPath,[collector],{cwd:root,windowsHide:true,stdio:'ignore'});
  t.after(()=>manual.kill());
  const active=await until(status,job=>job.phase==='external');
  assert.equal((await(await post()).json()).id,active.id);
  const done=await until(status,job=>job.status==='success');
  assert.equal(done.total,2);
  assert.equal((await readFile(path.join(root,'runs.txt'),'utf8')).trim(),'run');
});

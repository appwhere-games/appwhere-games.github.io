import {open,readFile,unlink} from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import path from 'node:path';

export async function activeCollection(root) {
  try {
    const lock=JSON.parse(await readFile(path.join(root,'data','.collection.lock'),'utf8'));
    if(!Number.isInteger(lock.pid)||lock.pid<1)return null;
    try{process.kill(lock.pid,0);return lock;}catch(error){if(error.code==='EPERM')return lock;return null;}
  }catch{return null;}
}
export async function acquireCollection(root) {
  const file=path.join(root,'data','.collection.lock');
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const handle=await open(file,'wx');
      await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await handle.close();
      process.once('exit',()=>{try{unlinkSync(file);}catch{}});return;
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      await new Promise(resolve=>setTimeout(resolve,100));
      if(await activeCollection(root)) {const busy=new Error('Bir oyun taraması zaten çalışıyor.');busy.code='COLLECTION_RUNNING';throw busy;}
      await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  }
  throw new Error('Tarama kilidi alınamadı.');
}

import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {activeCollection} from './collection-lock.mjs';

export function createUpdater(root,{collector=path.join(root,'scripts','collect.mjs')}={}) {
  let state={status:'idle',id:null,message:'',phase:null};
  let child=null,external=false,baseline=0;
  const snapshot=()=>({...state});
  const catalog=async()=>JSON.parse(await readFile(path.join(root,'data','apps.json'),'utf8'));
  async function finish(ok) {
    external=false;
    if(ok) {
      try {
        const data=await catalog();
        state={...state,status:'success',phase:'done',finishedAt:new Date().toISOString(),message:`Güncellendi · ${data.apps.length} oyun · ${Math.max(0,data.apps.length-baseline)} yeni oyun.`,total:data.apps.length,updatedAt:data.updatedAt};return;
      }catch{}
    }
    state={...state,status:'error',phase:'error',finishedAt:new Date().toISOString(),message:'Tarama tamamlanamadı. Mevcut oyunları görmeye devam edebilir, yeniden deneyebilirsin.'};
  }
  async function status() {
    if(!child) {
      const lock=await activeCollection(root);
      if(lock && state.status!=='running') {
        external=true;baseline=(await catalog().catch(()=>({apps:[]}))).apps.length;
        state={status:'running',id:`external-${lock.pid}`,phase:'external',startedAt:lock.startedAt,message:'Başka bir pencerede başlatılan oyun taraması sürüyor…'};
      } else if(external && !lock) {
        const modified=await stat(path.join(root,'data','apps.json')).catch(()=>null);
        await finish(Boolean(modified && modified.mtimeMs>=Date.parse(state.startedAt)));
      }
    }
    return snapshot();
  }
  function progress(line) {
    if(!line.startsWith('APPWHERE_PROGRESS '))return;
    try {
      const info=JSON.parse(line.slice(18));
      const count=Number.isInteger(info.current)&&Number.isInteger(info.total)?`${info.current}/${info.total}`:'';
      const messages={apple:`App Store: ${count ? count+' ülke/bölge tarandı.' : 'yeni oyunlar taranıyor…'}`,google:'Google Play: sıradaki ülkelerde yeni oyunlar aranıyor…',details:`Google Play: ${count ? count+' oyun kontrol edildi.' : 'çıkış tarihleri kontrol ediliyor…'}`,genres:'Oyun türleri tamamlanıyor…',media:'Mağaza görselleri alınıyor…',saving:'Güncel oyun listesi kaydediliyor…'};
      if(messages[info.phase])state={...state,phase:info.phase,message:messages[info.phase]};
    }catch{}
  }
  async function start() {
    if(state.status==='running')return snapshot();
    state={status:'running',id:randomUUID(),phase:'starting',startedAt:new Date().toISOString(),message:'Tarama başlatılıyor…'};
    try {
      baseline=(await catalog().catch(()=>({apps:[]}))).apps.length;
      const lock=await activeCollection(root);
      if(lock) {external=true;state={...state,id:`external-${lock.pid}`,phase:'external',startedAt:lock.startedAt,message:'Oyun taraması zaten sürüyor…'};return snapshot();}
      child=spawn(process.execPath,[collector],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let buffer='';
      child.stdout.on('data',chunk=>{buffer+=chunk.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop().slice(-8192);for(const line of lines)progress(line);});
      child.stderr.on('data',()=>{});
      child.once('error',()=>{child=null;void finish(false);});
      child.once('close',code=>{if(buffer)progress(buffer);child=null;void finish(code===0);});
    }catch{child=null;await finish(false);}
    return snapshot();
  }
  return {start,status,stop:()=>child?.kill()};
}

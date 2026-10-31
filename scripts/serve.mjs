import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createUpdater} from './update-manager.mjs';

export function createAppServer({root=path.resolve('.'),updater=createUpdater(root)}={}) {
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
  const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    try {
      const port=server.address()?.port;
      const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
      if(!hosts.includes(req.headers.host)){send(res,403,{error:'Geçersiz yerel adres.'});return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname==='/api/update') {
        if(req.method==='GET'){send(res,200,await updater.status());return;}
        if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(res,405,{error:'Desteklenmeyen istek.'});return;}
        const allowedOrigins=hosts.map(host=>`http://${host}`);
        if(req.headers['x-appwhere-update']!=='1' ||
          (req.headers.origin&&!allowedOrigins.includes(req.headers.origin)) ||
          (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin')) {
          send(res,403,{error:'Güncelleme yalnızca bu siteden başlatılabilir.'});return;
        }
        send(res,202,await updater.start());return;
      }
      if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Desteklenmeyen istek.'});return;}
      const file=path.resolve(root,`.${pathname.endsWith('/')?pathname+'index.html':pathname}`);
      const relative=path.relative(root,file);
      const parts=relative.split(path.sep);
      if(relative.startsWith('..')||path.isAbsolute(relative)||parts.some(p=>p.startsWith('.'))||!['index.html','style.css','app.js','assets','data'].includes(parts[0])||(parts[0]==='data'&&relative!==path.join('data','apps.json')))throw new Error('Forbidden');
      const bytes=await readFile(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Dosya bulunamadı.');}
  });
  server.on('close',()=>updater.stop());
  return server;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4173);
  const updater=createUpdater(path.resolve('.'));
  const server=createAppServer({updater});
  server.listen(port,'127.0.0.1',()=>console.log(`Appwhere preview: http://127.0.0.1:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{updater.stop();server.close(()=>process.exit(0));});
}

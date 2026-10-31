import {mkdir,readFile,writeFile,copyFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const work=path.resolve(root,'work');
const output=path.resolve(work,'pages');
if(path.relative(work,output)!=='pages'||!output.startsWith(root+path.sep))throw new Error('Unsafe Pages output directory');
await rm(output,{recursive:true,force:true});
await mkdir(path.join(output,'assets'),{recursive:true});
await mkdir(path.join(output,'data'),{recursive:true});
for(const file of ['index.html','style.css','app.js'])await copyFile(path.join(root,file),path.join(output,file));
for(const file of await readdir(path.join(root,'assets'),{withFileTypes:true})) {
  if(file.isFile()&&!file.name.startsWith('.')&&/\.(js|json|svg|png|jpg|jpeg|webp|avif|woff2|css)$/.test(file.name))await copyFile(path.join(root,'assets',file.name),path.join(output,'assets',file.name));
}
await copyFile(path.join(root,'data','apps.json'),path.join(output,'data','apps.json'));
const repository=process.env.GITHUB_REPOSITORY||'Anilseye/appwhere';
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error('Invalid repository');
const config={mode:'github-pages',repository,workflow:'collect.yml',branch:'main'};
await writeFile(path.join(output,'assets','hosting.js'),`export const hosting=${JSON.stringify(config)};\n`);
await writeFile(path.join(output,'.nojekyll'),'');
const data=JSON.parse(await readFile(path.join(output,'data','apps.json'),'utf8'));
console.log(`Appwhere Pages ready: ${data.apps.length} games, ${repository}, ${output}`);

import { mkdir, cp, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32')throw new Error('The portable Windows build requires Windows and its .NET Framework C# compiler.');
const nodeVersion='v24.22.3',name=`node-${nodeVersion}-win-x64`,cache=join(root,'.cache','node-runtime'),archive=join(cache,name+'.zip');
await mkdir(cache,{recursive:true});
const base=`https://nodejs.org/dist/${nodeVersion}/`;
const sums=await fetch(base+'SHASUMS256.txt').then(r=>{if(!r.ok)throw new Error('Cannot read official Node checksums.');return r.text();});
const expected=sums.split('\n').find(line=>line.trim().endsWith(name+'.zip'))?.trim().split(/\s+/)[0];
if(!expected)throw new Error('The pinned Node Windows archive is missing from official checksums.');
let bytes;try{bytes=await readFile(archive);}catch{}
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==expected){console.log(`Downloading official Node ${nodeVersion} runtime…`);const response=await fetch(base+name+'.zip');if(!response.ok)throw new Error('Runtime download failed.');bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Node archive checksum mismatch.');await writeFile(archive,bytes);}
const psQuote=value=>"'"+value.replaceAll("'","''")+"'";
const unpacked=join(cache,name);try{await access(join(unpacked,'node.exe'));}catch{const expanded=spawnSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${psQuote(archive)} -DestinationPath ${psQuote(cache)} -Force`],{windowsHide:true,stdio:'inherit'});if(expanded.status!==0)throw new Error('Runtime extraction failed.');}
const out=join(root,'dist','sonic-orbit-windows-x64');await mkdir(join(out,'runtime'),{recursive:true});
for(const file of ['package.json','package-lock.json','server.mjs','stem-jobs.mjs','tracking-bridge.mjs','README.md','LICENSE','THIRD_PARTY_NOTICES.md','Start-SonicOrbit.cmd','Stop-SonicOrbit.cmd','Setup-AI.cmd'])await copyFile(join(root,file),join(out,file));
await cp(join(root,'public'),join(out,'public'),{recursive:true,filter:path=>!path.endsWith('.task')});
await cp(join(root,'docs'),join(out,'docs'),{recursive:true});
await mkdir(join(out,'scripts'),{recursive:true});for(const file of ['setup-tracking.mjs','prepare-stems.py','Convert-Video.ps1'])await copyFile(join(root,'scripts',file),join(out,'scripts',file));
await mkdir(join(out,'node_modules','@mediapipe'),{recursive:true});
await cp(join(root,'node_modules','@mediapipe','tasks-vision'),join(out,'node_modules','@mediapipe','tasks-vision'),{recursive:true,filter:path=>!path.endsWith('.map')});
await copyFile(join(unpacked,'node.exe'),join(out,'runtime','node.exe'));await copyFile(join(unpacked,'LICENSE'),join(out,'runtime','NODE-LICENSE.txt'));
await writeFile(join(out,'runtime','PROVENANCE.txt'),`Node ${nodeVersion} Windows x64\nSource: ${base+name+'.zip'}\nArchive SHA-256: ${expected}\nUnmodified runtime; upstream license in NODE-LICENSE.txt\n`);
const compiler=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');await access(compiler);
const result=spawnSync(compiler,['/nologo','/target:winexe','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/win32icon:'+join(root,'public','brand','sonic-orbit.ico'),'/out:'+join(out,'SonicOrbit.exe'),join(root,'desktop','windows','Launcher.cs')],{windowsHide:true,stdio:'inherit'});
if(result.status!==0)throw new Error('Windows launcher compilation failed.');
console.log(`Built portable Windows player: ${out}\nNode runtime bundled; camera model downloads on first enable. AI separation is optional setup.`);

import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'dist/sonic-orbit-web');
const files=['version.js','audio-engine.js','sound-settings.js','dsp-math.js','orientation.js','scene-math.js','measured-hrtf.js','peak-guard.js','sdk/spatial-audio.js','sdk/source-geometry.js','sdk/spatial-audio.d.ts','hrtf/H3.json','hrtf/H17.json','hrtf/H3.bin','hrtf/H17.bin','hrtf/LICENSE.txt','hrtf/NOTICE.txt'];
// Check all assets before writing a new bundle. No camera or personal media files.
for(const file of files){try{await stat(resolve(root,'public',file));}catch{throw new Error(`Missing SDK asset: ${file}. For measured profiles, run scripts/prepare-hrtf.py first.`);}}
for(const file of files){const target=resolve(out,file);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,'public',file),target);}
await copyFile(resolve(root,'docs/web-sdk.md'),resolve(out,'README.md'));
await copyFile(resolve(root,'LICENSE'),resolve(out,'LICENSE'));
const {version}=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(root,'package.json'),'utf8'));
await writeFile(resolve(out,'package.json'),JSON.stringify({name:'sonic-orbit-web',version,license:'MIT',private:true,type:'module',exports:{'.':{types:'./sdk/spatial-audio.d.ts',import:'./sdk/spatial-audio.js'}}},null,2)+'\n');
console.log(`Built browser SDK: ${out}\n${files.length} runtime/type/license files. Serve this folder over localhost/HTTPS; it is not a Unity/Unreal binary.`);

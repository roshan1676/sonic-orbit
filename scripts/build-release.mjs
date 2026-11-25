import { cp, mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),{version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
function run(script){const result=spawnSync(process.execPath,[join(root,'scripts',script)],{cwd:root,windowsHide:true,stdio:'inherit'});if(result.status!==0)throw new Error(`${script} failed.`);}
run('build-extension.mjs');run('build-android.mjs');run('build-windows.mjs');
const out=join(root,'dist','release'),stage=join(root,'.cache','release-staging',String(Date.now()));await mkdir(out,{recursive:true});await mkdir(stage,{recursive:true});
const safe=path=>!relative(root,path).split(sep).some(part=>['.git','.cache','.venv-audio','test-results'].includes(part))&&!/\.(?:keystore|jks|mp4|mp3|wav|webm|task)$/i.test(path);
const packages=[['sonic-orbit-windows-x64','windows-x64'],['sonic-orbit-extension','browser-extension'],['sonic-orbit-web','web-sdk']];
const assets=[];
for(const [folder,suffix]of packages){const source=join(root,'dist',folder),target=join(stage,folder);await cp(source,target,{recursive:true,filter:safe});const name=`SonicOrbit-${version}-${suffix}.zip`;zip(target,join(out,name));assets.push(name);}
const docs=join(stage,'sonic-orbit-documentation');await mkdir(docs,{recursive:true});await cp(join(root,'docs'),join(docs,'docs'),{recursive:true});await copyFile(join(root,'README.md'),join(docs,'README.md'));await copyFile(join(root,'LICENSE'),join(docs,'LICENSE'));await copyFile(join(root,'THIRD_PARTY_NOTICES.md'),join(docs,'THIRD_PARTY_NOTICES.md'));
const docsName=`SonicOrbit-${version}-documentation.zip`;zip(docs,join(out,docsName));assets.push(docsName);
const apkName=`SonicOrbit-${version}-android.apk`;await copyFile(join(root,'dist','sonic-orbit-android-debug.apk'),join(out,apkName));assets.push(apkName);
const rows=[];for(const name of assets){const bytes=await readFile(join(out,name));rows.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);console.log(`${name} · ${(bytes.length/1048576).toFixed(1)} MiB`);}
await writeFile(join(out,'SHA256SUMS.txt'),rows.join('\n')+'\n');await writeFile(join(out,'release-assets.json'),JSON.stringify({version,assets:[...assets,'SHA256SUMS.txt']},null,2)+'\n');console.log(`Release assets ready: ${out}`);
function zip(source,target){const quote=value=>"'"+value.replaceAll("'","''")+"'";const result=spawnSync('powershell.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath ${quote(source)} -DestinationPath ${quote(target)} -Force`],{windowsHide:true,stdio:'inherit'});if(result.status!==0)throw new Error('ZIP packaging failed.');}

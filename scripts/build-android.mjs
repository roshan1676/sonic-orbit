import { cp, mkdir, access, readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import './build-sdk.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if(process.platform!=='win32')throw new Error('This preview build helper currently targets the installed Windows Android SDK.');
function run(file,args,options={}){const result=spawnSync(file,args,{windowsHide:true,encoding:'utf8',...options});if(result.stdout?.trim())console.log(result.stdout.trim());if(result.stderr?.trim())console.log(result.stderr.trim());if(result.error||result.status!==0)throw new Error(`${file} failed: ${result.error?.message||result.status}`);return result;}
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||join(process.env.LOCALAPPDATA,'Android','Sdk');
const tools=join(sdk,'build-tools','36.0.0'),platform=join(sdk,'platforms','android-35','android.jar');
const properties=spawnSync('java',['-XshowSettings:properties','-version'],{windowsHide:true,encoding:'utf8'});
const jdk=/java\.home\s*=\s*([^\r\n]+)/.exec(properties.stderr||'')?.[1].trim();if(!jdk)throw new Error('Install a Java JDK (17+) and put java on PATH.');
const java=join(jdk,'bin','java.exe'),javac=join(jdk,'bin','javac.exe'),keytool=join(jdk,'bin','keytool.exe');
for(const file of [java,javac,keytool,platform,join(tools,'aapt2.exe'),join(tools,'aapt.exe'),join(tools,'zipalign.exe'),join(tools,'lib','d8.jar'),join(tools,'lib','apksigner.jar')])await access(file);
const build=join(root,'.cache','android-build',String(Date.now())),classes=join(build,'classes'),dex=join(build,'dex'),assets=join(build,'assets');
for(const path of [build,classes,dex,assets])await mkdir(path,{recursive:true});
await cp(join(root,'mobile','android','assets'),assets,{recursive:true});await cp(join(root,'dist','sonic-orbit-web'),join(assets,'audio'),{recursive:true});
const unsigned=join(build,'unsigned.apk'),aligned=join(build,'aligned.apk'),out=join(root,'dist','sonic-orbit-android-debug.apk');
const resources=join(build,'resources.zip');
run(join(tools,'aapt2.exe'),['compile','--dir',join(root,'mobile','android','res'),'-o',resources]);
run(join(tools,'aapt2.exe'),['link','-o',unsigned,'-I',platform,'--manifest',join(root,'mobile','android','AndroidManifest.xml'),'-A',assets,'--min-sdk-version','26','--target-sdk-version','35','--version-code','1','--version-name',version,resources]);
run(javac,['-encoding','UTF-8','-source','8','-target','8','-bootclasspath',join(tools,'core-lambda-stubs.jar')+';'+platform,'-d',classes,join(root,'mobile','android','src','io','github','roshan1676','sonicorbit','MainActivity.java')]);
async function classFiles(path){const entries=await readdir(path,{withFileTypes:true}),files=[];for(const entry of entries){const file=join(path,entry.name);if(entry.isDirectory())files.push(...await classFiles(file));else if(entry.name.endsWith('.class'))files.push(file);}return files;}
run(java,['-cp',join(tools,'lib','d8.jar'),'com.android.tools.r8.D8','--lib',platform,'--min-api','26','--output',dex,...await classFiles(classes)]);
run(join(tools,'aapt.exe'),['add','-f',unsigned,'classes.dex'],{cwd:dex});
run(join(tools,'zipalign.exe'),['-f','4',unsigned,aligned]);
const keys=join(root,'.cache','android-debug.keystore');let hasKeys=true;try{await access(keys);}catch{hasKeys=false;}
if(!hasKeys)run(keytool,['-genkeypair','-keystore',keys,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=SonicOrbit Local Debug,O=Local Development,C=IN']);
run(java,['-jar',join(tools,'lib','apksigner.jar'),'sign','--ks',keys,'--ks-pass','pass:android','--key-pass','pass:android','--ks-key-alias','androiddebugkey','--out',out,aligned]);
run(java,['-jar',join(tools,'lib','apksigner.jar'),'verify','--verbose',out]);
run(join(tools,'aapt.exe'),['dump','badging',out]);
console.log(`Built debug APK: ${out}\nLocal-file player only. Not installed, store-published, or validated on a phone by this build.`);

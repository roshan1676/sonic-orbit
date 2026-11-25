import { createSpatialAudio } from './audio/sdk/spatial-audio.js';
const $=id=>document.getElementById(id),media=$('media');
let sdk,pending;
const settings={mode:'enhanced',bass:2,clarity:1,space:85,room:12,volume:50,theatre:15,yaw:0};
const fields=[['bass','Bass',-6,6,.5,' dB'],['clarity','Voice presence',-2,6,.5,' dB'],['space','Surround blend',0,100,1,'%'],['theatre','Short room reflections',0,60,1,'%'],['volume','Listening volume',0,100,1,'%'],['yaw','Head turn preview',-180,180,5,'°']];
function apply(){sdk?.update(settings);sdk?.setSceneOptions({theatre:settings.theatre});sdk?.setHeadPose(settings.yaw*Math.PI/180,0);}
for(const[key,title,min,max,step,suffix]of fields){const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');label.textContent=title;input.type='range';Object.assign(input,{min,max,step,value:settings[key]});output.textContent=settings[key]+suffix;input.oninput=()=>{settings[key]=Number(input.value);output.textContent=settings[key]+suffix;apply();};label.append(output,input);$('fields').append(label);}
async function ensureAudio(){
  if(!pending)pending=(async()=>{const next=await createSpatialAudio({settings});try{next.attachMediaElement(media);sdk=next;apply();$('engine-info').textContent=`${sdk.context.sampleRate/1000} kHz · Web Audio renderer · ${sdk.version}`;return sdk;}catch(error){await next.dispose();throw error;}})().catch(error=>{pending=null;throw error;});
  const result=await pending;await result.resume();return result;
}
$('open').onclick=()=>{media.pause();if(window.Sound360Android)window.Sound360Android.chooseMedia();else $('status').textContent='Open this player through the Android APK to choose a local file.';};
$('original').onchange=()=>{settings.mode=$('original').checked?'original':'enhanced';apply();};
media.addEventListener('play',async()=>{try{window.Sound360Android?.audioFocus();await ensureAudio();$('status').textContent=settings.mode==='original'?'Original audio through shared headroom.':'Spatial processing active locally. Head turn is a manual preview, not a head sensor.';}catch(error){media.pause();$('status').textContent=`Cannot start spatial audio: ${error.message}. A recent Android System WebView with AudioWorklet support is required.`;}});
media.addEventListener('error',()=>{$('status').textContent='This file could not be decoded by Android WebView. Try an MP4/AAC video or MP3/WAV song.';});
window.mobileMediaLoading=()=>{media.pause();$('open').disabled=true;$('status').textContent='Copying the selected file into private app cache…';};
window.mobileMediaReady=item=>{media.pause();media.src=item.url;media.load();$('file').textContent=`${item.name} · ${(item.bytes/1048576).toFixed(1)} MB`;$('open').disabled=false;$('status').textContent='Ready. Press Play in the media controls. Processing stays on this device.';};
window.mobileMediaError=message=>{$('open').disabled=false;$('status').textContent=message;};
window.pauseSound360=()=>{media.pause();if(sdk?.context.state==='running'&&typeof sdk.context.suspend==='function')sdk.context.suspend().catch(()=>{});};
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.pauseSound360();});
window.addEventListener('pagehide',()=>{media.pause();sdk?.dispose();});

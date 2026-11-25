import { DEFAULTS, LISTENING_PROFILES } from './settings.js';
const $=id=>document.getElementById(id),fields=[['bass','Bass',-6,6,.5,' dB'],['clarity','Voice presence',-2,6,.5,' dB'],['width','Stage width',0,100,1,'%'],['anchor','Centre anchor',0,100,1,'%'],['space','Spatial blend',0,100,1,'%'],['theatre','Short room reflections',0,60,1,'%'],['volume','Listening volume',0,100,1,'%'],['yaw','Head turn preview',-180,180,5,'°']];
let settings={...DEFAULTS},pending;
const send=async(type,data={})=>{const response=await chrome.runtime.sendMessage({target:'background',type,...data});if(response?.error)throw new Error(response.error);return response;};
function reflect(){for(const[key,,,,,suffix]of fields){$(key).value=settings[key];$(key+'-value').textContent=settings[key]+suffix;}$('original').checked=settings.mode==='original';$('profile').value=settings.profile;$('hrtf').value=settings.hrtf;}
const show=state=>{$('status').textContent=state.running?`Processing tab audio locally · ${state.sampleRate/1000} kHz. Stop restores the tab's own output.`:'Off. Open a media tab and choose Enable for this tab.';$('stop').disabled=!state.running;};
const save=()=>{clearTimeout(pending);pending=setTimeout(()=>send('UPDATE',{settings}).then(show).catch(error=>$('status').textContent=error.message),100);};
for(const[key,title,min,max,step,suffix]of fields){const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');label.textContent=title;output.id=key+'-value';input.id=key;input.type='range';Object.assign(input,{min,max,step,value:settings[key]});output.textContent=input.value+suffix;input.oninput=()=>{settings.profile='custom';$('profile').value='custom';settings[key]=Number(input.value);output.textContent=input.value+suffix;save();};label.append(output,input);$('fields').append(label);}
$('profile').onchange=()=>{const profile=$('profile').value;if(!LISTENING_PROFILES[profile])return;settings={...settings,...LISTENING_PROFILES[profile],profile,mode:'enhanced'};reflect();save();};
$('hrtf').onchange=()=>{settings.hrtf=$('hrtf').value;save();};
$('original').onchange=()=>{settings.mode=$('original').checked?'original':'enhanced';save();};
$('start').onclick=async()=>{$('start').disabled=true;try{clearTimeout(pending);await send('UPDATE',{settings});const state=await send('START');settings={...DEFAULTS,...state.settings};reflect();show(state);}catch(error){$('status').textContent=error.message;}finally{$('start').disabled=false;}};
$('stop').onclick=()=>send('STOP').then(show).catch(error=>$('status').textContent=error.message);
$('audition').onclick=async()=>{try{clearTimeout(pending);await send('STOP');await chrome.tabs.create({url:chrome.runtime.getURL('audition.html')});window.close();}catch(error){$('status').textContent=error.message;}};
try{const state=await send('STATUS');settings={...DEFAULTS,...state.settings};reflect();show(state);}catch(error){$('status').textContent=error.message;}

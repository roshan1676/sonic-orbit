import { createSpatialAudio } from './audio/sdk/spatial-audio.js';
const status=document.getElementById('status'),stop=document.getElementById('stop');
let current,generation=0;
async function end(){generation++;const old=current;current=null;stop.disabled=true;await old?.dispose();}
stop.onclick=()=>{end();status.textContent='Stopped.';};
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=async()=>{
  const version=++generation,old=current;current=null;
  // Allocate the context from this user gesture, before any network/profile load.
  const context=new AudioContext({latencyHint:'interactive'}),resuming=context.resume();let sdk;
  try{
    await old?.dispose();await resuming;
    if(version!==generation){await context.close();return;}
    sdk=await createSpatialAudio({context,settings:{mode:'enhanced',volume:60,bass:0,clarity:0,room:0,space:100}});
    const cleanup={dispose:async()=>{await sdk.dispose();if(context.state!=='closed')await context.close();}};
    if(version!==generation){await cleanup.dispose();return;}current=cleanup;stop.disabled=false;
    status.textContent='Preparing local headphone profile…';await sdk.setHrtfProfile(document.getElementById('hrtf').value);
    if(version!==generation)return;
    const angle=Number(button.dataset.angle)*Math.PI/180;
    const object=sdk.addSource({id:'direction-check',position:[Math.sin(angle)*2,0,-Math.cos(angle)*2]});
    const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
    let seed=1701;
    for(let i=0;i<samples.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const edge=Math.min(1,i/(context.sampleRate*.04),(samples.length-1-i)/(context.sampleRate*.06));
      samples[i]=(seed/2147483648-1)*.12*Math.max(0,edge);
    }
    const source=context.createBufferSource();source.buffer=buffer;
    const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=250;
    const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=8000;
    source.connect(high);high.connect(low);low.connect(object.input);
    source.onended=()=>{source.disconnect();high.disconnect();low.disconnect();if(version===generation){end();status.textContent=`Finished: ${button.textContent}. Try another direction or profile.`;}};
    source.start();status.textContent=`Playing: ${button.textContent}. No head tracking is active.`;
  }catch(error){await sdk?.dispose();if(context.state!=='closed')await context.close();if(version===generation){current=null;stop.disabled=true;status.textContent=error.message;}}
};
window.addEventListener('pagehide',()=>end());

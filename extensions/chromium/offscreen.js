import { createSpatialAudio } from './audio/sdk/spatial-audio.js';
import { TabAudioSession } from './tab-session.js';
const session=new TabAudioSession({getUserMedia:constraints=>navigator.mediaDevices.getUserMedia(constraints),createContext:()=>new AudioContext({latencyHint:'interactive'}),createSpatialAudio,onEnded:()=>chrome.runtime.sendMessage({target:'background',type:'ENDED'}).catch(()=>{})});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.target!=='offscreen'||sender.id!==chrome.runtime.id)return;
  (async()=>{if(message.type==='START')return session.start(message);if(message.type==='STOP')return session.stop();if(message.type==='UPDATE')return session.update(message.settings);if(message.type==='STATUS')return session.status();throw new Error('Unsupported audio action.');})().then(respond,error=>respond({error:error.message}));return true;
});
window.addEventListener('pagehide',()=>session.stop());

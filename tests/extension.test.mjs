import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionController } from '../extensions/chromium/controller.js';
import { TabAudioSession } from '../extensions/chromium/tab-session.js';
import { sanitize } from '../extensions/chromium/settings.js';
import { readFile } from 'node:fs/promises';

function fakeApi({url='https://www.youtube.com/watch?v=example',fail=false}={}){
  const events=[];let exists=false,state={running:false},saved={volume:95};
  const api={runtime:{getURL:path=>'chrome-extension://local/'+path,getContexts:async()=>exists?[{}]:[],sendMessage:async message=>{events.push(message);if(message.type==='START'){if(fail)return {error:'Capture failed'};state={running:true,tabId:message.tabId,settings:message.settings};}if(message.type==='STOP')state={running:false};return state;}},
    storage:{local:{get:async()=>({settings:saved}),set:async value=>{saved=value.settings;}}},
    tabs:{query:async()=>[{id:7,url}]},offscreen:{createDocument:async()=>{exists=true;},closeDocument:async()=>{exists=false;events.push('closed');}},
    tabCapture:{getMediaStreamId:async options=>{events.push(options);return 'private-stream-token';}},action:{setBadgeText:async value=>events.push(value),setBadgeBackgroundColor:async()=>{}}};
  return {api,events,exists:()=>exists};
}
test('extension captures only the selected tab and stops when that tab closes',async()=>{
  const fake=fakeApi(),controller=new ExtensionController(fake.api);const started=await controller.handle({type:'START'});
  assert.equal(started.running,true);assert.equal(started.tabId,7);assert.equal(started.settings.volume,50);
  assert.ok(fake.events.some(event=>event.targetTabId===7));
  await controller.handle({type:'STOP_TAB',tabId:9});assert.equal(fake.exists(),true);
  await controller.handle({type:'STOP_TAB',tabId:7});assert.equal(fake.exists(),false);
});
test('restricted pages and capture failures do not leave an offscreen processor running',async()=>{
  const restricted=fakeApi({url:'chrome://settings'});await assert.rejects(new ExtensionController(restricted.api).handle({type:'START'}),/media web page/);assert.equal(restricted.exists(),false);
  const failure=fakeApi({fail:true});await assert.rejects(new ExtensionController(failure.api).handle({type:'START'}),/Capture failed/);assert.equal(failure.exists(),false);
});
function fakeSession({fail=false,getUserMedia}={}){
  let stopped=0,closed=0,disposed=0,requested;const track=new EventTarget();track.stop=()=>{stopped++;};const stream={getTracks:()=>[track]};
  const context={state:'running',sampleRate:48000,createMediaStreamSource:()=>({connect(){},disconnect(){}}),resume:async()=>{},close:async()=>{context.state='closed';closed++;}};
  const session=new TabAudioSession({getUserMedia:getUserMedia|| (async constraints=>{requested=constraints;return stream;}),createContext:()=>context,createSpatialAudio:async()=>{if(fail)throw new Error('Renderer unavailable');return {input:{},update(){},setSceneOptions(){},setHeadPose(){},dispose:async()=>{disposed++;}};}});
  return {session,stream,counts:()=>({stopped,closed,disposed}),requested:()=>requested};
}
test('tab audio session uses no microphone, routes audio and releases capture and context on stop',async()=>{
  const fake=fakeSession();await fake.session.start({streamId:'token',tabId:7,settings:{bass:3}});
  assert.equal(fake.session.status().running,true);assert.deepEqual(fake.requested(),{audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:'token'}},video:false});
  await fake.session.stop();assert.deepEqual(fake.counts(),{stopped:1,closed:1,disposed:1});await fake.session.stop();assert.equal(fake.counts().stopped,1);
  const failure=fakeSession({fail:true});await assert.rejects(failure.session.start({streamId:'token',tabId:7}),/Renderer unavailable/);assert.deepEqual(failure.counts(),{stopped:1,closed:1,disposed:0});
});
test('cancelling a pending tab capture stops a stream granted later',async()=>{
  let grant;const fake=fakeSession({getUserMedia:()=>new Promise(resolve=>{grant=resolve;})});const starting=fake.session.start({streamId:'token',tabId:7});
  await new Promise(resolve=>setImmediate(resolve));await fake.session.stop();grant(fake.stream);await assert.rejects(starting,/cancelled/);assert.equal(fake.counts().stopped,1);
});
test('extension declares minimal permissions and bounds all persisted audio settings',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../extensions/chromium/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.permissions,['activeTab','tabCapture','offscreen','storage']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.content_scripts,undefined);
  const value=sanitize({bass:999,volume:-4,clarity:NaN,yaw:Infinity,unknown:'ignored'});assert.equal(value.bass,6);assert.equal(value.volume,0);assert.equal(value.clarity,1);assert.equal(value.yaw,0);assert.equal(value.unknown,undefined);
});

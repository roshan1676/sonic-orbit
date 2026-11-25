import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';
import { SceneControls } from '../public/scene-controls.js';

const response=value=>({ok:true,json:async()=>value});
function controls(t){
  const previousDocument=globalThis.document,previousFetch=globalThis.fetch;
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false});return elements.get(id);};
  globalThis.document={getElementById:get};
  const scene=Object.assign(Object.create(SceneControls.prototype),{media:{id:'media'},generation:0,getToken:()=>'',onState(){},onEnable(){}});
  t.after(()=>{clearTimeout(scene.poll);scene.abort?.abort();globalThis.document=previousDocument;globalThis.fetch=previousFetch;});
  return {scene,get};
}

test('Cancel is usable before the start response and cancellation follows that request',async t=>{
  const {scene,get}=controls(t);let resolveStart;const calls=[];
  globalThis.fetch=async(url)=>{calls.push(url);return url.endsWith('/cancel')?response({state:'cancelled'}):new Promise(resolve=>{resolveStart=resolve;});};
  const prepare=scene.prepare();assert.equal(get('cancel-stems').disabled,false);
  const cancel=scene.cancel();assert.equal(get('cancel-stems').disabled,true);assert.equal(calls.length,1);
  resolveStart(response({state:'starting'}));await Promise.all([prepare,cancel]);
  assert.equal(calls.at(-1),'/api/stems/media/cancel');assert.equal(scene.busy,false);assert.equal(get('prepare-stems').disabled,false);assert.equal(scene.poll,undefined);
});

test('Cancel during audio initialization prevents a late scene from being activated',async t=>{
  const {scene,get}=controls(t);let finishAudio;
  scene.ensureAudio=()=>new Promise(resolve=>{finishAudio=resolve;});globalThis.fetch=async()=>response({state:'ready'});
  const preparing=scene.prepare();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(get('cancel-stems').disabled,false);await scene.cancel();finishAudio({});await preparing;
  assert.equal(scene.player,null);assert.equal(scene.busy,false);assert.equal(get('enable-scene').disabled,true);
});

test('A request failure leaves cancellation available, and cancellation itself can be retried',async t=>{
  const {scene,get}=controls(t);globalThis.fetch=async()=>{throw new Error('Connection lost');};
  await scene.prepare();assert.equal(scene.busy,true);assert.equal(get('cancel-stems').disabled,false);
  await scene.cancel();assert.equal(scene.busy,true);assert.equal(get('cancel-stems').disabled,false);
  globalThis.fetch=async()=>response({});await scene.cancel();assert.equal(scene.busy,false);assert.equal(get('prepare-stems').disabled,false);
});

test('Reopening a media job that is still processing restores its Cancel control',async t=>{
  const {scene,get}=controls(t);globalThis.fetch=async()=>response({state:'separating',progress:.4});
  await scene.reset({id:'reopened'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(scene.busy,true);assert.equal(get('cancel-stems').disabled,false);assert.equal(get('cancel-stems').hidden,false);
});

test('Android file selection remains independent of a failed audio-module import',async()=>{
  const source=await readFile(new URL('../mobile/android/assets/bootstrap.js',import.meta.url),'utf8');
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{pause(){},load(){}});return elements.get(id);};
  let opened=0;const window={Sound360Android:{chooseMedia(){opened++;}}};
  const context=createContext({window,document:{getElementById:get}});
  new Script(source,{importModuleDynamically:async()=>{throw new Error('Renderer unavailable');}}).runInContext(context);
  await new Promise(resolve=>setImmediate(resolve));get('open').onclick();assert.equal(opened,1);
  window.mobileMediaLoading();assert.equal(get('open').disabled,true);
  window.mobileMediaReady({name:'song.mp3',bytes:1024,url:'https://sound360.local/media/key'});
  assert.equal(get('media').src,'https://sound360.local/media/key');assert.equal(get('open').disabled,false);
  window.mobileMediaError('Cannot read file');assert.equal(get('status').textContent,'Cannot read file');
});

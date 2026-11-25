import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourcePosition, focusAttenuation } from '../public/scene-math.js';
import { listenerBasis, eulerQuaternion } from '../public/orientation.js';
import { analyzeTracking, framingAdvice } from '../public/tracking-analysis.js';
import { StemJobs, stemKey } from '../stem-jobs.mjs';
import { sofaDirection, nearestDirection } from '../public/measured-hrtf.js';
import { StemPlayer } from '../public/stem-player.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('scene geometry anchors the singer and turn-away focus attenuates by 0/3/6 dB',()=>{
  assert.deepEqual(sourcePosition(0),[0,0,-2]);
  assert.ok(sourcePosition(90)[0]>1.99);assert.ok(sourcePosition(-90)[0]<-1.99);
  for(const [yaw,db]of [[0,0],[Math.PI/2,-3],[Math.PI,-6],[2*Math.PI,0]]){
    const forward=listenerBasis(eulerQuaternion(yaw,0,0)).forward;
    assert.ok(Math.abs(20*Math.log10(focusAttenuation(forward,sourcePosition(0),1))-db)<1e-8);
    assert.equal(focusAttenuation(forward,sourcePosition(0),0),1);
  }
});
test('camera setup separates still-head jitter from movement and adapts to slow inference',()=>{
  const samples=Array.from({length:50},(_,i)=>({pose:{yaw:Math.sin(i)*.003,pitch:Math.cos(i)*.002},quality:.9,brightness:90,inferenceMs:80}));
  const result=analyzeTracking(samples);assert.equal(result.ok,true);assert.equal(result.settings.maxFps,12);assert.ok(result.jitterDegrees<.2);
  assert.equal(analyzeTracking(samples.slice(0,5)).ok,false);
  assert.equal(analyzeTracking(samples.map((s,i)=>({...s,pose:{...s.pose,yaw:i*.01}}))).ok,false);
  assert.equal(analyzeTracking(samples.map(s=>({...s,quality:.2}))).ok,false);
  assert.match(framingAdvice({pose:{},brightness:20}),/dark/);
});
test('measured HRIR coordinates preserve left, right, behind and tilted head geometry',()=>{
  const front=sourcePosition(0);
  const v=sofaDirection(front,listenerBasis(eulerQuaternion(Math.PI/2,0,0)));
  assert.ok(v[1]>.999);assert.ok(Math.abs(v[0])<1e-8);
  const back=sofaDirection(front,listenerBasis(eulerQuaternion(Math.PI,0,0)));assert.ok(back[0]<-.999);
  const tilted=sofaDirection(sourcePosition(-90),listenerBasis(eulerQuaternion(0,0,.7)));assert.ok(Math.abs(Math.hypot(...tilted)-1)<1e-8);
  assert.equal(nearestDirection([[1,0,0],[0,1,0],[-1,0,0]],v),1);
});
test('stem cache requires four named files and changes identity when source changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sound360-stems-')); const mediaPath=join(root,'sample.mp4');
  try{
    await writeFile(mediaPath,'source');const item={id:'local-test',path:mediaPath};const key=await stemKey(mediaPath),directory=join(root,'.cache','stems',key);await mkdir(directory,{recursive:true});
    const jobs=new StemJobs(root);assert.equal((await jobs.status(item)).state,'idle');
    const manifest={model:'htdemucs',duration:20,stems:['vocals','drums','bass','other'].map(name=>({name,file:name+'.wav'}))};
    await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest));
    for(const stem of manifest.stems)await writeFile(join(directory,stem.file),'RIFF');
    const ready=await new StemJobs(root).status(item);assert.equal(ready.state,'ready');
    assert.equal(new StemJobs(root).describe(ready,item.id).stems.length,4);
    await writeFile(mediaPath,'changed source');assert.notEqual(await stemKey(mediaPath),key);
    await assert.rejects(new StemJobs(root).prepare(item),/environment is missing/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('all four stems share the video offset and stop/restart across seek, buffering and end',()=>{
  const video=new EventTarget();Object.assign(video,{paused:true,seeking:false,currentTime:15,readyState:4,playbackRate:1});
  const starts=[],modes=[],parameter={value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}};
  const context={currentTime:100,createGain:()=>({gain:{...parameter},connect(){},disconnect(){}}),createBufferSource:()=>({connect(){},disconnect(){},start(when,offset){starts.push([when,offset]);},stop(){this.onended?.();}})};
  const engine={context,createSceneSource:()=>({input:{},disconnect(){}}),setSceneEnabled:value=>modes.push(value)};
  const player=new StemPlayer(video,engine,()=>{});player.duration=120;player.buffers=new Map(['vocals','drums','bass','other'].map(name=>[name,{duration:120}]));
  try{
    player.setEnabled(true);assert.equal(starts.length,0);
    video.paused=false;video.dispatchEvent(new Event('playing'));assert.equal(starts.length,4);assert.ok(starts.every(([when,offset])=>when===100&&offset===15));
    context.currentTime=101.5;video.currentTime=16.5;player.sync();assert.equal(starts.length,4);
    video.seeking=true;video.dispatchEvent(new Event('seeking'));assert.equal(player.sources.length,0);
    video.currentTime=65;video.seeking=false;video.dispatchEvent(new Event('seeked'));assert.equal(starts.length,8);assert.ok(starts.slice(4).every(([,offset])=>offset===65));
    video.dispatchEvent(new Event('waiting'));assert.equal(player.sources.length,0);video.dispatchEvent(new Event('playing'));assert.equal(starts.length,12);
    context.currentTime+=1;video.currentTime=67;player.sync();assert.equal(starts.length,16); // 1 second drift forces resync.
    video.currentTime=120;player.sync();assert.equal(player.enabled,false);assert.equal(modes.at(-1),false);
  }finally{player.dispose();}
});

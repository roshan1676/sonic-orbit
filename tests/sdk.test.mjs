import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vector3, relativeSource } from '../public/sdk/source-geometry.js';
import { sourcePosition, distanceAttenuation } from '../public/scene-math.js';
import { createSpatialAudio, VERSION } from '../public/sdk/spatial-audio.js';

test('SDK world positions preserve 3D coordinates and correctly translate the listener',()=>{
  const world=[2,1,-4],listener=[4,-1,2],relative=relativeSource(world,listener);
  const rebuilt=sourcePosition(relative.azimuth,relative.distance,relative.elevation);
  for(let i=0;i<3;i++)assert.ok(Math.abs(rebuilt[i]-(world[i]-listener[i]))<1e-10);
  assert.ok(relative.azimuth<0);assert.ok(relative.elevation>0);
  assert.deepEqual(relativeSource([0,0,0],[0,0,0]),{azimuth:0,elevation:0,distance:.05});
  assert.deepEqual(vector3({x:1,y:2,z:3}),[1,2,3]);assert.deepEqual(vector3(new Float32Array([1,2,3])),[1,2,3]);
  for(const position of [null,[1,2],[1,NaN,3],[0,Infinity,0],[1e7,0,0],new DataView(new ArrayBuffer(12))])assert.throws(()=>vector3(position));
});
test('source distance gain is bounded nearby, attenuates far away and supports disabled rolloff',()=>{
  assert.equal(distanceAttenuation(.05),1);assert.equal(distanceAttenuation(2),1);assert.equal(distanceAttenuation(4),.5);assert.equal(distanceAttenuation(8),.25);
  assert.equal(distanceAttenuation(100,2,0),1);assert.ok(distanceAttenuation(1e6)>0);
});
test('SDK imports without starting browser services and rejects invalid capacity before allocating audio',async()=>{
  assert.equal(VERSION,'0.1.0-alpha.1');
  for(const maxSources of [0,129,1.5,NaN])await assert.rejects(createSpatialAudio({maxSources}),/maxSources/);
});

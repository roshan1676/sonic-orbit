import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { eulerQuaternion, listenerBasis, inverseQuaternion, multiplyQuaternion, slerpQuaternion, normalizeQuaternion } from '../public/orientation.js';
import { TrackingBridge, decodeTrackingPacket } from '../tracking-bridge.mjs';

test('all four heading quadrants and a complete turn have the correct forward vector', () => {
  for (const [degrees, expected] of [[0,[0,0,-1]],[90,[1,0,0]],[180,[0,0,1]],[270,[-1,0,0]],[360,[0,0,-1]]]) {
    const basis = listenerBasis(eulerQuaternion(degrees * Math.PI / 180));
    basis.forward.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6));
  }
});
test('quaternion interpolation crosses the heading wrap smoothly and recentres arbitrary poses', () => {
  const a = eulerQuaternion(179*Math.PI/180), b = eulerQuaternion(-179*Math.PI/180);
  assert.ok(listenerBasis(slerpQuaternion(a,b,0.5)).forward[2] > 0.999);
  const q = eulerQuaternion(2.8,0.7,-0.4), relative = multiplyQuaternion(inverseQuaternion(q),q);
  assert.ok(Math.abs(relative.w-1) < 1e-6); assert.ok(Math.hypot(relative.x,relative.y,relative.z) < 1e-6);
  assert.equal(normalizeQuaternion({ x:0,y:0,z:0,w:0 }),null);
  assert.equal(eulerQuaternion(NaN),null);
});
test('OpenTrack decoder rejects malformed poses and preserves a back-facing heading', () => {
  const packet = Buffer.alloc(48); packet.writeDoubleLE(180,24);
  const pose = decodeTrackingPacket(packet); assert.ok(Math.abs(pose.yaw-Math.PI) < 1e-6); assert.ok(listenerBasis(pose.quaternion).forward[2] > 0.999);
  assert.equal(decodeTrackingPacket(Buffer.alloc(47)),null); packet.writeDoubleLE(Infinity,32); assert.equal(decodeTrackingPacket(packet),null);
});
test('local UDP bridge starts on demand, receives data and releases its socket', async t => {
  const bridge = new TrackingBridge(0), sender = dgram.createSocket('udp4');
  t.after(() => { bridge.stop(); sender.close(); }); assert.equal(bridge.status().enabled,false);
  const status = await bridge.start(); assert.equal(bridge.socket.address().address,'127.0.0.1');
  const packet = Buffer.alloc(48); packet.writeDoubleLE(270,24);
  await new Promise((resolve,reject) => sender.send(packet,status.port,'127.0.0.1',error => error ? reject(error) : resolve()));
  for (let i=0; i<30 && !bridge.latest; i++) await new Promise(resolve => setTimeout(resolve,10));
  assert.ok(bridge.latest); assert.ok(listenerBasis(bridge.latest.quaternion).forward[0] < -0.999);
  bridge.stop(); assert.equal(bridge.status().enabled,false); assert.equal(bridge.latest,null);
});

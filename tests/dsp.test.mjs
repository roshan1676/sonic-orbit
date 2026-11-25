import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardBlock } from '../public/dsp-math.js';
import { matrixToPose, relativePose } from '../public/head-pose.js';

test('sample guard bounds overloads and links stereo gain', () => {
  const l = new Float32Array([0.1, 2, -3, 0.2]), r = new Float32Array([0.2, 1, -0.5, 0.3]);
  const output = [new Float32Array(4), new Float32Array(4)];
  guardBlock([l, r], output, { gain: 1, peak: 0, squares: 0, count: 0 }, 48000);
  for (const channel of output) for (const value of channel) assert.ok(Math.abs(value) <= 0.940001);
  assert.ok(Math.abs(output[0][1] / output[1][1] - 2) < 0.00001);
});
test('sample guard survives silence, invalid samples, mono, and block boundaries', () => {
  const state = { gain: 1, peak: 0, squares: 0, count: 0 };
  const outputs = [new Float32Array(128), new Float32Array(128)];
  guardBlock([], outputs, state, 48000); assert.ok(outputs.every(channel => channel.every(value => value === 0)));
  guardBlock([new Float32Array([NaN, Infinity, 5])], [new Float32Array(3), new Float32Array(3)], state, 48000);
  assert.ok(state.gain < 0.2);
  guardBlock([new Float32Array(128)], outputs, state, 48000);
  assert.ok(Number.isFinite(state.gain)); assert.ok(state.gain > 0.188);
});
test('safe-level original samples pass unchanged', () => {
  const input = [new Float32Array([0, 0.2, -0.3]), new Float32Array([0.1, -0.2, 0.4])];
  const output = [new Float32Array(3), new Float32Array(3)];
  guardBlock(input, output, { gain: 1, peak: 0, squares: 0, count: 0 }, 48000);
  assert.deepEqual(output, input);
});
test('head pose decodes known rotations and rejects invalid matrices', () => {
  const yaw = Math.PI / 6;
  const pose = matrixToPose({ data: [Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, 0, 0, 0, 1] });
  assert.ok(Math.abs(pose.yaw - yaw) < 0.00001); assert.ok(Math.abs(pose.pitch) < 0.00001);
  assert.equal(matrixToPose({ data: new Array(16).fill(0) }), null);
  assert.equal(matrixToPose({ data: [NaN] }), null);
});
test('neutral calibration, reversal, angle wrap, and head-pose bounds', () => {
  const pose = { yaw: 0.4, pitch: 0.2 };
  assert.ok(Math.abs(relativePose(pose, pose).yaw) < 0.00001);
  assert.equal(relativePose(pose, { yaw: 0, pitch: 0 }).yaw, -0.4);
  assert.equal(relativePose(pose, { yaw: 0, pitch: 0 }, true).yaw, 0.4);
  assert.ok(Math.abs(relativePose({ yaw: -3.1, pitch: 3 }, { yaw: 3.1, pitch: 0 }).yaw) < 0.1);
  assert.equal(relativePose({ yaw: 3, pitch: 3 }, { yaw: 0, pitch: 0 }).pitch, 0.7);
});

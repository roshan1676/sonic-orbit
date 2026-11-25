import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionFilter, HeadMotion, trackingOptions } from '../public/head-motion.js';
import { sanitizeSound, PRESETS } from '../public/sound-settings.js';
import { HeadTracker } from '../public/head-tracker.js';

const calibrated = options => {
  const motion = new HeadMotion(options);
  for (let t = 0; t <= 800; t += 50) motion.feed({ yaw: 0, pitch: 0, roll: 0 }, t);
  assert.equal(motion.calibrating, false); return motion;
};
test('motion filter suppresses stationary jitter while following a real turn', () => {
  const filter = new MotionFilter(), values = [];
  for (let i = 0; i < 120; i++) { const value = filter.sample(i % 2 ? 0.015 : -0.015, i * 1000 / 60, 65); if (i > 60) values.push(value); }
  const rms = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
  assert.ok(rms < 0.007, `Residual jitter ${rms}`);
  let value;
  for (let i = 120; i <= 132; i++) value = filter.sample(0.5, i * 1000 / 60, 65);
  assert.ok(value > 0.42, `Real turn response ${value}`);
});
test('calibration averages a stable sequence rather than accepting the first frame', () => {
  const motion = new HeadMotion(); motion.feed({ yaw: 0.5, pitch: 0.2 }, 0);
  assert.equal(motion.calibrating, true); assert.equal(motion.neutral, null);
  for (let t = 50; t <= 800; t += 50) motion.feed({ yaw: 0.5 + Math.sin(t) * 0.003, pitch: 0.2 }, t);
  assert.equal(motion.calibrating, false); assert.ok(Math.abs(motion.neutral.yaw - 0.5) < 0.003);
});
test('moving during calibration does not set a false neutral pose', () => {
  const motion = new HeadMotion();
  for (let t = 0; t < 1600; t += 50) motion.feed({ yaw: t / 1600, pitch: 0 }, t);
  assert.equal(motion.calibrating, true);
});
test('bad-quality, nonfinite, stale, and isolated jump measurements are rejected', () => {
  const motion = calibrated();
  assert.equal(motion.feed({ yaw: NaN, pitch: 0 }, 900), false);
  assert.equal(motion.feed({ yaw: 0, pitch: 0 }, 900, 0.1), false);
  assert.equal(motion.feed({ yaw: 0, pitch: 0 }, 700), false);
  assert.equal(motion.feed({ yaw: 0, pitch: 0 }, 900), true);
  assert.equal(motion.feed({ yaw: 2, pitch: 0 }, 950), false);
  assert.equal(motion.lastSeen, 900);
});
test('loss recovery returns gently or holds as selected, without invalid values', () => {
  const centre = calibrated({ lossMode: 'center', deadzone: 0 }), hold = calibrated({ lossMode: 'hold', deadzone: 0 });
  for (const motion of [centre, hold]) {
    motion.feed({ yaw: -0.5, pitch: 0.1 }, 1000);
    for (let t = 1000; t <= 1500; t += 16) motion.value(t);
  }
  assert.ok(hold.value(5000).yaw > 0.35); assert.ok(Math.abs(centre.value(5000).yaw) < 0.05);
  assert.ok(Number.isFinite(centre.value(6000).pitch));
});
test('sensitivity/prediction remain bounded and tuning rejects unsafe stored values', () => {
  const options = trackingOptions({ sensitivity: 99, prediction: -5, smoothing: NaN, maxFps: 100 });
  assert.equal(options.sensitivity, 2); assert.equal(options.prediction, 0); assert.equal(options.maxFps, 30); assert.equal(options.smoothing, 40);
  const sound = sanitizeSound({ bass: 999, volume: -50, treble: NaN, output: 'unknown', preset: '__proto__' });
  assert.equal(sound.bass, 6); assert.equal(sound.volume, 0); assert.equal(sound.treble, 0); assert.equal(sound.output, 'headphones'); assert.equal(sound.preset, 'neutral');
  for (const preset of Object.values(PRESETS)) assert.ok(sanitizeSound(preset).bass <= 6);
});
test('cancelling a pending camera request releases a stream that arrives late', async t => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); const oldCancel = globalThis.cancelAnimationFrame;
  let grant, stopped = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) } } });
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; if (oldCancel) globalThis.cancelAnimationFrame = oldCancel; else delete globalThis.cancelAnimationFrame; });
  const tracker = new HeadTracker({ video: { pause() {}, srcObject: null }, onPose() {}, onStatus() {}, onState() {} });
  const pending = tracker.start(); tracker.stop(); grant({ getTracks: () => [{ stop: () => stopped++ }] }); await pending;
  assert.equal(stopped, 1); assert.equal(tracker.active, false); assert.equal(tracker.stream, null);
});

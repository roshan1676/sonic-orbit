import { clamp } from './dsp-math.js';
import { relativePose } from './head-pose.js';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
const axes = ['yaw', 'pitch', 'roll'];
export const TRACKING_DEFAULTS = Object.freeze({ smoothing: 40, sensitivity: 1, deadzone: 0.2, prediction: 20, maxFps: 30, lossMode: 'center', followTilt: true });
export function trackingOptions(patch = {}) {
  const p = { ...TRACKING_DEFAULTS, ...patch };
  for (const [key, min, max] of [['smoothing', 0, 100], ['sensitivity', 0.5, 2], ['deadzone', 0, 3], ['prediction', 0, 35], ['maxFps', 10, 30]]) p[key] = Number.isFinite(p[key]) ? clamp(p[key], min, max) : TRACKING_DEFAULTS[key];
  p.lossMode = p.lossMode === 'hold' ? 'hold' : 'center'; p.followTilt = Boolean(p.followTilt);
  p.maxFps = [12, 24, 30].reduce((best, value) => Math.abs(value - p.maxFps) < Math.abs(best - p.maxFps) ? value : best, 24);
  return p;
}

// Independent implementation of Casiez et al.'s speed-adaptive One Euro filter.
export class MotionFilter {
  constructor() { this.reset(); }
  reset(value = 0) { this.raw = this.value = value; this.velocity = 0; this.time = null; }
  sample(value, time, smoothing = 55) {
    if (this.time === null) { this.reset(value); this.time = time; return value; }
    const dt = clamp((time - this.time) / 1000, 0.004, 0.5), speed = wrap(value - this.raw) / dt;
    this.velocity += alpha(1, dt) * (speed - this.velocity);
    const steadiness = smoothing / 100;
    const cutoff = 0.65 + (1 - steadiness) * 2.8 + (4.0 + (1 - steadiness) * 2) * Math.abs(this.velocity);
    this.value += alpha(cutoff, dt) * wrap(value - this.value);
    this.raw = value; this.time = time; return this.value;
  }
}

export class HeadMotion {
  constructor(options = {}) {
    this.options = trackingOptions(options); this.filters = Object.fromEntries(axes.map(axis => [axis, new MotionFilter()]));
    this.reset();
  }
  configure(patch) { this.options = trackingOptions({ ...this.options, ...patch }); }
  reset() {
    this.neutral = null; this.samples = []; this.lastRaw = null; this.lastSeen = null; this.lastFrame = null;
    this.filtered = { yaw: 0, pitch: 0, roll: 0 }; this.rendered = { ...this.filtered };
    this.calibrationProgress = 0; this.calibrating = true; this.rejected = 0;
    for (const filter of Object.values(this.filters)) filter.reset();
  }
  calibrate() { this.samples = []; this.calibrating = true; this.calibrationProgress = 0; }
  feed(raw, time, quality = 1) {
    if (!raw || !Number.isFinite(time) || !Number.isFinite(raw.yaw) || !Number.isFinite(raw.pitch) || quality < 0.3) return false;
    raw = { yaw: raw.yaw, pitch: raw.pitch, roll: Number.isFinite(raw.roll) ? raw.roll : 0 };
    if (this.lastSeen !== null && time <= this.lastSeen) return false;
    const gap = this.lastSeen === null ? Infinity : (time - this.lastSeen) / 1000;
    if (gap < 0.25 && this.lastRaw && axes.some(axis => Math.abs(wrap(raw[axis] - this.lastRaw[axis])) > Math.max(0.25, gap * 8 + 0.08))) { this.rejected++; return false; }
    this.lastSeen = time; this.lastRaw = raw;
    if (this.calibrating) {
      this.samples.push({ ...raw, time }); this.samples = this.samples.filter(p => time - p.time <= 1100).slice(-35);
      const means = Object.fromEntries(axes.map(axis => [axis, Math.atan2(this.samples.reduce((sum, p) => sum + Math.sin(p[axis]), 0), this.samples.reduce((sum, p) => sum + Math.cos(p[axis]), 0))]));
      const stable = axes.every(axis => this.samples.every(p => Math.abs(wrap(p[axis] - means[axis])) < 0.055));
      this.calibrationProgress = stable ? Math.min(1, (time - this.samples[0].time) / 650) : 0;
      if (this.samples.length >= 8 && this.calibrationProgress >= 1) {
        this.neutral = means; this.calibrating = false; this.filtered = { yaw: 0, pitch: 0, roll: 0 };
        for (const filter of Object.values(this.filters)) filter.reset();
      } else return true;
    }
    const relative = relativePose(raw, this.neutral, this.reverse);
    relative.roll = wrap(raw.roll - this.neutral.roll);
    for (const axis of axes) {
      const scale = axis === 'roll' ? 0.8 : this.options.sensitivity;
      let value = relative[axis] * scale;
      const deadzone = this.options.deadzone * Math.PI / 180;
      value = Math.sign(value) * Math.max(0, Math.abs(value) - deadzone);
      const limit = axis === 'yaw' ? 1.4 : 0.7;
      value = clamp(value, -limit, limit);
      if (axis === 'roll' && !this.options.followTilt) value = 0;
      if (gap > 0.5) this.filters[axis].reset(value);
      this.filtered[axis] = this.filters[axis].sample(value, time, this.options.smoothing);
    }
    return true;
  }
  value(now) {
    const age = this.lastSeen === null ? Infinity : Math.max(0, now - this.lastSeen);
    const state = this.calibrating ? 'calibrating' : age < 250 ? 'tracking' : age < 750 ? 'holding' : this.options.lossMode === 'hold' ? 'holding' : 'returning';
    const dt = this.lastFrame === null ? 1 / 60 : clamp((now - this.lastFrame) / 1000, 0.001, 0.1); this.lastFrame = now;
    const returnGain = state === 'returning' ? Math.exp(-(age - 750) / 650) : 1;
    for (const axis of axes) {
      const prediction = state === 'tracking' ? clamp(this.filters[axis].velocity * this.options.prediction / 1000, -0.045, 0.045) : 0;
      const target = this.calibrating ? 0 : (this.filtered[axis] + prediction) * returnGain;
      this.rendered[axis] += (1 - Math.exp(-dt / 0.012)) * (target - this.rendered[axis]);
      this.rendered[axis] = clamp(this.rendered[axis], axis === 'yaw' ? -1.4 : -0.7, axis === 'yaw' ? 1.4 : 0.7);
    }
    return { ...this.rendered, state, age, yawDegrees: this.rendered.yaw * 180 / Math.PI, pitchDegrees: this.rendered.pitch * 180 / Math.PI, calibrationProgress: this.calibrationProgress };
  }
}

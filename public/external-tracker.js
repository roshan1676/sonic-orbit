import { identity, eulerQuaternion, inverseQuaternion, multiplyQuaternion, normalizeQuaternion, slerpQuaternion, listenerBasis } from './orientation.js';

export class ExternalTracker {
  constructor({ onPose, onStatus, onState, onMetrics, getToken }) { Object.assign(this, { onPose, onStatus, onState, onMetrics, getToken }); this.active = false; this.generation = 0; this.reverse = false; this.options = { smoothing: 40, lossMode: 'center' }; }
  configure(options) { this.options = { ...this.options, ...options }; }
  async request(action) {
    const response = await fetch(`/api/tracking/${action}`, { method: 'POST', headers: { 'X-360-Token': this.getToken() } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  async start() {
    const generation = ++this.generation, status = await this.request('start');
    if (generation !== this.generation) { await this.request('stop'); return; }
    this.active = true; this.neutral = null; this.latest = null; this.sequence = null; this.target = this.current = identity(); this.frames = []; this.lastSeen = null; this.lastTick = performance.now(); this.metricsTime = 0;
    this.onState(true); this.onStatus(`Waiting for OpenTrack UDP output on 127.0.0.1:${status.port}. No motion sensor is connected yet.`);
    this.events = new EventSource('/api/tracking/events');
    this.events.onmessage = ({ data }) => {
      try {
        const packet = JSON.parse(data), pose = packet.pose;
        if (!pose || pose.sequence === this.sequence || packet.ageMs > 250) return;
        if (![pose.yaw, pose.pitch, pose.roll].every(Number.isFinite)) return;
        this.sequence = pose.sequence; this.latest = pose;
        const q = eulerQuaternion(pose.yaw * (this.reverse ? -1 : 1), pose.pitch, pose.roll);
        if (!q) return;
        if (!this.neutral) this.neutral = q;
        this.target = normalizeQuaternion(multiplyQuaternion(inverseQuaternion(this.neutral), q));
        this.lastSeen = performance.now(); this.frames.push(this.lastSeen); this.frames = this.frames.filter(t => this.lastSeen - t < 1000);
      } catch { /* Invalid packets never update orientation. */ }
    };
    this.events.onerror = () => this.onStatus('External feed interrupted. Waiting for local tracker data; no camera was opened.');
    const tick = now => {
      if (!this.active || generation !== this.generation) return;
      const age = this.lastSeen === null ? Infinity : now - this.lastSeen;
      const state = this.lastSeen === null ? 'waiting' : age < 250 ? 'tracking' : age < 750 || this.options.lossMode === 'hold' ? 'holding' : 'returning';
      const target = state === 'returning' || state === 'waiting' ? identity() : this.target;
      const tau = state === 'returning' ? 0.65 : 0.006 + this.options.smoothing * 0.00015;
      this.current = slerpQuaternion(this.current, target, 1 - Math.exp(-Math.min(0.1, (now - this.lastTick) / 1000) / tau)); this.lastTick = now;
      const basis = listenerBasis(this.current), yawDegrees = Math.atan2(basis.forward[0], -basis.forward[2]) * 180 / Math.PI;
      const pitchDegrees = Math.asin(Math.max(-1, Math.min(1, basis.forward[1]))) * 180 / Math.PI;
      this.displayYaw = yawDegrees; this.onPose({ quaternion: this.current, yawDegrees, pitchDegrees });
      if (now - this.metricsTime > 200) {
        this.metricsTime = now; this.onMetrics({ source: 'external', state, yawDegrees, pitchDegrees, fps: this.frames.filter(t => now - t < 1000).length, inferenceMs: 0, quality: age < 250 ? 1 : 0 });
        if (state === 'tracking') this.onStatus('Receiving local 360° orientation data. Accuracy and drift depend on the source sensor.');
        else if (state === 'holding') this.onStatus('External updates paused. Holding the last measured direction.');
        else if (state === 'returning') this.onStatus('External updates lost. Returning gently to centre.');
      }
      this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
  recenter() {
    if (this.latest) { this.neutral = eulerQuaternion(this.latest.yaw * (this.reverse ? -1 : 1), this.latest.pitch, this.latest.roll); this.target = identity(); }
    this.onStatus(this.latest ? 'External tracker recentred to the latest measured pose.' : 'Waiting for a sensor pose before recentering.');
  }
  stop() {
    this.generation++; this.active = false; cancelAnimationFrame(this.animation); this.events?.close(); this.events = null;
    this.request('stop').catch(() => {}); this.onState(false); this.onPose({ quaternion: identity(), yawDegrees: 0, pitchDegrees: 0 });
    this.onMetrics({ source: 'external', state: 'off', fps: 0, inferenceMs: 0, quality: 0 }); this.onStatus('External input off. No camera was opened.');
  }
}

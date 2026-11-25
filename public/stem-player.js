// Separated tracks use the video's timeline. Only 1x playback is supported so
// AudioBufferSource resampling cannot silently change vocal pitch.
export class StemPlayer {
  constructor(video, engine, onState) {
    Object.assign(this, { video, engine, onState }); this.enabled = false; this.buffers = new Map(); this.sources = [];
    this.objects = new Map(['vocals', 'drums', 'bass', 'other'].map(name => [name, engine.createSceneSource(name)]));
    this.handlers = { playing: () => this.start(), pause: () => this.stop(), seeking: () => this.stop(), seeked: () => this.start(), waiting: () => this.stop(), ended: () => this.stop() };
    for (const [event, fn] of Object.entries(this.handlers)) video.addEventListener(event, fn);
  }
  async load(data, onProgress = () => {}, signal) {
    const loaded = new Map();
    for (const stem of data.stems) {
      onProgress(`Loading ${stem.name}…`);
      signal?.throwIfAborted();
      const response = await fetch(stem.url, { signal }); if (!response.ok) throw new Error(`Cannot load ${stem.name}.`);
      const buffer = await this.engine.context.decodeAudioData(await response.arrayBuffer());
      signal?.throwIfAborted(); if(this.disposed)return;
      loaded.set(stem.name, buffer);
    }
    if (loaded.size !== 4) throw new Error('All four separated tracks are required.');
    if(this.disposed)return;
    this.buffers = loaded; this.duration = Math.min(...[...loaded.values()].map(buffer => buffer.duration));
  }
  setEnabled(enabled) {
    this.enabled = enabled && this.buffers.size === 4;
    if (this.enabled) this.video.playbackRate = 1;
    this.engine.setSceneEnabled(this.enabled); this.stop();
    clearInterval(this.timer);
    if (this.enabled) { this.start(); this.timer = setInterval(() => this.sync(), 250); }
    this.onState(this.enabled);
  }
  start() {
    this.stop();
    if (!this.enabled || this.video.paused || this.video.seeking || this.video.readyState < 3) return;
    if (this.video.currentTime >= this.duration - .03) { this.setEnabled(false); return; }
    const context = this.engine.context, when = context.currentTime;
    this.offset = Math.max(0, this.video.currentTime); this.startedAt = when;
    for (const [name, buffer] of this.buffers) {
      const source = context.createBufferSource(), envelope = context.createGain();
      source.buffer = buffer; envelope.gain.setValueAtTime(0, when); envelope.gain.linearRampToValueAtTime(1, when + .015);
      source.connect(envelope); envelope.connect(this.objects.get(name).input); source.start(when, this.offset);
      this.sources.push({ source, envelope });
    }
  }
  stop() {
    const now = this.engine.context.currentTime;
    for (const { source, envelope } of this.sources) {
      envelope.gain.cancelScheduledValues(now); envelope.gain.setValueAtTime(envelope.gain.value, now); envelope.gain.linearRampToValueAtTime(0, now + .015);
      source.onended = () => { source.disconnect(); envelope.disconnect(); };
      try { source.stop(now + .02); } catch {}
    }
    this.sources = [];
  }
  sync() {
    if (!this.enabled || this.video.paused || this.video.seeking) return;
    if (this.video.currentTime >= this.duration - .03) { this.setEnabled(false); return; }
    if (!this.sources.length) { if (this.video.readyState >= 3) this.start(); return; }
    const expected = this.offset + this.engine.context.currentTime - this.startedAt;
    if (Math.abs(expected - this.video.currentTime) > .08) this.start();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.setEnabled(false); for (const [event, fn] of Object.entries(this.handlers)) this.video.removeEventListener(event, fn);
    for (const object of this.objects.values()) object.disconnect(); this.buffers.clear();
  }
}

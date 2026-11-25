import { HeadTracker } from './head-tracker.js';
import { ExternalTracker } from './external-tracker.js';

export class TrackingHub {
  constructor(callbacks) { this.camera = new HeadTracker(callbacks); this.external = new ExternalTracker(callbacks); this.current = this.camera; this.options = {}; }
  get active() { return this.current.active; }
  get pending() { return this.current.pending || false; }
  get displayYaw() { return this.current.displayYaw || 0; }
  get source() { return this.current === this.external ? 'external' : 'camera'; }
  get reverse() { return this.camera.reverse; }
  set reverse(value) { this.camera.reverse = this.external.reverse = value; }
  set cameraId(value) { this.camera.deviceId = value; }
  configure(options) { this.options = options; this.camera.configure(options); this.external.configure(options); }
  async start(source = 'camera') { this.current = source === 'external' ? this.external : this.camera; return this.current.start(); }
  stop() { this.current.stop(); }
  recenter() { this.current.recenter(); }
}

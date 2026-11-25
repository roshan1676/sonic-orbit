import { HeadMotion, trackingOptions } from './head-motion.js';

export class HeadTracker {
  constructor({ video, onPose, onStatus, onState, onMetrics = () => {}, onOverlay = () => {}, onPending = () => {} }) {
    Object.assign(this, { video, onPose, onStatus, onState, onMetrics, onOverlay, onPending });
    this.motion = new HeadMotion(); this.active = false; this.generation = 0; this.displayYaw = 0;
    this.options = trackingOptions(); this.reverse = false;
  }
  configure(patch) { this.options = trackingOptions({ ...this.options, ...patch }); this.motion.configure(this.options); }
  status(text) { if (text !== this.statusText) { this.statusText = text; this.onStatus(text); } }
  async start() {
    if (this.active) return;
    const generation = ++this.generation;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost and a supported browser.');
      this.status('Allow the camera when prompted. Processing stays local; no microphone is requested.');
      const cameraConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } };
      if (this.deviceId) cameraConstraints.deviceId = { exact: this.deviceId }; else cameraConstraints.facingMode = 'user';
      this.pending = true; this.onPending(true);
      let timedOut = false, requestTimer;
      const cameraRequest = navigator.mediaDevices.getUserMedia({ video: cameraConstraints, audio: false }).then(stream => {
        if(timedOut || generation !== this.generation){stream.getTracks().forEach(track=>track.stop());throw new Error('Camera request cancelled.');}return stream;
      });
      let stream;
      try { stream = await Promise.race([cameraRequest,new Promise((_,reject)=>{requestTimer=setTimeout(()=>{timedOut=true;reject(new Error('Camera request timed out. Check camera permission, or open this player in Edge / Chrome.'));},15000);})]); }
      finally { clearTimeout(requestTimer); if(generation===this.generation){this.pending=false;this.onPending(false);} }
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream; await this.video.play();
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (this.active) this.stop(); });
      this.active = true; this.motion.reset(); this.motion.configure(this.options); this.motion.reverse = this.reverse;
      this.onState(true); this.inferenceMs = 0; this.frames = []; this.quality = 0; this.lastCapture = -Infinity;
      this.lastVideoTime = -1; this.lastMetrics = 0; this.busy = true;
      this.worker = new Worker('/head-worker.js');
      this.status('Loading the local face model. Then hold still facing the screen for calibration.');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('The local face model did not load. Check npm run setup:tracking.')); this.stop(); }, 30000);
        this.initReject = reject; this.initTimeout = timeout;
        this.worker.onerror = () => { clearTimeout(timeout); reject(new Error('The tracking worker failed. Camera tracking was stopped.')); this.stop(); };
        this.worker.onmessage = ({ data }) => {
          if (generation !== this.generation) return;
          if (data.type === 'ready') {
            clearTimeout(timeout); this.initReject = null; this.busy = false;
            this.captureLoop(generation); this.renderLoop(generation); resolve();
          } else if (data.type === 'pose') {
            this.busy = false; this.inferenceMs = this.inferenceMs ? 0.8 * this.inferenceMs + 0.2 * data.inferenceMs : data.inferenceMs;
            const now = performance.now(); this.frames.push(now); this.frames = this.frames.filter(time => now - time < 1000);
            this.quality = data.quality || 0;
            if (data.pose) this.motion.feed(data.pose, data.timestamp, this.quality);
            this.onOverlay(data);
          } else if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); this.stop(); this.status(data.message); }
        };
        this.worker.postMessage({ type: 'init' });
      });
    } catch (error) { if(generation!==this.generation)return;this.stop();throw error; }
  }
  captureLoop(generation) {
    const capture = async now => {
      if (!this.active || generation !== this.generation) return;
      this.captureFrame = requestAnimationFrame(capture);
      const period = Math.max(1000 / this.options.maxFps, this.inferenceMs * 1.3);
      if (this.busy || now - this.lastCapture + 1 < period || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
      this.busy = true; this.lastCapture = now; this.lastVideoTime = this.video.currentTime;
      let frame;
      try {
        const width = 384, height = Math.round(width * (this.video.videoHeight || 3) / (this.video.videoWidth || 4));
        frame = await createImageBitmap(this.video, { resizeWidth: width, resizeHeight: height });
        if (!this.active || generation !== this.generation || !this.worker) { frame.close(); return; }
        this.worker.postMessage({ type: 'frame', frame, timestamp: now }, [frame]);
      } catch (error) { frame?.close(); this.stop(); this.status(`Tracking stopped: ${error.message}`); }
    };
    this.captureFrame = requestAnimationFrame(capture);
  }
  renderLoop(generation) {
    const render = now => {
      if (!this.active || generation !== this.generation) return;
      this.motion.reverse = this.reverse;
      const pose = this.motion.value(now); this.displayYaw = pose.yawDegrees; this.onPose(pose);
      if (now - this.lastMetrics > 200) {
        this.lastMetrics = now;
        this.onMetrics({ ...pose, fps: this.frames.filter(time => now - time < 1000).length, inferenceMs: this.inferenceMs, quality: this.quality, rejected: this.motion.rejected });
        if (pose.state === 'calibrating') this.status(this.quality < 0.3 ? 'No clear face yet. Move into view and check the camera lighting.' : 'Calibrating: look at the screen and hold still for about one second.');
        else if (pose.state === 'tracking') this.status(this.quality < 0.6 ? 'Tracking a partial face. Face the camera for steadier positioning.' : 'Screen anchoring active. Turn gently; Recenter if you change your seating position.');
        else if (pose.state === 'holding') this.status('Face temporarily lost. Holding the last direction.');
        else this.status('Face lost. Returning gently to centre. A webcam cannot track a full turn away.');
      }
      this.renderFrame = requestAnimationFrame(render);
    };
    this.renderFrame = requestAnimationFrame(render);
  }
  recenter() {
    this.motion.calibrate();
    if (this.active) this.status('Recalibrating: face the screen and hold still.');
  }
  stop() {
    this.pending=false;this.onPending(false);
    this.generation++; cancelAnimationFrame(this.captureFrame); cancelAnimationFrame(this.renderFrame); clearTimeout(this.initTimeout);
    this.initReject?.(new Error('Head tracking stopped.')); this.initReject = null;
    this.worker?.terminate(); this.worker = null; this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.active = false; this.displayYaw = 0; this.motion.reset();
    this.onOverlay(null);
    this.onState(false); this.onPose({ yaw: 0, pitch: 0, roll: 0, yawDegrees: 0, pitchDegrees: 0 });
    this.onMetrics({ state: 'off', fps: 0, inferenceMs: 0, quality: 0, calibrationProgress: 0 });
    this.status('Camera off. No frames are recorded or uploaded.');
  }
}

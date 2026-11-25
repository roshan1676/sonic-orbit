import { guardBlock } from './dsp-math.js';

class PeakGuard extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = { gain: 1, peak: 0, squares: 0, count: 0 };
  }
  process(inputs, outputs) {
    guardBlock(inputs[0] || [], outputs[0], this.state, sampleRate);
    if (this.state.count >= 4096) {
      this.port.postMessage({ peak: this.state.peak, rms: Math.sqrt(this.state.squares / this.state.count), gain: this.state.gain });
      this.state.peak = 0;
      this.state.squares = 0;
      this.state.count = 0;
    }
    return true;
  }
}
registerProcessor('peak-guard', PeakGuard);

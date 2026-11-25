export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

// Stereo-linked, sample-peak gain control. This is not a true-peak limiter.
// State is reused between blocks; input and output may alias.
export function guardBlock(inputs, outputs, state, sampleRate) {
  const left = inputs[0];
  const right = inputs[1] || left;
  const outL = outputs[0];
  const outR = outputs[1];
  const release = Math.exp(-1 / (0.08 * sampleRate));
  for (let i = 0; i < outL.length; i++) {
    const l = Number.isFinite(left?.[i]) ? left[i] : 0;
    const r = Number.isFinite(right?.[i]) ? right[i] : 0;
    const peak = Math.max(Math.abs(l), Math.abs(r));
    const target = peak > 0.94 ? 0.94 / peak : 1;
    state.gain = target < state.gain ? target : release * state.gain + (1 - release) * target;
    outL[i] = l * state.gain;
    if (outR) outR[i] = r * state.gain;
    state.peak = Math.max(state.peak, Math.abs(outL[i]), Math.abs(outR?.[i] || 0));
    state.squares += (outL[i] ** 2 + (outR?.[i] || 0) ** 2) * 0.5;
    state.count++;
  }
}

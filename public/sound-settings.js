import { clamp } from './dsp-math.js';

export const SOUND_RANGES = Object.freeze({ bass: [-6, 6], warmth: [-4, 4], clarity: [-2, 6], treble: [-4, 4], tightness: [0, 100], focus: [0, 100], anchor: [0, 100], dynamics: [0, 100], width: [0, 100], room: [0, 40], space: [0, 100], height: [0, 100], volume: [0, 100] });
export const DEFAULTS = Object.freeze({ mode: 'original', output: 'headphones', preset: 'neutral', bass: 0, warmth: 0, clarity: 0, treble: 0, tightness: 0, focus: 0, anchor: 0, dynamics: 0, width: 55, room: 15, space: 55, height: 15, volume: 50 });
export const PRESETS = Object.freeze({
  neutral: { name: 'Neutral', bass: 0, warmth: 0, clarity: 0, treble: 0, tightness: 0, focus: 0, anchor: 0, dynamics: 0, width: 55, room: 10, space: 55, height: 10 },
  cinema: { name: 'Cinema', bass: 3, warmth: -0.5, clarity: 1.5, treble: 0.5, tightness: 25, focus: 12, anchor: 65, dynamics: 0, width: 65, room: 18, space: 85, height: 25 },
  dialogue: { name: 'Dialogue', bass: 0, warmth: -1, clarity: 2.5, treble: 0, tightness: 30, focus: 55, anchor: 85, dynamics: 25, width: 35, room: 4, space: 60, height: 0 },
  music: { name: 'Music', bass: 2, warmth: 0, clarity: 0.5, treble: 1, tightness: 15, focus: 0, anchor: 35, dynamics: 0, width: 65, room: 10, space: 65, height: 10 },
  night: { name: 'Late night', bass: 0.5, warmth: -0.5, clarity: 2, treble: 0, tightness: 30, focus: 30, anchor: 75, dynamics: 70, width: 45, room: 8, space: 65, height: 10 }
});
export function sanitizeSound(patch = {}) {
  const settings = { ...DEFAULTS };
  for (const [key, [min, max]] of Object.entries(SOUND_RANGES)) if (Number.isFinite(patch[key])) settings[key] = clamp(patch[key], min, max);
  settings.mode = patch.mode === 'enhanced' ? 'enhanced' : 'original';
  settings.output = patch.output === 'speakers' ? 'speakers' : 'headphones';
  settings.preset = Object.hasOwn(PRESETS, patch.preset) || patch.preset === 'custom' ? patch.preset : 'neutral';
  return settings;
}

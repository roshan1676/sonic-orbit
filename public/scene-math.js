export const SCENE_DEFAULTS = Object.freeze({ vocals: { azimuth: 0, level: 0 }, drums: { azimuth: 35, level: -1 }, bass: { azimuth: -10, level: -1 }, other: { azimuth: -40, level: -1 } });
export function sourcePosition(degrees, radius = 2, elevation = 0) {
  const radians = degrees * Math.PI / 180, vertical = elevation * Math.PI / 180;
  return [Math.sin(radians) * Math.cos(vertical) * radius, Math.sin(vertical) * radius, -Math.cos(radians) * Math.cos(vertical) * radius];
}
export function distanceAttenuation(distance, referenceDistance = 2, rolloff = 1) {
  return referenceDistance / (referenceDistance + rolloff * Math.max(0, distance - referenceDistance));
}
export function focusAttenuation(forward, position, amount) {
  const distance = Math.hypot(...position); if (!distance) return 1;
  const dot = Math.max(-1, Math.min(1, forward.reduce((sum, value, i) => sum + value * position[i] / distance, 0)));
  const db = -6 * Math.max(0, Math.min(1, amount)) * (1 - dot) / 2;
  return 10 ** (db / 20);
}

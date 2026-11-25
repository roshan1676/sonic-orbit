import { clamp } from './dsp-math.js';

// MediaPipe JS face geometry is supplied as a column-major 4x4 pose matrix.
// Rotation is relative to a user-selected neutral pose; monocular translation is ignored.
export function matrixToPose(matrix) {
  const m = matrix?.data;
  if (!m || m.length !== 16 || !m.every(Number.isFinite)) return null;
  const forwardLength = Math.hypot(m[8], m[9], m[10]);
  if (forwardLength < 0.0001) return null;
  return { yaw: Math.atan2(m[8], m[10]), pitch: Math.asin(clamp(m[9] / forwardLength, -1, 1)), roll: Math.atan2(m[1], m[5]) };
}

export function relativePose(pose, neutral, reverse = false) {
  const wrapped = Math.atan2(Math.sin(pose.yaw - neutral.yaw), Math.cos(pose.yaw - neutral.yaw));
  // Camera and listener look toward one another, so their horizontal axes oppose.
  const yaw = clamp(wrapped * (reverse ? 1 : -1), -1.4, 1.4);
  const pitch = clamp(pose.pitch - neutral.pitch, -0.7, 0.7);
  return { yaw, pitch, yawDegrees: yaw * 180 / Math.PI };
}

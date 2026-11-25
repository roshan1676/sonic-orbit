export function normalizeQuaternion(q) {
  if (!q || !['x', 'y', 'z', 'w'].every(k => Number.isFinite(q[k]))) return null;
  const n = Math.hypot(q.x, q.y, q.z, q.w); if (n < 1e-8) return null;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
export const identity = () => ({ x: 0, y: 0, z: 0, w: 1 });
export const inverseQuaternion = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function multiplyQuaternion(a, b) {
  return { x: a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y, y: a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x, z: a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w, w: a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z };
}
export function eulerQuaternion(yaw = 0, pitch = 0, roll = 0) {
  if (![yaw, pitch, roll].every(Number.isFinite)) return null;
  const y = { x: 0, y: -Math.sin(yaw/2), z: 0, w: Math.cos(yaw/2) };
  const p = { x: Math.sin(pitch/2), y: 0, z: 0, w: Math.cos(pitch/2) };
  const r = { x: 0, y: 0, z: -Math.sin(roll/2), w: Math.cos(roll/2) };
  return normalizeQuaternion(multiplyQuaternion(multiplyQuaternion(y, p), r));
}
export function slerpQuaternion(a, b, t) {
  let dot = a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w;
  if (dot < 0) { b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; dot = -dot; }
  dot = Math.min(1, dot); t = Math.max(0, Math.min(1, t));
  if (dot > 0.9995) return normalizeQuaternion(Object.fromEntries(['x','y','z','w'].map(k => [k,a[k]+t*(b[k]-a[k])])));
  const angle = Math.acos(dot), denom = Math.sin(angle), s0 = Math.sin((1-t)*angle)/denom, s1 = Math.sin(t*angle)/denom;
  return { x: a.x*s0+b.x*s1, y: a.y*s0+b.y*s1, z: a.z*s0+b.z*s1, w: a.w*s0+b.w*s1 };
}
export function listenerBasis(quaternion) {
  const q = normalizeQuaternion(quaternion); if (!q) return null;
  const rotate = ([x,y,z]) => {
    const tx = 2*(q.y*z-q.z*y), ty = 2*(q.z*x-q.x*z), tz = 2*(q.x*y-q.y*x);
    return [x+q.w*tx+q.y*tz-q.z*ty, y+q.w*ty+q.z*tx-q.x*tz, z+q.w*tz+q.x*ty-q.y*tx];
  };
  return { forward: rotate([0,0,-1]), up: rotate([0,1,0]) };
}

import type { Vec3 } from './types';

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type Quat = [number, number, number, number];

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function m3mul(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function m3mulV3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function m3rotX(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function m3rotY(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function m3rotZ(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function m3fromEulerXYZDeg(rotDeg: Vec3): Mat3 {
  const rx = m3rotX(degToRad(rotDeg[0]));
  const ry = m3rotY(degToRad(rotDeg[1]));
  const rz = m3rotZ(degToRad(rotDeg[2]));
  // XYZ order
  return m3mul(m3mul(rz, ry), rx);
}

export function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function quatInvertUnit(q: Quat): Quat {
  // For unit quaternion, inverse is conjugate.
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  // v' = q * v * q^-1 (optimized)
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v' = v + qw * t + cross(q.xyz, t)
  const cx = qy * tz - qz * ty;
  const cy = qz * tx - qx * tz;
  const cz = qx * ty - qy * tx;

  return [vx + qw * tx + cx, vy + qw * ty + cy, vz + qw * tz + cz];
}

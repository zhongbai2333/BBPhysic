import type { Vec3 } from './types';
import type { Quat } from './preview_math';
import { m3fromEulerXYZDeg, m3mul, m3mulV3, quatInvertUnit, quatRotateVec3, v3sub } from './preview_math';

export function resolveGroupByUuid(uuid: string | null): Group | null {
  if (!uuid) return null;
  try {
    const groups = (Group as any).all as Group[] | undefined;
    if (!Array.isArray(groups)) return null;
    const g = groups.find((x) => x && (x as any).uuid === uuid);
    return (g as any) || null;
  } catch {
    return null;
  }
}

function readGroupOriginAny(group: any): Vec3 {
  try {
    const o = group?.origin;
    if (Array.isArray(o) && o.length >= 3) return [Number(o[0]) || 0, Number(o[1]) || 0, Number(o[2]) || 0];
    if (o && typeof o === 'object') return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0];
  } catch {
    // ignore
  }
  return [0, 0, 0];
}

function readGroupRotationDegAny(group: any): Vec3 {
  try {
    const r = group?.rotation;
    if (Array.isArray(r) && r.length >= 3) return [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0];
    if (r && typeof r === 'object') return [Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0];
  } catch {
    // ignore
  }
  return [0, 0, 0];
}

export function getGroupWorldPivot(group: any): Vec3 {
  if (!group) return [0, 0, 0];

  // Blockbench group's pivot is stored on `origin` (model coordinates).
  // For empty groups/bones, `group.mesh.getWorldPosition()` can drift to children center,
  // which shows up as a consistent offset (often ~1 cube height).
  try {
    const o = group?.origin;
    if (o !== undefined && o !== null) {
      return readGroupOriginAny(group);
    }
  } catch {
    // ignore
  }

  // Best: ask THREE for the group's world position.
  // In Blockbench this Object3D represents the actual pivot used for transforms.
  try {
    const THREE = (globalThis as any).THREE;
    const mesh = group.mesh;
    if (THREE && mesh && typeof mesh.getWorldPosition === 'function') {
      const v = new THREE.Vector3();
      mesh.getWorldPosition(v);
      return [v.x, v.y, v.z];
    }
  } catch {
    // ignore
  }

  // Fallback: group.origin (typically model-space pivot).
  try {
    return readGroupOriginAny(group);
  } catch {
    // ignore
  }

  // Legacy fallback: approximate from parent chain (kept as last resort).
  // If origins are already absolute, this degenerates to the same as origin anyway.
  try {
    const chain: any[] = [];
    let cur = group;
    for (let guard = 0; guard < 256 && cur && cur !== 'root'; guard++) {
      chain.push(cur);
      const p = cur.parent;
      if (!p || p === 'root') break;
      if ((p as any).type === 'group' || (p as any).constructor?.name === 'Group') {
        cur = p;
        continue;
      }
      break;
    }
    chain.reverse();
    if (!chain.length) return [0, 0, 0];

    const origins = chain.map(readGroupOriginAny);
    const rots = chain.map(readGroupRotationDegAny);

    let worldPos = origins[0];
    let worldRot = m3fromEulerXYZDeg(rots[0]);
    for (let i = 1; i < chain.length; i++) {
      const restOffset = v3sub(origins[i], origins[i - 1]);
      const rotated = m3mulV3(worldRot, restOffset);
      worldPos = [worldPos[0] + rotated[0], worldPos[1] + rotated[1], worldPos[2] + rotated[2]];
      worldRot = m3mul(worldRot, m3fromEulerXYZDeg(rots[i]));
    }
    return worldPos;
  } catch {
    // ignore
  }

  return [0, 0, 0];
}

/**
 * 获取 Group 的旋转（四元数）
 */
export function getGroupRotationQuaternion(group: any): Quat {
  // Blockbench uses euler angles, convert to quaternion
  const rx = (group.rotation?.[0] ?? 0) * Math.PI / 180;
  const ry = (group.rotation?.[1] ?? 0) * Math.PI / 180;
  const rz = (group.rotation?.[2] ?? 0) * Math.PI / 180;

  // Simple euler to quaternion conversion (ZYX order)
  const cy = Math.cos(ry * 0.5);
  const sy = Math.sin(ry * 0.5);
  const cp = Math.cos(rx * 0.5);
  const sp = Math.sin(rx * 0.5);
  const cr = Math.cos(rz * 0.5);
  const sr = Math.sin(rz * 0.5);

  const qw = cr * cp * cy + sr * sp * sy;
  const qx = sr * cp * cy - cr * sp * sy;
  const qy = cr * sp * cy + sr * cp * sy;
  const qz = cr * cp * sy - sr * sp * cy;

  return [qx, qy, qz, qw];
}

export function getCubeWorldQuaternion(cubeObj: any, fallbackGroup: any): Quat {
  try {
    const THREE = (globalThis as any).THREE;
    const mesh = cubeObj?.mesh;
    if (THREE && mesh && typeof mesh.getWorldQuaternion === 'function') {
      const q = new THREE.Quaternion();
      mesh.getWorldQuaternion(q);
      return [q.x, q.y, q.z, q.w];
    }
  } catch {
    // ignore
  }
  if (fallbackGroup) {
    return getGroupRotationQuaternion(fallbackGroup);
  }
  return [0, 0, 0, 1];
}

export function setMeshWorldTransform(mesh: any, worldPos: Vec3, worldQuat: Quat): void {
  try {
    const THREE = (globalThis as any).THREE;
    if (!THREE || !mesh) return;

    const pos = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
    const quat = new THREE.Quaternion(worldQuat[0], worldQuat[1], worldQuat[2], worldQuat[3]);

    const parent = mesh.parent;
    if (parent && typeof parent.updateMatrixWorld === 'function') {
      parent.updateMatrixWorld(true);

      const parentWorldQuat = new THREE.Quaternion();
      if (typeof parent.getWorldQuaternion === 'function') {
        parent.getWorldQuaternion(parentWorldQuat);
      }
      const invParentQuat = parentWorldQuat.clone().invert();
      const localQuat = invParentQuat.multiply(quat);

      const invParentMat = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      const localPos = pos.clone().applyMatrix4(invParentMat);

      mesh.position.copy(localPos);
      mesh.quaternion.copy(localQuat);
      if (typeof mesh.updateMatrixWorld === 'function') {
        mesh.updateMatrixWorld(true);
      }
      return;
    }

    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    if (typeof mesh.updateMatrixWorld === 'function') {
      mesh.updateMatrixWorld(true);
    }
  } catch {
    // ignore
  }
}

export function computeMeshPivotOffsetLocal(mesh: any, bodyCenterWorld: Vec3, bodyRotationWorld: Quat): Vec3 {
  try {
    const THREE = (globalThis as any).THREE;
    if (!THREE || !mesh || typeof mesh.getWorldPosition !== 'function') return [0, 0, 0];
    const p = new THREE.Vector3();
    mesh.getWorldPosition(p);
    const pivotWorld: Vec3 = [p.x, p.y, p.z];
    return quatRotateVec3(quatInvertUnit(bodyRotationWorld), v3sub(pivotWorld, bodyCenterWorld));
  } catch {
    return [0, 0, 0];
  }
}

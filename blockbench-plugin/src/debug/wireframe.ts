import type { AABB, Vec3 } from '../physics/types';
import { t } from '../i18n';

declare const THREE: any;

const SETTINGS_STORAGE_KEY = 'bbphysic.settings.v1';

type WireframeSettings = {
  wireframe_color: string;
  wireframe_opacity: number;
  wireframe_diagonals: 'none' | 'one' | 'all';
  show_joint_markers: boolean;
  show_collider_markers: boolean;
};

const DEFAULT_WIREFRAME_SETTINGS: WireframeSettings = {
  wireframe_color: '#00c8ff',
  wireframe_opacity: 0.5,
  wireframe_diagonals: 'one',
  show_joint_markers: true,
  show_collider_markers: true,
};

function loadWireframeSettings(): WireframeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIREFRAME_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<WireframeSettings>;
    return {
      ...DEFAULT_WIREFRAME_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_WIREFRAME_SETTINGS };
  }
}

function getCubeAabbWorld(cube: Cube): AABB | null {
  try {
    if ((cube as any).visibility === false) return null;
    const verts = cube.getGlobalVertexPositions();
    if (!Array.isArray(verts) || verts.length === 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const v of verts) {
      const x = v[0];
      const y = v[1];
      const z = v[2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  } catch {
    return null;
  }
}

function collectCubesUnderGroup(group: Group): Cube[] {
  const maxLevels = 9999;
  const all = (Cube as any).all as Cube[] | undefined;
  if (!Array.isArray(all)) return [];
  return all.filter((c) => {
    try {
      return c && c.isChildOf(group as any, maxLevels);
    } catch {
      return false;
    }
  });
}

// ===== Legacy (main branch) style helpers: traverse Outliner nodes + compute pivots =====

function getNodeByUUID(uuid: string) {
  try {
    const uuids = (globalThis as any).OutlinerNode?.uuids;
    if (uuids && typeof uuids === 'object') {
      return uuids[String(uuid)];
    }
  } catch {
    // ignore
  }
  return null;
}

function isOutlinerGroup(obj: any): boolean {
  return !!obj && (obj.type === 'group' || obj.constructor?.name === 'Group');
}

function isBoneGroup(obj: any): boolean {
  // Bone-like groups are the ones that actually have a mesh in the scene.
  return isOutlinerGroup(obj) && !!obj.mesh;
}

function collectGroupsDepthFirst(root: any): any[] {
  // Use manual .children traversal (isChildOf doesn't work for groups)
  const out: any[] = [];
  const stack: any[] = [];
  if (root) stack.push(root);
  
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    
    if (isOutlinerGroup(cur)) out.push(cur);
    const children = cur.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child) stack.push(child);
      }
    }
  }
  
  return out;
}

function readVec3Any(v: any): Vec3 {
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  if (v && typeof v === 'object') return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
  return [0, 0, 0];
}

function readGroupOriginAny(group: any): Vec3 {
  return readVec3Any(group?.origin);
}

function readGroupRotationDegAny(group: any): Vec3 {
  // Blockbench stores group rotation in degrees.
  return readVec3Any(group?.rotation);
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

type Mat3 = [number, number, number, number, number, number, number, number, number];

function m3mul(a: Mat3, b: Mat3): Mat3 {
  const a00 = a[0], a01 = a[1], a02 = a[2];
  const a10 = a[3], a11 = a[4], a12 = a[5];
  const a20 = a[6], a21 = a[7], a22 = a[8];
  const b00 = b[0], b01 = b[1], b02 = b[2];
  const b10 = b[3], b11 = b[4], b12 = b[5];
  const b20 = b[6], b21 = b[7], b22 = b[8];
  return [
    a00 * b00 + a01 * b10 + a02 * b20,
    a00 * b01 + a01 * b11 + a02 * b21,
    a00 * b02 + a01 * b12 + a02 * b22,
    a10 * b00 + a11 * b10 + a12 * b20,
    a10 * b01 + a11 * b11 + a12 * b21,
    a10 * b02 + a11 * b12 + a12 * b22,
    a20 * b00 + a21 * b10 + a22 * b20,
    a20 * b01 + a21 * b11 + a22 * b21,
    a20 * b02 + a21 * b12 + a22 * b22,
  ];
}

function m3mulV3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function m3rotX(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

function m3rotY(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function m3rotZ(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function m3fromEulerXYZDeg(rotDeg: Vec3): Mat3 {
  const rx = m3rotX(degToRad(rotDeg[0]));
  const ry = m3rotY(degToRad(rotDeg[1]));
  const rz = m3rotZ(degToRad(rotDeg[2]));
  // XYZ order
  return m3mul(m3mul(rz, ry), rx);
}

function computeGroupPivotWorldCurrentPose(group: any): Vec3 {
  if (!group) return [0, 0, 0];

  // Prefer Blockbench pivot (origin). For empty groups/bones, mesh world position can drift.
  try {
    const o = group?.origin;
    if (o !== undefined && o !== null) {
      return readGroupOriginAny(group);
    }
  } catch {
    // ignore
  }

  // Best path: ask THREE for world position.
  try {
    const mesh = group.mesh;
    if (mesh && typeof mesh.getWorldPosition === 'function' && typeof THREE !== 'undefined' && THREE) {
      const tmp = new THREE.Vector3();
      mesh.getWorldPosition(tmp);
      return [tmp.x, tmp.y, tmp.z];
    }
  } catch {
    // ignore
  }

  // Fallback: approximate using origins + rotations along the parent chain.
  const chain: any[] = [];
  let cur = group;
  for (let guard = 0; guard < 256 && cur && cur !== 'root'; guard++) {
    if (isOutlinerGroup(cur)) chain.push(cur);
    const p = cur.parent;
    if (!p || p === 'root') break;
    cur = p;
  }
  chain.reverse();
  if (!chain.length) return [0, 0, 0];

  const origins = chain.map(readGroupOriginAny);
  const rots = chain.map(readGroupRotationDegAny);

  let worldPos = origins[0];
  let worldRot = m3fromEulerXYZDeg(rots[0]);
  for (let i = 1; i < chain.length; i++) {
    const restOffset = v3sub(origins[i], origins[i - 1]);
    worldPos = v3add(worldPos, m3mulV3(worldRot, restOffset));
    worldRot = m3mul(worldRot, m3fromEulerXYZDeg(rots[i]));
  }
  return worldPos;
}

function resolveGroupByUuid(uuid: string | null): Group | null {
  if (!uuid) return null;
  const groups = (Group as any).all as Group[] | undefined;
  if (!Array.isArray(groups)) return null;
  const g = groups.find((x) => x && (x as any).uuid === uuid);
  return (g as any) || null;
}

function aabbEdges(aabb: AABB): Float32Array {
  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, maxZ] = aabb.max;

  const p000: Vec3 = [minX, minY, minZ];
  const p100: Vec3 = [maxX, minY, minZ];
  const p010: Vec3 = [minX, maxY, minZ];
  const p110: Vec3 = [maxX, maxY, minZ];
  const p001: Vec3 = [minX, minY, maxZ];
  const p101: Vec3 = [maxX, minY, maxZ];
  const p011: Vec3 = [minX, maxY, maxZ];
  const p111: Vec3 = [maxX, maxY, maxZ];

  const lines: Vec3[] = [
    // bottom
    p000, p100,
    p100, p101,
    p101, p001,
    p001, p000,
    // top
    p010, p110,
    p110, p111,
    p111, p011,
    p011, p010,
    // verticals
    p000, p010,
    p100, p110,
    p101, p111,
    p001, p011,
  ];

  const out = new Float32Array(lines.length * 3);
  for (let i = 0; i < lines.length; i++) {
    out[i * 3 + 0] = lines[i][0];
    out[i * 3 + 1] = lines[i][1];
    out[i * 3 + 2] = lines[i][2];
  }
  return out;
}

function cubeEdgesFor8Vertices(): [number, number][] {
  return [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],

    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],

    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
}

function safeGetCubeVerticesWorld(cube: Cube): Vec3[] {
  try {
    if ((cube as any).visibility === false) return [];
    const verts = cube.getGlobalVertexPositions();
    if (!Array.isArray(verts)) return [];
    return verts
      .filter((v) => Array.isArray(v) && v.length >= 3)
      .map((v) => [Number(v[0]), Number(v[1]), Number(v[2])] as Vec3);
  } catch {
    return [];
  }
}

function buildEdgePositionsFromVertices(vertices: Vec3[], edges: [number, number][]): Float32Array {
  const out = new Float32Array(edges.length * 2 * 3);
  let i = 0;
  for (const [aIdx, bIdx] of edges) {
    const a = vertices[aIdx];
    const b = vertices[bIdx];
    if (!a || !b) continue;
    out[i++] = a[0];
    out[i++] = a[1];
    out[i++] = a[2];
    out[i++] = b[0];
    out[i++] = b[1];
    out[i++] = b[2];
  }
  return i === out.length ? out : out.slice(0, i);
}

function cubeObbLinePositions(cube: Cube, diagonalsMode: 'none' | 'one' | 'all', diagVariant: number): Float32Array | null {
  const verts = safeGetCubeVerticesWorld(cube);
  if (verts.length !== 8) return null;

  const edgePositions = buildEdgePositionsFromVertices(verts, cubeEdgesFor8Vertices());
  if (diagonalsMode === 'none') return edgePositions;

  // Body diagonals (choose one deterministically per cube to distinguish)
  const diagPairs: [number, number][] = [
    [0, 6],
    [1, 7],
    [2, 4],
    [3, 5],
  ];
  const picked = diagonalsMode === 'all' ? diagPairs : [diagPairs[Math.abs(diagVariant) % diagPairs.length]];
  const diagPositions = buildEdgePositionsFromVertices(verts, picked);

  return concatFloat32Arrays([edgePositions, diagPositions]);
}

function aabbDiagonals(aabb: AABB, mode: 'none' | 'one' | 'all', variant: number): Float32Array {
  if (mode === 'none') return new Float32Array(0);

  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, maxZ] = aabb.max;

  const p000: Vec3 = [minX, minY, minZ];
  const p100: Vec3 = [maxX, minY, minZ];
  const p010: Vec3 = [minX, maxY, minZ];
  const p110: Vec3 = [maxX, maxY, minZ];
  const p001: Vec3 = [minX, minY, maxZ];
  const p101: Vec3 = [maxX, minY, maxZ];
  const p011: Vec3 = [minX, maxY, maxZ];
  const p111: Vec3 = [maxX, maxY, maxZ];

  const candidates: [Vec3, Vec3][] = [
    [p000, p111],
    [p100, p011],
    [p010, p101],
    [p110, p001],
  ];

  const pairs: [Vec3, Vec3][] = mode === 'all' ? candidates : [candidates[Math.abs(variant) % candidates.length]];

  const out = new Float32Array(pairs.length * 2 * 3);
  let i = 0;
  for (const [a, b] of pairs) {
    out[i++] = a[0];
    out[i++] = a[1];
    out[i++] = a[2];
    out[i++] = b[0];
    out[i++] = b[1];
    out[i++] = b[2];
  }
  return out;
}

function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

function aabbCenter(aabb: AABB): Vec3 {
  return [
    (aabb.min[0] + aabb.max[0]) * 0.5,
    (aabb.min[1] + aabb.max[1]) * 0.5,
    (aabb.min[2] + aabb.max[2]) * 0.5,
  ];
}

let enabled = false;
let movingUuid: string | null = null;
let colliderUuid: string | null = null;
let rafHandle: number | null = null;
let lastUpdate = 0;

let lineObjects: THREE.LineSegments[] = [];
let markerObjects: THREE.Object3D[] = [];

function clearObjects() {
  for (const o of lineObjects.splice(0, lineObjects.length)) {
    try {
      Canvas.scene.remove(o);
      o.geometry.dispose();
      (o.material as any)?.dispose?.();
    } catch {
      // ignore
    }
  }
  for (const o of markerObjects.splice(0, markerObjects.length)) {
    try {
      Canvas.scene.remove(o);
      (o as any).geometry?.dispose?.();
      (o as any).material?.dispose?.();
    } catch {
      // ignore
    }
  }
}

function buildGroupPivotMarker(group: any, color: any) {
  try {
    let p = computeGroupPivotWorldCurrentPose(group);
    try {
      const uuid = String(group?.uuid ?? '');
      const map = (window as any).BBPhysicPreviewGroupPivots as Record<string, Vec3> | undefined;
      const override = uuid && map ? (map as any)[uuid] : null;
      if (Array.isArray(override) && override.length >= 3) {
        p = [Number(override[0]) || 0, Number(override[1]) || 0, Number(override[2]) || 0];
      }
    } catch {
      // ignore
    }
    const pos = new THREE.Vector3(p[0], p[1], p[2]);
    const geom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.renderOrder = 999;
    Canvas.scene.add(mesh);
    markerObjects.push(mesh);
  } catch {
    // ignore
  }
}

export function setWireframeTargets(params: { movingGroupUuid: string | null; colliderGroupUuid: string | null }) {
  movingUuid = params.movingGroupUuid;
  colliderUuid = params.colliderGroupUuid;
  if (enabled) {
    updateWireframeOnce(true);
  }
}

export function updateWireframeOnce(force = false) {
  if (!enabled) return;

  const now = performance.now();
  if (!force && now - lastUpdate < 150) return;
  lastUpdate = now;

  const moving = resolveGroupByUuid(movingUuid);
  const collider = resolveGroupByUuid(colliderUuid);

  clearObjects();

  const settings = loadWireframeSettings();
  const color = new THREE.Color(settings.wireframe_color || DEFAULT_WIREFRAME_SETTINGS.wireframe_color);
  const opacity = Math.min(1, Math.max(0, Number(settings.wireframe_opacity ?? DEFAULT_WIREFRAME_SETTINGS.wireframe_opacity)));
  const diagonals = settings.wireframe_diagonals ?? DEFAULT_WIREFRAME_SETTINGS.wireframe_diagonals;

  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });

  const addCubeLines = (c: Cube, tint?: THREE.Color) => {
    const uuid = String((c as any).uuid ?? '');
    const diagVariant = fnv1a32(uuid);

    // Prefer OBB lines from 8 world vertices; fallback to AABB lines.
    const obb = cubeObbLinePositions(c, diagonals, diagVariant);
    let positions: Float32Array | null = obb;
    if (!positions) {
      const aabb = getCubeAabbWorld(c);
      if (!aabb) return;
      const base = aabbEdges(aabb);
      const diag = aabbDiagonals(aabb, diagonals, diagVariant);
      positions = diag.length > 0 ? concatFloat32Arrays([base, diag]) : base;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = tint
      ? new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity, depthTest: false })
      : material;
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 999;
    Canvas.scene.add(lines);
    lineObjects.push(lines);
  };

  // moving group: cyan
  if (moving) {
    const cubes = collectCubesUnderGroup(moving);
    for (const c of cubes) {
      addCubeLines(c, color);
    }
  }

  // collider group: red-ish
  if (settings.show_collider_markers && collider) {
    const tint = new THREE.Color('#ff4d4d');
    const cubes = collectCubesUnderGroup(collider);
    for (const c of cubes) {
      addCubeLines(c, tint);
    }
  }

  if (settings.show_joint_markers) {
    // In modeling workflow, the "joint" is the Group pivot (origin), not the cube AABB center.
    if (moving || collider) {
      // Collect groups from BOTH moving and collider groups to show all joints
      const movingGroups: any[] = [];
      const colliderGroups: any[] = [];
      
      if (moving) {
        movingGroups.push(...collectGroupsDepthFirst(moving));
      }
      if (collider) {
        colliderGroups.push(...collectGroupsDepthFirst(collider));
      }
      
      // Combine and deduplicate
      const allGroups: any[] = [...movingGroups];
      for (const g of colliderGroups) {
        if (!allGroups.some((existing: any) => existing.uuid === g.uuid)) {
          allGroups.push(g);
        }
      }
      
      const bones = allGroups.filter(isBoneGroup);
      const toShow = bones.length ? bones : allGroups;
      
      // Simplified debug output
      if (toShow.length > 0) {
        console.log('[BBPhysic] Joint markers:', {
          moving: movingGroups.length,
          collider: colliderGroups.length,
          total: toShow.length,
        });
      }
      
      // Build markers with correct colors based on hierarchy
      for (const g of toShow) {
        // Check if this group belongs to collider hierarchy
        const isColliderGroup = colliderGroups.some((cg: any) => cg.uuid === g.uuid);
        const markerColor = isColliderGroup 
          ? new THREE.Color('#ff4d4d')  // Red for collider
          : color;                        // Cyan for moving
        buildGroupPivotMarker(g, markerColor);
      }
    }
  }
}

export function enableWireframe() {
  if (enabled) return;
  enabled = true;
  Blockbench.showQuickMessage(t('bbphysic.wireframe.enabled', 'BBPhysic: 线框显示已开启'), 1200);

  const loop = (ts: number) => {
    if (!enabled) return;
    updateWireframeOnce(false);
    rafHandle = requestAnimationFrame(loop);
  };

  lastUpdate = 0;
  rafHandle = requestAnimationFrame(loop);
}

export function disableWireframe() {
  if (!enabled) return;
  enabled = false;
  if (rafHandle != null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  clearObjects();
  Blockbench.showQuickMessage(t('bbphysic.wireframe.disabled', 'BBPhysic: 线框显示已关闭'), 1200);
}

export function isWireframeEnabled() {
  return enabled;
}

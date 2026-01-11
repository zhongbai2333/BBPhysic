/**
 * Real-time physics preview module
 * Implements OBB-based physics simulation with live visualization
 */

import { ensureBBPhysicWasmModule } from '../wasm/runtime';
import { updateWireframeOnce } from '../debug/wireframe';
import { getPreparedPhysicsJob } from './prep';
import type { Vec3 } from './types';
import { PhysicsWorld, RigidBodyType, type Transform } from './world';
import {
  computeMeshPivotOffsetLocal,
  getCubeWorldQuaternion,
  getGroupWorldPivot,
  resolveGroupByUuid,
  setMeshWorldTransform,
} from './preview_blockbench';
import type { Quat } from './preview_math';
import { quatInvertUnit, quatRotateVec3, v3add, v3sub } from './preview_math';

interface PhysicsBody {
  bodyId: number;
  cubeUuid: string;
  groupUuid: string | null;
  isCollider: boolean;
  bodyType: RigidBodyType;
  drivenByEditor: boolean;
  initialTransform: Transform;
  mesh: any | null;
  originalMeshLocalPos: any | null;
  originalMeshLocalQuat: any | null;
  // Mesh pivot offset relative to rigid body center, expressed in rigid body's local space.
  // This keeps the visual cube aligned when the modeling pivot is not at the geometric center.
  meshPivotOffsetLocal: Vec3;
}

interface GroupBody {
  groupUuid: string;
  bodyId: number;
  initialTransform: Transform;
}

interface PreviewRuntimeState {
  isRunning: boolean;
  isPaused: boolean;
  world: PhysicsWorld | null;
  bodies: PhysicsBody[];
  groupBodies: GroupBody[];
  animationFrameId: number | null;
  lastStepTimeMs: number;
  accumulatedTimeSec: number;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(1);
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 10) return n.toFixed(3);
  return n.toFixed(4);
}

function fmtV3(v: Vec3): string {
  return `[${fmtNum(v[0])}, ${fmtNum(v[1])}, ${fmtNum(v[2])}]`;
}

function fmtQ4(q: Quat): string {
  return `[${fmtNum(q[0])}, ${fmtNum(q[1])}, ${fmtNum(q[2])}, ${fmtNum(q[3])}]`;
}

/**
 * Calculate OBB half-extents from 8 vertices
 * 从 8 个顶点计算 OBB 半尺寸
 */
function calculateOBBHalfExtents(vertices: Vec3[]): Vec3 {
  if (vertices.length !== 8) {
    return [0.5, 0.5, 0.5];
  }

  // Calculate AABB first (simple approximation)
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return [
    (maxX - minX) / 2,
    (maxY - minY) / 2,
    (maxZ - minZ) / 2,
  ];
}

function calculateOBBHalfExtentsWithRotation(verticesWorld: Vec3[], centerWorld: Vec3, rotationWorld: Quat): Vec3 {
  if (verticesWorld.length !== 8) {
    return calculateOBBHalfExtents(verticesWorld);
  }

  // Convert world vertices into the box's local frame: v_local = inv(R) * (v_world - center)
  const inv = quatInvertUnit(rotationWorld);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of verticesWorld) {
    const local = quatRotateVec3(inv, v3sub(v, centerWorld));
    minX = Math.min(minX, local[0]);
    minY = Math.min(minY, local[1]);
    minZ = Math.min(minZ, local[2]);
    maxX = Math.max(maxX, local[0]);
    maxY = Math.max(maxY, local[1]);
    maxZ = Math.max(maxZ, local[2]);
  }

  return [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2];
}

/**
 * Calculate OBB center from 8 vertices
 * 从 8 个顶点计算 OBB 中心
 */
function calculateOBBCenter(vertices: Vec3[]): Vec3 {
  if (vertices.length !== 8) {
    return [0, 0, 0];
  }

  let sumX = 0, sumY = 0, sumZ = 0;
  for (const [x, y, z] of vertices) {
    sumX += x;
    sumY += y;
    sumZ += z;
  }

  return [sumX / 8, sumY / 8, sumZ / 8];
}

class PhysicsPreviewController {
  private readonly state: PreviewRuntimeState = {
    isRunning: false,
    isPaused: false,
    world: null,
    bodies: [],
    groupBodies: [],
    animationFrameId: null,
    lastStepTimeMs: 0,
    accumulatedTimeSec: 0,
  };

  private lastPreviewDebugLogMs = 0;
  private previewStepsSinceLastDebugLog = 0;
  private lastPreviewProbePos: Vec3 | null = null;
  private lastPreviewProbeRot: Quat | null = null;

  private outlinerCache = new Map<string, any>();
  private outlinerCacheLen = -1;

  // ===== Drag-to-apply-force controls (non-destructive) =====
  // Gesture: Shift + Left Mouse drag.
  // Implementation: a simple critically-damped spring that pulls the rigid body
  // towards the mouse ray intersection point on a screen-facing plane.
  private dragDomEl: HTMLElement | null = null;
  private isDragging = false;
  private dragBodyId: number | null = null;
  private dragBodyUuid: string | null = null;
  private dragGrabOffsetLocal: Vec3 = [0, 0, 0];
  private dragPlanePointWorld: Vec3 = [0, 0, 0];
  private dragPlaneNormalWorld: Vec3 = [0, 0, 1];
  private dragTargetPointWorld: Vec3 = [0, 0, 0];
  private dragHasTarget = false;

  private dragConvertedToKinematic = false;
  private dragOriginalBodyType: RigidBodyType | null = null;

  // Release inertia support
  private dragLastVelWorld: Vec3 = [0, 0, 0];
  private dragLastVelValid = false;

  private getDragSettings(): { strength: number; maxSpeed: number; inertia: boolean; inertiaScale: number } {
    const fallback = { strength: 24, maxSpeed: 18, inertia: false, inertiaScale: 0.6 };
    try {
      const s: any = (window as any).BBPhysicSettings || {};
      const strength = Number(s.drag_strength);
      const maxSpeed = Number(s.drag_max_speed);
      const inertia = Boolean(s.drag_inertia);
      const inertiaScale = Number(s.drag_inertia_scale);
      return {
        strength: Number.isFinite(strength) ? Math.max(1, Math.min(200, strength)) : fallback.strength,
        maxSpeed: Number.isFinite(maxSpeed) ? Math.max(0, Math.min(100, maxSpeed)) : fallback.maxSpeed,
        inertia,
        inertiaScale: Number.isFinite(inertiaScale) ? Math.max(0, Math.min(3, inertiaScale)) : fallback.inertiaScale,
      };
    } catch {
      return fallback;
    }
  }

  private isPhysicsModeSelected(): boolean {
    try {
      const modes: any = (globalThis as any).Modes;
      const selected = modes?.selected ?? null;
      const id = (selected && typeof selected === 'object') ? (selected.id ?? null) : selected;
      return id === 'bbphysic_physics';
    } catch {
      return false;
    }
  }

  private isPhysicsDragToolSelected(): boolean {
    try {
      const toolbox: any = (globalThis as any).Toolbox;
      const sel = toolbox?.selected ?? null;
      const id = (sel && typeof sel === 'object') ? (sel.id ?? null) : sel;
      if (!id) return false;
      return id === 'bbphysic_drag';
    } catch {
      return false;
    }
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  async start(): Promise<boolean> {
    if (this.state.isRunning) {
      console.warn('[BBPhysic Preview] Already running');
      return false;
    }

    console.log('[BBPhysic Preview] Starting preview...');

    const success = await this.initializeWorld();
    if (!success) {
      console.error('[BBPhysic Preview] Failed to initialize physics world');
      try {
        Blockbench.showQuickMessage('物理预览初始化失败 / Preview init failed', 2000);
      } catch {
        // ignore
      }
      return false;
    }

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.lastStepTimeMs = 0;
    this.state.accumulatedTimeSec = 0;
    this.state.animationFrameId = requestAnimationFrame(this.physicsUpdateLoop);

    this.enableDragControls();

    console.log('[BBPhysic Preview] Preview started');
    try {
      Blockbench.showQuickMessage('物理预览已启动 / Preview started', 1500);
    } catch {
      // ignore
    }
    return true;
  }

  stop(): void {
    if (!this.state.isRunning) return;

    console.log('[BBPhysic Preview] Stopping preview...');

    if (this.state.animationFrameId !== null) {
      cancelAnimationFrame(this.state.animationFrameId);
      this.state.animationFrameId = null;
    }

    this.disableDragControls();

    this.restoreMeshes();

    if (this.state.world) {
      this.state.world.free();
      this.state.world = null;
    }

    this.state.bodies = [];
    this.state.groupBodies = [];
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.lastStepTimeMs = 0;
    this.state.accumulatedTimeSec = 0;
    this.outlinerCache.clear();
    this.outlinerCacheLen = -1;

    try {
      delete (window as any).BBPhysicPreviewGroupPivots;
    } catch {
      // ignore
    }

    console.log('[BBPhysic Preview] Preview stopped');
    try {
      Blockbench.showQuickMessage('物理预览已停止 / Preview stopped', 1500);
    } catch {
      // ignore
    }
  }

  togglePause(): void {
    if (!this.state.isRunning) {
      console.warn('[BBPhysic Preview] Cannot pause: not running');
      return;
    }

    this.state.isPaused = !this.state.isPaused;
    if (this.state.isPaused) {
      console.log('[BBPhysic Preview] Paused');
      try {
        Blockbench.showQuickMessage('物理预览已暂停 / Preview paused', 1500);
      } catch {
        // ignore
      }
      return;
    }

    console.log('[BBPhysic Preview] Resumed');
    this.state.lastStepTimeMs = 0;
    try {
      Blockbench.showQuickMessage('物理预览已恢复 / Preview resumed', 1500);
    } catch {
      // ignore
    }

    // Important: when paused, RAF loop stops scheduling itself.
    // Ensure we kick it again when resuming.
    if (this.state.animationFrameId === null) {
      this.state.animationFrameId = requestAnimationFrame(this.physicsUpdateLoop);
    }
  }

  reset(): void {
    if (!this.state.isRunning) {
      console.warn('[BBPhysic Preview] Cannot reset: not running');
      return;
    }

    console.log('[BBPhysic Preview] Resetting...');
    if (this.state.world) {
      for (const body of this.state.bodies) {
        this.state.world.setTransform(body.bodyId, body.initialTransform);
      }
      for (const gb of this.state.groupBodies) {
        this.state.world.setTransform(gb.bodyId, gb.initialTransform);
      }
    }

    this.restoreMeshes();

    // Stop active dragging on reset.
    this.cancelDrag(false);

    this.state.accumulatedTimeSec = 0;
    this.state.lastStepTimeMs = 0;

    console.log('[BBPhysic Preview] Reset complete');
    try {
      Blockbench.showQuickMessage('物理预览已重置 / Preview reset', 1500);
    } catch {
      // ignore
    }
  }

  private restoreMeshes(): void {
    try {
      for (const body of this.state.bodies) {
        if (!body.mesh) continue;
        if (body.originalMeshLocalPos && typeof body.mesh.position?.copy === 'function') {
          body.mesh.position.copy(body.originalMeshLocalPos);
        }
        if (body.originalMeshLocalQuat && typeof body.mesh.quaternion?.copy === 'function') {
          body.mesh.quaternion.copy(body.originalMeshLocalQuat);
        }
        if (typeof body.mesh.updateMatrixWorld === 'function') {
          body.mesh.updateMatrixWorld(true);
        }
      }
    } catch {
      // ignore
    }
  }

  private enableDragControls(): void {
    this.disableDragControls();
    if (typeof document === 'undefined') return;

    const el = this.getCanvasDomElement();
    if (!el) return;

    this.dragDomEl = el;
    try {
      const opts: AddEventListenerOptions = { capture: true, passive: false };
      el.addEventListener('pointerdown', this.onPointerDown, opts);
      el.addEventListener('mousedown', this.onMouseDown as any, opts as any);
      window.addEventListener('pointermove', this.onPointerMove, opts);
      window.addEventListener('mousemove', this.onMouseMove as any, opts as any);
      window.addEventListener('pointerup', this.onPointerUp, opts);
      window.addEventListener('mouseup', this.onMouseUp as any, opts as any);
      window.addEventListener('pointercancel', this.onPointerUp, opts);
      window.addEventListener('blur', this.onWindowBlur, { capture: true });
    } catch {
      // ignore
    }
  }

  private disableDragControls(): void {
    const el = this.dragDomEl;
    this.dragDomEl = null;
    this.cancelDrag(false);
    if (!el) return;
    try {
      el.removeEventListener('pointerdown', this.onPointerDown as any, { capture: true } as any);
      el.removeEventListener('mousedown', this.onMouseDown as any, { capture: true } as any);
      window.removeEventListener('pointermove', this.onPointerMove as any, { capture: true } as any);
      window.removeEventListener('mousemove', this.onMouseMove as any, { capture: true } as any);
      window.removeEventListener('pointerup', this.onPointerUp as any, { capture: true } as any);
      window.removeEventListener('mouseup', this.onMouseUp as any, { capture: true } as any);
      window.removeEventListener('pointercancel', this.onPointerUp as any, { capture: true } as any);
      window.removeEventListener('blur', this.onWindowBlur as any, { capture: true } as any);
    } catch {
      // ignore
    }
  }

  private refreshDragControlsBinding(): void {
    if (!this.state.isRunning) return;
    const current = this.getCanvasDomElement();
    if (!current) return;
    if (this.dragDomEl !== current) {
      this.enableDragControls();
    }
  }

  private getBodyMesh(body: PhysicsBody): any | null {
    if (body.mesh) return body.mesh;
    const cube = this.findOutlinerElementByUuid(body.cubeUuid);
    const cubeObj = cube as any;
    return cubeObj?.mesh ?? null;
  }

  private cancelDrag(applyReleaseInertia: boolean): void {
    // If we temporarily converted a dynamic body to kinematic, revert it now.
    const bodyId = this.dragBodyId;
    const world = this.state.world;
    const originalType = this.dragOriginalBodyType;

    try {
      if (this.dragConvertedToKinematic && world && bodyId !== null && originalType !== null) {
        world.setBodyType(bodyId, originalType);

        // Optional: apply release inertia (only on real mouse release)
        const settings = this.getDragSettings();
        if (
          applyReleaseInertia &&
          settings.inertia &&
          originalType === RigidBodyType.Dynamic &&
          this.dragLastVelValid
        ) {
          let v = this.dragLastVelWorld;
          const len = Math.hypot(v[0], v[1], v[2]);
          // Clamp to the base max speed before scaling
          if (Number.isFinite(len) && len > settings.maxSpeed && settings.maxSpeed > 0) {
            const s = settings.maxSpeed / len;
            v = [v[0] * s, v[1] * s, v[2] * s];
          }

          // Apply inertia scale (lets you keep high follow speed but tame release kick)
          const m = settings.inertiaScale;
          world.setLinvel(bodyId, [v[0] * m, v[1] * m, v[2] * m]);
        }
      }
    } catch {
      // ignore
    }

    this.dragConvertedToKinematic = false;
    this.dragOriginalBodyType = null;
    this.isDragging = false;
    this.dragBodyId = null;
    this.dragBodyUuid = null;
    this.dragHasTarget = false;
    this.dragLastVelValid = false;
    this.dragLastVelWorld = [0, 0, 0];
  }

  private getCanvasDomElement(): HTMLElement | null {
    try {
      const p: any = (globalThis as any).Preview?.selected;
      const canvas = p?.canvas ?? null;
      if (canvas && typeof canvas.getBoundingClientRect === 'function') return canvas as HTMLElement;
    } catch {
      // ignore
    }

    try {
      const c: any = Canvas as any;
      const dom = c?.renderer?.domElement ?? c?.domElement ?? c?.canvas ?? null;
      if (dom && typeof dom.getBoundingClientRect === 'function') return dom as HTMLElement;
    } catch {
      // ignore
    }

    try {
      const byId = document.getElementById('preview') as any;
      if (byId && typeof byId.getBoundingClientRect === 'function') return byId as HTMLElement;
    } catch {
      // ignore
    }

    try {
      const canvas = document.querySelector('canvas') as any;
      if (canvas && typeof canvas.getBoundingClientRect === 'function') return canvas as HTMLElement;
    } catch {
      // ignore
    }
    return null;
  }

  private getActiveCamera(): any | null {
    try {
      const p: any = (globalThis as any).Preview?.selected;
      return p?.camera ?? p?.camPers ?? p?.camOrtho ?? null;
    } catch {
      // ignore
    }

    try {
      const c: any = Canvas as any;
      return c?.camera ?? c?.camPersp ?? c?.camOrtho ?? null;
    } catch {
      return null;
    }
  }

  private computeRayFromEvent(ev: PointerEvent | MouseEvent): { raycaster: any; mouseNdc: { x: number; y: number } } | null {
    const THREE = (globalThis as any).THREE;
    if (!THREE) return null;
    const cam = this.getActiveCamera();
    if (!cam) return null;
    const el = this.dragDomEl ?? this.getCanvasDomElement();
    if (!el || typeof (el as any).getBoundingClientRect !== 'function') return null;

    const rect = el.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

    try {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), cam);
      return { raycaster, mouseNdc: { x: nx, y: ny } };
    } catch {
      return null;
    }
  }

  private getSelectedCubeUuidFallback(): string | null {
    try {
      const selected = (Cube as any).selected as any[] | undefined;
      const first = Array.isArray(selected) ? selected[0] : null;
      if (first && typeof first.uuid === 'string') return first.uuid;
    } catch {
      // ignore
    }
    try {
      const sel = (globalThis as any).Outliner?.selected;
      const first = Array.isArray(sel) ? sel[0] : null;
      if (first && (first as any).type === 'cube' && typeof (first as any).uuid === 'string') return (first as any).uuid;
    } catch {
      // ignore
    }
    return null;
  }

  private findBodyFromIntersectObject(obj: any): PhysicsBody | null {
    if (!obj) return null;
    let cur: any = obj;
    for (let guard = 0; guard < 32 && cur; guard++) {
      for (const b of this.state.bodies) {
        if (b.cubeUuid === '__bbphysic_ground__') continue;
        const bm = this.getBodyMesh(b);
        if (!bm) continue;
        if (cur === bm) return b;
      }
      cur = cur.parent;
    }
    return null;
  }

  private setDragPlaneAtPoint(pointWorld: Vec3): void {
    const THREE = (globalThis as any).THREE;
    const cam = this.getActiveCamera();
    if (!THREE || !cam || typeof cam.getWorldDirection !== 'function') {
      this.dragPlaneNormalWorld = [0, 0, 1];
      this.dragPlanePointWorld = pointWorld;
      return;
    }
    try {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      // Plane faces the camera (normal points along view direction).
      this.dragPlaneNormalWorld = [dir.x, dir.y, dir.z];
      this.dragPlanePointWorld = pointWorld;
    } catch {
      this.dragPlaneNormalWorld = [0, 0, 1];
      this.dragPlanePointWorld = pointWorld;
    }
  }

  private intersectDragPlane(ray: any): Vec3 | null {
    const THREE = (globalThis as any).THREE;
    if (!THREE || !ray) return null;
    try {
      // Ray: origin + t * dir. Solve plane intersection: (p - p0)·n = 0.
      const o = ray.origin as any;
      const d = ray.direction as any;
      const n = this.dragPlaneNormalWorld;
      const p0 = this.dragPlanePointWorld;

      const denom = d.x * n[0] + d.y * n[1] + d.z * n[2];
      if (Math.abs(denom) < 1.0e-6) return null;
      const t = ((p0[0] - o.x) * n[0] + (p0[1] - o.y) * n[1] + (p0[2] - o.z) * n[2]) / denom;
      if (!Number.isFinite(t)) return null;
      if (t < 0) return null;
      return [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
    } catch {
      return null;
    }
  }

  private handlePointerLikeDown(ev: PointerEvent | MouseEvent): void {
    if (!this.state.isRunning || this.state.isPaused || !this.state.world) return;
    if (this.isPhysicsModeSelected() && !this.isPhysicsDragToolSelected()) return;
    // Preview mode gesture: Left click drag on a cube.
    // (No modifier required; we only consume the event once a drag target is found.)
    if ((ev as any).button !== 0) return;

    const THREE = (globalThis as any).THREE;
    if (!THREE) return;

    const rayInfo = this.computeRayFromEvent(ev);
    if (!rayInfo) {
      // Still allow fallback-to-selection (no ray) if user has a cube selected.
      const selUuid = this.getSelectedCubeUuidFallback();
      const body = selUuid ? (this.state.bodies.find((b) => b.cubeUuid === selUuid) ?? null) : null;
      if (!body) return;
      const t = this.state.world.getTransform(body.bodyId);
      if (!t) return;

      const hitPoint: Vec3 = t.position;
      const center = t.position;
      const offsetWorld = v3sub(hitPoint, center);
      const inv = quatInvertUnit(t.rotation as any);
      this.dragGrabOffsetLocal = quatRotateVec3(inv, offsetWorld);

      this.isDragging = true;
      this.dragBodyId = body.bodyId;
      this.dragBodyUuid = body.cubeUuid;
      this.dragHasTarget = true;
      this.dragTargetPointWorld = hitPoint;
      this.setDragPlaneAtPoint(hitPoint);

      console.log('[BBPhysic Preview][drag] start (fallback selection)', { cubeUuid: body.cubeUuid, bodyId: body.bodyId });
      try {
        Blockbench.showQuickMessage('拖拽模式：已抓取选中 Cube（左键拖动）', 1200);
      } catch {
        // ignore
      }

      try {
        (ev as any).preventDefault?.();
        (ev as any).stopPropagation?.();
      } catch {
        // ignore
      }
      return;
    }

    const meshes: any[] = [];
    for (const b of this.state.bodies) {
      if (b.cubeUuid === '__bbphysic_ground__') continue;
      const m = this.getBodyMesh(b);
      if (m) meshes.push(m);
    }
    if (meshes.length === 0) return;

    let intersects: any[] = [];
    try {
      intersects = rayInfo.raycaster.intersectObjects(meshes, true) || [];
    } catch {
      intersects = [];
    }
    let body: PhysicsBody | null = null;
    let hit: any = null;
    if (Array.isArray(intersects) && intersects.length > 0) {
      hit = intersects[0];
      body = this.findBodyFromIntersectObject(hit?.object);
    }
    if (!body) {
      const selUuid = this.getSelectedCubeUuidFallback();
      if (selUuid) body = this.state.bodies.find((b) => b.cubeUuid === selUuid) ?? null;
    }
    if (!body) return;

    // Dragging a fixed/kinematic/editor-driven body is not supported.
    // For stability with joints, convert dynamic bodies to kinematic during drag.
    this.dragConvertedToKinematic = false;
    this.dragOriginalBodyType = null;
    try {
      if (body.bodyType === RigidBodyType.Dynamic && !body.drivenByEditor) {
        this.dragOriginalBodyType = body.bodyType;
        this.state.world.setBodyType(body.bodyId, RigidBodyType.Kinematic);
        this.dragConvertedToKinematic = true;
      }
    } catch {
      // ignore
    }

    const t = this.state.world.getTransform(body.bodyId);
    if (!t) return;

    const hitPoint: Vec3 = hit?.point ? [Number(hit.point.x), Number(hit.point.y), Number(hit.point.z)] : t.position;
    const center = t.position;
    const offsetWorld = v3sub(hitPoint, center);
    const inv = quatInvertUnit(t.rotation as any);
    this.dragGrabOffsetLocal = quatRotateVec3(inv, offsetWorld);

    this.isDragging = true;
    this.dragBodyId = body.bodyId;
    this.dragBodyUuid = body.cubeUuid;
    this.dragHasTarget = true;
    this.dragTargetPointWorld = hitPoint;
    this.setDragPlaneAtPoint(hitPoint);

    console.log('[BBPhysic Preview][drag] start', { cubeUuid: body.cubeUuid, bodyId: body.bodyId });

    try {
      Blockbench.showQuickMessage('拖拽模式：已抓取（左键拖动）', 800);
    } catch {
      // ignore
    }

    try {
      const pid = (ev as any).pointerId;
      if (pid !== undefined) {
        (ev.target as any)?.setPointerCapture?.(pid);
      }
    } catch {
      // ignore
    }

    // Avoid default viewport interactions while dragging.
    try {
      (ev as any).preventDefault?.();
      (ev as any).stopPropagation?.();
    } catch {
      // ignore
    }
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    this.handlePointerLikeDown(ev);
  };

  private readonly onMouseDown = (ev: MouseEvent): void => {
    this.handlePointerLikeDown(ev);
  };

  private handlePointerLikeMove(ev: PointerEvent | MouseEvent): void {
    if (!this.isDragging || this.dragBodyId === null || !this.state.isRunning || this.state.isPaused) return;
    if (this.isPhysicsModeSelected() && !this.isPhysicsDragToolSelected()) return;
    const rayInfo = this.computeRayFromEvent(ev);
    if (!rayInfo) return;
    const p = this.intersectDragPlane(rayInfo.raycaster.ray);
    if (!p) return;
    this.dragTargetPointWorld = p;
    this.dragHasTarget = true;
    try {
      (ev as any).preventDefault?.();
      (ev as any).stopPropagation?.();
    } catch {
      // ignore
    }
  }

  private readonly onPointerMove = (ev: PointerEvent): void => {
    this.handlePointerLikeMove(ev);
  };

  private readonly onMouseMove = (ev: MouseEvent): void => {
    this.handlePointerLikeMove(ev);
  };

  private handlePointerLikeUp(ev: PointerEvent | MouseEvent): void {
    if (!this.isDragging) return;
    if (this.isPhysicsModeSelected() && !this.isPhysicsDragToolSelected()) {
      this.cancelDrag(false);
      return;
    }
    this.cancelDrag(true);
    try {
      (ev as any).preventDefault?.();
      (ev as any).stopPropagation?.();
    } catch {
      // ignore
    }
  }

  private readonly onPointerUp = (ev: PointerEvent): void => {
    this.handlePointerLikeUp(ev);
  };

  private readonly onMouseUp = (ev: MouseEvent): void => {
    this.handlePointerLikeUp(ev);
  };

  private readonly onWindowBlur = (): void => {
    this.cancelDrag(false);
  };

  private applyDragSpring(dt: number): void {
    if (!this.state.world) return;
    if (!this.isDragging || this.dragBodyId === null || !this.dragHasTarget) return;
    const bodyId = this.dragBodyId;

    const settings = this.getDragSettings();

    const t = this.state.world.getTransform(bodyId);
    if (!t) return;

    // Maintain the grabbed point under the cursor: targetCenter = targetPoint - R * offsetLocal
    const rot = t.rotation as any as Quat;
    const offsetWorld = quatRotateVec3(rot, this.dragGrabOffsetLocal);
    const targetCenter = v3sub(this.dragTargetPointWorld, offsetWorld);
    const cur = t.position;

    const delta = v3sub(targetCenter, cur);
    // Smooth spring step: alpha = 1 - exp(-k*dt)
    const k = Math.max(1, settings.strength);
    const safeDt = Math.max(0, dt);
    const alpha = 1 - Math.exp(-k * safeDt);
    let step: Vec3 = [delta[0] * alpha, delta[1] * alpha, delta[2] * alpha];

    // Speed clamp to prevent accumulating huge constraint impulses in joint chains.
    // If dt is very small, skip clamp.
    if (safeDt > 1.0e-5) {
      // Make strength also improve "catch-up" so increasing strength feels more "follow".
      // We raise the effective speed cap with sqrt(strength) so it grows but not explosively.
      const strengthBoost = Math.sqrt(Math.max(0.01, settings.strength / 24));
      const effectiveMaxSpeed = Math.max(0, Math.min(120, settings.maxSpeed * strengthBoost));
      const maxStep = effectiveMaxSpeed * safeDt;
      const len = Math.hypot(step[0], step[1], step[2]);
      if (Number.isFinite(len) && len > maxStep && maxStep > 0) {
        const s = maxStep / len;
        step = [step[0] * s, step[1] * s, step[2] * s];
      }
    }

    // Estimate drag velocity for optional release inertia.
    if (safeDt > 1.0e-5) {
      this.dragLastVelWorld = [step[0] / safeDt, step[1] / safeDt, step[2] / safeDt];
      this.dragLastVelValid = true;
    }

    const newPos: Vec3 = [cur[0] + step[0], cur[1] + step[1], cur[2] + step[2]];

    try {
      this.state.world.setTransform(bodyId, { position: newPos, rotation: rot });
    } catch {
      // ignore
    }
  }

  private getNowMs(timestamp: number): number {
    if (Number.isFinite(timestamp as any)) return Number(timestamp);
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
  }

  private rebuildOutlinerCacheIfNeeded(): void {
    const els: any[] = (Outliner as any)?.elements;
    if (!Array.isArray(els)) return;
    if (this.outlinerCacheLen === els.length && this.outlinerCache.size > 0) return;
    this.outlinerCache.clear();
    for (const el of els) {
      const uuid = String((el as any)?.uuid ?? '');
      if (uuid) this.outlinerCache.set(uuid, el);
    }
    this.outlinerCacheLen = els.length;
  }

  private findOutlinerElementByUuid(uuid: string): any | null {
    this.rebuildOutlinerCacheIfNeeded();
    const cached = this.outlinerCache.get(uuid);
    if (cached) return cached;
    try {
      const el = (Outliner as any)?.elements?.find((x: any) => x && x.uuid === uuid) ?? null;
      if (el) this.outlinerCache.set(uuid, el);
      return el;
    } catch {
      return null;
    }
  }

  private async initializeWorld(): Promise<boolean> {
    try {
      const job = getPreparedPhysicsJob();
      if (!job || job.cubes.length === 0) {
        console.warn('[BBPhysic Preview] No prepared physics job found');
        return false;
      }

      const movingGroupUuidFromJob = typeof (job as any).movingGroupUuid === 'string' ? (job as any).movingGroupUuid : null;
      const colliderGroupUuidFromJob = typeof (job as any).colliderGroupUuid === 'string' ? (job as any).colliderGroupUuid : null;

      let wasmModule;
      try {
        wasmModule = await ensureBBPhysicWasmModule();
      } catch (e) {
        console.error('[BBPhysic Preview] Failed to ensure WASM module', e);
        try {
          Blockbench.showQuickMessage('BBPhysic: wasm 未加载/路径错误，无法启动预览', 3500);
        } catch {
          // ignore
        }
        return false;
      }

      const settings = (window as any).BBPhysicSettings || {};

      let gravityY = Array.isArray(settings.gravity) && settings.gravity.length === 3
        ? Number(settings.gravity[1])
        : Number(settings.gravity_y ?? -9.81);
      if (!Number.isFinite(gravityY)) gravityY = -9.81;

      this.state.world = new PhysicsWorld(wasmModule.exports, gravityY);
      try {
        const iters = Number(settings.iterations ?? 8);
        this.state.world.setSolverIterations(iters);
      } catch {
        // ignore
      }
      this.state.bodies = [];
      this.state.groupBodies = [];
      this.outlinerCache.clear();
      this.outlinerCacheLen = -1;

      console.log(`[BBPhysic Preview] Initializing physics world with ${job.cubes.length} cubes`);
      console.log('[BBPhysic Preview] Runtime settings:', {
        gravityY,
        groundHeight: Number(settings.ground_height ?? 0),
        timestep: Number(settings.timestep ?? 0.016),
        iterations: Number(settings.iterations ?? 8),
      });

      // Ground
      const groundHeight = Number(settings.ground_height ?? 0);
      const groundHalfExtents: Vec3 = [10000, 0.1, 10000];
      const groundTransform: Transform = {
        position: [0, groundHeight - groundHalfExtents[1], 0],
        rotation: [0, 0, 0, 1],
      };
      const groundBodyId = this.state.world.addRigidBody(RigidBodyType.Fixed, groundTransform);
      if (groundBodyId !== 0) {
        const ok = this.state.world.addBoxCollider(groundBodyId, groundHalfExtents);
        if (ok !== 0) {
          this.state.bodies.push({
            bodyId: groundBodyId,
            cubeUuid: '__bbphysic_ground__',
            groupUuid: null,
            isCollider: true,
            bodyType: RigidBodyType.Fixed,
            drivenByEditor: false,
            initialTransform: groundTransform,
            mesh: null,
            originalMeshLocalPos: null,
            originalMeshLocalQuat: null,
            meshPivotOffsetLocal: [0, 0, 0],
          });
        }
      }

      // Cubes
      let colliderCubeCount = 0;
      for (const cube of job.cubes) {
        if (cube.vertices_world.length !== 8) {
          console.warn(`[BBPhysic Preview] Skipping cube ${cube.name}: invalid vertex count`);
          continue;
        }

        const center = calculateOBBCenter(cube.vertices_world);

        let isCollider = false;
        let isColliderDetermined = false;
        const hasIsCollider = typeof (cube as any).is_collider === 'boolean';
        const role = (cube as any).role;
        if (hasIsCollider) {
          isCollider = Boolean((cube as any).is_collider);
          isColliderDetermined = true;
        } else if (role === 'collider' || role === 'moving') {
          isCollider = role === 'collider';
          isColliderDetermined = true;
        }

        const cubeObj = this.findOutlinerElementByUuid(String((cube as any).uuid ?? cube.uuid)) ?? null;
        const parentGroup = (cubeObj as any)?.parent ?? null;

        if (!isColliderDetermined) {
          const pgUuid = parentGroup ? String((parentGroup as any).uuid ?? '') : '';
          if (colliderGroupUuidFromJob && pgUuid && pgUuid === colliderGroupUuidFromJob) {
            isCollider = true;
            isColliderDetermined = true;
          } else if (movingGroupUuidFromJob && pgUuid && pgUuid === movingGroupUuidFromJob) {
            isCollider = false;
            isColliderDetermined = true;
          }
        }

        if (!isColliderDetermined) {
          const gname = parentGroup ? String((parentGroup as any).name ?? '') : '';
          if (gname && gname.toLowerCase().includes('collider')) {
            isCollider = true;
            isColliderDetermined = true;
          }
        }

        // Make collider-group cubes also simulated so preview can update their
        // position/rotation just like moving-group cubes.
        const bodyType = RigidBodyType.Dynamic;

        const rotation = getCubeWorldQuaternion(cubeObj, parentGroup);
        const halfExtents = calculateOBBHalfExtentsWithRotation(cube.vertices_world, center, rotation);
        const transform: Transform = { position: center, rotation };

        const bodyId = this.state.world.addRigidBody(bodyType, transform);
        if (bodyId === 0) {
          console.warn(`[BBPhysic Preview] Failed to create rigid body for cube ${cube.name}`);
          continue;
        }

        const success = this.state.world.addBoxCollider(bodyId, halfExtents);
        if (success === 0) {
          console.warn(`[BBPhysic Preview] Failed to add collider for cube ${cube.name}`);
          continue;
        }

        let mesh: any | null = null;
        let originalMeshLocalPos: any | null = null;
        let originalMeshLocalQuat: any | null = null;
        let meshPivotOffsetLocal: Vec3 = [0, 0, 0];
        try {
          mesh = (cubeObj as any)?.mesh ?? null;
          const THREE = (globalThis as any).THREE;
          if (THREE && mesh) {
            originalMeshLocalPos = mesh.position?.clone ? mesh.position.clone() : null;
            originalMeshLocalQuat = mesh.quaternion?.clone ? mesh.quaternion.clone() : null;
            meshPivotOffsetLocal = computeMeshPivotOffsetLocal(mesh, center, rotation);
          }
        } catch {
          mesh = null;
          originalMeshLocalPos = null;
          originalMeshLocalQuat = null;
          meshPivotOffsetLocal = [0, 0, 0];
        }

        this.state.bodies.push({
          bodyId,
          cubeUuid: cube.uuid,
          groupUuid: parentGroup ? String((parentGroup as any).uuid ?? '') : null,
          isCollider,
          bodyType,
          drivenByEditor: false,
          initialTransform: transform,
          mesh,
          originalMeshLocalPos,
          originalMeshLocalQuat,
          meshPivotOffsetLocal,
        });

        if (isCollider) colliderCubeCount++;
      }

      console.log(
        '[BBPhysic Preview] Prepared cubes:',
        job.cubes.length,
        'Collider cubes detected:',
        colliderCubeCount,
        'job.movingGroupUuid:',
        movingGroupUuidFromJob,
        'job.colliderGroupUuid:',
        colliderGroupUuidFromJob
      );

      // ===== Group joints =====
      try {
        const groupBodyIdByUuid = new Map<string, number>();
        const groupInitialByUuid = new Map<string, Transform>();
        const groupParentUuidByUuid = new Map<string, string | null>();

        const ensureGroupBody = (group: any): number => {
          if (!group) return 0;
          const uuid = String(group.uuid ?? '');
          if (!uuid) return 0;
          const existing = groupBodyIdByUuid.get(uuid);
          if (existing) return existing;

          let parentUuid: string | null = null;
          const p: any = group.parent;
          if (p && p !== 'root' && ((p as any).type === 'group' || (p as any).constructor?.name === 'Group')) {
            parentUuid = String((p as any).uuid ?? '') || null;
          }

          const pivot = getGroupWorldPivot(group);
          const transform: Transform = { position: pivot, rotation: [0, 0, 0, 1] };
          // Group bodies are always simulated; both moving/collider groups can be driven by joints.
          const bodyType = RigidBodyType.Dynamic;
          const bodyId = this.state.world!.addRigidBody(bodyType, transform);
          if (!bodyId) return 0;

          try {
            const massHalfExtents: Vec3 = [0.25, 0.25, 0.25];
            this.state.world!.addBoxColliderGroups(bodyId, massHalfExtents, false, 0b1, 0);
          } catch {
            // ignore
          }

          groupBodyIdByUuid.set(uuid, bodyId);
          groupInitialByUuid.set(uuid, transform);
          groupParentUuidByUuid.set(uuid, parentUuid);
          return bodyId;
        };

        for (const b of this.state.bodies) {
          if (!b.groupUuid) continue;
          if (b.cubeUuid === '__bbphysic_ground__') continue;
          let g: any = resolveGroupByUuid(b.groupUuid);
          for (let guard = 0; guard < 256 && g; guard++) {
            ensureGroupBody(g);
            const p: any = g.parent;
            if (!p || p === 'root') break;
            if ((p as any).type === 'group' || (p as any).constructor?.name === 'Group') {
              g = p;
              continue;
            }
            break;
          }
        }

        let fixedJointCount = 0;
        for (const b of this.state.bodies) {
          if (!b.groupUuid) continue;
          if (b.cubeUuid === '__bbphysic_ground__') continue;
          const g = resolveGroupByUuid(b.groupUuid);
          if (!g) continue;
          const gBody = ensureGroupBody(g);
          if (!gBody) continue;
          const ok = this.state.world!.addFixedJoint(gBody, b.bodyId);
          if (ok) fixedJointCount++;
        }

        const groupJointType = String((settings as any).group_joint_type ?? 'spherical');
        let sphericalJointCount = 0;
        let revoluteJointCount = 0;
        for (const [uuid, bodyId] of groupBodyIdByUuid.entries()) {
          const parentUuid = groupParentUuidByUuid.get(uuid) ?? null;
          if (!parentUuid) continue;
          const parentBodyId = groupBodyIdByUuid.get(parentUuid);
          if (!parentBodyId) continue;

          const t = groupInitialByUuid.get(uuid);
          const anchor: Vec3 = t ? t.position : ([0, 0, 0] as Vec3);

          let ok = 0;
          if (groupJointType === 'revolute') {
            const pt = groupInitialByUuid.get(parentUuid);
            const parentPos: Vec3 = pt ? pt.position : ([0, 0, 0] as Vec3);
            const axis: Vec3 = [anchor[0] - parentPos[0], anchor[1] - parentPos[1], anchor[2] - parentPos[2]];
            const len = Math.hypot(axis[0], axis[1], axis[2]);
            const axisN: Vec3 = len > 1.0e-6 ? [axis[0] / len, axis[1] / len, axis[2] / len] : [0, 1, 0];
            ok = this.state.world!.addRevoluteJoint(parentBodyId, bodyId, anchor, axisN);
            if (ok) revoluteJointCount++;
          } else {
            ok = this.state.world!.addSphericalJoint(parentBodyId, bodyId, anchor);
            if (ok) sphericalJointCount++;
          }
        }

        this.state.groupBodies = Array.from(groupBodyIdByUuid.entries()).map(([groupUuid, bodyId]) => ({
          groupUuid,
          bodyId,
          initialTransform: groupInitialByUuid.get(groupUuid) ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        }));

        console.log(
          '[BBPhysic Preview] Group bodies:',
          this.state.groupBodies.length,
          'Fixed joints:',
          fixedJointCount,
          'Spherical joints:',
          sphericalJointCount,
          'Revolute joints:',
          revoluteJointCount,
          'Group joint type:',
          groupJointType
        );
      } catch (e) {
        console.warn('[BBPhysic Preview] Failed to build group joints:', e);
      }

      console.log(`[BBPhysic Preview] Initialized ${this.state.bodies.length} rigid bodies`);
      return this.state.bodies.length > 0;
    } catch (e) {
      console.error('[BBPhysic Preview] initializePhysicsWorld failed:', e);
      return false;
    }
  }

  private publishGroupPivots(): void {
    if (!this.state.world) return;
    try {
      const pivots: Record<string, Vec3> = {};
      for (const gb of this.state.groupBodies) {
        const t = this.state.world.getTransform(gb.bodyId);
        if (!t) continue;
        pivots[gb.groupUuid] = t.position;
      }
      (window as any).BBPhysicPreviewGroupPivots = pivots;
    } catch {
      // ignore
    }
  }

  private requestRender(): void {
    try {
      const c: any = Canvas as any;
      if (c && typeof c.render === 'function') c.render();
    } catch {
      // ignore
    }
  }

  private updateBlockbenchFromPhysics(): void {
    if (!this.state.world) return;

    for (const body of this.state.bodies) {
      if (body.cubeUuid === '__bbphysic_ground__') continue;
      if (body.drivenByEditor) continue;

      const transform = this.state.world.getTransform(body.bodyId);
      if (!transform) continue;

      const cube = this.findOutlinerElementByUuid(body.cubeUuid);
      if (!cube) continue;
      const cubeObj = cube as any;
      const mesh = body.mesh ?? cubeObj?.mesh ?? null;
      if (!mesh) continue;

      let worldPos = transform.position;
      if (body.meshPivotOffsetLocal) {
        const offsetWorld = quatRotateVec3(transform.rotation, body.meshPivotOffsetLocal);
        worldPos = v3add(worldPos, offsetWorld);
      }
      setMeshWorldTransform(mesh, worldPos, transform.rotation);
    }

    this.publishGroupPivots();
    this.requestRender();
  }

  private updateKinematicBodiesFromEditor(): void {
    if (!this.state.world) return;
    const THREE = (globalThis as any).THREE;
    if (!THREE) return;

    for (const body of this.state.bodies) {
      if (!body.drivenByEditor) continue;
      if (body.cubeUuid === '__bbphysic_ground__') continue;

      const cube = this.findOutlinerElementByUuid(body.cubeUuid);
      const cubeObj = cube as any;
      const mesh = body.mesh ?? cubeObj?.mesh ?? null;
      if (!mesh || typeof mesh.getWorldPosition !== 'function' || typeof mesh.getWorldQuaternion !== 'function') continue;

      try {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        mesh.getWorldPosition(p);
        mesh.getWorldQuaternion(q);
        const rot: Quat = [q.x, q.y, q.z, q.w];

        const pivotWorld: Vec3 = [p.x, p.y, p.z];
        const offsetWorld = body.meshPivotOffsetLocal ? quatRotateVec3(rot, body.meshPivotOffsetLocal) : ([0, 0, 0] as Vec3);
        const centerWorld = v3sub(pivotWorld, offsetWorld);

        this.state.world.setTransform(body.bodyId, { position: centerWorld, rotation: rot });
      } catch {
        // ignore
      }
    }
  }

  private readonly physicsUpdateLoop = (timestamp: number): void => {
    // Mark current RAF as consumed.
    this.state.animationFrameId = null;

    if (!this.state.isRunning || this.state.isPaused || !this.state.world) {
      return;
    }

    // Keep drag listeners attached to the currently selected preview canvas.
    this.refreshDragControlsBinding();

    try {
      const nowMs = this.getNowMs(timestamp);
      if (!Number.isFinite(this.state.lastStepTimeMs) || this.state.lastStepTimeMs <= 0) {
        this.state.lastStepTimeMs = nowMs;
      }

      let deltaMs = nowMs - this.state.lastStepTimeMs;
      if (!Number.isFinite(deltaMs) || deltaMs < 0) deltaMs = 0;
      this.state.lastStepTimeMs = nowMs;

      const deltaSec = deltaMs / 1000;

      const settings = (window as any).BBPhysicSettings || {};
      const fixedTimestep = Number(settings.timestep ?? 0.016);
      if (!Number.isFinite(fixedTimestep) || fixedTimestep <= 0) {
        throw new Error(`Invalid timestep: ${String(settings.timestep)}`);
      }

      if (!Number.isFinite(this.state.accumulatedTimeSec)) {
        this.state.accumulatedTimeSec = 0;
      }
      this.state.accumulatedTimeSec += deltaSec;

      const maxAccumulated = fixedTimestep * 5;
      if (this.state.accumulatedTimeSec > maxAccumulated) {
        this.state.accumulatedTimeSec = maxAccumulated;
      }

      this.updateKinematicBodiesFromEditor();

      let stepsThisFrame = 0;
      while (this.state.accumulatedTimeSec >= fixedTimestep) {
        this.state.world.step(fixedTimestep);
        this.state.accumulatedTimeSec -= fixedTimestep;
        stepsThisFrame++;
      }

      // Apply drag "force" every frame (even if stepsThisFrame == 0),
      // otherwise user input would appear to snap back on high FPS.
      this.applyDragSpring(deltaSec);
      this.previewStepsSinceLastDebugLog += stepsThisFrame;

      if (nowMs - this.lastPreviewDebugLogMs > 1000) {
        this.lastPreviewDebugLogMs = nowMs;
        const probe = this.state.bodies.find((b) => !b.isCollider && b.cubeUuid !== '__bbphysic_ground__');
        if (probe) {
          const t = this.state.world.getTransform(probe.bodyId);
          if (t) {
            const pos = t.position;
            const rot = t.rotation as Quat;
            let dPos: Vec3 | null = null;
            let dRot: Quat | null = null;
            if (this.lastPreviewProbePos && this.lastPreviewProbeRot) {
              dPos = [pos[0] - this.lastPreviewProbePos[0], pos[1] - this.lastPreviewProbePos[1], pos[2] - this.lastPreviewProbePos[2]];
              dRot = [rot[0] - this.lastPreviewProbeRot[0], rot[1] - this.lastPreviewProbeRot[1], rot[2] - this.lastPreviewProbeRot[2], rot[3] - this.lastPreviewProbeRot[3]];
            }
            this.lastPreviewProbePos = [pos[0], pos[1], pos[2]];
            this.lastPreviewProbeRot = [rot[0], rot[1], rot[2], rot[3]];

            let meshWorldPosStr: string | null = null;
            let meshWorldQuatStr: string | null = null;
            let meshExpectedPosStr: string | null = null;
            let meshPosDiffStr: string | null = null;
            try {
              const THREE = (globalThis as any).THREE;
              const cube = this.findOutlinerElementByUuid(probe.cubeUuid);
              const cubeObj = cube as any;
              const mesh = probe.mesh ?? cubeObj?.mesh ?? null;
              if (THREE && mesh && typeof mesh.getWorldPosition === 'function' && typeof mesh.getWorldQuaternion === 'function') {
                const mv = new THREE.Vector3();
                const mq = new THREE.Quaternion();
                mesh.getWorldPosition(mv);
                mesh.getWorldQuaternion(mq);
                meshWorldPosStr = fmtV3([mv.x, mv.y, mv.z]);
                meshWorldQuatStr = fmtQ4([mq.x, mq.y, mq.z, mq.w]);

                const pivotOffset = probe.meshPivotOffsetLocal ?? ([0, 0, 0] as Vec3);
                const expected = v3add(pos, quatRotateVec3(rot, pivotOffset));
                meshExpectedPosStr = fmtV3(expected);
                const diff: Vec3 = [mv.x - expected[0], mv.y - expected[1], mv.z - expected[2]];
                meshPosDiffStr = fmtV3(diff);
              }
            } catch {
              // ignore
            }

            const steps = this.previewStepsSinceLastDebugLog;
            this.previewStepsSinceLastDebugLog = 0;

            console.log('[BBPhysic Preview][debug] probe', {
              bodyId: probe.bodyId,
              cubeUuid: probe.cubeUuid,
              dt: fixedTimestep,
              stepsPerSecApprox: steps,
              pos: fmtV3(pos),
              rot: fmtQ4(rot),
              dPos: dPos ? fmtV3(dPos) : null,
              dRot: dRot ? fmtQ4(dRot) : null,
              meshWorldPos: meshWorldPosStr,
              meshExpectedPos: meshExpectedPosStr,
              meshPosDiff: meshPosDiffStr,
              meshWorldQuat: meshWorldQuatStr,
            });
          }
        }
      }

      this.updateBlockbenchFromPhysics();

      try {
        updateWireframeOnce(true);
      } catch (e) {
        console.warn('[BBPhysic Preview] updateWireframeOnce failed:', e);
      }
    } catch (e) {
      console.error('[BBPhysic Preview] physicsUpdateLoop error:', e);
    } finally {
      if (this.state.isRunning && !this.state.isPaused && this.state.world) {
        this.state.animationFrameId = requestAnimationFrame(this.physicsUpdateLoop);
      }
    }
  };
}

const controller = new PhysicsPreviewController();

/**
 * Start physics preview
 * 开始物理预览
 */
export async function startPhysicsPreview(): Promise<boolean> {
  return controller.start();
}

/**
 * Stop physics preview
 * 停止物理预览
 */
export function stopPhysicsPreview(): void {
  controller.stop();
}

/**
 * Toggle pause state
 * 切换暂停状态
 */
export function togglePausePhysicsPreview(): void {
  controller.togglePause();
}

/**
 * Reset preview to initial state
 * 重置预览到初始状态
 */
export function resetPhysicsPreview(): void {
  controller.reset();
}

/**
 * Check if preview is currently running
 * 检查预览是否正在运行
 */
export function isPreviewRunning(): boolean {
  return controller.isRunning();
}

/**
 * Check if preview is paused
 * 检查预览是否已暂停
 */
export function isPreviewPaused(): boolean {
  return controller.isPaused();
}

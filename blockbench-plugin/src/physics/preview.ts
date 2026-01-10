/**
 * Real-time physics preview module
 * Implements OBB-based physics simulation with live visualization
 */

import { loadBBPhysicWasm } from '../wasm/loader';
import { PhysicsWorld, RigidBodyType, type Transform } from './world';
import { getPreparedPhysicsJob, type PreparedCube } from './prep';
import type { Vec3 } from './types';
import { updateWireframeOnce } from '../debug/wireframe';

interface PhysicsBody {
  bodyId: number;
  cubeUuid: string;
  groupUuid: string | null;
  isCollider: boolean;
  initialTransform: Transform;
}

interface PreviewState {
  isRunning: boolean;
  isPaused: boolean;
  world: PhysicsWorld | null;
  bodies: PhysicsBody[];
  animationFrameId: number | null;
  lastStepTime: number;
  accumulatedTime: number;
}

const state: PreviewState = {
  isRunning: false,
  isPaused: false,
  world: null,
  bodies: [],
  animationFrameId: null,
  lastStepTime: 0,
  accumulatedTime: 0,
};

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

/**
 * Get group's rotation as quaternion
 * 获取 Group 的旋转（四元数）
 */
function getGroupRotationQuaternion(group: any): [number, number, number, number] {
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

/**
 * Initialize physics world with prepared cubes
 * 初始化物理世界
 */
async function initializePhysicsWorld(): Promise<boolean> {
  try {
    const job = getPreparedPhysicsJob();
    if (!job || job.cubes.length === 0) {
      console.warn('[BBPhysic Preview] No prepared physics job found');
      return false;
    }

    // Load WASM module
    const wasmModule = await loadBBPhysicWasm({} as any); // TODO: pass plugin reference
    if (!wasmModule) {
      console.error('[BBPhysic Preview] Failed to load WASM module');
      return false;
    }

    // Create physics world with gravity from settings
    const settings = (window as any).BBPhysicSettings || {};
    const gravity = settings.gravity_y ?? -9.81;
    state.world = new PhysicsWorld(wasmModule.exports, gravity);
    state.bodies = [];

    console.log(`[BBPhysic Preview] Initializing physics world with ${job.cubes.length} cubes`);

    // Add rigid bodies for each cube (OBB-based)
    for (const cube of job.cubes) {
      if (cube.vertices_world.length !== 8) {
        console.warn(`[BBPhysic Preview] Skipping cube ${cube.name}: invalid vertex count`);
        continue;
      }

      // Calculate OBB properties
      const center = calculateOBBCenter(cube.vertices_world);
      const halfExtents = calculateOBBHalfExtents(cube.vertices_world);

      // Find the cube's group to determine if it's a collider
      const cubeObj = Outliner.elements.find((el: any) => el.uuid === cube.uuid);
      const parentGroup = cubeObj?.parent;
      const isCollider = parentGroup && (parentGroup as any).name?.includes('collider');

      // Create rigid body
      const bodyType = isCollider ? RigidBodyType.Fixed : RigidBodyType.Dynamic;
      const rotation = parentGroup ? getGroupRotationQuaternion(parentGroup) : [0, 0, 0, 1];
      
      const transform: Transform = {
        position: center,
        rotation: rotation as [number, number, number, number],
      };

      const bodyId = state.world.addRigidBody(bodyType, transform);
      if (bodyId === 0) {
        console.warn(`[BBPhysic Preview] Failed to create rigid body for cube ${cube.name}`);
        continue;
      }

      // Add OBB collider
      const success = state.world.addBoxCollider(bodyId, halfExtents);
      if (success === 0) {
        console.warn(`[BBPhysic Preview] Failed to add collider for cube ${cube.name}`);
        continue;
      }

      state.bodies.push({
        bodyId,
        cubeUuid: cube.uuid,
        groupUuid: parentGroup ? (parentGroup as any).uuid : null,
        isCollider,
        initialTransform: transform,
      });
    }

    console.log(`[BBPhysic Preview] Initialized ${state.bodies.length} rigid bodies`);
    return state.bodies.length > 0;
  } catch (error) {
    console.error('[BBPhysic Preview] Initialization failed:', error);
    return false;
  }
}

/**
 * Physics update loop
 * 物理更新循环
 */
function physicsUpdateLoop(timestamp: number): void {
  if (!state.isRunning || state.isPaused || !state.world) {
    return;
  }

  // Calculate delta time
  if (state.lastStepTime === 0) {
    state.lastStepTime = timestamp;
  }
  const deltaMs = timestamp - state.lastStepTime;
  state.lastStepTime = timestamp;

  // Get timestep from settings
  const settings = (window as any).BBPhysicSettings || {};
  const fixedTimestep = settings.timestep ?? 0.016; // 60 FPS default

  // Accumulate time and step physics with fixed timestep
  state.accumulatedTime += deltaMs / 1000; // Convert to seconds

  // Limit max accumulated time to avoid spiral of death
  const maxAccumulated = fixedTimestep * 5;
  if (state.accumulatedTime > maxAccumulated) {
    state.accumulatedTime = maxAccumulated;
  }

  // Step physics with fixed timestep
  while (state.accumulatedTime >= fixedTimestep) {
    state.world.step(fixedTimestep);
    state.accumulatedTime -= fixedTimestep;
  }

  // Update Blockbench cubes/groups with physics results
  updateBlockbenchFromPhysics();

  // Update wireframe visualization
  updateWireframeOnce(true);

  // Continue loop
  state.animationFrameId = requestAnimationFrame(physicsUpdateLoop);
}

/**
 * Update Blockbench elements with physics simulation results
 * 用物理模拟结果更新 Blockbench 元素
 */
function updateBlockbenchFromPhysics(): void {
  if (!state.world) return;

  for (const body of state.bodies) {
    // Skip fixed/collider bodies
    if (body.isCollider) continue;

    // Get updated transform from physics engine
    const transform = state.world.getTransform(body.bodyId);
    if (!transform) continue;

    // Find the cube in Blockbench
    const cube = Outliner.elements.find((el: any) => el.uuid === body.cubeUuid);
    if (!cube) continue;

    // Update cube position
    // Note: For full implementation, we should update the parent group's transform
    // For now, we'll just update the cube's local position as a proof of concept
    const cubeObj = cube as any;
    if (cubeObj.from && cubeObj.to) {
      // Calculate offset from initial position
      const [newX, newY, newZ] = transform.position;
      const [initX, initY, initZ] = body.initialTransform.position;
      const dx = newX - initX;
      const dy = newY - initY;
      const dz = newZ - initZ;

      // Apply offset to cube
      cubeObj.from[0] += dx;
      cubeObj.from[1] += dy;
      cubeObj.from[2] += dz;
      cubeObj.to[0] += dx;
      cubeObj.to[1] += dy;
      cubeObj.to[2] += dz;

      // Update initial transform for next frame
      body.initialTransform = transform;
    }
  }

  // Request canvas update
  Canvas.updateView({
    elements: Outliner.elements,
    element_aspects: { geometry: true, transform: true },
  });
}

/**
 * Start physics preview
 * 开始物理预览
 */
export async function startPhysicsPreview(): Promise<boolean> {
  if (state.isRunning) {
    console.warn('[BBPhysic Preview] Already running');
    return false;
  }

  console.log('[BBPhysic Preview] Starting preview...');

  // Initialize physics world
  const success = await initializePhysicsWorld();
  if (!success) {
    console.error('[BBPhysic Preview] Failed to initialize physics world');
    Blockbench.showQuickMessage('物理预览初始化失败 / Preview init failed', 2000);
    return false;
  }

  // Start update loop
  state.isRunning = true;
  state.isPaused = false;
  state.lastStepTime = 0;
  state.accumulatedTime = 0;
  state.animationFrameId = requestAnimationFrame(physicsUpdateLoop);

  console.log('[BBPhysic Preview] Preview started');
  Blockbench.showQuickMessage('物理预览已启动 / Preview started', 1500);
  return true;
}

/**
 * Stop physics preview
 * 停止物理预览
 */
export function stopPhysicsPreview(): void {
  if (!state.isRunning) {
    return;
  }

  console.log('[BBPhysic Preview] Stopping preview...');

  // Cancel animation frame
  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  // Clean up physics world
  if (state.world) {
    state.world.free();
    state.world = null;
  }

  state.bodies = [];
  state.isRunning = false;
  state.isPaused = false;
  state.lastStepTime = 0;
  state.accumulatedTime = 0;

  console.log('[BBPhysic Preview] Preview stopped');
  Blockbench.showQuickMessage('物理预览已停止 / Preview stopped', 1500);
}

/**
 * Toggle pause state
 * 切换暂停状态
 */
export function togglePausePhysicsPreview(): void {
  if (!state.isRunning) {
    console.warn('[BBPhysic Preview] Cannot pause: not running');
    return;
  }

  state.isPaused = !state.isPaused;
  
  if (state.isPaused) {
    console.log('[BBPhysic Preview] Paused');
    Blockbench.showQuickMessage('物理预览已暂停 / Preview paused', 1500);
  } else {
    console.log('[BBPhysic Preview] Resumed');
    state.lastStepTime = 0; // Reset to avoid large delta
    Blockbench.showQuickMessage('物理预览已恢复 / Preview resumed', 1500);
  }
}

/**
 * Reset preview to initial state
 * 重置预览到初始状态
 */
export function resetPhysicsPreview(): void {
  if (!state.isRunning) {
    console.warn('[BBPhysic Preview] Cannot reset: not running');
    return;
  }

  console.log('[BBPhysic Preview] Resetting...');

  // Reset all body transforms to initial state
  if (state.world) {
    for (const body of state.bodies) {
      state.world.setTransform(body.bodyId, body.initialTransform);
    }
  }

  state.accumulatedTime = 0;
  state.lastStepTime = 0;

  console.log('[BBPhysic Preview] Reset complete');
  Blockbench.showQuickMessage('物理预览已重置 / Preview reset', 1500);
}

/**
 * Check if preview is currently running
 * 检查预览是否正在运行
 */
export function isPreviewRunning(): boolean {
  return state.isRunning;
}

/**
 * Check if preview is paused
 * 检查预览是否已暂停
 */
export function isPreviewPaused(): boolean {
  return state.isPaused;
}

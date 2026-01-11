import type { BBPhysicWasmExports } from '../wasm/loader';
import type { Vec3 } from './types';

export enum RigidBodyType {
  Fixed = 0,
  Dynamic = 1,
  Kinematic = 2,
}

export interface Transform {
  position: Vec3;
  rotation: [number, number, number, number]; // quaternion [x, y, z, w]
}

/**
 * 物理世界的 TypeScript 包装器
 * 提供类型安全的 API 来与 WASM 模块交互
 */
export class PhysicsWorld {
  private handle: number = 0;
  private exports: BBPhysicWasmExports;

  constructor(exports: BBPhysicWasmExports, gravityY: number = -9.81) {
    this.exports = exports;
    this.handle = exports.bbp_world_create(gravityY);
    if (this.handle === 0) {
      throw new Error('Failed to create physics world');
    }
  }

  /**
   * 步进物理模拟
   * @param dt 时间步长（秒）
   */
  step(dt: number): void {
    this.exports.bbp_world_step(this.handle, dt);
  }

  /**
   * 设置求解器迭代次数（影响关节“力度/刚度”和整体稳定性）
   */
  setSolverIterations(iterations: number): void {
    const iters = Number(iterations);
    const safe = Number.isFinite(iters) ? Math.max(1, Math.min(128, Math.floor(iters))) : 8;
    this.exports.bbp_set_solver_iterations(this.handle, safe);
  }

  /**
   * 添加刚体
   * @param bodyType 刚体类型
   * @param transform 初始变换
   * @returns 刚体 ID（0 表示失败）
   */
  addRigidBody(bodyType: RigidBodyType, transform: Transform): number {
    const { position, rotation } = transform;
    return this.exports.bbp_add_rigid_body(
      this.handle,
      bodyType,
      position[0],
      position[1],
      position[2],
      rotation[0],
      rotation[1],
      rotation[2],
      rotation[3]
    );
  }

  /**
   * 添加长方体碰撞体
   * @param bodyId 刚体 ID
   * @param halfExtents 半尺寸 [hx, hy, hz]
   * @returns 成功返回 1，失败返回 0
   */
  addBoxCollider(bodyId: number, halfExtents: Vec3): number {
    return this.exports.bbp_add_box_collider(
      this.handle,
      bodyId,
      halfExtents[0],
      halfExtents[1],
      halfExtents[2]
    );
  }

  /**
   * 添加长方体碰撞体（扩展版：支持 sensor）
   * @param isSensor 传感器不产生接触力（但可用于质量属性/关节骨架）
   */
  addBoxColliderEx(bodyId: number, halfExtents: Vec3, isSensor: boolean): number {
    return this.exports.bbp_add_box_collider_ex(
      this.handle,
      bodyId,
      halfExtents[0],
      halfExtents[1],
      halfExtents[2],
      isSensor ? 1 : 0
    );
  }

  /**
   * 添加长方体碰撞体（带 collision groups）
   * membershipBits/filterBits 使用 32-bit bitmask
   */
  addBoxColliderGroups(
    bodyId: number,
    halfExtents: Vec3,
    isSensor: boolean,
    membershipBits: number,
    filterBits: number
  ): number {
    return this.exports.bbp_add_box_collider_groups(
      this.handle,
      bodyId,
      halfExtents[0],
      halfExtents[1],
      halfExtents[2],
      isSensor ? 1 : 0,
      membershipBits >>> 0,
      filterBits >>> 0
    );
  }

  /**
   * 添加球关节（用于 Group 与父 Group 之间的“关节连接”）
   * @returns 成功返回 1，失败返回 0
   */
  addSphericalJoint(bodyId1: number, bodyId2: number, anchorWorld: Vec3): number {
    return this.exports.bbp_add_spherical_joint(
      this.handle,
      bodyId1,
      bodyId2,
      anchorWorld[0],
      anchorWorld[1],
      anchorWorld[2]
    );
  }

  /**
   * 添加固定关节（用于把同一 Group 内的多个 cube 刚性绑在一起）
   * @returns 成功返回 1，失败返回 0
   */
  addFixedJoint(bodyId1: number, bodyId2: number): number {
    return this.exports.bbp_add_fixed_joint(this.handle, bodyId1, bodyId2);
  }

  /**
   * 添加刚性旋转关节（铰链/hinge）：只允许绕指定轴旋转
   * @param anchorWorld 关节锚点（世界坐标）
   * @param axisWorld 旋转轴（世界坐标，长度可为任意；WASM 侧会归一化）
   * @returns 成功返回 1，失败返回 0
   */
  addRevoluteJoint(bodyId1: number, bodyId2: number, anchorWorld: Vec3, axisWorld: Vec3): number {
    return this.exports.bbp_add_revolute_joint(
      this.handle,
      bodyId1,
      bodyId2,
      anchorWorld[0],
      anchorWorld[1],
      anchorWorld[2],
      axisWorld[0],
      axisWorld[1],
      axisWorld[2]
    );
  }

  /**
   * 获取刚体的变换
   * @param bodyId 刚体 ID
   * @returns Transform 或 null（如果失败）
   */
  getTransform(bodyId: number): Transform | null {
    const ptr = this.exports.bbp_get_transform(this.handle, bodyId);
    if (ptr === 0) {
      return null;
    }

    try {
      // 从 WASM 内存读取 7 个 f32
      const buffer = new Float32Array(this.exports.memory.buffer, ptr, 7);
      const transform: Transform = {
        position: [buffer[0], buffer[1], buffer[2]],
        rotation: [buffer[3], buffer[4], buffer[5], buffer[6]],
      };
      return transform;
    } finally {
      this.exports.bbp_free_transform(ptr);
    }
  }

  /**
   * 设置刚体的变换
   * @param bodyId 刚体 ID
   * @param transform 新的变换
   * @returns 成功返回 1，失败返回 0
   */
  setTransform(bodyId: number, transform: Transform): number {
    const { position, rotation } = transform;
    return this.exports.bbp_set_transform(
      this.handle,
      bodyId,
      position[0],
      position[1],
      position[2],
      rotation[0],
      rotation[1],
      rotation[2],
      rotation[3]
    );
  }

  /**
   * 切换刚体类型（0=Fixed, 1=Dynamic, 2=Kinematic(position-based)）
   * 用于交互拖拽时临时改成 Kinematic，减少关节被瞬移拉炸。
   */
  setBodyType(bodyId: number, bodyType: RigidBodyType): number {
    return this.exports.bbp_set_body_type(this.handle, bodyId, bodyType);
  }

  /**
   * 设置线速度（世界坐标，单位/秒）
   */
  setLinvel(bodyId: number, v: Vec3): number {
    return this.exports.bbp_set_linvel(this.handle, bodyId, v[0], v[1], v[2]);
  }

  /**
   * 设置角速度（世界坐标，弧度/秒）
   */
  setAngvel(bodyId: number, w: Vec3): number {
    return this.exports.bbp_set_angvel(this.handle, bodyId, w[0], w[1], w[2]);
  }

  /**
   * 获取世界中的刚体数量
   */
  getBodyCount(): number {
    return this.exports.bbp_get_body_count(this.handle);
  }

  /**
   * 释放物理世界
   */
  free(): void {
    if (this.handle !== 0) {
      this.exports.bbp_world_free(this.handle);
      this.handle = 0;
    }
  }
}

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

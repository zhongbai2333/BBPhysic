use rapier3d::prelude::*;
use rapier3d::parry::math::{Rotation as ParryRotation, Vector as ParryVector};
use glam::Quat;
use std::cell::RefCell;
use std::collections::HashMap;

// 一个极简的「物理世界」封装：后续你可以逐步补充
// - 从 Blockbench 模型生成刚体/碰撞体
// - 查询/投射/碰撞事件
// - 序列化/快照等
struct PhysicsWorld {
    pipeline: PhysicsPipeline,
    gravity: Vector,
    integration_parameters: IntegrationParameters,
    island_manager: IslandManager,
    broad_phase: BroadPhaseBvh,
    narrow_phase: NarrowPhase,
    rigid_body_set: RigidBodySet,
    collider_set: ColliderSet,
    impulse_joint_set: ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    ccd_solver: CCDSolver,
    // 映射用户 ID 到 RigidBodyHandle
    user_id_to_body: HashMap<u32, RigidBodyHandle>,
    next_user_id: u32,
}

impl PhysicsWorld {
    fn new(gravity_y: Real) -> Self {
        let rigid_body_set = RigidBodySet::new();
        let collider_set = ColliderSet::new();

        Self {
            pipeline: PhysicsPipeline::new(),
            gravity: Vector::new(0.0, gravity_y, 0.0),
            integration_parameters: IntegrationParameters::default(),
            island_manager: IslandManager::new(),
            broad_phase: BroadPhaseBvh::new(),
            narrow_phase: NarrowPhase::new(),
            rigid_body_set,
            collider_set,
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            user_id_to_body: HashMap::new(),
            next_user_id: 1,
        }
    }

    fn step(&mut self, dt: Real) {
        self.integration_parameters.dt = dt;

        let physics_hooks = ();
        let event_handler = (); // 可替换为自定义事件处理

        self.pipeline.step(
            self.gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &physics_hooks,
            &event_handler,
        );
    }
}

thread_local! {
    // 用句柄（u32）索引，避免 JS 侧管理指针
    static WORLDS: RefCell<Vec<Option<PhysicsWorld>>> = const { RefCell::new(Vec::new()) };
}

/// 返回 ABI 版本号，方便你以后升级导出接口
#[no_mangle]
pub extern "C" fn bbp_abi_version() -> u32 {
    1
}

/// 创建一个 world，返回 handle（0 表示失败）
#[no_mangle]
pub extern "C" fn bbp_world_create(gravity_y: f32) -> u32 {
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        let world = PhysicsWorld::new(gravity_y as Real);

        // 尝试复用空洞
        for (i, slot) in worlds.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(world);
                return (i as u32) + 1;
            }
        }

        worlds.push(Some(world));
        worlds.len() as u32
    })
}

/// 释放 world
#[no_mangle]
pub extern "C" fn bbp_world_free(handle: u32) {
    if handle == 0 {
        return;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if idx < worlds.len() {
            worlds[idx] = None;
        }
    });
}

/// 步进模拟（dt 秒）
#[no_mangle]
pub extern "C" fn bbp_world_step(handle: u32, dt: f32) {
    if handle == 0 {
        return;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            world.step(dt as Real);
        }
    });
}

/// 添加刚体，返回用户 ID（0 表示失败）
/// body_type: 0=固定, 1=动态, 2=运动学
/// pos_x, pos_y, pos_z: 位置
/// rot_x, rot_y, rot_z, rot_w: 四元数旋转（暂未使用，待实现）
#[no_mangle]
pub extern "C" fn bbp_add_rigid_body(
    handle: u32,
    body_type: u32,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    _rot_x: f32,
    _rot_y: f32,
    _rot_z: f32,
    _rot_w: f32,
) -> u32 {
    if handle == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            let position = ParryVector::new(pos_x as Real, pos_y as Real, pos_z as Real);

            let rb = match body_type {
                0 => RigidBodyBuilder::fixed()
                    .translation(position)
                    .build(),
                1 => RigidBodyBuilder::dynamic()
                    .translation(position)
                    .build(),
                2 => RigidBodyBuilder::kinematic_position_based()
                    .translation(position)
                    .build(),
                _ => return 0,
            };

            let rb_handle = world.rigid_body_set.insert(rb);
            let user_id = world.next_user_id;
            world.next_user_id += 1;
            world.user_id_to_body.insert(user_id, rb_handle);
            user_id
        } else {
            0
        }
    })
}

/// 添加碰撞体（长方体）到刚体
/// body_id: 刚体用户 ID
/// hx, hy, hz: 半尺寸
#[no_mangle]
pub extern "C" fn bbp_add_box_collider(
    handle: u32,
    body_id: u32,
    hx: f32,
    hy: f32,
    hz: f32,
) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                let collider = ColliderBuilder::cuboid(hx as Real, hy as Real, hz as Real).build();
                world
                    .collider_set
                    .insert_with_parent(collider, rb_handle, &mut world.rigid_body_set);
                1 // 成功
            } else {
                0
            }
        } else {
            0
        }
    })
}

/// 获取刚体的位置和旋转
/// 返回值：ptr 指向 7 个 f32 [px, py, pz, qx, qy, qz, qw]
/// 使用完后需调用 bbp_free_transform
#[no_mangle]
pub extern "C" fn bbp_get_transform(handle: u32, body_id: u32) -> *mut f32 {
    if handle == 0 || body_id == 0 {
        return std::ptr::null_mut();
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let worlds = worlds.borrow();
        if let Some(Some(world)) = worlds.get(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                if let Some(rb) = world.rigid_body_set.get(rb_handle) {
                    let pos = rb.translation();
                    let rot = rb.rotation();

                    let data = vec![
                        pos.x as f32,
                        pos.y as f32,
                        pos.z as f32,
                        rot.x as f32,
                        rot.y as f32,
                        rot.z as f32,
                        rot.w as f32,
                    ];

                    let boxed = data.into_boxed_slice();
                    Box::into_raw(boxed) as *mut f32
                } else {
                    std::ptr::null_mut()
                }
            } else {
                std::ptr::null_mut()
            }
        } else {
            std::ptr::null_mut()
        }
    })
}

/// 释放 transform 数据
#[no_mangle]
pub extern "C" fn bbp_free_transform(ptr: *mut f32) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(std::slice::from_raw_parts_mut(ptr, 7));
        }
    }
}

/// 设置刚体的位置和旋转
#[no_mangle]
pub extern "C" fn bbp_set_transform(
    handle: u32,
    body_id: u32,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    rot_x: f32,
    rot_y: f32,
    rot_z: f32,
    rot_w: f32,
) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                if let Some(rb) = world.rigid_body_set.get_mut(rb_handle) {
                    let position = ParryVector::new(pos_x as Real, pos_y as Real, pos_z as Real);
                    let rotation = Quat::from_xyzw(rot_x, rot_y, rot_z, rot_w);

                    rb.set_translation(position, true);
                    rb.set_rotation(rotation, true);
                    1 // 成功
                } else {
                    0
                }
            } else {
                0
            }
        } else {
            0
        }
    })
}

/// 获取所有刚体数量
#[no_mangle]
pub extern "C" fn bbp_get_body_count(handle: u32) -> u32 {
    if handle == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let worlds = worlds.borrow();
        if let Some(Some(world)) = worlds.get(idx) {
            world.rigid_body_set.len() as u32
        } else {
            0
        }
    })
}

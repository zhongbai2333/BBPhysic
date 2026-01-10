use rapier3d::prelude::*;
use std::cell::RefCell;

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
}

impl PhysicsWorld {
    fn new(gravity_y: Real) -> Self {
        let mut rigid_body_set = RigidBodySet::new();
        let mut collider_set = ColliderSet::new();

        // 默认给一个地面 + 一个盒子，验证模拟链路 OK（后续可移除）
        let ground = RigidBodyBuilder::fixed().build();
        let ground_handle = rigid_body_set.insert(ground);
        let ground_collider = ColliderBuilder::cuboid(50.0, 0.1, 50.0).build();
        collider_set.insert_with_parent(ground_collider, ground_handle, &mut rigid_body_set);

        let body = RigidBodyBuilder::dynamic()
            .translation(Vector::new(0.0, 5.0, 0.0))
            .build();
        let body_handle = rigid_body_set.insert(body);
        let collider = ColliderBuilder::cuboid(0.5, 0.5, 0.5).density(1.0).build();
        collider_set.insert_with_parent(collider, body_handle, &mut rigid_body_set);

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

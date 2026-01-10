use rapier3d::prelude::*;
use std::collections::HashMap;

/// 物理世界封装
/// 
/// 管理所有刚体、碰撞体和物理模拟状态
/// 当前使用 Rapier 作为后端，未来可扩展 OBB 专用算法
pub struct PhysicsWorld {
    pub pipeline: PhysicsPipeline,
    pub gravity: Vector,
    pub integration_parameters: IntegrationParameters,
    pub island_manager: IslandManager,
    pub broad_phase: BroadPhaseBvh,
    pub narrow_phase: NarrowPhase,
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
    // 映射用户 ID 到 RigidBodyHandle
    pub user_id_to_body: HashMap<u32, RigidBodyHandle>,
    pub next_user_id: u32,
}

impl PhysicsWorld {
    pub fn new(gravity_y: Real) -> Self {
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

    pub fn step(&mut self, dt: Real) {
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

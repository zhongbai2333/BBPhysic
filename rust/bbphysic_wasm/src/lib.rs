#![allow(clippy::not_unsafe_ptr_arg_deref)]

// Minimal wasm export surface for solver acceleration.
//
// This deliberately avoids wasm-bindgen to keep the integration simple:
// JS side can instantiate the wasm and call exports, passing pointers into
// wasm linear memory.
//
// Exported functions:
// - bbp_alloc(len_bytes) -> *mut u8
// - bbp_free(ptr, len_bytes)
// - bbp_rapier_step(...)

use core::mem;

// Rapier / Parry query helpers (3D, f32)
use rapier3d::na::{Isometry3, Matrix3, Rotation3, Translation3, UnitQuaternion, Vector3};

use rapier3d::prelude::{
    ActiveCollisionTypes, BroadPhase, CCDSolver, ColliderBuilder, ColliderSet, ImpulseJointSet,
    IntegrationParameters, InteractionGroups, IslandManager, JointAxesMask, JointAxis,
    MultibodyJointSet, NarrowPhase, PhysicsPipeline, QueryPipeline, RigidBodyBuilder,
    RigidBodyHandle, RigidBodySet,
};

use std::num::NonZeroUsize;

#[no_mangle]
pub extern "C" fn bbp_alloc(len_bytes: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len_bytes);
    let ptr = buf.as_mut_ptr();
    mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn bbp_free(ptr: *mut u8, len_bytes: usize) {
    if ptr.is_null() || len_bytes == 0 {
        return;
    }
    let _ = Vec::<u8>::from_raw_parts(ptr, 0, len_bytes);
}

#[inline]
unsafe fn slice_f32<'a>(ptr: *mut f32, len: usize) -> &'a mut [f32] {
    core::slice::from_raw_parts_mut(ptr, len)
}

#[inline]
unsafe fn slice_i32<'a>(ptr: *const i32, len: usize) -> &'a [i32] {
    core::slice::from_raw_parts(ptr, len)
}

#[inline]
unsafe fn slice_u8<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    core::slice::from_raw_parts(ptr, len)
}

#[inline]
fn quat_from_xyzw(x: f32, y: f32, z: f32, w: f32) -> UnitQuaternion<f32> {
    // nalgebra's UnitQuaternion stores (w, i, j, k)
    let q = rapier3d::na::Quaternion::new(w, x, y, z);
    UnitQuaternion::from_quaternion(q)
}

#[inline]
fn iso_from_pos_quat(px: f32, py: f32, pz: f32, qx: f32, qy: f32, qz: f32, qw: f32) -> Isometry3<f32> {
    Isometry3::from_parts(
        Translation3::from(Vector3::new(px, py, pz)),
        quat_from_xyzw(qx, qy, qz, qw),
    )
}

#[inline]
fn clamp_f32(x: f32, lo: f32, hi: f32) -> f32 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

// ---------------------------
// Rapier full physics step (Dynamics)
// ---------------------------

/// Run a single Rapier physics step for a skeletal chain set.
///
/// This intentionally keeps all "physics" inside Rapier:
/// - rigid bodies (dynamic + kinematic roots)
/// - impulse joints between parent/child pivots
/// - angular motors to drive toward target local Euler angles
/// - collision against external OBB boxes
///
/// Memory layout (all little-endian, wasm linear memory):
/// - parent_i32[n] : parent index per bone (-1 for root)
/// - root_u8[n]    : 1 if this bone is a kinematic root driven by target world pose
/// - world_pos[3n] : current simulated world pivot positions (in)
/// - world_quat[4n]: current simulated world pivot orientations (in), xyzw
/// - linvel[3n]    : linear velocity (in/out)
/// - angvel[3n]    : angular velocity (in/out)
/// - target_local_euler_rad[3n]: target local euler XYZ in radians (per bone, relative to parent)
/// - radius[ n ]   : collision half-extent per bone (pivot OBB cuboid)
/// - target_world_pos[3n]  : target world pose for kinematic roots (others ignored)
/// - target_world_quat[4n] : target world pose for kinematic roots (others ignored)
/// - boxes[15*m]   : external OBB boxes (center, axes, half)
/// - out_world_pos[3n] (out)
/// - out_world_quat[4n] (out)
///
/// Returns 1 on success, 0 on invalid inputs.
#[no_mangle]
pub unsafe extern "C" fn bbp_rapier_step(
    bone_count: u32,
    dt: f32,
    substeps: u32,
    gravity_y: f32,
    lin_damping: f32,
    ang_damping: f32,
    motor_stiffness: f32,
    motor_damping: f32,
    air_drag: f32,
    inertia_scale: f32,
    target_self_collision: u32,
    cloth_link_count: u32,
    cloth_links_ptr: *const f32,
    parent_ptr: *const i32,
    root_ptr: *const u8,
    world_pos_ptr: *const f32,
    world_quat_ptr: *const f32,
    linvel_ptr: *mut f32,
    angvel_ptr: *mut f32,
    target_local_euler_ptr: *const f32,
    radius_ptr: *const f32,
    target_world_pos_ptr: *const f32,
    target_world_quat_ptr: *const f32,
    box_count: u32,
    boxes_ptr: *const f32,
    out_world_pos_ptr: *mut f32,
    out_world_quat_ptr: *mut f32,
) -> u32 {
    let n = bone_count as usize;
    if n == 0 {
        return 0;
    }
    if parent_ptr.is_null()
        || root_ptr.is_null()
        || world_pos_ptr.is_null()
        || world_quat_ptr.is_null()
        || linvel_ptr.is_null()
        || angvel_ptr.is_null()
        || target_local_euler_ptr.is_null()
        || radius_ptr.is_null()
        || target_world_pos_ptr.is_null()
        || target_world_quat_ptr.is_null()
        || out_world_pos_ptr.is_null()
        || out_world_quat_ptr.is_null()
    {
        return 0;
    }

    let parents = slice_i32(parent_ptr, n);
    let roots = slice_u8(root_ptr, n);
    let world_pos = core::slice::from_raw_parts(world_pos_ptr, 3 * n);
    let world_quat = core::slice::from_raw_parts(world_quat_ptr, 4 * n);
    let target_local = core::slice::from_raw_parts(target_local_euler_ptr, 3 * n);
    let radius = core::slice::from_raw_parts(radius_ptr, n);
    let target_world_pos = core::slice::from_raw_parts(target_world_pos_ptr, 3 * n);
    let target_world_quat = core::slice::from_raw_parts(target_world_quat_ptr, 4 * n);
    let linvel = slice_f32(linvel_ptr, 3 * n);
    let angvel = slice_f32(angvel_ptr, 3 * n);
    let out_pos = slice_f32(out_world_pos_ptr, 3 * n);
    let out_quat = slice_f32(out_world_quat_ptr, 4 * n);

    let dt = if dt.is_finite() { dt } else { 0.0 };
    let steps = (substeps.max(1).min(32)) as usize;
    let dt_step = (dt / (steps as f32)).max(0.0);

    // World + sets
    let mut islands = IslandManager::new();
    let mut broad_phase = BroadPhase::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut bodies = RigidBodySet::new();
    let mut colliders = ColliderSet::new();
    let mut joints = ImpulseJointSet::new();
    let mut mb_joints = MultibodyJointSet::new();
    let mut ccd_solver = CCDSolver::new();
    let mut pipeline = PhysicsPipeline::new();
    let mut query_pipeline = QueryPipeline::new();

    let grav = Vector3::new(0.0, gravity_y, 0.0);
    let lin_damp = clamp_f32(lin_damping, 0.0, 50.0);
    let ang_damp = clamp_f32(ang_damping, 0.0, 50.0);
    let motor_k = clamp_f32(motor_stiffness, 0.0, 5_000.0);
    let motor_c = clamp_f32(motor_damping, 0.0, 2_000.0);

    let drag = clamp_f32(air_drag, 0.0, 50.0);
    let drag_factor = (1.0 - drag * dt_step).clamp(0.0, 1.0);
    let inertia = clamp_f32(inertia_scale, 0.0, 5.0);
    let vel_scale = drag_factor * inertia;

    let allow_self_collision = target_self_collision != 0;

    // Collision groups: bones only collide with environment (OBB boxes), not with each other.
    let group_bones: u32 = 0b0001;
    let group_env: u32 = 0b0010;
    let bones_mask = if allow_self_collision { group_env | group_bones } else { group_env };
    let bones_groups = InteractionGroups::new(group_bones.into(), bones_mask.into());
    let env_groups = InteractionGroups::new(group_env.into(), group_bones.into());

    let bone_active = if allow_self_collision {
        ActiveCollisionTypes::DYNAMIC_DYNAMIC
            | ActiveCollisionTypes::DYNAMIC_KINEMATIC
            | ActiveCollisionTypes::DYNAMIC_FIXED
            | ActiveCollisionTypes::KINEMATIC_FIXED
    } else {
        ActiveCollisionTypes::DYNAMIC_FIXED | ActiveCollisionTypes::KINEMATIC_FIXED
    };

    // Integration parameters
    let mut params = IntegrationParameters::default();
    params.dt = dt_step;
    // make constraints a bit tighter by default
    params.erp = 0.8;
    params.joint_erp = 0.8;
    params.num_solver_iterations = NonZeroUsize::new(8).unwrap();
    // Improve contact robustness to reduce slow sinking through env colliders.
    params.allowed_linear_error = 0.0005;
    params.max_penetration_correction = 0.4;
    params.prediction_distance = 0.08;
    params.max_ccd_substeps = 4;

    // Create rigid bodies
    let mut handles: Vec<RigidBodyHandle> = Vec::with_capacity(n);
    for i in 0..n {
        let p_off = 3 * i;
        let q_off = 4 * i;
        let px = world_pos[p_off + 0];
        let py = world_pos[p_off + 1];
        let pz = world_pos[p_off + 2];
        let qx = world_quat[q_off + 0];
        let qy = world_quat[q_off + 1];
        let qz = world_quat[q_off + 2];
        let qw = world_quat[q_off + 3];
        let iso = iso_from_pos_quat(px, py, pz, qx, qy, qz, qw);

        let is_root = roots[i] != 0;
        let mut rb = if is_root {
            // Kinematic root follows target world pose.
            RigidBodyBuilder::kinematic_position_based().position(iso)
        } else {
            RigidBodyBuilder::dynamic().position(iso).ccd_enabled(true)
        };
        rb = rb.linear_damping(lin_damp).angular_damping(ang_damp);

        // Apply incoming velocities for dynamics.
        if !is_root {
            let lv = Vector3::new(linvel[p_off + 0], linvel[p_off + 1], linvel[p_off + 2]);
            let av = Vector3::new(angvel[p_off + 0], angvel[p_off + 1], angvel[p_off + 2]);
            rb = rb.linvel(lv).angvel(av);
        }

        let h = bodies.insert(rb);
        handles.push(h);
    }

    // Add per-bone pivot colliders as OBB cuboids.
    // NOTE: we keep this OBB-only (no capsule/ball) to match the project direction.
    // `radius[i]` is interpreted as a half-extent for the cuboid.
    for i in 0..n {
        let r = radius[i].max(0.0);
        if r <= 1e-6 {
            continue;
        }
        let h = handles[i];
        let co = ColliderBuilder::cuboid(r, r, r)
            .collision_groups(bones_groups)
            // Collide against env and optionally self depending on config.
            .active_collision_types(bone_active)
            .friction(0.8)
            .restitution(0.0);
        colliders.insert_with_parent(co, h, &mut bodies);
    }

    // Create external OBB colliders as fixed bodies (one fixed body per box).
    if box_count > 0 {
        if boxes_ptr.is_null() {
            return 0;
        }
        let m = box_count as usize;
        let floats_per = 15usize;
        let data = slice_f32_ro(boxes_ptr, m * floats_per);
        for bi in 0..m {
            let off = bi * floats_per;
            let cx = data[off + 0];
            let cy = data[off + 1];
            let cz = data[off + 2];
            let ax0 = data[off + 3];
            let ax1 = data[off + 4];
            let ax2 = data[off + 5];
            let ay0 = data[off + 6];
            let ay1 = data[off + 7];
            let ay2 = data[off + 8];
            let az0 = data[off + 9];
            let az1 = data[off + 10];
            let az2 = data[off + 11];
            let hx = data[off + 12].max(0.0);
            let hy = data[off + 13].max(0.0);
            let hz = data[off + 14].max(0.0);
            if hx <= 0.0 || hy <= 0.0 || hz <= 0.0 {
                continue;
            }
            let cols = [
                Vector3::new(ax0, ax1, ax2),
                Vector3::new(ay0, ay1, ay2),
                Vector3::new(az0, az1, az2),
            ];
            let m3 = Matrix3::from_columns(&cols);
            let rot3 = Rotation3::from_matrix_unchecked(m3);
            let quat = UnitQuaternion::from_rotation_matrix(&rot3);
            let iso = Isometry3::from_parts(Translation3::from(Vector3::new(cx, cy, cz)), quat);

            let rb = RigidBodyBuilder::fixed().position(iso);
            let h = bodies.insert(rb);
            let co = ColliderBuilder::cuboid(hx, hy, hz)
                .collision_groups(env_groups)
                // Env boxes collide only against dynamic/kinematic bones.
                .active_collision_types(ActiveCollisionTypes::DYNAMIC_FIXED | ActiveCollisionTypes::KINEMATIC_FIXED)
                .friction(0.8)
                .restitution(0.0);
            colliders.insert_with_parent(co, h, &mut bodies);
        }
    }

    // Optional cloth-like coupling: connect chain tips with rod-like constraints.
    // Implemented using only Rapier rigid bodies + ball joints (no custom solver).
    if cloth_link_count > 0 {
        if !cloth_links_ptr.is_null() {
            let m = cloth_link_count.min(256) as usize;
            let data = slice_f32_ro(cloth_links_ptr, 3 * m);
            for li in 0..m {
                let off = 3 * li;
                let a = data[off + 0].round() as i32;
                let b = data[off + 1].round() as i32;
                let rest = data[off + 2].max(0.0);
                if a < 0 || b < 0 || rest <= 1e-6 {
                    continue;
                }
                let a = a as usize;
                let b = b as usize;
                if a >= n || b >= n || a == b {
                    continue;
                }

                let ha = handles[a];
                let hb = handles[b];
                let ia = *bodies[ha].position();
                let ib = *bodies[hb].position();
                let pa = ia.translation.vector;
                let pb = ib.translation.vector;
                let seg = pb - pa;
                let dist = seg.norm();
                if !dist.is_finite() || dist <= 1e-6 {
                    continue;
                }
                let dir = seg / dist;
                let mid = (pa + pb) * 0.5;

                let from = Vector3::x();
                let to = dir;
                let rot = UnitQuaternion::rotation_between(&from, &to).unwrap_or(UnitQuaternion::identity());
                let iso_mid = Isometry3::from_parts(Translation3::from(mid), rot);

                // A small intermediate body acts as a rigid rod.
                let rod = RigidBodyBuilder::dynamic()
                    .position(iso_mid)
                    .linear_damping((lin_damp + 5.0).min(50.0))
                    .angular_damping((ang_damp + 5.0).min(50.0));
                let hrod = bodies.insert(rod);

                // Endpoints in world based on rest-length.
                let ea = rapier3d::na::Point3::from(mid - dir * (rest * 0.5));
                let eb = rapier3d::na::Point3::from(mid + dir * (rest * 0.5));

                // Joint A
                let iso_a = *bodies[ha].position();
                let iso_r = *bodies[hrod].position();
                let a1 = iso_a.inverse_transform_point(&ea);
                let a2 = iso_r.inverse_transform_point(&ea);
                let ja = rapier3d::dynamics::GenericJointBuilder::new(JointAxesMask::LOCKED_SPHERICAL_AXES)
                    .local_anchor1(a1)
                    .local_anchor2(a2);
                joints.insert(ha, hrod, ja, true);

                // Joint B
                let iso_b = *bodies[hb].position();
                let iso_r2 = *bodies[hrod].position();
                let b1 = iso_b.inverse_transform_point(&eb);
                let b2 = iso_r2.inverse_transform_point(&eb);
                let jb = rapier3d::dynamics::GenericJointBuilder::new(JointAxesMask::LOCKED_SPHERICAL_AXES)
                    .local_anchor1(b1)
                    .local_anchor2(b2);
                joints.insert(hb, hrod, jb, true);
            }
        }
    }

    // Parent-child joints with angular motors to drive toward target local Euler.
    for child in 0..n {
        let p = parents[child];
        if p < 0 {
            continue;
        }
        let parent = p as usize;
        if parent >= n {
            continue;
        }
        let h_parent = handles[parent];
        let h_child = handles[child];

        // Anchors: child pivot in world, expressed in local frames.
        let child_iso = bodies[h_child].position();
        let parent_iso = bodies[h_parent].position();
        let pivot_world = rapier3d::na::Point3::from(child_iso.translation.vector);
        let a1 = parent_iso.inverse_transform_point(&pivot_world);
        let a2 = rapier3d::na::Point3::origin();

        // Generic joint: lock translations (ball-like), allow rotations, with motors.
        let mut joint = rapier3d::dynamics::GenericJointBuilder::new(JointAxesMask::LOCKED_SPHERICAL_AXES)
            .local_anchor1(a1)
            .local_anchor2(a2);

        // Motor targets are the child's *local* Euler angles (relative to parent), in radians.
        let t_off = 3 * child;
        let tx = target_local[t_off + 0];
        let ty = target_local[t_off + 1];
        let tz = target_local[t_off + 2];

        joint = joint
            .motor_position(JointAxis::AngX, tx, motor_k, motor_c)
            .motor_position(JointAxis::AngY, ty, motor_k, motor_c)
            .motor_position(JointAxis::AngZ, tz, motor_k, motor_c);

        joints.insert(h_parent, h_child, joint, true);
    }

    // Drive kinematic roots to their target poses.
    for i in 0..n {
        if roots[i] == 0 {
            continue;
        }
        let p_off = 3 * i;
        let q_off = 4 * i;
        let px = target_world_pos[p_off + 0];
        let py = target_world_pos[p_off + 1];
        let pz = target_world_pos[p_off + 2];
        let qx = target_world_quat[q_off + 0];
        let qy = target_world_quat[q_off + 1];
        let qz = target_world_quat[q_off + 2];
        let qw = target_world_quat[q_off + 3];
        let iso = iso_from_pos_quat(px, py, pz, qx, qy, qz, qw);
        let h = handles[i];
        bodies[h].set_next_kinematic_position(iso);
    }

    // Step simulation.
    for _ in 0..steps {
        pipeline.step(
            &grav,
            &params,
            &mut islands,
            &mut broad_phase,
            &mut narrow_phase,
            &mut bodies,
            &mut colliders,
            &mut joints,
            &mut mb_joints,
            &mut ccd_solver,
            Some(&mut query_pipeline),
            &(),
            &(),
        );

        // Apply additional air-drag/inertia scaling to dynamic bodies.
        if vel_scale < 0.9999 || vel_scale > 1.0001 {
            for i in 0..n {
                if roots[i] != 0 {
                    continue; // skip kinematic
                }
                let h = handles[i];
                let mut lv = *bodies[h].linvel();
                let mut av = *bodies[h].angvel();
                lv *= vel_scale;
                av *= vel_scale;
                bodies[h].set_linvel(lv, true);
                bodies[h].set_angvel(av, true);
            }
        }
    }

    // Write outputs.
    for i in 0..n {
        let p_off = 3 * i;
        let q_off = 4 * i;
        let h = handles[i];
        let iso = bodies[h].position();
        let t = iso.translation.vector;
        out_pos[p_off + 0] = t.x;
        out_pos[p_off + 1] = t.y;
        out_pos[p_off + 2] = t.z;
        let q = iso.rotation.quaternion();
        out_quat[q_off + 0] = q.i;
        out_quat[q_off + 1] = q.j;
        out_quat[q_off + 2] = q.k;
        out_quat[q_off + 3] = q.w;

        // Velocities out (for dynamics only; roots can be zeroed).
        let mut lv = *bodies[h].linvel();
        let mut av = *bodies[h].angvel();
        // Clamp velocities to avoid explosive impulses when pushed by external colliders.
        let max_lin = 35.0_f32;
        let max_ang = 50.0_f32;
        let lin_norm = lv.norm();
        if lin_norm.is_finite() && lin_norm > max_lin {
            lv = lv * (max_lin / lin_norm);
        }
        let ang_norm = av.norm();
        if ang_norm.is_finite() && ang_norm > max_ang {
            av = av * (max_ang / ang_norm);
        }
        linvel[p_off + 0] = if roots[i] != 0 { 0.0 } else { lv.x };
        linvel[p_off + 1] = if roots[i] != 0 { 0.0 } else { lv.y };
        linvel[p_off + 2] = if roots[i] != 0 { 0.0 } else { lv.z };
        angvel[p_off + 0] = if roots[i] != 0 { 0.0 } else { av.x };
        angvel[p_off + 1] = if roots[i] != 0 { 0.0 } else { av.y };
        angvel[p_off + 2] = if roots[i] != 0 { 0.0 } else { av.z };
    }

    1
}

#[inline]
unsafe fn slice_f32_ro<'a>(ptr: *const f32, len: usize) -> &'a [f32] {
    core::slice::from_raw_parts(ptr, len)
}

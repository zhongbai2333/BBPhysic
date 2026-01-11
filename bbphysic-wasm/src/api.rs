use crate::physics::PhysicsWorld;
use crate::obb::{OBB, check_obb_collision};
use rapier3d::prelude::*;
use glam::{Vec3, Quat};
use std::cell::RefCell;

thread_local! {
    // 用句柄（u32）索引，避免 JS 侧管理指针
    static WORLDS: RefCell<Vec<Option<PhysicsWorld>>> = const { RefCell::new(Vec::new()) };
}

/// 返回 ABI 版本号，方便以后升级导出接口
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

/// 设置求解器迭代次数（影响关节/碰撞约束的“刚度/强度”）
/// iterations: 建议 4~32，越大越稳定但越慢。
#[no_mangle]
pub extern "C" fn bbp_set_solver_iterations(handle: u32, iterations: u32) -> u32 {
    if handle == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            let iters = iterations.max(1).min(128) as usize;
            world.integration_parameters.num_solver_iterations = iters;
            1
        } else {
            0
        }
    })
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
    rot_x: f32,
    rot_y: f32,
    rot_z: f32,
    rot_w: f32,
) -> u32 {
    if handle == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            let position = Vector::new(pos_x as Real, pos_y as Real, pos_z as Real);
            let mut rotation = Quat::from_xyzw(rot_x, rot_y, rot_z, rot_w);
            if rotation.length_squared() < 1.0e-12 {
                rotation = Quat::IDENTITY;
            } else {
                rotation = rotation.normalize();
            }

            let mut rb = match body_type {
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

            // Rapier's builder.rotation expects an angular vector. For our JS API we accept quaternion,
            // so apply it post-build.
            rb.set_rotation(rotation, false);

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

/// 添加碰撞体（长方体）到刚体（扩展版）
/// body_id: 刚体用户 ID
/// hx, hy, hz: 半尺寸
/// is_sensor: 0=普通碰撞体, 1=传感器（不产生接触力，但仍可用于质量属性）
#[no_mangle]
pub extern "C" fn bbp_add_box_collider_ex(
    handle: u32,
    body_id: u32,
    hx: f32,
    hy: f32,
    hz: f32,
    is_sensor: u32,
) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                let mut builder = ColliderBuilder::cuboid(hx as Real, hy as Real, hz as Real)
                    // Be explicit: ensure the collider contributes mass properties.
                    .density(1.0);
                if is_sensor != 0 {
                    builder = builder.sensor(true);
                }
                let collider = builder.build();
                world
                    .collider_set
                    .insert_with_parent(collider, rb_handle, &mut world.rigid_body_set);
                1
            } else {
                0
            }
        } else {
            0
        }
    })
}

/// 添加碰撞体（长方体）到刚体（带 collision groups）
/// - is_sensor: 0=普通碰撞体, 1=传感器
/// - membership_bits/filter_bits: 32-bit bitmask for InteractionGroups
#[no_mangle]
pub extern "C" fn bbp_add_box_collider_groups(
    handle: u32,
    body_id: u32,
    hx: f32,
    hy: f32,
    hz: f32,
    is_sensor: u32,
    membership_bits: u32,
    filter_bits: u32,
) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                let memberships = Group::from_bits_truncate(membership_bits);
                let filter = Group::from_bits_truncate(filter_bits);
                let groups = InteractionGroups::new(memberships, filter, InteractionTestMode::And);

                let mut builder = ColliderBuilder::cuboid(hx as Real, hy as Real, hz as Real)
                    .density(1.0)
                    .collision_groups(groups);
                if is_sensor != 0 {
                    builder = builder.sensor(true);
                }

                let collider = builder.build();
                world
                    .collider_set
                    .insert_with_parent(collider, rb_handle, &mut world.rigid_body_set);
                1
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
                    let position = Vector::new(pos_x as Real, pos_y as Real, pos_z as Real);
                    let mut rotation = Quat::from_xyzw(rot_x, rot_y, rot_z, rot_w);
                    if rotation.length_squared() < 1.0e-12 {
                        rotation = Quat::IDENTITY;
                    } else {
                        rotation = rotation.normalize();
                    }

                    if rb.is_kinematic() {
                        // KinematicPositionBased bodies should be driven via the "next" pose so Rapier can
                        // compute effective kinematic velocities and push dynamic bodies.
                        rb.set_next_kinematic_translation(position);
                        rb.set_next_kinematic_rotation(rotation);
                    } else {
                        rb.set_translation(position, true);
                        rb.set_rotation(rotation, true);
                    }
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

/// 修改刚体类型（0=固定, 1=动态, 2=运动学 position-based）
/// 用途：拖拽交互时临时切换到运动学，避免直接瞬移导致关节爆炸。
#[no_mangle]
pub extern "C" fn bbp_set_body_type(handle: u32, body_id: u32, body_type: u32) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                if let Some(rb) = world.rigid_body_set.get_mut(rb_handle) {
                    let new_type = match body_type {
                        0 => RigidBodyType::Fixed,
                        1 => RigidBodyType::Dynamic,
                        2 => RigidBodyType::KinematicPositionBased,
                        _ => return 0,
                    };

                    rb.set_body_type(new_type, true);

                    // When switching back to dynamic, clear velocities to avoid explosive impulses
                    // caused by large effective kinematic velocities accumulated during drag.
                    if new_type == RigidBodyType::Dynamic {
                        rb.set_linvel(Vector::new(0.0, 0.0, 0.0), true);
                        rb.set_angvel(Vector::new(0.0, 0.0, 0.0), true);
                    }

                    1
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

/// 设置刚体线速度（世界坐标）
/// 用途：拖拽释放时注入初速度（惯性手感）。
#[no_mangle]
pub extern "C" fn bbp_set_linvel(handle: u32, body_id: u32, vx: f32, vy: f32, vz: f32) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                if let Some(rb) = world.rigid_body_set.get_mut(rb_handle) {
                    rb.set_linvel(Vector::new(vx as Real, vy as Real, vz as Real), true);
                    return 1;
                }
            }
        }
        0
    })
}

/// 设置刚体角速度（世界坐标，单位=弧度/秒）
#[no_mangle]
pub extern "C" fn bbp_set_angvel(handle: u32, body_id: u32, wx: f32, wy: f32, wz: f32) -> u32 {
    if handle == 0 || body_id == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        if let Some(Some(world)) = worlds.get_mut(idx) {
            if let Some(&rb_handle) = world.user_id_to_body.get(&body_id) {
                if let Some(rb) = world.rigid_body_set.get_mut(rb_handle) {
                    rb.set_angvel(Vector::new(wx as Real, wy as Real, wz as Real), true);
                    return 1;
                }
            }
        }
        0
    })
}

/// 添加球关节（SphericalJoint）连接两个刚体。
/// - body_id1/body_id2: 两个刚体用户 ID
/// - anchor_*: 关节锚点（世界坐标）
/// - 默认禁用两端刚体之间的接触（contacts_enabled=false），避免关节旋转被碰撞卡死。
#[no_mangle]
pub extern "C" fn bbp_add_spherical_joint(
    handle: u32,
    body_id1: u32,
    body_id2: u32,
    anchor_x: f32,
    anchor_y: f32,
    anchor_z: f32,
) -> u32 {
    if handle == 0 || body_id1 == 0 || body_id2 == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        let Some(Some(world)) = worlds.get_mut(idx) else {
            return 0;
        };

        let Some(&h1) = world.user_id_to_body.get(&body_id1) else {
            return 0;
        };
        let Some(&h2) = world.user_id_to_body.get(&body_id2) else {
            return 0;
        };

        let Some(rb1) = world.rigid_body_set.get(h1) else {
            return 0;
        };
        let Some(rb2) = world.rigid_body_set.get(h2) else {
            return 0;
        };

        let anchor_world = Vector::new(anchor_x as Real, anchor_y as Real, anchor_z as Real);
        // Convert world anchor into each body's local space.
        let local1 = rb1.rotation().inverse() * (anchor_world - rb1.translation());
        let local2 = rb2.rotation().inverse() * (anchor_world - rb2.translation());

        let joint = SphericalJointBuilder::new()
            .contacts_enabled(false)
            .local_anchor1(local1)
            .local_anchor2(local2)
            .build();

        world.impulse_joint_set.insert(h1, h2, joint, true);
        1
    })
}

/// 添加固定关节（FixedJoint）将两个刚体刚性绑定到当前相对姿态。
/// 默认禁用两端刚体之间的接触（contacts_enabled=false），避免自碰撞干扰绑定。
#[no_mangle]
pub extern "C" fn bbp_add_fixed_joint(handle: u32, body_id1: u32, body_id2: u32) -> u32 {
    if handle == 0 || body_id1 == 0 || body_id2 == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        let Some(Some(world)) = worlds.get_mut(idx) else {
            return 0;
        };

        let Some(&h1) = world.user_id_to_body.get(&body_id1) else {
            return 0;
        };
        let Some(&h2) = world.user_id_to_body.get(&body_id2) else {
            return 0;
        };

        let Some(rb1) = world.rigid_body_set.get(h1) else {
            return 0;
        };
        let Some(rb2) = world.rigid_body_set.get(h2) else {
            return 0;
        };

        // Preserve current relative transform by choosing the joint frame to be rb1's current pose.
        // world_frame = rb1_pos * frame1 = rb2_pos * frame2
        let world_frame = *rb1.position();
        let frame1 = rb1.position().inverse() * world_frame;
        let frame2 = rb2.position().inverse() * world_frame;

        let joint = FixedJointBuilder::new()
            .contacts_enabled(false)
            .local_frame1(frame1)
            .local_frame2(frame2)
            .build();

        world.impulse_joint_set.insert(h1, h2, joint, true);
        1
    })
}

/// 添加刚性旋转关节（RevoluteJoint / Hinge）连接两个刚体。
/// - 只允许围绕指定轴旋转（不允许平移，也不允许其他轴的相对旋转）。
/// - anchor_*: 关节锚点（世界坐标）
/// - axis_*: 旋转轴（世界坐标；会自动归一化，过短则回退到 (0,1,0)）
/// - 默认禁用两端刚体之间的接触（contacts_enabled=false），避免关节旋转被碰撞卡死。
#[no_mangle]
pub extern "C" fn bbp_add_revolute_joint(
    handle: u32,
    body_id1: u32,
    body_id2: u32,
    anchor_x: f32,
    anchor_y: f32,
    anchor_z: f32,
    axis_x: f32,
    axis_y: f32,
    axis_z: f32,
) -> u32 {
    if handle == 0 || body_id1 == 0 || body_id2 == 0 {
        return 0;
    }
    let idx = (handle - 1) as usize;
    WORLDS.with(|worlds| {
        let mut worlds = worlds.borrow_mut();
        let Some(Some(world)) = worlds.get_mut(idx) else {
            return 0;
        };

        let Some(&h1) = world.user_id_to_body.get(&body_id1) else {
            return 0;
        };
        let Some(&h2) = world.user_id_to_body.get(&body_id2) else {
            return 0;
        };

        let Some(rb1) = world.rigid_body_set.get(h1) else {
            return 0;
        };
        let Some(rb2) = world.rigid_body_set.get(h2) else {
            return 0;
        };

        let anchor_world = Vector::new(anchor_x as Real, anchor_y as Real, anchor_z as Real);
        // Convert world anchor into each body's local space.
        let local1 = rb1.rotation().inverse() * (anchor_world - rb1.translation());
        let local2 = rb2.rotation().inverse() * (anchor_world - rb2.translation());

        let mut axis_world = Vector::new(axis_x as Real, axis_y as Real, axis_z as Real);
        let axis_len2 = axis_world.length_squared();
        if axis_len2 < 1.0e-12 {
            axis_world = Vector::new(0.0 as Real, 1.0 as Real, 0.0 as Real);
        } else {
            axis_world /= axis_len2.sqrt();
        }

        // Use axis expressed in body1 local space for the revolute joint.
        let axis_local1 = rb1.rotation().inverse() * axis_world;

        let joint = RevoluteJointBuilder::new(axis_local1)
            .contacts_enabled(false)
            .local_anchor1(local1)
            .local_anchor2(local2)
            .build();

        world.impulse_joint_set.insert(h1, h2, joint, true);
        1
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

/// 检查两个 OBB 是否碰撞
/// 参数：8个顶点 × 2个OBB × 3个坐标 = 48个f32
/// 返回：1=碰撞，0=不碰撞
#[no_mangle]
pub extern "C" fn bbp_check_obb_collision(
    vertices1_ptr: *const f32,
    vertices2_ptr: *const f32,
) -> u32 {
    if vertices1_ptr.is_null() || vertices2_ptr.is_null() {
        return 0;
    }

    unsafe {
        // 从指针读取顶点数据
        let v1_slice = std::slice::from_raw_parts(vertices1_ptr, 24); // 8 vertices * 3 coords
        let v2_slice = std::slice::from_raw_parts(vertices2_ptr, 24);

        // 转换为 Vec3 数组
        let mut vertices1 = [Vec3::ZERO; 8];
        let mut vertices2 = [Vec3::ZERO; 8];

        for i in 0..8 {
            vertices1[i] = Vec3::new(
                v1_slice[i * 3],
                v1_slice[i * 3 + 1],
                v1_slice[i * 3 + 2],
            );
            vertices2[i] = Vec3::new(
                v2_slice[i * 3],
                v2_slice[i * 3 + 1],
                v2_slice[i * 3 + 2],
            );
        }

        // 从顶点计算 OBB
        let obb1 = OBB::from_vertices(&vertices1);
        let obb2 = OBB::from_vertices(&vertices2);

        // 使用 Parry 的碰撞检测
        if check_obb_collision(&obb1, &obb2, 0.0).is_some() {
            1
        } else {
            0
        }
    }
}

/// 获取两个 OBB 的碰撞详细信息
/// 返回：ptr 指向 7 个 f32 [is_colliding, depth, normal_x, normal_y, normal_z, contact_x, contact_y, contact_z]
/// 使用完后需调用 bbp_free_collision_info
#[no_mangle]
pub extern "C" fn bbp_get_obb_collision_info(
    vertices1_ptr: *const f32,
    vertices2_ptr: *const f32,
) -> *mut f32 {
    if vertices1_ptr.is_null() || vertices2_ptr.is_null() {
        return std::ptr::null_mut();
    }

    unsafe {
        let v1_slice = std::slice::from_raw_parts(vertices1_ptr, 24);
        let v2_slice = std::slice::from_raw_parts(vertices2_ptr, 24);

        let mut vertices1 = [Vec3::ZERO; 8];
        let mut vertices2 = [Vec3::ZERO; 8];

        for i in 0..8 {
            vertices1[i] = Vec3::new(
                v1_slice[i * 3],
                v1_slice[i * 3 + 1],
                v1_slice[i * 3 + 2],
            );
            vertices2[i] = Vec3::new(
                v2_slice[i * 3],
                v2_slice[i * 3 + 1],
                v2_slice[i * 3 + 2],
            );
        }

        let obb1 = OBB::from_vertices(&vertices1);
        let obb2 = OBB::from_vertices(&vertices2);

        if let Some(collision) = check_obb_collision(&obb1, &obb2, 0.0) {
            let data = vec![
                1.0, // is_colliding
                collision.penetration_depth,
                collision.normal.x,
                collision.normal.y,
                collision.normal.z,
                collision.contact_point.x,
                collision.contact_point.y,
                collision.contact_point.z,
            ];

            let boxed = data.into_boxed_slice();
            Box::into_raw(boxed) as *mut f32
        } else {
            let data = vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
            let boxed = data.into_boxed_slice();
            Box::into_raw(boxed) as *mut f32
        }
    }
}

/// 释放碰撞信息数据
#[no_mangle]
pub extern "C" fn bbp_free_collision_info(ptr: *mut f32) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(std::slice::from_raw_parts_mut(ptr, 8));
        }
    }
}

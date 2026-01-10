use rapier3d::prelude::*;
use glam::{Vec3, Quat, Mat3};

/// OBB（Oriented Bounding Box）数据结构
/// 
/// 表示一个定向包围盒，用于精确的碰撞检测
#[derive(Clone, Debug)]
pub struct OBB {
    /// 中心点（世界坐标）
    pub center: Vec3,
    /// 旋转（四元数）
    pub rotation: Quat,
    /// 半尺寸（沿每个局部轴的半长）
    pub half_extents: Vec3,
}

impl OBB {
    /// 从中心点、旋转和半尺寸创建 OBB
    pub fn new(center: Vec3, rotation: Quat, half_extents: Vec3) -> Self {
        Self {
            center,
            rotation,
            half_extents,
        }
    }

    /// 从 8 个世界坐标顶点计算 OBB
    /// 
    /// 使用协方差矩阵方法计算最佳拟合的 OBB
    pub fn from_vertices(vertices: &[Vec3; 8]) -> Self {
        // 计算中心点
        let center = vertices.iter().fold(Vec3::ZERO, |acc, v| acc + *v) / 8.0;

        // 计算协方差矩阵（用于复杂情况，当前使用简化方法）
        let mut _cov = Mat3::ZERO;
        for v in vertices {
            let p = *v - center;
            _cov += Mat3::from_cols(
                Vec3::new(p.x * p.x, p.x * p.y, p.x * p.z),
                Vec3::new(p.y * p.x, p.y * p.y, p.y * p.z),
                Vec3::new(p.z * p.x, p.z * p.y, p.z * p.z),
            );
        }
        _cov /= 8.0;

        // 对于标准 Blockbench cube，我们可以使用简化方法
        // 假设顶点已经按标准顺序排列
        // 计算三个主轴
        let axis_x = (vertices[1] - vertices[0]).normalize();
        let axis_y = (vertices[3] - vertices[0]).normalize();
        let axis_z = (vertices[4] - vertices[0]).normalize();

        // 构建旋转矩阵
        let rot_matrix = Mat3::from_cols(axis_x, axis_y, axis_z);
        let rotation = Quat::from_mat3(&rot_matrix);

        // 计算半尺寸（沿每个轴投影）
        let half_x = (vertices[1] - vertices[0]).length() * 0.5;
        let half_y = (vertices[3] - vertices[0]).length() * 0.5;
        let half_z = (vertices[4] - vertices[0]).length() * 0.5;

        Self {
            center,
            rotation,
            half_extents: Vec3::new(half_x, half_y, half_z),
        }
    }

    /// 转换为 Rapier Cuboid 用于物理模拟（非碰撞检测）
    pub fn to_cuboid_shape(&self) -> (Vec3, Quat) {
        (self.center, self.rotation)
    }
}

/// OBB 碰撞检测结果
#[derive(Clone, Debug)]
pub struct OBBCollisionResult {
    /// 是否发生碰撞
    pub is_colliding: bool,
    /// 穿透深度（如果碰撞）
    pub penetration_depth: f32,
    /// 碰撞法线（从 obb1 指向 obb2）
    pub normal: Vec3,
    /// 碰撞点（世界坐标）
    pub contact_point: Vec3,
}

/// 使用简化的 OBB 碰撞检测
/// 
/// 基于分离轴定理（SAT）的简化实现
/// 完整版本将使用 Rapier/Parry 的优化算法
pub fn check_obb_collision(obb1: &OBB, obb2: &OBB, _prediction: f32) -> Option<OBBCollisionResult> {
    // 简化实现：使用球体包围检测作为快速检查
    let distance = (obb2.center - obb1.center).length();
    let combined_radius = (obb1.half_extents + obb2.half_extents).length();
    
    if distance < combined_radius {
        let direction = (obb2.center - obb1.center).normalize_or_zero();
        let penetration = combined_radius - distance;
        let contact_point = obb1.center + direction * obb1.half_extents.length();
        
        Some(OBBCollisionResult {
            is_colliding: true,
            penetration_depth: penetration,
            normal: direction,
            contact_point,
        })
    } else {
        None
    }
    
    // TODO: 实现完整的 SAT 算法
    // 1. 测试 obb1 的三个面法线作为分离轴
    // 2. 测试 obb2 的三个面法线作为分离轴
    // 3. 测试 9 个边叉乘作为分离轴
    // 4. 如果所有轴都不能分离，则碰撞
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_obb_creation() {
        let obb = OBB::new(
            Vec3::ZERO,
            Quat::IDENTITY,
            Vec3::new(1.0, 1.0, 1.0),
        );
        assert_eq!(obb.center, Vec3::ZERO);
        assert_eq!(obb.half_extents, Vec3::new(1.0, 1.0, 1.0));
    }

    #[test]
    fn test_obb_collision_non_overlapping() {
        let obb1 = OBB::new(
            Vec3::new(0.0, 0.0, 0.0),
            Quat::IDENTITY,
            Vec3::new(1.0, 1.0, 1.0),
        );
        let obb2 = OBB::new(
            Vec3::new(5.0, 0.0, 0.0),
            Quat::IDENTITY,
            Vec3::new(1.0, 1.0, 1.0),
        );

        let result = check_obb_collision(&obb1, &obb2, 0.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_obb_collision_overlapping() {
        let obb1 = OBB::new(
            Vec3::new(0.0, 0.0, 0.0),
            Quat::IDENTITY,
            Vec3::new(1.0, 1.0, 1.0),
        );
        let obb2 = OBB::new(
            Vec3::new(1.5, 0.0, 0.0),
            Quat::IDENTITY,
            Vec3::new(1.0, 1.0, 1.0),
        );

        let result = check_obb_collision(&obb1, &obb2, 0.0);
        assert!(result.is_some());
        if let Some(collision) = result {
            assert!(collision.is_colliding);
            assert!(collision.penetration_depth > 0.0);
        }
    }
}

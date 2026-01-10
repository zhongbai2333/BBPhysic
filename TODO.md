# BBPhysic TODO

> 目标：Blockbench 插件（BBPhysic）为骨骼/组提供基于 OBB（Oriented Bounding Box）的物理解算与碰撞检测。

## ✅ 已完成

### 插件基础设施
- [x] TypeScript 插件架构（esbuild 打包）
- [x] 插件注册与生命周期管理
- [x] i18n 国际化系统（中英文）
- [x] 设置持久化（localStorage）
- [x] 顶部菜单栏集成 `BBPhysic`

### UI 组件
- [x] **设置对话框**：物理参数、碰撞设置、显示选项、调试选项
- [x] **解算对话框**：双 Group 选择（运动物体 + 碰撞体）
- [x] **顶部菜单**：设置 / 选择根 Group / 开始解算 / 预览 / 线框显示

### 数据准备（OBB 模式）
- [x] 从 Cube 提取世界坐标顶点（8 个顶点）
- [x] 从 Cube 提取边信息（12 条边）
- [x] Group 层级遍历
- [x] 关节枢轴点计算

### 可视化（OBB 线框）
- [x] **OBB 线框渲染**：基于 Cube 的 8 个世界顶点绘制
- [x] 关节枢轴标记（Group origin）
- [x] 碰撞体可视化
- [x] 可配置颜色、透明度
- [x] 对角线变体（区分不同 Cube）
- [x] Three.js 集成

### WASM 集成
- [x] Rust 项目（Rapier3D 0.32.0）
- [x] WebAssembly 编译
- [x] 多策略加载（fs.readFileSync / Blockbench.readFile）
- [x] 插件目录路径解析
- [x] ABI 版本控制
- [x] **WASM API 基础**：
  - `bbp_world_create` - 创建物理世界
  - `bbp_world_step` - 步进模拟
  - `bbp_world_free` - 释放世界
  - `bbp_add_rigid_body` - 添加刚体
  - `bbp_add_box_collider` - 添加长方体碰撞体
  - `bbp_get_transform` / `bbp_set_transform` - 变换操作
  - `bbp_get_body_count` - 查询刚体数量

### 构建系统
- [x] esbuild 配置
- [x] WASM 构建脚本（Windows/Linux/macOS）
- [x] Watch 模式开发

### 文档
- [x] DEVELOPMENT.md（架构、构建、API）
- [x] PROJECT_SUMMARY.md（实现清单）
- [x] README.md（功能、快速开始、双语）

## 🔄 下一步（OBB 解算核心功能）

### 1. OBB 碰撞检测算法优化
**目标**：实现高效的 OBB-OBB 碰撞检测

- [ ] **Rust 侧 OBB 数据结构**
  - 定义 OBB 结构体（中心点、三个轴、三个半尺寸）
  - 从 8 顶点计算 OBB（主成分分析或简化方法）
  - OBB 与 Rapier 刚体的转换

- [ ] **OBB 碰撞检测算法**
  - 分离轴定理（SAT）实现
  - 优化性能（早期退出、缓存计算）
  - 提供碰撞点、法线、穿透深度

- [ ] **WASM API 扩展（OBB 专用）**
  - `bbp_add_obb_collider(handle, body_id, center, axes, half_extents) -> collider_id`
  - `bbp_check_obb_collision(handle, obb1, obb2) -> collision_info`
  - `bbp_get_collision_contacts(handle) -> contacts`

### 2. Blockbench → OBB 数据流
**目标**：从 Blockbench Cube 准确提取 OBB 数据

- [ ] **Group 层级解析**
  - 递归遍历所有子 Group
  - 处理 Group 的旋转和位置变换
  - 构建刚体层级树

- [ ] **Cube → OBB 转换**
  - 从 `cube.getGlobalVertexPositions()` 获取世界坐标
  - 计算 OBB 中心点
  - 计算 OBB 三个主轴方向（基于旋转矩阵）
  - 计算沿每个轴的半尺寸

- [ ] **坐标系映射**
  - Blockbench 坐标系 → Rapier 坐标系
  - 单位缩放处理（设置中的 unit_scale）
  - 四元数与欧拉角转换

### 3. 物理解算执行
**目标**：使用 OBB 进行实际的碰撞解算

- [ ] **解算流程**
  - 初始化：创建物理世界，添加所有 OBB 刚体
  - 步进：执行物理模拟步骤
  - 结果应用：将解算结果应用回 Blockbench Group/Cube

- [ ] **碰撞响应**
  - 位置校正（分离重叠的 OBB）
  - 速度调整（基于摩擦、弹性系数）
  - 关节约束（限制旋转范围）

- [ ] **性能优化**
  - 空间分区（BVH/网格）
  - 休眠机制（静止物体不参与计算）
  - 增量更新（只更新变化的物体）

### 4. 实时预览
**目标**：在 Blockbench 中实时查看物理模拟效果

- [ ] **渲染循环集成**
  - 挂钩 Blockbench 的渲染循环
  - 每帧调用 `bbp_world_step`
  - 避免与动画系统冲突

- [ ] **UI 控制**
  - 开始/停止预览
  - 暂停/单步执行
  - 重置到初始状态
  - 调整时间步长

- [ ] **视觉反馈**
  - 更新 OBB 线框位置
  - 高亮碰撞接触点
  - 显示速度/力向量（可选）

### 5. 线框调试增强
**目标**：提供更详细的调试可视化

- [ ] **关节可视化改进**
  - 修复：显示所有子 Group 的关节标记（当前仅显示根 Group）
  - 显示旋转轴
  - 显示关节限制范围（角度锥）

- [ ] **OBB 可视化增强**
  - 区分静态/动态 OBB（不同颜色）
  - 显示 OBB 的主轴方向
  - 显示碰撞接触点和法线

- [ ] **性能监控**
  - 显示 FPS
  - 显示碰撞检测次数
  - 显示解算耗时

## 📋 未来增强（待定）

### 高级碰撞形状（优先级低）
- [ ] 胶囊体碰撞体（用于腿部、手臂）
- [ ] 球体碰撞体（用于头部、关节）
- [ ] 凸包碰撞体（复杂形状）

### 高级物理特性
- [ ] 铰链关节（hinge joint）
- [ ] 球窝关节（ball-socket joint）
- [ ] 弹簧关节（spring joint）
- [ ] 布娃娃系统（ragdoll）

### 导出功能
- [ ] 导出物理配置（JSON）
- [ ] 导入物理配置
- [ ] 烘焙动画（将物理结果烘焙为关键帧）

## 🔧 工程化改进

### 当前待办
- [ ] 增强错误处理和日志
  - WASM 加载失败的详细错误信息
  - API 版本不匹配警告
  - 无效输入验证
- [ ] 单元测试
  - OBB 计算测试
  - 碰撞检测测试
  - 坐标转换测试
- [ ] 性能基准测试
  - 不同数量 OBB 的性能对比
  - 内存使用分析

### 文档待补充
- [ ] 用户手册（如何使用插件）
- [ ] 示例模型（展示不同场景）
- [ ] API 文档（WASM 函数详细说明）
- [ ] 故障排除指南

## 📊 当前优先级

**P0（当前冲刺）**：
1. 修复关节可视化 bug（所有子 Group）
2. 实现 OBB 数据结构（Rust）
3. 实现 OBB-OBB 碰撞检测（SAT 算法）
4. Blockbench Cube → OBB 转换

**P1（下一冲刺）**：
1. 完整解算流程（初始化→步进→应用结果）
2. 实时预览 UI 控制
3. 坐标系映射和单位处理

**P2（后续）**：
1. 性能优化（空间分区、休眠）
2. 高级可视化（轴向、接触点）
3. 错误处理和测试

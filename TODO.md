# BBPhysic TODO

> 目标：Blockbench 插件（BBPhysic）为骨骼/组提供物理解算与碰撞。

## 已完成

- 顶部菜单 `BBPhysic`：设置 / 选择根 Group / 开始解算 / 预览（实时）/ 线框显示（占位 UI）
- WASM 自动加载：插件启动时从插件目录推导 `dist/bbphysic.wasm`，并使用 `fs.readFileSync` 加载

## 下一步（核心功能）

- **根 Group 选择与持久化**
  - 从 Outliner 选择 Group 作为“参与解算根”
  - 当根 Group 删除/改名/合并时的健壮性处理

- **数据提取（Blockbench → 物理世界）**
  - 从 Group/骨骼层级抽取刚体/关节拓扑
  - 从 cube/mesh 抽取碰撞体（AABB/OBB/凸包/盒体优先）
  - 约束：定义哪些节点可动、哪些固定，关节限制（角度、轴）

- **解算执行（WASM/Rapier）**
  - 设计 wasm 导出接口：initWorld / step / setTransforms / getTransforms / debugDraw
  - 解决单位系统：Blockbench 坐标、单位、缩放与 Rapier 的对应

- **预览（实时解算）**
  - 渲染循环挂钩：开始/停止预览，避免与 Blockbench 动画/关键帧冲突
  - UI 状态：预览开关、暂停、单步、重置

- **线框调试绘制**
  - 显示可动关节：轴向/限制范围
  - 显示碰撞 cube/形状：线框盒体/胶囊体等
  - 与视图刷新机制集成（性能与清理）

## 工程化

- 增加最小日志与错误码（WASM 加载、接口版本不匹配、无根节点等）
- 在 `blockbench-plugin/` 下补充开发说明（构建、调试、wasm 更新流程）

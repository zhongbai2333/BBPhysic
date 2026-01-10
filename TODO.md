# BBPhysic - TODO（Rapier-only / WASM / OBB-only）

> 目标：Blockbench 插件中提供“链式骨骼物理”
>
> - Preview：实时预览
> - Bake：写关键帧
> - 碰撞：仅使用 OBB（由 cube 几何驱动）
>
> 核心约束：物理求解 **全部交给 Rust/WASM + Rapier**；JS 只做 UI/采样/写回。

---

## 已完成（现状）

- [x] Preview / Bake 已迁移为 Rapier-only（Rust/WASM 解算）
- [x] 碰撞输入统一为 OBB（15 floats/box），来源为 movingRoot 下的 cubes
- [x] 修复 wasm memory.grow 导致的 detached ArrayBuffer（调用前/后刷新 TypedArray views）
- [x] 设置页不再堆一列：改为“类别选择 → 子对话框”

验收标准：

- 文档化以上决策（写入 README 或本文件“决策记录”段）。

---

## 近期要做（高优先级）

- [x] 文档化：补齐 doc.md（原理 + 通信数据布局）
- [ ] 清理遗留：确认仓库内不再包含球/胶囊相关逻辑与配置项（已移除大部分，继续巡检）
- [x] 统一命名：将遗留变量名（例如 movingCapsulesWorldPerFrame 实际存 boxes）改为 boxes，避免误导
- [ ] 体验验证：用一个包含 movingRoot cubes 的示例模型跑 Preview/Bake，确认 OBB 碰撞确实生效

---

## 可选增强（低优先级）

- [ ] 为骨骼碰撞体提供更贴合的 OBB（目前是 pivot cuboid；可考虑按父子段方向拉伸）
- [ ] 更多调参项（摩擦/弹性、CCD、solver iterations）
- [ ] 添加最小示例工程/截图

---

## 里程碑 3：解算器（JS 版本，PBD/Verlet 优先）【历史/已废弃】

- [ ] 实现最小可用解算：
  - [ ] Verlet 或半隐式欧拉
  - [ ] 约束投影（PBD）：距离/长度保持
  - [ ] 阻尼（全局或每约束）
- [ ] 实现碰撞：
  - [ ] 点 vs 球（投影到表面）
  - [ ] 点 vs 胶囊（点到线段距离投影）
- [ ] 调参策略：
  - [ ] 每帧迭代次数 N（默认 6–10）
  - [ ] dt 与时间轴帧率同步（或固定 dt）

说明：本项目已收敛为 Rapier-only（Rust/WASM），不再维护 JS solver 路线。

---

## 里程碑 4：写回 Blockbench（实时预览）【已实现/待验证】

- [ ] 读取当前动画/姿态：
  - [ ] 获取当前选中的 Animation / BoneAnimator（custom/animation）
  - [ ] 获取当前帧时间（custom/timeline.Timeline）
- [ ] 将解算结果写回预览：
  - [ ] 把“质点链”的姿态转换为骨骼旋转（优先只写 rotation）
  - [ ] 调用/触发预览刷新（custom/preview.animate 或相关刷新机制）

验收标准：

- 打开“预览物理”后，拖动时间轴或播放时，裙摆会随姿态实时更新。

---

## 里程碑 5：烘培（Bake）到关键帧（核心交付）【已实现/待验证】

- [ ] 烘培入口：
  - [ ] 选择时间区间（起止帧）
  - [ ] 选择采样步长（每帧/每 N 帧）
- [ ] 写关键帧：
  - [ ] 为每个受控骨骼通道创建/更新 keyframe（custom/keyframe._Keyframe / KeyframeDataPoint）
  - [ ] 批量写入时使用 undo 分组（custom/undo）避免污染历史
- [ ] 稳定性：
  - [ ] 重复烘培可覆盖旧的物理 keyframes（可选：写入专用 marker 或命名约定）

验收标准：

- 点击“烘培到关键帧”，生成可回放、可导出的动画；关闭插件后动画仍保留。

---

## 里程碑 6：性能与平台策略（可选增强）

- [ ] 性能基线：
  - [ ] 记录每帧解算耗时（ms）与可承受质点数量
- [ ] 若 JS 不足：Rust → WASM：
  - [ ] Rust 实现核心解算（约束 + 碰撞）
  - [ ] 编译到 wasm，JS 插件中加载并一次调用处理一帧/多帧
  - [ ] 数据布局优化：TypedArray 传参，减少 JS↔WASM 往返
- [ ] 不推荐路线（除非强需求）：Rust 后端子进程 + IPC（分发/权限/延迟复杂）

验收标准：

- 在目标模型规模下达到可用交互帧率；若启用 WASM，明显优于纯 JS。

---

## 里程碑 7：文档与示例

- [ ] 编写使用说明：
  - [ ] 如何搭建裙摆骨骼链
  - [ ] 如何配置碰撞体
  - [ ] 如何预览与烘培
- [ ] 提供最小示例工程/截图（如允许）

---

## 决策记录（持续更新）

- 物理：Rust/WASM + Rapier（唯一求解器）
- 碰撞：OBB-only（外部环境由 cubes→OBB；骨骼自身碰撞体也使用 cuboid）
- 数据传输：WASM 线性内存 + TypedArray views（见 doc.md）

---

## 关键 API 参考（来自 web.blockbench.net TypeDoc）

- Action / UI 入口：custom/action
- 动画与骨骼 animator：custom/animation
- 关键帧数据：custom/keyframe
- 时间轴：custom/timeline
- 预览刷新：custom/preview
- 插件加载：generated/plugin_loader
- 桌面专属能力（可选）：custom/desktop

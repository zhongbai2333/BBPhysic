# BBPhysic

Add physical solutions to Blockbench

## 开始使用（开发中）

当前仓库提供一个最小可加载的 Blockbench 插件脚本：`bbphysic.js`。

1) 打开 Blockbench（桌面版优先）
2) 打开插件管理（通常在 `File > Plugins`）并选择“从文件加载/Load Plugin from File”
3) 选择本仓库根目录的 `bbphysic.js`
4) 插件加载后：

   - 在“工具/Tools”菜单中应能看到入口
   - 或在 Action Control（动作搜索）里搜索 `BBPhysic`

说明：

- `BBPhysic: 设置`：设置采样 fps、作用轴，以及“跟随/惯性”解算参数（写入本机存储）
- `BBPhysic: Bake 到关键帧`：弹出 Bake 对话框（起止时间、fps、轴、是否覆盖已有关键帧），对选中骨骼链解算并写入旋转关键帧（带 Undo）
- `BBPhysic: 预览（开/关）`：实时预览解算效果（不写关键帧；停止后恢复动画姿态）

解算说明（当前版本）：
- 先对每节骨骼做“跟随/惯性”二阶响应
- 再对骨骼链做“父子耦合”，让子骨骼趋向“父骨骼 + 初始相对角”（可迭代多次）
- 可选：对“链末端点”施加球体碰撞约束（第一版），用于减少穿模

碰撞球心定位：
- 手动模式：直接填固定坐标（适合躯干/整体）
- 绑定模式：把球心绑定到一个骨骼/组（随姿态变化自动更新），更容易对齐腿/胯

使用流程：
1) 在动画面板选中目标动画
2) 在 Outliner 里选中裙摆骨骼链的“根骨骼”(Group)
3) 执行 `BBPhysic: Bake 到关键帧`，在对话框里确认起止时间/轴/覆盖策略后开始

设置补充：
- **解算范围**：
   - 仅选中的根骨骼：和之前一致，依赖 Outliner 的选择
   - 所有根骨骼（全模型）：自动对全模型所有根骨骼链进行解算（无需手动选择）
- **尝试使用 WASM（Rust）加速（实验）**：启用后会尝试加载 `bbphysic_wasm.wasm`，失败则自动回退纯 JS

## Rust/WASM 加速（实验）

仓库内提供了一个最小 Rust→WASM 原型（只加速 solver step：跟随 + 链耦合）。

1) 安装 Rust 工具链，并添加 wasm target：
- `rustup target add wasm32-unknown-unknown`

2) 编译 wasm：
- `cd rust/bbphysic_wasm`
- `cargo build --release --target wasm32-unknown-unknown`

3) 放置 wasm 文件到插件同目录：
- 将 `rust/bbphysic_wasm/target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm`
   复制到你“加载 bbphysic.js 的那个目录”（例如本仓库根目录），并命名为 `bbphysic_wasm.wasm`

说明：
- 如果你是“从文件加载”插件，并且指向的是本仓库根目录的 `bbphysic.js`，那么 `bbphysic_wasm.wasm` 也应放在本仓库根目录。
- 也支持放在 Blockbench 的 userData/plugins 目录作为后备路径。

4) 在 Blockbench 中开启：
- Tools → BBPhysic: 设置 → 勾选“尝试使用 WASM（Rust）加速（实验）”

当前阶段：Bake + 预览 都可用；碰撞仍是第一版（球体 + 仅调整单轴）。

## 开发（多文件源码 + 打包输出 bbphysic.js）

为了提高可维护性，源码已拆分到 `src/` 目录；Blockbench 实际加载的仍然是仓库根目录的 `bbphysic.js`（构建产物）。

- 安装依赖：`npm install`
- 构建输出：`npm run build`（生成/更新根目录 `bbphysic.js`）
- 监听构建：`npm run watch`

注意：请不要直接修改根目录的 `bbphysic.js`，它会在构建时被覆盖；请改 `src/` 下的源码。

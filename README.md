# BBPhysic

Add physical solutions to Blockbench

## 开始使用（开发中）

当前仓库提供一个最小可加载的 Blockbench 插件脚本：`bbphysic.js`。

1. 打开 Blockbench（桌面版优先）
1. 打开插件管理（通常在 `File > Plugins`）并选择“从文件加载/Load Plugin from File”
1. 选择本仓库根目录的 `bbphysic.js`
1. 插件加载后：

   - 在“工具/Tools”菜单中应能看到入口
   - 或在 Action Control（动作搜索）里搜索 `BBPhysic`

说明：

- `BBPhysic: 设置`：按类别配置（基础 / 物理（Rapier）/ 碰撞（OBB）/ 布料组 / 调试），写入本机存储
- `BBPhysic: Bake（预烘培）`：对时间区间逐帧解算并写入旋转关键帧（带 Undo）
- `BBPhysic: 预览（开/关）`：实时预览解算效果（不写关键帧）

解算说明（当前版本）：

- 物理求解全部由 **Rust/WASM + Rapier** 完成（JS 不再自研 solver）
- 碰撞仅使用 **OBB**：外部环境 OBB 来自 movingRoot 下的 cubes（几何驱动）

实现细节与通信数据布局见：`doc.md`

使用流程：

1. 在动画面板选中目标动画
1. 在 Outliner 里选中裙摆骨骼链的“根骨骼”(Group)
1. 执行 `BBPhysic: Bake 到关键帧`，在对话框里确认起止时间/轴/覆盖策略后开始

设置补充：

- **解算范围**：仅选中的根骨骼 / 所有根骨骼（全模型）

## Rust/WASM（必需）

仓库内提供 Rust→WASM 模块，负责 Rapier 解算。

1. 安装 Rust 工具链，并添加 wasm target：

   - `rustup target add wasm32-unknown-unknown`

1. 编译 wasm：

   - `cd rust/bbphysic_wasm`
   - `cargo build --release --target wasm32-unknown-unknown`

1. 放置 wasm 文件到插件同目录：

   - 将 `rust/bbphysic_wasm/target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm`
     复制到你“加载 bbphysic.js 的那个目录”（例如本仓库根目录），并命名为 `bbphysic_wasm.wasm`

说明：

- 如果你是“从文件加载”插件，并且指向的是本仓库根目录的 `bbphysic.js`，那么 `bbphysic_wasm.wasm` 也应放在本仓库根目录。
- 也支持放在 Blockbench 的 userData/plugins 目录作为后备路径。

当前阶段：Bake + 预览 都可用；碰撞为 OBB-only。

## 开发（多文件源码 + 打包输出 bbphysic.js）

为了提高可维护性，源码已拆分到 `src/` 目录；Blockbench 实际加载的仍然是仓库根目录的 `bbphysic.js`（构建产物）。

- 安装依赖：`npm install`
- 构建输出：`npm run build`（生成/更新根目录 `bbphysic.js`）
- 监听构建：`npm run watch`

注意：请不要直接修改根目录的 `bbphysic.js`，它会在构建时被覆盖；请改 `src/` 下的源码。

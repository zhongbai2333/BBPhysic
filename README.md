# BBPhysic

A Blockbench plugin that provides physics simulation and collision detection capabilities using the Rapier physics engine.

## Features

- 🎯 **Physics Simulation**: Real-time physics using Rapier3D compiled to WebAssembly
- 🔧 **Collision Detection**: OBB (Oriented Bounding Box) collision visualization
- 🎨 **Wireframe Visualization**: Debug rendering for joints and colliders
- ⚙️ **Comprehensive Settings**: Fine-tune physics parameters, collision layers, and display options
- 🌍 **i18n Support**: English and Chinese translations

## Quick Start

### For Users

1. Download the latest release from the [Releases](https://github.com/zhongbai2333/BBPhysic/releases) page
2. In Blockbench, go to **File → Plugins → Load Plugin from File**
3. Select the downloaded `bbphysic.js` file
4. Ensure `bbphysic.wasm` is in the same directory as the plugin

### For Developers

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development instructions.

多文件开发骨架（TypeScript + esbuild），最终输出单文件插件到 `dist/bbphysic.js`。

## Quick Build

### Build Plugin

```bash
cd blockbench-plugin
npm install
npm run build
```

This creates `blockbench-plugin/dist/bbphysic.js`.

### Build WASM Module

On Windows (PowerShell):

```powershell
.\scripts\build_wasm.ps1
```

On Linux/macOS:

```bash
# Build WASM
cargo build -p bbphysic-wasm --target wasm32-unknown-unknown --release

# Copy to plugin dist
mkdir -p blockbench-plugin/dist
cp target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm blockbench-plugin/dist/bbphysic.wasm
```

## Usage

After loading the plugin, you'll find a **BBPhysic** menu in the menu bar with:

- **Settings**: Configure physics parameters, collision settings, and visualization options
- **Select Solve Root Group**: Choose groups for physics simulation
- **Start Solve**: Begin physics calculation (currently in data preparation phase)
- **Preview (Realtime)**: Toggle real-time physics preview
- **Debug Wireframe**: Visualize joints and collision shapes

## Current Status

The plugin is currently in the **data preparation phase**:

- ✅ Plugin infrastructure complete
- ✅ WASM integration working
- ✅ UI dialogs implemented
- ✅ Wireframe visualization functional
- ⏳ Physics simulation integration (in progress)

See [TODO.md](TODO.md) for the complete roadmap.

## Development

```bash
cd blockbench-plugin
npm i
npm run build
```

## 构建 Rapier WASM

插件会在启动时尝试从“插件文件所在目录”加载 `bbphysic.wasm`（注意：不是进程工作目录）。

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_wasm.ps1
```

这会构建 `bbphysic-wasm` 并把产物复制到 `blockbench-plugin/dist/bbphysic.wasm`。

## 载入到 Blockbench

- 打开 Blockbench → Plugins 菜单 → 选择从文件加载（或把 `dist/bbphysic.js` 拖入 Blockbench）
- 确保同目录存在 `dist/bbphysic.wasm`（由上面的 WASM 构建脚本生成）
- 插件加载后，在 Tools 菜单会出现 `BBPhysic: Test Action`

## 目录

- `src/index.ts`: 入口
- `src/plugin/register.ts`: `Plugin.register` 元数据与生命周期
- `src/physics/*`: 物理/碰撞相关模块（后续扩展）
- `dist/bbphysic.js`: 构建产物（可直接加载）

## Contributing

Contributions are welcome! Please:

1. Check [TODO.md](TODO.md) for planned features
2. Follow the existing code style
3. Test in Blockbench before submitting
4. Read [DEVELOPMENT.md](DEVELOPMENT.md) for guidelines

For detailed development documentation, see [DEVELOPMENT.md](DEVELOPMENT.md).

# BBPhysic Blockbench Plugin

多文件开发骨架（TypeScript + esbuild），最终输出单文件插件到 `dist/bbphysic.js`。

## 开发

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

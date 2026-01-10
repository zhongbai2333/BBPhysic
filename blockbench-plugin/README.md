# BBPhysic Blockbench Plugin

多文件开发（TypeScript + esbuild），最终输出单文件插件到 `dist/bbphysic.js`。

## 开发

```bash
cd blockbench-plugin
npm i
npm run build
```

## 构建 Rapier WASM

插件会在启动时尝试从“插件文件所在目录”加载同目录的 `bbphysic.wasm`（通过插件路径反推，不依赖工作目录）。

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_wasm.ps1
```

产物会被复制到 `blockbench-plugin/dist/bbphysic.wasm`。

## 载入到 Blockbench

- 把 `dist/bbphysic.js` 加载/拖入 Blockbench
- 确保同目录存在 `dist/bbphysic.wasm`

## 目录

- `src/plugin/register.ts`: `Plugin.register` 元数据与生命周期
- `src/wasm/loader.ts`: wasm 载入（从插件路径推断 wasm 路径）
- `dist/bbphysic.js`: 插件产物
- `dist/bbphysic.wasm`: 物理核心产物

# bbphysic-wasm

Rapier 3D 物理核心（Rust）编译为 WebAssembly，供 Blockbench 插件侧加载。

## 构建

在仓库根目录：

```powershell
# 首次需要安装 target
rustup target add wasm32-unknown-unknown

# 构建并复制到 blockbench-plugin/dist/bbphysic.wasm
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_wasm.ps1
```

## 导出 ABI

当前导出（最小骨架）：

- `bbp_abi_version() -> u32`
- `bbp_world_create(gravity_y: f32) -> u32`
- `bbp_world_step(handle: u32, dt: f32)`
- `bbp_world_free(handle: u32)`

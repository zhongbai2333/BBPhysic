# BBPhysic（当前实现说明）

本项目当前实现遵循两条硬约束：

1) **物理解算全权交给 Rust/WASM + Rapier**（JS 不做自研 solver）。
2) **碰撞仅使用 OBB（Oriented Bounding Box）**：
   - 外部“环境碰撞体”来自 movingRoot 下的 cubes（几何驱动 OBB）。
   - 骨骼自身也只挂 **cuboid** 碰撞体（不使用 ball/capsule）。

---

## 运行流程（Preview / Bake）

### 1) Step1：选择运动物件（movingRoot）

- UI：`BBPhysic 第一次解算：选择运动物件`
- 作用：从 movingRoot 下的每个 bone group 的 **直接子 cube** 生成 `BoxDef[]`。
- JS 端在每帧会把这些 cube 变换成 **世界空间 OBB**，作为“环境碰撞体”喂给 Rapier。

### 2) Step2：选择被解算部件（targetRoot）

- UI：`BBPhysic 第二次解算：选择被解算物理部件`
- 作用：
  - 生成链式骨骼数据（chains），后续用于构建 parent/roots 数组。
  - 计算 pivot AABB（仅用于体积提示/辅助信息）。
  - 可选：将当前选中的多个 root 保存为“布料组”（tip ring）。

### 3) Preview：实时预览

- 文件：`src/preview.js`
- 每 tick 主要做三件事：
  1. 采样骨骼当前姿态（world pos/quaternion、local target euler 等）。
  2. 把 movingRoot 的 cubes 采样成 OBB 数组（15 floats / box）。
  3. 调用 `bbp_rapier_step(...)`，拿到 outWorldQuat/Pos 并写回骨骼预览。

### 4) Bake：写关键帧

- 文件：`src/bake.js`
- Bake 先按时间区间采样姿态与 OBB，再逐帧调用 `bbp_rapier_step`，最后把解算后的旋转写成关键帧。

---

## OBB 数据结构

OBB 由 cube 几何驱动生成，单个 box 的数据布局为 15 个 `f32`：

- `center`：3 floats（世界空间中心）
- `axes`：9 floats（3 个单位轴向量，每个 3 floats，世界空间）
- `half`：3 floats（半尺寸 hx/hy/hz）

顺序为：

1. center.xyz
2. axis0.xyz
3. axis1.xyz
4. axis2.xyz
5. half.xyz

对应实现：`src/capsules.js`（现仅保留 box 管线）。

---

## JS ↔ WASM 通信（线性内存布局）

WASM 导出：

- `bbp_alloc(len_bytes) -> *mut u8`
- `bbp_rapier_step(...) -> u32`

JS 端：`src/rapier_wasm_solver.js`

`RapierWasmSolver.ensureViews()` 会一次性 `bbp_alloc` 一大块内存，然后在同一块 `ArrayBuffer` 上建立 TypedArray 视图。

> 重要：WASM 里如果发生 `memory.grow`，旧的 `ArrayBuffer` 会 detach。为避免崩溃，`step()` **调用前后都会 ensureViews()**，确保调用者拿到的 views 永远绑定在最新 buffer 上。

### 视图与类型

设骨骼数量为 `n`，最多环境盒数量 `m`，最多布料连接数量 `k`。

- `parent: Int32Array[n]`：父索引（root 为 -1）
- `root: Uint8Array[n]`：1 表示 kinematic root（跟随 target world），0 表示 dynamic
- `worldPos: Float32Array[3n]`：输入，当前 world pivot
- `worldQuat: Float32Array[4n]`：输入，当前 world quat（xyzw）
- `linvel: Float32Array[3n]`：输入/输出
- `angvel: Float32Array[3n]`：输入/输出
- `targetLocal: Float32Array[3n]`：输入，目标 local euler（XYZ，弧度）
- `radius: Float32Array[n]`：输入，**pivot cuboid 的 half-extent**（目前用 `computeGroupApproxRadius` 推导）
- `targetWorldPos: Float32Array[3n]`：输入，仅 root 使用
- `targetWorldQuat: Float32Array[4n]`：输入，仅 root 使用
- `clothLinks: Float32Array[3k]`：输入，(aIndex, bIndex, restLength)
- `boxes: Float32Array[15m]`：输入，OBB 列表
- `outWorldPos: Float32Array[3n]`：输出
- `outWorldQuat: Float32Array[4n]`：输出

对应 Rust 端注释与实现：`rust/bbphysic_wasm/src/lib.rs`。

---

## Rust/Rapier 解算策略（概要）

`bbp_rapier_step` 内部每次调用会创建一个临时 Rapier world 并 step：

- 每个骨骼一个刚体
  - `root[i]==1`：kinematic_position_based（每步设置 next kinematic pose）
  - 否则：dynamic（读写 linvel/angvel）
- 父子之间用 joint 连接，锁平移，允许旋转，并用电机驱动到 `targetLocal`。
- 外部环境：从 OBB 输入创建 fixed body + `ColliderBuilder::cuboid`。
- 骨骼自身碰撞体：每 bone 一个 `ColliderBuilder::cuboid(r,r,r)`（OBB-only）。

---

## 构建说明（Windows）

- Rust/WASM：
  - 在 `rust/bbphysic_wasm`：`cargo build --release --target wasm32-unknown-unknown`
  - 把生成的 `target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm` 复制到仓库根目录 `bbphysic_wasm.wasm`
- JS bundle：
  - 仓库根目录：`npm run build` 生成 `bbphysic.js`

---

## 常见问题

### Q：为什么要频繁 ensureViews()？

A：WASM 可能触发 `memory.grow`，旧 `ArrayBuffer` 会 detach，继续对旧 TypedArray `.set()` 会直接抛错。现在的实现通过“step 前后刷新 views”规避。

### Q：现在还有 JS solver 吗？

A：没有。`tryInitWasm()` 也不再提供 `use_wasm` 开关，项目固定走 Rapier。

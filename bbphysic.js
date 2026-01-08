/* BBPhysic - Blockbench Plugin (WIP)
 * ⚠️ 此文件由构建脚本自动生成：请编辑 src/ 下的源文件
 */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/state.js
  var PLUGIN_ID, PLUGIN_VERSION, STORAGE_KEY, state;
  var init_state = __esm({
    "src/state.js"() {
      PLUGIN_ID = "bbphysic";
      PLUGIN_VERSION = "0.0.3";
      STORAGE_KEY = `${PLUGIN_ID}:config:v2`;
      state = {
        /** @type {{bake_fps: number, axis: 'x'|'y'|'z', solve_scope: 'selected'|'all_roots', use_wasm: boolean, follow_strength: number, follow_damping: number, tip_falloff: number, max_chain_depth: number, chain_coupling: number, chain_iterations: number, collision_enabled: boolean, collision_iterations: number, collision_strength: number, collision_sweep_substeps_max: number, debug_logging: boolean, debug_log_frames: number, show_moving_capsules: boolean, show_target_capsules: boolean, capsule_update_fps: number, solve_xyz: boolean, moving_root_uuid: string, target_root_uuid: string}} */
        config: {
          bake_fps: 30,
          axis: "x",
          solve_xyz: true,
          solve_scope: "selected",
          use_wasm: false,
          follow_strength: 80,
          follow_damping: 18,
          tip_falloff: 0.5,
          max_chain_depth: 32,
          chain_coupling: 0.6,
          chain_iterations: 4,
          collision_enabled: false,
          collision_iterations: 6,
          collision_strength: 1,
          collision_sweep_substeps_max: 6,
          debug_logging: false,
          debug_log_frames: 5,
          show_moving_capsules: false,
          show_target_capsules: false,
          capsule_update_fps: 10,
          moving_root_uuid: "",
          target_root_uuid: ""
        },
        /** @type {{settings?: any, step1_moving?: any, step2_target?: any, bake?: any, preview?: any, toggle_collider?: any}} */
        actions: {},
        /** @type {{instance?: WebAssembly.Instance, memory?: WebAssembly.Memory, exports?: any, ok?: boolean}|null} */
        wasm: null,
        wasmInitTried: false,
        // capsule ghost visuals
        capsuleTimer: null,
        capsuleLastUpdateMs: 0,
        movingCapsulesGroup: null,
        targetCapsulesGroup: null,
        previewTimer: null,
        previewState: null,
        /**
         * 三阶段解算运行时缓存：
         * - movingCapsules: 由“运动物件根组件”自动生成的胶囊段列表
         * - targetCapsules: 由“被解算物理部件根组件”自动生成的胶囊段列表（用于虚影/调试）
         * - targetAabb: 由“被解算物理部件根组件”计算的体积信息
         */
        solveSetup: {
          /** @type {any|null} */
          movingRoot: null,
          /** @type {Array<{a_uuid: string, b_uuid: string, radius: number}>} */
          movingCapsules: [],
          /** @type {any|null} */
          targetRoot: null,
          /** @type {Array<{a_uuid: string, b_uuid: string, radius: number}>} */
          targetCapsules: [],
          /** @type {{center: [number,number,number], size: [number,number,number], count: number}|null} */
          targetAabb: null
        },
        tmpThreeVec3: typeof THREE !== "undefined" && THREE ? new THREE.Vector3() : null
      };
    }
  });

  // src/util.js
  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n))
      return fallback;
    return Math.max(min, Math.min(max, n));
  }
  function notify(message, timeMs = 1500) {
    try {
      if (typeof Blockbench !== "undefined" && Blockbench && typeof Blockbench.showStatusMessage === "function") {
        Blockbench.showStatusMessage(String(message), timeMs);
        return;
      }
    } catch (e) {
    }
    console.log("[BBPhysic]", message);
  }
  function showMessage(title, message) {
    try {
      new MessageBox({
        title,
        message,
        buttons: ["OK"],
        confirm: 0
      }).show();
    } catch (e) {
      console.warn("[BBPhysic] MessageBox failed", e);
      if (typeof alert === "function")
        alert(String(message));
    }
  }
  function debugLog(...args) {
    if (!state.config.debug_logging)
      return;
    console.log("[BBPhysic][debug]", ...args);
  }
  function debugWarn(...args) {
    if (!state.config.debug_logging)
      return;
    console.warn("[BBPhysic][debug]", ...args);
  }
  function sleep0() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  var init_util = __esm({
    "src/util.js"() {
      init_state();
    }
  });

  // src/config_storage.js
  function loadConfigFromStorage() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    try {
      if (typeof localStorage === "undefined")
        return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw)
        return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object")
        return;
      const axis = String((_a = parsed.axis) != null ? _a : state.config.axis).trim().toLowerCase();
      const scopeRaw = String((_b = parsed.solve_scope) != null ? _b : state.config.solve_scope);
      const solve_scope = scopeRaw === "all_roots" ? "all_roots" : "selected";
      const solve_xyz = Boolean((_c = parsed.solve_xyz) != null ? _c : state.config.solve_xyz);
      state.config = {
        ...state.config,
        bake_fps: Math.round(clampNumber(parsed.bake_fps, 1, 120, state.config.bake_fps)),
        axis: axis === "x" || axis === "y" || axis === "z" ? axis : state.config.axis,
        solve_xyz,
        solve_scope,
        use_wasm: Boolean((_d = parsed.use_wasm) != null ? _d : state.config.use_wasm),
        follow_strength: clampNumber(parsed.follow_strength, 0, 500, state.config.follow_strength),
        follow_damping: clampNumber(parsed.follow_damping, 0, 200, state.config.follow_damping),
        tip_falloff: clampNumber(parsed.tip_falloff, 0, 1, state.config.tip_falloff),
        max_chain_depth: Math.round(clampNumber(parsed.max_chain_depth, 1, 128, state.config.max_chain_depth)),
        chain_coupling: clampNumber(parsed.chain_coupling, 0, 1, state.config.chain_coupling),
        chain_iterations: Math.round(clampNumber(parsed.chain_iterations, 0, 64, state.config.chain_iterations)),
        collision_enabled: Boolean((_e = parsed.collision_enabled) != null ? _e : state.config.collision_enabled),
        collision_iterations: Math.round(clampNumber(parsed.collision_iterations, 0, 64, state.config.collision_iterations)),
        collision_strength: clampNumber(parsed.collision_strength, 0, 5, state.config.collision_strength),
        collision_sweep_substeps_max: Math.round(clampNumber(parsed.collision_sweep_substeps_max, 1, 32, state.config.collision_sweep_substeps_max)),
        debug_logging: Boolean((_f = parsed.debug_logging) != null ? _f : state.config.debug_logging),
        debug_log_frames: Math.round(clampNumber(parsed.debug_log_frames, 0, 60, state.config.debug_log_frames)),
        show_moving_capsules: Boolean((_g = parsed.show_moving_capsules) != null ? _g : state.config.show_moving_capsules),
        show_target_capsules: Boolean((_h = parsed.show_target_capsules) != null ? _h : state.config.show_target_capsules),
        capsule_update_fps: Math.round(clampNumber(parsed.capsule_update_fps, 1, 60, state.config.capsule_update_fps)),
        moving_root_uuid: String((_j = (_i = parsed.moving_root_uuid) != null ? _i : state.config.moving_root_uuid) != null ? _j : ""),
        target_root_uuid: String((_l = (_k = parsed.target_root_uuid) != null ? _k : state.config.target_root_uuid) != null ? _l : "")
      };
    } catch (e) {
      console.warn("[BBPhysic] Failed to load config", e);
    }
  }
  function saveConfigToStorage() {
    try {
      if (typeof localStorage === "undefined")
        return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bake_fps: state.config.bake_fps,
          axis: state.config.axis,
          solve_xyz: state.config.solve_xyz,
          solve_scope: state.config.solve_scope,
          use_wasm: state.config.use_wasm,
          follow_strength: state.config.follow_strength,
          follow_damping: state.config.follow_damping,
          tip_falloff: state.config.tip_falloff,
          max_chain_depth: state.config.max_chain_depth,
          chain_coupling: state.config.chain_coupling,
          chain_iterations: state.config.chain_iterations,
          collision_enabled: state.config.collision_enabled,
          collision_iterations: state.config.collision_iterations,
          collision_strength: state.config.collision_strength,
          collision_sweep_substeps_max: state.config.collision_sweep_substeps_max,
          debug_logging: state.config.debug_logging,
          debug_log_frames: state.config.debug_log_frames,
          show_moving_capsules: state.config.show_moving_capsules,
          show_target_capsules: state.config.show_target_capsules,
          capsule_update_fps: state.config.capsule_update_fps,
          moving_root_uuid: state.config.moving_root_uuid,
          target_root_uuid: state.config.target_root_uuid
        })
      );
    } catch (e) {
      console.warn("[BBPhysic] Failed to save config", e);
    }
  }
  var init_config_storage = __esm({
    "src/config_storage.js"() {
      init_state();
      init_util();
    }
  });

  // src/math.js
  function v3(x = 0, y = 0, z = 0) {
    return [x, y, z];
  }
  function v3add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  function v3sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function v3len(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  }
  function v3scale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
  }
  function v3normalize(a) {
    const l = v3len(a);
    if (l > 1e-8)
      return [a[0] / l, a[1] / l, a[2] / l];
    return [0, 0, 0];
  }
  function v3dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function degToRad(d) {
    return d * Math.PI / 180;
  }
  function radToDeg(r) {
    return r * 180 / Math.PI;
  }
  function m3mul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
      a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
      a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
      a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
      a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
      a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
      a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  }
  function m3mulV3(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
  }
  function m3rotX(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }
  function m3rotY(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }
  function m3rotZ(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }
  function m3fromEulerXYZDeg(rotDeg) {
    const rx = degToRad(rotDeg[0] || 0);
    const ry = degToRad(rotDeg[1] || 0);
    const rz = degToRad(rotDeg[2] || 0);
    return m3mul(m3mul(m3rotX(rx), m3rotY(ry)), m3rotZ(rz));
  }
  var init_math = __esm({
    "src/math.js"() {
    }
  });

  // src/blockbench_api.js
  function getSelectedAnimation() {
    try {
      if (typeof Animator !== "undefined" && Animator && Animator.selected)
        return Animator.selected;
      if (typeof AnimationItem !== "undefined" && AnimationItem && AnimationItem.selected)
        return AnimationItem.selected;
    } catch (e) {
    }
    return null;
  }
  function isOutlinerGroup(obj) {
    var _a;
    return !!obj && (obj.type === "group" || ((_a = obj.constructor) == null ? void 0 : _a.name) === "Group");
  }
  function isBoneGroup(obj) {
    return isOutlinerGroup(obj) && !!obj.mesh;
  }
  function getSelectedRootGroups() {
    try {
      if (typeof Group !== "undefined" && Group) {
        if (Array.isArray(Group.multi_selected) && Group.multi_selected.length) {
          return Group.multi_selected.filter(isBoneGroup);
        }
        if (Group.selected && isBoneGroup(Group.selected))
          return [Group.selected];
      }
    } catch (e) {
    }
    return [];
  }
  function getAllRootGroups() {
    try {
      if (typeof Group !== "undefined" && Group && Array.isArray(Group.all)) {
        return Group.all.filter(isBoneGroup).filter((g) => {
          const p = g.parent;
          return !p || p === "root" || !isBoneGroup(p);
        });
      }
    } catch (e) {
    }
    return [];
  }
  function getSolveRootGroups() {
    if (state.config.solve_scope === "all_roots")
      return getAllRootGroups();
    return getSelectedRootGroups();
  }
  function readGroupOrigin(group) {
    const o = group == null ? void 0 : group.origin;
    if (Array.isArray(o) && o.length >= 3)
      return [Number(o[0]) || 0, Number(o[1]) || 0, Number(o[2]) || 0];
    if (typeof o === "object" && o)
      return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0];
    return [0, 0, 0];
  }
  function readGroupRotationDeg(group) {
    const r = group == null ? void 0 : group.rotation;
    if (Array.isArray(r) && r.length >= 3)
      return [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0];
    if (typeof r === "object" && r)
      return [Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0];
    try {
      const mesh = group == null ? void 0 : group.mesh;
      const mr = mesh == null ? void 0 : mesh.rotation;
      if (mr && typeof mr.x === "number" && typeof mr.y === "number" && typeof mr.z === "number") {
        return [radToDeg(mr.x), radToDeg(mr.y), radToDeg(mr.z)];
      }
    } catch (e) {
    }
    return [0, 0, 0];
  }
  function writeGroupRotationDeg(group, rotDeg) {
    if (!group)
      return;
    const x = Number(rotDeg == null ? void 0 : rotDeg[0]) || 0;
    const y = Number(rotDeg == null ? void 0 : rotDeg[1]) || 0;
    const z = Number(rotDeg == null ? void 0 : rotDeg[2]) || 0;
    try {
      const r = group.rotation;
      if (Array.isArray(r) && r.length >= 3) {
        r[0] = x;
        r[1] = y;
        r[2] = z;
      } else if (typeof r === "object" && r) {
        r.x = x;
        r.y = y;
        r.z = z;
      }
    } catch (e) {
    }
    try {
      const mesh = group.mesh;
      if (mesh && mesh.rotation) {
        mesh.rotation.set(degToRad(x), degToRad(y), degToRad(z));
      }
    } catch (e) {
    }
    try {
      if (typeof Canvas !== "undefined" && Canvas && typeof Canvas.updateView === "function") {
        Canvas.updateView({});
      }
    } catch (e) {
    }
  }
  function computeGroupPivotWorldCurrentPose(group) {
    var _a;
    if (!group)
      return [0, 0, 0];
    try {
      const mesh = group.mesh;
      if (mesh && state.tmpThreeVec3 && typeof mesh.getWorldPosition === "function") {
        mesh.getWorldPosition(state.tmpThreeVec3);
        return [state.tmpThreeVec3.x, state.tmpThreeVec3.y, state.tmpThreeVec3.z];
      }
    } catch (e) {
    }
    const chain = [];
    let cur = group;
    while (cur && cur !== "root") {
      if (cur.type === "group" || ((_a = cur.constructor) == null ? void 0 : _a.name) === "Group")
        chain.push(cur);
      const p = cur.parent;
      if (!p || p === "root")
        break;
      cur = p;
    }
    chain.reverse();
    if (!chain.length)
      return [0, 0, 0];
    const origins = chain.map(readGroupOrigin);
    const rots = chain.map(readGroupRotationDeg);
    let worldPos = origins[0];
    let worldRot = m3fromEulerXYZDeg(rots[0]);
    for (let i = 1; i < chain.length; i++) {
      const restOffset = v3sub(origins[i], origins[i - 1]);
      worldPos = v3add(worldPos, m3mulV3(worldRot, restOffset));
      worldRot = m3mul(worldRot, m3fromEulerXYZDeg(rots[i]));
    }
    return worldPos;
  }
  function pickRotationChannel(animator) {
    const channels = animator == null ? void 0 : animator.channels;
    if (channels && typeof channels === "object") {
      if (channels.rotation)
        return "rotation";
      if (channels.rotations)
        return "rotations";
    }
    return "rotation";
  }
  function addRotationKeyframe(boneAnimator, timeSec, rotDeg) {
    const channel = pickRotationChannel(boneAnimator);
    try {
      return boneAnimator.addKeyframe({
        channel,
        time: timeSec,
        data_points: [{ x: rotDeg[0], y: rotDeg[1], z: rotDeg[2] }]
      });
    } catch (e1) {
      return boneAnimator.addKeyframe({
        channel,
        time: timeSec,
        data_points: [[rotDeg[0], rotDeg[1], rotDeg[2]]]
      });
    }
  }
  var init_blockbench_api = __esm({
    "src/blockbench_api.js"() {
      init_state();
      init_math();
    }
  });

  // src/wasm.js
  function getBlockbenchUserDataPath() {
    try {
      if (typeof electron !== "undefined" && electron && electron.app && typeof electron.app.getPath === "function") {
        return electron.app.getPath("userData");
      }
    } catch (e) {
    }
    try {
      if (typeof electron !== "undefined" && electron && electron.remote && electron.remote.app && typeof electron.remote.app.getPath === "function") {
        return electron.remote.app.getPath("userData");
      }
    } catch (e) {
    }
    return null;
  }
  function joinPathSafe(...parts) {
    try {
      if (typeof PathModule !== "undefined" && PathModule && typeof PathModule.join === "function") {
        return PathModule.join(...parts);
      }
    } catch (e) {
    }
    return parts.filter(Boolean).join("/");
  }
  function readBinaryFileAsArrayBuffer(filePath) {
    try {
      if (typeof filePath !== "string" || !filePath)
        return null;
      if (typeof fs !== "undefined" && fs && typeof fs.readFileSync === "function") {
        const buf = fs.readFileSync(filePath);
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      }
    } catch (e) {
    }
    return null;
  }
  function readBinaryFileAsArrayBufferBB(filePath) {
    return new Promise((resolve) => {
      try {
        if (typeof filePath !== "string" || !filePath)
          return resolve(null);
        if (typeof Blockbench === "undefined" || !Blockbench || typeof Blockbench.readFile !== "function")
          return resolve(null);
        Blockbench.readFile([filePath], { readtype: "buffer", errorbox: false }, (files) => {
          try {
            const f0 = Array.isArray(files) ? files[0] : null;
            if (f0 && f0.content instanceof ArrayBuffer)
              return resolve(f0.content);
          } catch (e) {
          }
          resolve(null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }
  function isAbsolutePath(p) {
    if (typeof p !== "string")
      return false;
    if (/^[A-Za-z]:\\/.test(p))
      return true;
    if (p.startsWith("\\\\"))
      return true;
    if (p.startsWith("/"))
      return true;
    return false;
  }
  function getThisPluginDir() {
    try {
      if (typeof Plugins !== "undefined" && Plugins && Array.isArray(Plugins.installed)) {
        const row = Plugins.installed.find((x) => x && x.id === PLUGIN_ID);
        const p = row == null ? void 0 : row.path;
        if (p && typeof p === "string") {
          try {
            if (typeof PathModule !== "undefined" && PathModule && typeof PathModule.dirname === "function") {
              return PathModule.dirname(p);
            }
          } catch (e) {
          }
          return p.replace(/\\[^\\]+$/, "");
        }
      }
    } catch (e) {
    }
    try {
      if (typeof __dirname !== "undefined" && __dirname)
        return String(__dirname);
    } catch (e) {
    }
    return null;
  }
  async function tryInitWasm() {
    if (state.wasmInitTried)
      return state.wasm;
    state.wasmInitTried = true;
    state.wasm = { ok: false };
    if (!state.config.use_wasm)
      return state.wasm;
    if (typeof WebAssembly === "undefined")
      return state.wasm;
    try {
      const candidates = [];
      const pluginDir = getThisPluginDir();
      if (pluginDir)
        candidates.push(joinPathSafe(pluginDir, "bbphysic_wasm.wasm"));
      const userData = getBlockbenchUserDataPath();
      if (userData)
        candidates.push(joinPathSafe(userData, "plugins", "bbphysic_wasm.wasm"));
      candidates.push("./bbphysic_wasm.wasm");
      let bytes = null;
      let loadedFrom = null;
      for (const c of candidates) {
        if (!c)
          continue;
        if (isAbsolutePath(c)) {
          bytes = readBinaryFileAsArrayBuffer(c);
          if (!bytes)
            bytes = await readBinaryFileAsArrayBufferBB(c);
        }
        if (!bytes && typeof c === "string" && c.startsWith("./")) {
          try {
            const resp = await fetch(c);
            if (resp.ok)
              bytes = await resp.arrayBuffer();
          } catch (e) {
          }
        }
        if (bytes) {
          loadedFrom = c;
          break;
        }
      }
      if (!bytes) {
        debugWarn("wasm: 未找到 bbphysic_wasm.wasm（请放到 Blockbench userData/plugins 目录）", { userData });
        return state.wasm;
      }
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const exports = instance.exports;
      const memory = exports.memory;
      if (!exports || !memory || typeof exports.bbp_solve_step !== "function") {
        return state.wasm;
      }
      state.wasm = { instance, exports, memory, ok: true };
      debugLog("wasm", "WASM solver loaded", { from: loadedFrom });
    } catch (e) {
      debugWarn("wasm init failed", e);
    }
    return state.wasm;
  }
  var init_wasm = __esm({
    "src/wasm.js"() {
      init_state();
      init_util();
    }
  });

  // src/capsules.js
  function isCubeLike(node) {
    var _a;
    if (!node)
      return false;
    if (node.type === "cube" || ((_a = node.constructor) == null ? void 0 : _a.name) === "Cube")
      return true;
    const f = node.from;
    const t = node.to;
    return Array.isArray(f) && f.length >= 3 && Array.isArray(t) && t.length >= 3;
  }
  function collectGroupsDepthFirst(root) {
    const out = [];
    const stack = [];
    if (root)
      stack.push(root);
    while (stack.length) {
      const cur = stack.pop();
      if (!cur)
        continue;
      if (isOutlinerGroup(cur))
        out.push(cur);
      const children = cur.children;
      if (Array.isArray(children)) {
        for (let i = children.length - 1; i >= 0; i--)
          stack.push(children[i]);
      }
    }
    return out;
  }
  function collectCubesUnderGroup(group) {
    const cubes = [];
    if (!group)
      return cubes;
    const children = group.children;
    if (!Array.isArray(children))
      return cubes;
    for (const ch of children) {
      if (isCubeLike(ch))
        cubes.push(ch);
    }
    return cubes;
  }
  function readVec3Any(v) {
    if (Array.isArray(v) && v.length >= 3)
      return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
    if (v && typeof v === "object")
      return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
    return null;
  }
  function applyCubeRotationToPoint(p, cubeRotDeg, cubePivot) {
    if (!cubeRotDeg)
      return p;
    const m = m3fromEulerXYZDeg(cubeRotDeg);
    const rel = v3sub(p, cubePivot);
    const rr = m3mulV3(m, rel);
    return [cubePivot[0] + rr[0], cubePivot[1] + rr[1], cubePivot[2] + rr[2]];
  }
  function computeOrientedCubeCapsuleOffsetsLocal(group, cube) {
    if (!group || !cube)
      return null;
    const f = cube.from;
    const t = cube.to;
    if (!Array.isArray(f) || !Array.isArray(t))
      return null;
    const fx = Number(f[0]) || 0, fy = Number(f[1]) || 0, fz = Number(f[2]) || 0;
    const tx = Number(t[0]) || 0, ty = Number(t[1]) || 0, tz = Number(t[2]) || 0;
    const dx = Math.abs(tx - fx);
    const dy = Math.abs(ty - fy);
    const dz = Math.abs(tz - fz);
    let axis = [1, 0, 0];
    let halfLen = 0.5 * dx;
    let radius = 0.5 * Math.max(0.1, Math.min(dy, dz));
    if (dy >= dx && dy >= dz) {
      axis = [0, 1, 0];
      halfLen = 0.5 * dy;
      radius = 0.5 * Math.max(0.1, Math.min(dx, dz));
    } else if (dz >= dx && dz >= dy) {
      axis = [0, 0, 1];
      halfLen = 0.5 * dz;
      radius = 0.5 * Math.max(0.1, Math.min(dx, dy));
    }
    if (!(halfLen > 1e-4))
      halfLen = 0.5;
    if (!(radius > 1e-4))
      radius = 0.1;
    const center = [(fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5];
    const pivot = readVec3Any(cube.origin) || center;
    const cubeRotDeg = readVec3Any(cube.rotation);
    const a0 = v3sub(v3add(center, v3scale(axis, -halfLen)), [0, 0, 0]);
    const b0 = v3sub(v3add(center, v3scale(axis, +halfLen)), [0, 0, 0]);
    const aRot = applyCubeRotationToPoint(a0, cubeRotDeg, pivot);
    const bRot = applyCubeRotationToPoint(b0, cubeRotDeg, pivot);
    const go = readGroupOrigin(group);
    const start = (
      /** @type {[number,number,number]} */
      [aRot[0] - go[0], aRot[1] - go[1], aRot[2] - go[2]]
    );
    const end = (
      /** @type {[number,number,number]} */
      [bRot[0] - go[0], bRot[1] - go[1], bRot[2] - go[2]]
    );
    return { start, end, radius: Math.max(0.1, Math.min(64, radius)) };
  }
  function computeGroupApproxRadius(group) {
    if (!group)
      return 0;
    try {
      const cubes = collectCubesUnderGroup(group);
      let r = 0;
      for (const cube of cubes) {
        const seg = computeOrientedCubeCapsuleOffsetsLocal(group, cube);
        if (seg && seg.radius > r)
          r = seg.radius;
      }
      if (r > 1e-6)
        return r;
    } catch (e) {
    }
    return 0.5;
  }
  function buildCapsuleDefsFromRoot(rootGroup) {
    const capsules = [];
    if (!rootGroup || !isOutlinerGroup(rootGroup))
      return capsules;
    const groups = collectGroupsDepthFirst(rootGroup);
    for (const g of groups) {
      if (!isBoneGroup(g) || !(g == null ? void 0 : g.uuid))
        continue;
      const cubes = collectCubesUnderGroup(g);
      for (const cube of cubes) {
        const cuuid = String((cube == null ? void 0 : cube.uuid) || "");
        if (!cuuid)
          continue;
        const seg = computeOrientedCubeCapsuleOffsetsLocal(g, cube);
        if (!seg)
          continue;
        capsules.push({
          a_uuid: String(g.uuid),
          b_uuid: String(g.uuid),
          radius: seg.radius,
          start_offset_local: seg.start,
          end_offset_local: seg.end,
          cube_uuid: cuuid,
          dynamic_from_cube: true
        });
      }
    }
    if (capsules.length === 0) {
      for (const parent of groups) {
        if (!isBoneGroup(parent) || !(parent == null ? void 0 : parent.uuid))
          continue;
        const children = (parent.children || []).filter(isOutlinerGroup);
        for (const ch of children) {
          if (!(ch == null ? void 0 : ch.uuid))
            continue;
          capsules.push({
            a_uuid: String(parent.uuid),
            b_uuid: String(ch.uuid),
            radius: Math.max(0.1, computeGroupApproxRadius(parent))
          });
        }
      }
    }
    return capsules;
  }
  function getNodeByUUID(uuid) {
    try {
      if (typeof OutlinerNode !== "undefined" && (OutlinerNode == null ? void 0 : OutlinerNode.uuids)) {
        return OutlinerNode.uuids[String(uuid)];
      }
    } catch (e) {
    }
    return null;
  }
  function computeCapsulesWorldNow(capsuleDefs) {
    const out = [];
    if (!Array.isArray(capsuleDefs) || capsuleDefs.length === 0)
      return out;
    for (const c of capsuleDefs) {
      const aNode = getNodeByUUID(c.a_uuid);
      if (!isOutlinerGroup(aNode))
        continue;
      const aPos = (
        /** @type {[number, number, number]} */
        computeGroupPivotWorldCurrentPose(aNode)
      );
      let bPos = [0, 0, 0];
      const hasOffsets = Array.isArray(c.start_offset_local) && c.start_offset_local.length >= 3 && Array.isArray(c.end_offset_local) && c.end_offset_local.length >= 3;
      if (hasOffsets || c.dynamic_from_cube) {
        try {
          if (!aNode.mesh || typeof THREE === "undefined")
            continue;
          const q = aNode.mesh.getWorldQuaternion(new THREE.Quaternion());
          let localA = (
            /** @type {[number,number,number]} */
            c.start_offset_local
          );
          let localB = (
            /** @type {[number,number,number]} */
            c.end_offset_local
          );
          let radius = Math.max(0.1, Number(c.radius) || 0);
          if (c.dynamic_from_cube && c.cube_uuid) {
            const cubeNode = getNodeByUUID(c.cube_uuid);
            if (!isCubeLike(cubeNode))
              continue;
            const seg = computeOrientedCubeCapsuleOffsetsLocal(aNode, cubeNode);
            if (!seg)
              continue;
            localA = seg.start;
            localB = seg.end;
            radius = seg.radius;
          }
          if (!Array.isArray(localA) || !Array.isArray(localB))
            continue;
          const va = new THREE.Vector3(localA[0], localA[1], localA[2]).applyQuaternion(q);
          const vb = new THREE.Vector3(localB[0], localB[1], localB[2]).applyQuaternion(q);
          const aw = (
            /** @type {[number,number,number]} */
            [aPos[0] + va.x, aPos[1] + va.y, aPos[2] + va.z]
          );
          bPos = /** @type {[number,number,number]} */
          [aPos[0] + vb.x, aPos[1] + vb.y, aPos[2] + vb.z];
          out.push({ a: aw, b: bPos, radius });
          continue;
        } catch (e) {
          continue;
        }
      } else {
        const bNode = getNodeByUUID(c.b_uuid);
        if (!isOutlinerGroup(bNode))
          continue;
        bPos = /** @type {[number, number, number]} */
        computeGroupPivotWorldCurrentPose(bNode);
      }
      out.push({ a: aPos, b: bPos, radius: Math.max(0.1, Number(c.radius) || 0) });
    }
    return out;
  }
  function computePivotAabbWorld(rootGroup) {
    const groups = collectGroupsDepthFirst(rootGroup);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let count = 0;
    for (const g of groups) {
      try {
        const p = computeGroupPivotWorldCurrentPose(g);
        const x = Number(p[0]) || 0;
        const y = Number(p[1]) || 0;
        const z = Number(p[2]) || 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
        count++;
      } catch (e) {
      }
    }
    if (count === 0) {
      return { center: (
        /** @type {[number,number,number]} */
        [0, 0, 0]
      ), size: (
        /** @type {[number,number,number]} */
        [0, 0, 0]
      ), count: 0 };
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    return {
      center: (
        /** @type {[number,number,number]} */
        [cx, cy, cz]
      ),
      size: (
        /** @type {[number,number,number]} */
        [maxX - minX, maxY - minY, maxZ - minZ]
      ),
      count
    };
  }
  var init_capsules = __esm({
    "src/capsules.js"() {
      init_blockbench_api();
      init_math();
    }
  });

  // src/collider_visual.js
  function getSceneForCollider() {
    try {
      if (typeof Canvas !== "undefined" && Canvas && Canvas.scene)
        return Canvas.scene;
    } catch (e) {
    }
    try {
      if (typeof scene !== "undefined" && scene)
        return scene;
    } catch (e) {
    }
    return null;
  }
  function requestCanvasUpdate() {
    try {
      if (typeof Canvas !== "undefined" && Canvas && typeof Canvas.updateView === "function") {
        Canvas.updateView({});
      }
    } catch (e) {
    }
  }
  function anyCapsuleGhostEnabled() {
    return Boolean(state.config.show_moving_capsules || state.config.show_target_capsules);
  }
  function ensureCapsuleGroups() {
    if (typeof THREE === "undefined" || !THREE)
      return null;
    const scn = getSceneForCollider();
    if (!scn)
      return null;
    if (!state.movingCapsulesGroup) {
      const g = new THREE.Group();
      g.name = "BBPhysic_MovingCapsules";
      g.visible = false;
      g.renderOrder = 999;
      scn.add(g);
      state.movingCapsulesGroup = g;
    }
    if (!state.targetCapsulesGroup) {
      const g = new THREE.Group();
      g.name = "BBPhysic_TargetCapsules";
      g.visible = false;
      g.renderOrder = 999;
      scn.add(g);
      state.targetCapsulesGroup = g;
    }
    return { moving: state.movingCapsulesGroup, target: state.targetCapsulesGroup };
  }
  function getGroupByUUID(uuid) {
    try {
      if (typeof OutlinerNode !== "undefined" && (OutlinerNode == null ? void 0 : OutlinerNode.uuids)) {
        const node = OutlinerNode.uuids[String(uuid)];
        if (isOutlinerGroup(node))
          return node;
      }
    } catch (e) {
    }
    return null;
  }
  function clearGroup(group) {
    if (!group)
      return;
    try {
      for (const ch of group.children.slice())
        group.remove(ch);
    } catch (e) {
    }
    group.userData = {};
  }
  function buildCapsuleSegmentObjects(opacity) {
    const lineGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    lineGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeom.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const lineMat = new THREE.LineBasicMaterial({ color: 16777215, transparent: true, opacity, depthTest: false });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 999;
    const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 16777215,
      wireframe: true,
      transparent: true,
      opacity,
      depthTest: false
    });
    const cyl = new THREE.Mesh(cylGeom, cylMat);
    cyl.renderOrder = 999;
    const sphereGeom = new THREE.SphereGeometry(1, 10, 8);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 16777215,
      wireframe: true,
      transparent: true,
      opacity,
      depthTest: false
    });
    const a = new THREE.Mesh(sphereGeom, sphereMat);
    const b = new THREE.Mesh(sphereGeom, sphereMat);
    a.renderOrder = 999;
    b.renderOrder = 999;
    return { line, cyl, a, b };
  }
  function ensureGroupSegments(group, count, opacity) {
    var _a;
    if (!group)
      return;
    const existing = Array.isArray((_a = group.userData) == null ? void 0 : _a.segments) ? group.userData.segments : [];
    if (existing.length === count)
      return;
    clearGroup(group);
    const segments = [];
    for (let i = 0; i < count; i++) {
      const seg = buildCapsuleSegmentObjects(opacity);
      group.add(seg.line);
      group.add(seg.cyl);
      group.add(seg.a);
      group.add(seg.b);
      segments.push(seg);
    }
    group.userData.segments = segments;
  }
  function updateSegmentsFromCapsulesWorld(group, capsulesWorld, opacity) {
    if (!group)
      return;
    ensureGroupSegments(group, capsulesWorld.length, opacity);
    const segments = group.userData.segments;
    for (let i = 0; i < capsulesWorld.length; i++) {
      const c = capsulesWorld[i];
      const seg = segments[i];
      const r = Math.max(0, Number(c.radius) || 0);
      const ax = c.a[0], ay = c.a[1], az = c.a[2];
      const bx = c.b[0], by = c.b[1], bz = c.b[2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;
      seg.a.position.set(c.a[0], c.a[1], c.a[2]);
      seg.b.position.set(c.b[0], c.b[1], c.b[2]);
      seg.a.scale.set(r, r, r);
      seg.b.scale.set(r, r, r);
      if (len > 1e-3 && r > 1e-6) {
        seg.cyl.visible = true;
        seg.cyl.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
        seg.cyl.scale.set(r, len, r);
        const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        seg.cyl.quaternion.copy(q);
      } else {
        seg.cyl.visible = false;
      }
      const attr = seg.line.geometry.attributes.position;
      attr.setXYZ(0, ax, ay, az);
      attr.setXYZ(1, bx, by, bz);
      attr.needsUpdate = true;
    }
  }
  function stopCapsuleUpdates() {
    if (state.capsuleTimer) {
      clearInterval(state.capsuleTimer);
      state.capsuleTimer = null;
    }
  }
  function updateCapsuleVisuals(force = false) {
    if (!anyCapsuleGhostEnabled())
      return;
    const groups = ensureCapsuleGroups();
    if (!groups)
      return;
    const now = Date.now();
    const minDt = Math.round(1e3 / Math.max(1, Math.min(60, Math.round(state.config.capsule_update_fps || 10))));
    if (!force && now - state.capsuleLastUpdateMs < minDt)
      return;
    state.capsuleLastUpdateMs = now;
    try {
      if ((!state.solveSetup.movingCapsules || state.solveSetup.movingCapsules.length === 0) && state.config.moving_root_uuid) {
        const root = getGroupByUUID(state.config.moving_root_uuid);
        if (root)
          state.solveSetup.movingCapsules = buildCapsuleDefsFromRoot(root);
      }
      if ((!state.solveSetup.targetCapsules || state.solveSetup.targetCapsules.length === 0) && state.config.target_root_uuid) {
        const root = getGroupByUUID(state.config.target_root_uuid);
        if (root)
          state.solveSetup.targetCapsules = buildCapsuleDefsFromRoot(root);
      }
    } catch (e) {
    }
    const movingVisible = Boolean(state.config.show_moving_capsules) && Array.isArray(state.solveSetup.movingCapsules) && state.solveSetup.movingCapsules.length > 0;
    const targetVisible = Boolean(state.config.show_target_capsules) && Array.isArray(state.solveSetup.targetCapsules) && state.solveSetup.targetCapsules.length > 0;
    groups.moving.visible = movingVisible;
    groups.target.visible = targetVisible;
    if (movingVisible) {
      const movingWorld = computeCapsulesWorldNow(state.solveSetup.movingCapsules);
      updateSegmentsFromCapsulesWorld(groups.moving, movingWorld, 0.35);
    }
    if (targetVisible) {
      const targetWorld = computeCapsulesWorldNow(state.solveSetup.targetCapsules);
      updateSegmentsFromCapsulesWorld(groups.target, targetWorld, 0.18);
    }
    requestCanvasUpdate();
  }
  function startCapsuleUpdates() {
    stopCapsuleUpdates();
    if (!anyCapsuleGhostEnabled())
      return;
    ensureCapsuleGroups();
    updateCapsuleVisuals(true);
    const fps = Math.max(1, Math.min(60, Math.round(state.config.capsule_update_fps || 10)));
    state.capsuleTimer = setInterval(() => {
      try {
        updateCapsuleVisuals(false);
      } catch (e) {
      }
    }, Math.round(1e3 / fps));
  }
  function applyCapsuleVisualSettings() {
    const groups = ensureCapsuleGroups();
    if (!groups)
      return;
    if (!anyCapsuleGhostEnabled()) {
      groups.moving.visible = false;
      groups.target.visible = false;
      stopCapsuleUpdates();
      requestCanvasUpdate();
      return;
    }
    startCapsuleUpdates();
  }
  var init_collider_visual = __esm({
    "src/collider_visual.js"() {
      init_state();
      init_blockbench_api();
      init_capsules();
    }
  });

  // src/chains_and_collision.js
  function isCubeLike2(node) {
    var _a;
    if (!node)
      return false;
    if (node.type === "cube" || ((_a = node.constructor) == null ? void 0 : _a.name) === "Cube")
      return true;
    const f = node.from;
    const t = node.to;
    return Array.isArray(f) && f.length >= 3 && Array.isArray(t) && t.length >= 3;
  }
  function collectCubesUnderGroup2(group) {
    const cubes = [];
    if (!group)
      return cubes;
    function traverse(node) {
      if (isCubeLike2(node)) {
        cubes.push(node);
      }
      if (node && Array.isArray(node.children)) {
        for (const ch of node.children) {
          traverse(ch);
        }
      }
    }
    traverse(group);
    return cubes;
  }
  function computeChainTipExtraRestOffset(chainGroups) {
    if (!Array.isArray(chainGroups) || chainGroups.length < 2)
      return null;
    const last = chainGroups[chainGroups.length - 1];
    const prev = chainGroups[chainGroups.length - 2];
    if (!last || !prev)
      return null;
    const oLast = readGroupOrigin(last);
    const oPrev = readGroupOrigin(prev);
    const lastOffset = v3sub(oLast, oPrev);
    const len = v3len(lastOffset);
    if (!(len > 1e-6))
      return null;
    const dir = v3scale(lastOffset, 1 / len);
    let maxProj = -1;
    let foundAny = false;
    try {
      const cubes = collectCubesUnderGroup2(last);
      for (const cube of cubes) {
        const f = cube.from;
        const t = cube.to;
        if (!Array.isArray(f) || !Array.isArray(t))
          continue;
        const xs = [Number(f[0]) || 0, Number(t[0]) || 0];
        const ys = [Number(f[1]) || 0, Number(t[1]) || 0];
        const zs = [Number(f[2]) || 0, Number(t[2]) || 0];
        for (const x of xs) {
          for (const y of ys) {
            for (const z of zs) {
              const v = v3sub([x, y, z], oLast);
              const p = v3dot(v, dir);
              if (p > maxProj)
                maxProj = p;
              foundAny = true;
            }
          }
        }
      }
    } catch (e) {
    }
    if (!foundAny || maxProj < 1e-4)
      return null;
    const clamped = Math.min(maxProj, Math.max(0, len * 10));
    return (
      /** @type {[number,number,number]} */
      v3scale(dir, clamped)
    );
  }
  function computeChainTipWorldWithExtra(chainGroups, eulerDegPerBone, tipExtraRestOffset) {
    if (!Array.isArray(chainGroups) || chainGroups.length === 0)
      return v3(0, 0, 0);
    const origins = chainGroups.map(readGroupOrigin);
    let worldPos = origins[0];
    let worldRot = m3fromEulerXYZDeg(eulerDegPerBone[0] || [0, 0, 0]);
    for (let i = 1; i < chainGroups.length; i++) {
      const restOffset = v3sub(origins[i], origins[i - 1]);
      const rotatedOffset = m3mulV3(worldRot, restOffset);
      worldPos = v3add(worldPos, rotatedOffset);
      const localRot = m3fromEulerXYZDeg(eulerDegPerBone[i] || [0, 0, 0]);
      worldRot = m3mul(worldRot, localRot);
    }
    if (chainGroups.length >= 2) {
      const lastOffset = v3sub(origins[origins.length - 1], origins[origins.length - 2]);
      let tipVecLocal = lastOffset;
      if (Array.isArray(tipExtraRestOffset) && tipExtraRestOffset.length >= 3) {
        tipVecLocal = tipExtraRestOffset;
      }
      const tipOffset = m3mulV3(worldRot, tipVecLocal);
      return v3add(worldPos, tipOffset);
    }
    return worldPos;
  }
  function buildChainsFromRoot(root, maxDepth) {
    const out = [];
    if (!root)
      return out;
    const children0 = (root.children || []).filter(isBoneGroup);
    if (!children0.length)
      return [[root]];
    for (const ch of children0) {
      out.push(...buildChainsFromStart(ch, maxDepth));
    }
    return out;
  }
  function buildChainsFromStart(start, maxDepth) {
    const out = [];
    if (!start)
      return out;
    let current = start;
    let chain = [start];
    const cap = Math.max(1, Math.round(maxDepth != null ? maxDepth : 32));
    for (let depth = 0; depth < cap; depth++) {
      const children = (current.children || []).filter(isBoneGroup);
      if (!children.length) {
        out.push(chain);
        return out;
      }
      if (children.length === 1) {
        current = children[0];
        chain.push(current);
        continue;
      }
      out.push(chain);
      for (const ch of children) {
        out.push(...buildChainsFromStart(ch, cap - depth - 1));
      }
      return out;
    }
    out.push(chain);
    return out;
  }
  function applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerWorld, radiusOverride, collisionMemory, tipExtraRestOffset) {
    if (!state.config.collision_enabled)
      return;
    const radius = radiusOverride == null ? Math.max(0, Number(state.config.collision_radius) || 0) : Math.max(0, Number(radiusOverride) || 0);
    if (radius <= 1e-6)
      return;
    const center = Array.isArray(centerWorld) && centerWorld.length >= 3 ? centerWorld : state.config.collision_center;
    const c = [Number(center[0]) || 0, Number(center[1]) || 0, Number(center[2]) || 0];
    const iters = Math.max(0, Math.min(64, Math.round(state.config.collision_iterations)));
    const strength = clampNumber(state.config.collision_strength, 0, 5, 1);
    if (iters <= 0 || strength <= 0)
      return;
    const tipExtra = Array.isArray(tipExtraRestOffset) && tipExtraRestOffset.length >= 3 ? tipExtraRestOffset : computeChainTipExtraRestOffset(chainGroups);
    const eps = 0.5;
    const maxStep = 6;
    function tipInfo() {
      const eulers = baseEulerDegPerBone.map((r, i) => {
        const out = [r[0], r[1], r[2]];
        out[axisIndex] = axisAnglesDeg[i];
        return out;
      });
      const tip = computeChainTipWorldWithExtra(chainGroups, eulers, tipExtra);
      const to = v3sub(tip, c);
      const d2 = v3len(to);
      const n = d2 > 1e-6 ? v3scale(to, 1 / d2) : [0, 0, 0];
      return { tip, to, d: d2, n };
    }
    let info = tipInfo();
    let d = info.d;
    let touched = false;
    for (let iter = 0; iter < iters && d < radius; iter++) {
      touched = true;
      const penetration = radius - d;
      let pushDir2 = info.n;
      if (collisionMemory && Array.isArray(collisionMemory.lastNormalWorld)) {
        const last = collisionMemory.lastNormalWorld;
        if (v3len(last) > 1e-6 && v3dot(last, pushDir2) < 0.2) {
          pushDir2 = last;
        }
      }
      pushDir2 = v3normalize(pushDir2);
      if (v3len(pushDir2) <= 1e-8)
        break;
      let progressed = false;
      for (let j = axisAnglesDeg.length - 1; j >= 0; j--) {
        const old = axisAnglesDeg[j];
        const baseSigned = v3dot(info.to, pushDir2);
        axisAnglesDeg[j] = old + eps;
        let infoPlus = tipInfo();
        const sPlus = v3dot(infoPlus.to, pushDir2);
        axisAnglesDeg[j] = old - eps;
        let infoMinus = tipInfo();
        const sMinus = v3dot(infoMinus.to, pushDir2);
        const dir = sPlus >= sMinus ? 1 : -1;
        axisAnglesDeg[j] = old + dir * Math.min(maxStep, penetration * strength);
        const infoNew = tipInfo();
        const sNew = v3dot(infoNew.to, pushDir2);
        if (sNew >= baseSigned + 1e-4 || infoNew.d >= d + 1e-4) {
          info = infoNew;
          d = infoNew.d;
          progressed = true;
          if (d >= radius)
            break;
        } else {
          axisAnglesDeg[j] = old;
        }
      }
      if (!progressed)
        break;
    }
    if (touched && collisionMemory) {
      collisionMemory.lastNormalWorld = pushDir;
    }
  }
  function clamp01(t) {
    return Math.max(0, Math.min(1, Number(t) || 0));
  }
  function v3lerpLocal(a, b, t) {
    const tt = clamp01(t);
    return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt];
  }
  function closestPointOnSegment(p, a, b) {
    const ab = v3sub(b, a);
    const ab2 = v3dot(ab, ab);
    if (ab2 <= 1e-10)
      return a;
    let t = v3dot(v3sub(p, a), ab) / ab2;
    t = clamp01(t);
    return v3add(a, v3scale(ab, t));
  }
  function applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesWorld, pointRadius, collisionMemory) {
    if (!state.config.collision_enabled)
      return;
    if (!Array.isArray(capsulesWorld) || capsulesWorld.length === 0)
      return;
    const pr = Math.max(0, Number(pointRadius) || 0);
    const tipExtra = computeChainTipExtraRestOffset(chainGroups);
    for (const cap of capsulesWorld) {
      if (!cap || !Array.isArray(cap.a) || !Array.isArray(cap.b))
        continue;
      const r = Math.max(0, Number(cap.radius) || 0) + pr;
      if (r <= 1e-6)
        continue;
      const eulersNow = baseEulerDegPerBone.map((rot, i) => {
        const out = [rot[0], rot[1], rot[2]];
        out[axisIndex] = axisAnglesDeg[i];
        return out;
      });
      const tipNow = computeChainTipWorldWithExtra(chainGroups, eulersNow, tipExtra);
      const closest = closestPointOnSegment(tipNow, cap.a, cap.b);
      const d = v3len(v3sub(tipNow, closest));
      if (d < r) {
        applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, closest, r, collisionMemory, tipExtra);
      }
    }
  }
  function applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesPrev, capsulesNow, pointRadius, collisionMemory) {
    var _a;
    if (!state.config.collision_enabled)
      return;
    if (!Array.isArray(capsulesNow) || capsulesNow.length === 0)
      return;
    if (!Array.isArray(capsulesPrev) || capsulesPrev.length === 0) {
      applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesNow, pointRadius, collisionMemory);
      return;
    }
    const maxSub = Math.max(1, Math.min(32, Math.round(Number(state.config.collision_sweep_substeps_max) || 6)));
    let maxDisp = 0;
    for (let i = 0; i < Math.min(capsulesPrev.length, capsulesNow.length); i++) {
      const p = capsulesPrev[i];
      const n = capsulesNow[i];
      if (!p || !n)
        continue;
      try {
        maxDisp = Math.max(maxDisp, v3len(v3sub(n.a, p.a)), v3len(v3sub(n.b, p.b)));
      } catch (e) {
      }
    }
    let base = 0;
    try {
      base = Math.max(0.5, Number((_a = capsulesNow[0]) == null ? void 0 : _a.radius) || 0);
    } catch (e) {
      base = 0.5;
    }
    const sub = Math.max(1, Math.min(maxSub, Math.ceil(maxDisp / Math.max(1e-3, base))));
    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      const interp = [];
      for (let i = 0; i < Math.min(capsulesPrev.length, capsulesNow.length); i++) {
        const p = capsulesPrev[i];
        const n = capsulesNow[i];
        if (!p || !n)
          continue;
        interp.push({
          a: v3lerpLocal(p.a, n.a, t),
          b: v3lerpLocal(p.b, n.b, t),
          radius: Math.max(0, Number(n.radius) || 0)
        });
      }
      applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, interp, pointRadius, collisionMemory);
    }
  }
  var init_chains_and_collision = __esm({
    "src/chains_and_collision.js"() {
      init_state();
      init_util();
      init_math();
      init_blockbench_api();
    }
  });

  // src/solver.js
  function makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex) {
    const boneCount = restDeltaAxis.length;
    const value = new Array(boneCount).fill(0);
    const vel = new Array(boneCount).fill(0);
    let wValue = null;
    let wVel = null;
    let wTargets = null;
    let wRest = null;
    let wChainStarts = null;
    let wChainLens = null;
    function ensureWasmViews() {
      if (!state.wasm || !state.wasm.ok || !state.wasm.exports || !state.wasm.memory)
        return false;
      if (wValue && wValue.length === boneCount)
        return true;
      const f32 = 4;
      const u32 = 4;
      const bytes = boneCount * f32 * 4 + chainStarts.length * u32 * 2;
      if (typeof state.wasm.exports.bbp_alloc !== "function")
        return false;
      const basePtr = state.wasm.exports.bbp_alloc(bytes);
      if (!basePtr)
        return false;
      let p = basePtr;
      const memBuf = state.wasm.memory.buffer;
      wValue = new Float32Array(memBuf, p, boneCount);
      p += boneCount * f32;
      wVel = new Float32Array(memBuf, p, boneCount);
      p += boneCount * f32;
      wTargets = new Float32Array(memBuf, p, boneCount);
      p += boneCount * f32;
      wRest = new Float32Array(memBuf, p, boneCount);
      p += boneCount * f32;
      wChainStarts = new Uint32Array(memBuf, p, chainStarts.length);
      p += chainStarts.length * u32;
      wChainLens = new Uint32Array(memBuf, p, chainLengths.length);
      p += chainLengths.length * u32;
      for (let i = 0; i < boneCount; i++)
        wRest[i] = Number(restDeltaAxis[i]) || 0;
      for (let i = 0; i < chainStarts.length; i++)
        wChainStarts[i] = chainStarts[i] >>> 0;
      for (let i = 0; i < chainLengths.length; i++)
        wChainLens[i] = chainLengths[i] >>> 0;
      return true;
    }
    return {
      init(initialTargets) {
        for (let i = 0; i < boneCount; i++) {
          value[i] = initialTargets[i];
          vel[i] = 0;
        }
        if (wValue) {
          for (let i = 0; i < boneCount; i++) {
            wValue[i] = Number(value[i]) || 0;
            wVel[i] = 0;
          }
        }
      },
      step(targets, dt) {
        if (state.wasm && state.wasm.ok && ensureWasmViews()) {
          try {
            for (let i = 0; i < boneCount; i++)
              wTargets[i] = Number(targets[i]) || 0;
            state.wasm.exports.bbp_solve_step(
              boneCount,
              Number(dt) || 0,
              Number(state.config.follow_strength) || 0,
              Number(state.config.follow_damping) || 0,
              wValue.byteOffset,
              wVel.byteOffset,
              wTargets.byteOffset,
              chainStarts.length,
              wChainStarts.byteOffset,
              wChainLens.byteOffset,
              wRest.byteOffset,
              Number(state.config.chain_coupling) || 0,
              Number(state.config.chain_iterations) || 0,
              Number(state.config.tip_falloff) || 0
            );
            for (let i = 0; i < boneCount; i++)
              value[i] = wValue[i];
            return value.slice();
          } catch (e) {
            debugWarn("wasm step failed, fallback to JS", e);
          }
        }
        for (let i = 0; i < boneCount; i++) {
          const x = value[i];
          const v = vel[i];
          const xT = targets[i];
          const accel = (xT - x) * Math.max(0, state.config.follow_strength) - v * Math.max(0, state.config.follow_damping);
          const v2 = v + accel * dt;
          const x2 = x + v2 * dt;
          vel[i] = v2;
          value[i] = x2;
        }
        const iters = Math.max(0, Math.min(64, Math.round(state.config.chain_iterations)));
        const baseCoupling = clampNumber(state.config.chain_coupling, 0, 1, 0.6);
        for (let iter = 0; iter < iters; iter++) {
          for (let c = 0; c < chainStarts.length; c++) {
            const start = chainStarts[c];
            const len = chainLengths[c];
            for (let local = 1; local < len; local++) {
              const i = start + local;
              const parent = i - 1;
              const t = len <= 1 ? 0 : local / (len - 1);
              const coupling = baseCoupling * (1 - clampNumber(state.config.tip_falloff, 0, 1, 0.5) * t);
              const desired = value[parent] + restDeltaAxis[i];
              value[i] = value[i] + (desired - value[i]) * coupling;
            }
          }
        }
        return value.slice();
      }
    };
  }
  var init_solver = __esm({
    "src/solver.js"() {
      init_state();
      init_util();
    }
  });

  // src/bake.js
  function getGroupByUUID2(uuid) {
    try {
      if (typeof OutlinerNode !== "undefined" && (OutlinerNode == null ? void 0 : OutlinerNode.uuids)) {
        const node = OutlinerNode.uuids[String(uuid)];
        if (isOutlinerGroup(node))
          return node;
      }
    } catch (e) {
    }
    return null;
  }
  async function bakeToKeyframes(opts) {
    var _a, _b, _c, _d;
    const animation = getSelectedAnimation();
    if (!animation) {
      showMessage("BBPhysic", "请先在动画面板选择一个动画，再执行 Bake。");
      return;
    }
    const targetRoot = state.config.target_root_uuid ? getGroupByUUID2(state.config.target_root_uuid) : null;
    if (!targetRoot) {
      showMessage("BBPhysic", "未找到被解算根组件（请先完成第二次解算：选择被解算物理部件）。");
      return;
    }
    const roots = [targetRoot];
    const chains = roots.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth)).filter((c) => Array.isArray(c) && c.length);
    if (!chains.length) {
      showMessage("BBPhysic", "未能从所选根骨骼构建出骨骼链。");
      return;
    }
    const bones = [];
    const chainStarts = [];
    const chainLengths = [];
    for (let ci = 0; ci < chains.length; ci++) {
      chainStarts.push(bones.length);
      chainLengths.push(chains[ci].length);
      chains[ci].forEach((g) => bones.push(g));
    }
    const fps = Math.round(clampNumber(opts.fps, 1, 120, state.config.bake_fps));
    const dt = 1 / fps;
    const animEnd = Math.max(0, Number(animation.length) || 0);
    const start = clampNumber(opts.start, 0, animEnd, 0);
    const end = clampNumber(opts.end, 0, animEnd, animEnd);
    if (!(end > start)) {
      showMessage("BBPhysic", "时间区间无效：end 必须大于 start。");
      return;
    }
    const axisIndex = opts.axis === "x" ? 0 : opts.axis === "y" ? 1 : 2;
    const solveXYZ = Boolean(state.config.solve_xyz);
    const logFrames = Math.max(0, Math.min(60, Math.round(Number(state.config.debug_log_frames) || 0)));
    const shouldLog = (frameIndex) => state.config.debug_logging && frameIndex < logFrames;
    const nearZero = (x) => Math.abs(Number(x) || 0) < 1e-6;
    const allNearZero = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v) => nearZero(v));
    const times = [];
    const targetRotations = [];
    const targetAxis = solveXYZ ? [] : [];
    const movingCapsulesWorldPerFrame = [];
    const prevTime = typeof Timeline !== "undefined" && Timeline ? Timeline.time : 0;
    const movingRoot = state.config.moving_root_uuid ? getGroupByUUID2(state.config.moving_root_uuid) : null;
    const movingCapsuleDefs = movingRoot ? buildCapsuleDefsFromRoot(movingRoot) : [];
    if (state.config.collision_enabled && (!movingRoot || movingCapsuleDefs.length === 0)) {
      debugWarn("已启用碰撞，但未生成运动物件胶囊（请先完成第一次解算：选择运动物件）。本次 Bake 将不会执行碰撞约束。");
    }
    try {
      notify(`BBPhysic: 采样中（${fps} fps，${start.toFixed(3)}s→${end.toFixed(3)}s）...`, 2500);
      let frameIndex = 0;
      for (let t = start; t <= end + 1e-6; t += dt, frameIndex++) {
        const tt = Math.min(end, t);
        times.push(tt);
        if (typeof Timeline !== "undefined" && Timeline && typeof Timeline.setTime === "function") {
          Timeline.setTime(tt, true);
        }
        if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
          Animator.preview(true);
        }
        const frameRot = bones.map((g) => readGroupRotationDeg(g));
        targetRotations.push(frameRot);
        if (!solveXYZ)
          targetAxis.push(frameRot.map((r) => r[axisIndex]));
        if (shouldLog(frameIndex)) {
          const b0 = bones[0];
          let meshRotDeg = null;
          try {
            const mr = (_a = b0 == null ? void 0 : b0.mesh) == null ? void 0 : _a.rotation;
            if (mr)
              meshRotDeg = [radToDeg(mr.x || 0), radToDeg(mr.y || 0), radToDeg(mr.z || 0)];
          } catch (e) {
          }
          debugLog("sample", {
            frame: frameIndex,
            t: Number(tt.toFixed(6)),
            axis: opts.axis,
            bone0: (b0 == null ? void 0 : b0.name) || (b0 == null ? void 0 : b0.uuid) || "bone0",
            bone0_group_rot_deg: frameRot[0],
            bone0_mesh_rot_deg: meshRotDeg,
            bone0_axis_deg: (_b = frameRot[0]) == null ? void 0 : _b[axisIndex]
          });
        }
        if (state.config.collision_enabled && movingCapsuleDefs.length) {
          movingCapsulesWorldPerFrame.push(computeCapsulesWorldNow(movingCapsuleDefs));
        }
        if (times.length % 30 === 0)
          await sleep0();
      }
    } finally {
      try {
        if (typeof Timeline !== "undefined" && Timeline && typeof Timeline.setTime === "function") {
          Timeline.setTime(prevTime, true);
        }
        if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
          Animator.preview(true);
        }
      } catch (e) {
      }
    }
    if (state.config.debug_logging) {
      try {
        const firstAxis2 = solveXYZ ? (_c = targetRotations == null ? void 0 : targetRotations[0]) == null ? void 0 : _c.map((r) => r[axisIndex]) : targetAxis[0];
        if (Array.isArray(firstAxis2) && allNearZero(firstAxis2)) {
          debugWarn("采样得到的 axis 角全为 0（或接近 0）。这通常表示预览姿态没有刷新、骨骼没有旋转通道、或读取姿态来源不对。", {
            axis: opts.axis,
            boneCount: bones.length,
            collision_enabled: state.config.collision_enabled
          });
        }
      } catch (e) {
      }
    }
    const restDeltaAxis = new Array(bones.length).fill(0);
    const restDeltaXYZ = solveXYZ ? [new Array(bones.length).fill(0), new Array(bones.length).fill(0), new Array(bones.length).fill(0)] : null;
    const firstFrameRot = targetRotations[0];
    const firstAxis = solveXYZ ? firstFrameRot.map((r) => r[axisIndex]) : targetAxis[0];
    for (let c = 0; c < chainStarts.length; c++) {
      const startIndex = chainStarts[c];
      const len = chainLengths[c];
      for (let local = 1; local < len; local++) {
        const i = startIndex + local;
        restDeltaAxis[i] = firstAxis[i] - firstAxis[i - 1];
        if (restDeltaXYZ) {
          restDeltaXYZ[0][i] = firstFrameRot[i][0] - firstFrameRot[i - 1][0];
          restDeltaXYZ[1][i] = firstFrameRot[i][1] - firstFrameRot[i - 1][1];
          restDeltaXYZ[2][i] = firstFrameRot[i][2] - firstFrameRot[i - 1][2];
        }
      }
    }
    const solver = makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex);
    solver.init(firstAxis);
    const solversXYZ = solveXYZ && restDeltaXYZ ? [
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[0], 0),
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[1], 1),
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[2], 2)
    ] : null;
    if (solversXYZ) {
      solversXYZ[0].init(firstFrameRot.map((r) => r[0]));
      solversXYZ[1].init(firstFrameRot.map((r) => r[1]));
      solversXYZ[2].init(firstFrameRot.map((r) => r[2]));
    }
    const collisionMemoryPerChain = chains.map(() => ({ lastNormalWorld: null }));
    const collisionMemoryPerChainXYZ = solversXYZ ? [chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null }))] : null;
    const tipRadiusPerChain = chains.map((chainGroups) => {
      try {
        const tip = chainGroups == null ? void 0 : chainGroups[chainGroups.length - 1];
        return computeGroupApproxRadius(tip);
      } catch (e) {
        return 0;
      }
    });
    const createdKeyframes = [];
    Undo.initEdit({ animations: [animation] });
    try {
      notify("BBPhysic: 写入关键帧...", 2e3);
      for (let i = 0; i < times.length; i++) {
        const baseRotFrame = targetRotations[i];
        const capsNow = state.config.collision_enabled ? movingCapsulesWorldPerFrame[i] || [] : [];
        const capsPrev = state.config.collision_enabled ? movingCapsulesWorldPerFrame[Math.max(0, i - 1)] || capsNow : capsNow;
        if (solveXYZ && solversXYZ) {
          const outRot = baseRotFrame.map((r) => [r[0], r[1], r[2]]);
          for (let ax = 0; ax < 3; ax++) {
            const targetsAx = baseRotFrame.map((r) => r[ax]);
            const solved = solversXYZ[ax].step(targetsAx, dt);
            if (state.config.collision_enabled && capsNow && capsNow.length) {
              for (let c = 0; c < chains.length; c++) {
                const startIndex = chainStarts[c];
                const len = chainLengths[c];
                const chainGroups = chains[c];
                const baseEuler = outRot.slice(startIndex, startIndex + len);
                const axisAngles = solved.slice(startIndex, startIndex + len);
                const mem = ((_d = collisionMemoryPerChainXYZ == null ? void 0 : collisionMemoryPerChainXYZ[ax]) == null ? void 0 : _d[c]) || null;
                const tipR = tipRadiusPerChain[c] || 0;
                applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, ax, capsPrev, capsNow, tipR, mem);
                for (let j = 0; j < len; j++)
                  solved[startIndex + j] = axisAngles[j];
              }
            }
            for (let b = 0; b < outRot.length; b++)
              outRot[b][ax] = solved[b];
          }
          if (shouldLog(i)) {
            debugLog("solve_xyz", {
              frame: i,
              t: Number(times[i].toFixed(6)),
              capsule_count: (capsNow == null ? void 0 : capsNow.length) || 0
            });
          }
          for (let b = 0; b < bones.length; b++) {
            const boneAnimator = animation.getBoneAnimator(bones[b]);
            const kf = addRotationKeyframe(boneAnimator, times[i], outRot[b]);
            if (opts.overwrite && kf && typeof kf.replaceOthers === "function") {
              try {
                kf.replaceOthers(null);
              } catch (e) {
              }
            }
            if (kf)
              createdKeyframes.push(kf);
          }
        } else {
          const frameAxis = targetAxis[i];
          const solvedAxis = solver.step(frameAxis, dt);
          if (shouldLog(i)) {
            debugLog("solve_pre_collision", {
              frame: i,
              t: Number(times[i].toFixed(6)),
              target_axis_deg_sample: frameAxis == null ? void 0 : frameAxis.slice(0, Math.min(6, bones.length)),
              solved_axis_deg_sample: solvedAxis == null ? void 0 : solvedAxis.slice(0, Math.min(6, bones.length))
            });
          }
          if (state.config.collision_enabled && capsNow && capsNow.length) {
            for (let c = 0; c < chains.length; c++) {
              const startIndex = chainStarts[c];
              const len = chainLengths[c];
              const chainGroups = chains[c];
              const baseEuler = targetRotations[i].slice(startIndex, startIndex + len);
              const axisAngles = solvedAxis.slice(startIndex, startIndex + len);
              const mem = collisionMemoryPerChain[c];
              const tipR = tipRadiusPerChain[c] || 0;
              applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, axisIndex, capsPrev, capsNow, tipR, mem);
              for (let j = 0; j < len; j++)
                solvedAxis[startIndex + j] = axisAngles[j];
            }
            if (shouldLog(i)) {
              debugLog("collision_capsules", {
                frame: i,
                t: Number(times[i].toFixed(6)),
                capsule_count: capsNow.length
              });
            }
          }
          for (let b = 0; b < bones.length; b++) {
            const boneAnimator = animation.getBoneAnimator(bones[b]);
            const base = targetRotations[i][b];
            const out = [base[0], base[1], base[2]];
            out[axisIndex] = solvedAxis[b];
            const kf = addRotationKeyframe(boneAnimator, times[i], out);
            if (opts.overwrite && kf && typeof kf.replaceOthers === "function") {
              try {
                kf.replaceOthers(null);
              } catch (e) {
              }
            }
            if (kf)
              createdKeyframes.push(kf);
          }
        }
        if (i % 30 === 0) {
          notify(`BBPhysic: ${Math.round(i / Math.max(1, times.length - 1) * 100)}%`, 500);
          await sleep0();
        }
      }
      Undo.finishEdit("BBPhysic: Bake to keyframes", { animations: [animation], keyframes: createdKeyframes });
      notify(`BBPhysic: Bake 完成（${createdKeyframes.length} keyframes）`, 3e3);
    } catch (e) {
      Undo.cancelEdit();
      console.error("[BBPhysic] Bake failed", e);
      showMessage("BBPhysic", `Bake 失败：${(e == null ? void 0 : e.message) || e}`);
    }
  }
  var init_bake = __esm({
    "src/bake.js"() {
      init_state();
      init_util();
      init_blockbench_api();
      init_chains_and_collision();
      init_solver();
      init_math();
      init_capsules();
    }
  });

  // src/dialogs.js
  function getGroupOptionsForDialog() {
    const options = { "": "(未选择)" };
    try {
      if (typeof Group !== "undefined" && Group && Array.isArray(Group.all)) {
        const all = Group.all.slice().filter(isOutlinerGroup);
        all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        for (const g of all) {
          if (g && typeof g.uuid === "string")
            options[g.uuid] = String(g.name || g.uuid);
        }
      }
    } catch (e) {
    }
    return options;
  }
  function getGroupByUUID3(uuid) {
    try {
      if (typeof OutlinerNode !== "undefined" && (OutlinerNode == null ? void 0 : OutlinerNode.uuids)) {
        const node = OutlinerNode.uuids[String(uuid)];
        if (isOutlinerGroup(node))
          return node;
      }
    } catch (e) {
    }
    return null;
  }
  function openStep1MovingObjectDialog() {
    const options = getGroupOptionsForDialog();
    const dialog = new Dialog("bbphysic_step1_moving", {
      title: "BBPhysic 第一次解算：选择运动物件（生成碰撞胶囊）",
      buttons: ["确定", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        moving_root_uuid: {
          label: "运动物件根组件（Group）",
          type: "select",
          value: state.config.moving_root_uuid || "",
          options
        }
      },
      onConfirm(formResult) {
        const uuid = String(formResult.moving_root_uuid || "");
        const root = uuid ? getGroupByUUID3(uuid) : null;
        if (!root) {
          showMessage("BBPhysic", "请选择一个有效的运动物件根组件（Group）。");
          return;
        }
        state.config.moving_root_uuid = uuid;
        state.solveSetup.movingRoot = root;
        state.solveSetup.movingCapsules = buildCapsuleDefsFromRoot(root);
        saveConfigToStorage();
        applyCapsuleVisualSettings();
        showMessage("BBPhysic", `已生成运动物件碰撞胶囊：${state.solveSetup.movingCapsules.length} 段`);
      }
    });
    dialog.show();
  }
  function openStep2TargetObjectDialog() {
    const options = getGroupOptionsForDialog();
    const dialog = new Dialog("bbphysic_step2_target", {
      title: "BBPhysic 第二次解算：选择被解算物理部件（计算体积）",
      buttons: ["确定", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        target_root_uuid: {
          label: "被解算物理部件根组件（Group）",
          type: "select",
          value: state.config.target_root_uuid || "",
          options
        }
      },
      onConfirm(formResult) {
        const uuid = String(formResult.target_root_uuid || "");
        const root = uuid ? getGroupByUUID3(uuid) : null;
        if (!root) {
          showMessage("BBPhysic", "请选择一个有效的被解算根组件（Group）。");
          return;
        }
        state.config.target_root_uuid = uuid;
        state.solveSetup.targetRoot = root;
        state.solveSetup.targetCapsules = buildCapsuleDefsFromRoot(root);
        state.solveSetup.targetAabb = computePivotAabbWorld(root);
        saveConfigToStorage();
        applyCapsuleVisualSettings();
        const aabb = state.solveSetup.targetAabb;
        showMessage(
          "BBPhysic",
          `已计算被解算部件体积（pivot AABB）：中心(${aabb.center.map((v) => v.toFixed(2)).join(", ")})，尺寸(${aabb.size.map((v) => v.toFixed(2)).join(", ")})，节点数 ${aabb.count}`
        );
      }
    });
    dialog.show();
  }
  function openSettingsDialog() {
    const dialog = new Dialog("bbphysic_settings", {
      title: "BBPhysic 设置（Bake + 解算）",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        bake_fps: { label: "Bake 采样帧率 (fps)", type: "number", value: state.config.bake_fps, min: 1, max: 120, step: 1 },
        solve_xyz: { label: "同时解算 XYZ 三轴", type: "checkbox", value: Boolean(state.config.solve_xyz) },
        axis: { label: "单轴模式：作用轴 (x/y/z)", type: "text", value: state.config.axis },
        solve_scope: {
          label: "解算范围",
          type: "select",
          value: state.config.solve_scope,
          options: { selected: "仅选中的根骨骼", all_roots: "所有根骨骼（全模型）" }
        },
        use_wasm: { label: "尝试使用 WASM（Rust）加速（实验）", type: "checkbox", value: state.config.use_wasm },
        follow_strength: { label: "跟随强度 (k)", type: "number", value: state.config.follow_strength, min: 0, max: 500, step: 1 },
        follow_damping: { label: "跟随阻尼 (c)", type: "number", value: state.config.follow_damping, min: 0, max: 200, step: 1 },
        tip_falloff: { label: "末端衰减 (0-1)", type: "number", value: state.config.tip_falloff, min: 0, max: 1, step: 0.05 },
        max_chain_depth: { label: "链条最大深度", type: "number", value: state.config.max_chain_depth, min: 1, max: 128, step: 1 },
        chain_coupling: { label: "链耦合强度 (0-1)", type: "number", value: state.config.chain_coupling, min: 0, max: 1, step: 0.05 },
        chain_iterations: { label: "链耦合迭代次数", type: "number", value: state.config.chain_iterations, min: 0, max: 64, step: 1 },
        collision_enabled: { label: "启用碰撞（胶囊）", type: "checkbox", value: state.config.collision_enabled },
        collision_iterations: { label: "碰撞迭代次数", type: "number", value: state.config.collision_iterations, min: 0, max: 64, step: 1 },
        collision_strength: { label: "碰撞强度", type: "number", value: state.config.collision_strength, min: 0, max: 5, step: 0.1 },
        collision_sweep_substeps_max: { label: "碰撞插帧上限（运动物件移动快时）", type: "number", value: state.config.collision_sweep_substeps_max, min: 1, max: 32, step: 1 },
        show_moving_capsules: { label: "显示运动物件胶囊虚影（第1次解算）", type: "checkbox", value: state.config.show_moving_capsules },
        show_target_capsules: { label: "显示被解算部件胶囊虚影（第2次解算）", type: "checkbox", value: state.config.show_target_capsules },
        capsule_update_fps: { label: "胶囊虚影刷新率 (fps)", type: "number", value: state.config.capsule_update_fps, min: 1, max: 60, step: 1 },
        debug_logging: { label: "输出调试日志（控制台）", type: "checkbox", value: state.config.debug_logging },
        debug_log_frames: { label: "调试输出帧数", type: "number", value: state.config.debug_log_frames, min: 0, max: 60, step: 1 }
      },
      onConfirm(formResult) {
        var _a, _b;
        const axisRaw = String((_a = formResult.axis) != null ? _a : state.config.axis).trim().toLowerCase();
        const scopeRaw = String((_b = formResult.solve_scope) != null ? _b : state.config.solve_scope);
        const solve_scope = scopeRaw === "all_roots" ? "all_roots" : "selected";
        state.config = {
          ...state.config,
          bake_fps: Math.round(clampNumber(formResult.bake_fps, 1, 120, state.config.bake_fps)),
          axis: axisRaw === "x" || axisRaw === "y" || axisRaw === "z" ? axisRaw : state.config.axis,
          solve_xyz: Boolean(formResult.solve_xyz),
          solve_scope: (
            /** @type {'selected'|'all_roots'} */
            solve_scope
          ),
          use_wasm: Boolean(formResult.use_wasm),
          follow_strength: clampNumber(formResult.follow_strength, 0, 500, state.config.follow_strength),
          follow_damping: clampNumber(formResult.follow_damping, 0, 200, state.config.follow_damping),
          tip_falloff: clampNumber(formResult.tip_falloff, 0, 1, state.config.tip_falloff),
          max_chain_depth: Math.round(clampNumber(formResult.max_chain_depth, 1, 128, state.config.max_chain_depth)),
          chain_coupling: clampNumber(formResult.chain_coupling, 0, 1, state.config.chain_coupling),
          chain_iterations: Math.round(clampNumber(formResult.chain_iterations, 0, 64, state.config.chain_iterations)),
          collision_enabled: Boolean(formResult.collision_enabled),
          collision_iterations: Math.round(clampNumber(formResult.collision_iterations, 0, 64, state.config.collision_iterations)),
          collision_strength: clampNumber(formResult.collision_strength, 0, 5, state.config.collision_strength),
          collision_sweep_substeps_max: Math.round(clampNumber(formResult.collision_sweep_substeps_max, 1, 32, state.config.collision_sweep_substeps_max)),
          show_moving_capsules: Boolean(formResult.show_moving_capsules),
          show_target_capsules: Boolean(formResult.show_target_capsules),
          capsule_update_fps: Math.round(clampNumber(formResult.capsule_update_fps, 1, 60, state.config.capsule_update_fps)),
          debug_logging: Boolean(formResult.debug_logging),
          debug_log_frames: Math.round(clampNumber(formResult.debug_log_frames, 0, 60, state.config.debug_log_frames))
        };
        saveConfigToStorage();
        state.wasmInitTried = false;
        state.wasm = null;
        tryInitWasm();
        applyCapsuleVisualSettings();
        showMessage("BBPhysic", "设置已保存（写入本机存储）。");
      }
    });
    dialog.show();
  }
  function openBakeDialog() {
    if (!state.config.moving_root_uuid) {
      showMessage("BBPhysic", "请先执行：BBPhysic 第一次解算（选择运动物件）。");
      return;
    }
    if (!state.config.target_root_uuid) {
      showMessage("BBPhysic", "请先执行：BBPhysic 第二次解算（选择被解算物理部件）。");
      return;
    }
    const animation = getSelectedAnimation();
    if (!animation) {
      showMessage("BBPhysic", "请先在动画面板选择一个动画，再执行 Bake。");
      return;
    }
    const endDefault = Math.max(0, Number(animation.length) || 0);
    const dialog = new Dialog("bbphysic_bake", {
      title: "BBPhysic Bake（预烘培）",
      buttons: ["开始 Bake", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        start: { label: "起始时间 (s)", type: "number", value: 0, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
        end: { label: "结束时间 (s)", type: "number", value: endDefault, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
        fps: { label: "采样帧率 (fps)", type: "number", value: state.config.bake_fps, min: 1, max: 120, step: 1 },
        axis: {
          label: "作用轴",
          type: "select",
          value: state.config.axis,
          options: { x: "X", y: "Y", z: "Z" }
        },
        overwrite: { label: "覆盖同时间已有关键帧", type: "checkbox", value: true }
      },
      onConfirm(formResult) {
        var _a;
        const start = clampNumber(formResult.start, 0, endDefault, 0);
        const end = clampNumber(formResult.end, 0, endDefault, endDefault);
        const fps = Math.round(clampNumber(formResult.fps, 1, 120, state.config.bake_fps));
        const axisRaw = String((_a = formResult.axis) != null ? _a : state.config.axis).trim().toLowerCase();
        const axis = axisRaw === "x" || axisRaw === "y" || axisRaw === "z" ? axisRaw : state.config.axis;
        const overwrite = Boolean(formResult.overwrite);
        bakeToKeyframes({ start, end, fps, axis, overwrite });
      }
    });
    dialog.show();
  }
  var init_dialogs = __esm({
    "src/dialogs.js"() {
      init_state();
      init_util();
      init_blockbench_api();
      init_config_storage();
      init_wasm();
      init_collider_visual();
      init_bake();
      init_capsules();
    }
  });

  // src/preview.js
  function getGroupByUUID4(uuid) {
    try {
      if (typeof OutlinerNode !== "undefined" && (OutlinerNode == null ? void 0 : OutlinerNode.uuids)) {
        const node = OutlinerNode.uuids[String(uuid)];
        if (isOutlinerGroup(node))
          return node;
      }
    } catch (e) {
    }
    return null;
  }
  function stopPreview() {
    if (state.previewTimer) {
      clearInterval(state.previewTimer);
      state.previewTimer = null;
    }
    state.previewState = null;
    try {
      if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
        Animator.preview(true);
      }
    } catch (e) {
    }
    notify("BBPhysic: 预览已停止", 1500);
  }
  function startPreview() {
    var _a;
    if (state.previewTimer)
      return;
    const animation = getSelectedAnimation();
    if (!animation) {
      showMessage("BBPhysic", "请先在动画面板选择一个动画，再启动预览。");
      return;
    }
    const roots = getSolveRootGroups();
    if (!roots.length) {
      showMessage(
        "BBPhysic",
        state.config.solve_scope === "all_roots" ? "未找到任何根骨骼（Group）。" : "请先在 Outliner 里选中裙摆骨骼链的“根骨骼”(Group)。"
      );
      return;
    }
    const chains = roots.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth)).filter((c) => Array.isArray(c) && c.length);
    if (!chains.length) {
      showMessage("BBPhysic", "未能从所选根骨骼构建出骨骼链。");
      return;
    }
    const bones = [];
    const chainStarts = [];
    const chainLengths = [];
    for (let ci = 0; ci < chains.length; ci++) {
      chainStarts.push(bones.length);
      chainLengths.push(chains[ci].length);
      chains[ci].forEach((g) => bones.push(g));
    }
    const axisRaw = String((_a = state.config.axis) != null ? _a : "x").trim().toLowerCase();
    const axis = axisRaw === "x" || axisRaw === "y" || axisRaw === "z" ? axisRaw : "x";
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const solveXYZ = Boolean(state.config.solve_xyz);
    const fps = Math.max(1, Math.min(60, Math.round(Number(state.config.bake_fps) || 30)));
    const dtNominal = 1 / fps;
    const restDeltaAxis = new Array(bones.length).fill(0);
    const restDeltaXYZ = solveXYZ ? [new Array(bones.length).fill(0), new Array(bones.length).fill(0), new Array(bones.length).fill(0)] : null;
    try {
      if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
        Animator.preview(true);
      }
    } catch (e) {
    }
    const initialFrameRot = bones.map((g) => readGroupRotationDeg(g));
    const initialAxis = initialFrameRot.map((r) => r[axisIndex]);
    for (let c = 0; c < chainStarts.length; c++) {
      const startIndex = chainStarts[c];
      const len = chainLengths[c];
      for (let local = 1; local < len; local++) {
        const i = startIndex + local;
        restDeltaAxis[i] = initialAxis[i] - initialAxis[i - 1];
        if (restDeltaXYZ) {
          restDeltaXYZ[0][i] = initialFrameRot[i][0] - initialFrameRot[i - 1][0];
          restDeltaXYZ[1][i] = initialFrameRot[i][1] - initialFrameRot[i - 1][1];
          restDeltaXYZ[2][i] = initialFrameRot[i][2] - initialFrameRot[i - 1][2];
        }
      }
    }
    const solver = makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex);
    solver.init(initialAxis);
    const solversXYZ = solveXYZ && restDeltaXYZ ? [
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[0], 0),
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[1], 1),
      makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[2], 2)
    ] : null;
    if (solversXYZ) {
      solversXYZ[0].init(initialFrameRot.map((r) => r[0]));
      solversXYZ[1].init(initialFrameRot.map((r) => r[1]));
      solversXYZ[2].init(initialFrameRot.map((r) => r[2]));
    }
    state.previewState = {
      animation,
      chains,
      bones,
      chainStarts,
      chainLengths,
      axisIndex,
      solveXYZ,
      lastTime: typeof Timeline !== "undefined" && Timeline ? Timeline.time : 0,
      dtNominal,
      solver,
      solversXYZ,
      movingCapsuleDefs: [],
      lastCapsulesWorld: null,
      tipRadiusPerChain: chains.map((cg) => {
        try {
          const tip = cg == null ? void 0 : cg[cg.length - 1];
          return computeGroupApproxRadius(tip);
        } catch (e) {
          return 0;
        }
      }),
      collisionMemoryPerChain: chains.map(() => ({ lastNormalWorld: null })),
      collisionMemoryPerChainXYZ: solversXYZ ? [chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null }))] : null
    };
    try {
      const movingRoot = state.config.moving_root_uuid ? getGroupByUUID4(state.config.moving_root_uuid) : null;
      if (movingRoot)
        state.previewState.movingCapsuleDefs = buildCapsuleDefsFromRoot(movingRoot);
    } catch (e) {
    }
    state.previewTimer = setInterval(() => {
      var _a2, _b, _c, _d, _e;
      try {
        if (!state.previewState)
          return;
        const animNow = getSelectedAnimation();
        if (!animNow || animNow !== state.previewState.animation) {
          stopPreview();
          return;
        }
        const tNow = typeof Timeline !== "undefined" && Timeline ? Number(Timeline.time) || 0 : 0;
        let dt = state.previewState.dtNominal;
        const jump = tNow - (Number(state.previewState.lastTime) || 0);
        if (!Number.isFinite(jump) || Math.abs(jump) > 0.5 || jump < -1e-6) {
          try {
            if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
              Animator.preview(true);
            }
          } catch (e) {
          }
          const frameRotReset = state.previewState.bones.map((g) => readGroupRotationDeg(g));
          const axisReset = frameRotReset.map((r) => r[state.previewState.axisIndex]);
          state.previewState.solver.init(axisReset);
          dt = state.previewState.dtNominal;
        } else if (jump > 1e-6) {
          dt = Math.max(1 / 240, Math.min(1 / 5, jump));
        }
        state.previewState.lastTime = tNow;
        try {
          if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
            Animator.preview(true);
          }
        } catch (e) {
        }
        const baseRot = state.previewState.bones.map((g) => readGroupRotationDeg(g));
        const capsNow = state.config.collision_enabled && ((_a2 = state.previewState.movingCapsuleDefs) == null ? void 0 : _a2.length) ? computeCapsulesWorldNow(state.previewState.movingCapsuleDefs) : [];
        const capsPrev = state.previewState.lastCapsulesWorld || capsNow;
        if (state.previewState.solveXYZ && state.previewState.solversXYZ) {
          const outRot = baseRot.map((r) => [r[0], r[1], r[2]]);
          for (let ax = 0; ax < 3; ax++) {
            const targets = baseRot.map((r) => r[ax]);
            const solved = state.previewState.solversXYZ[ax].step(targets, dt);
            if (state.config.collision_enabled && capsNow && capsNow.length) {
              for (let c = 0; c < state.previewState.chains.length; c++) {
                const startIndex = state.previewState.chainStarts[c];
                const len = state.previewState.chainLengths[c];
                const chainGroups = state.previewState.chains[c];
                const baseEuler = outRot.slice(startIndex, startIndex + len);
                const axisAngles = solved.slice(startIndex, startIndex + len);
                const mem = ((_c = (_b = state.previewState.collisionMemoryPerChainXYZ) == null ? void 0 : _b[ax]) == null ? void 0 : _c[c]) || null;
                const tipR = ((_d = state.previewState.tipRadiusPerChain) == null ? void 0 : _d[c]) || 0;
                applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, ax, capsPrev, capsNow, tipR, mem);
                for (let j = 0; j < len; j++)
                  solved[startIndex + j] = axisAngles[j];
              }
            }
            for (let b = 0; b < outRot.length; b++)
              outRot[b][ax] = solved[b];
          }
          for (let b = 0; b < state.previewState.bones.length; b++) {
            writeGroupRotationDeg(state.previewState.bones[b], outRot[b]);
          }
        } else {
          const targets = baseRot.map((r) => r[state.previewState.axisIndex]);
          const solvedAxis = state.previewState.solver.step(targets, dt);
          if (state.config.collision_enabled && capsNow && capsNow.length) {
            for (let c = 0; c < state.previewState.chains.length; c++) {
              const startIndex = state.previewState.chainStarts[c];
              const len = state.previewState.chainLengths[c];
              const chainGroups = state.previewState.chains[c];
              const baseEuler = baseRot.slice(startIndex, startIndex + len);
              const axisAngles = solvedAxis.slice(startIndex, startIndex + len);
              const mem = state.previewState.collisionMemoryPerChain ? state.previewState.collisionMemoryPerChain[c] : null;
              const tipR = ((_e = state.previewState.tipRadiusPerChain) == null ? void 0 : _e[c]) || 0;
              applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, state.previewState.axisIndex, capsPrev, capsNow, tipR, mem);
              for (let j = 0; j < len; j++)
                solvedAxis[startIndex + j] = axisAngles[j];
            }
          }
          for (let b = 0; b < state.previewState.bones.length; b++) {
            const base = baseRot[b];
            const out = [base[0], base[1], base[2]];
            out[state.previewState.axisIndex] = solvedAxis[b];
            writeGroupRotationDeg(state.previewState.bones[b], out);
          }
        }
        if (state.config.collision_enabled && capsNow && capsNow.length) {
          state.previewState.lastCapsulesWorld = capsNow;
        }
      } catch (e) {
        console.error("[BBPhysic] Preview tick failed", e);
        stopPreview();
      }
    }, Math.round(1e3 / fps));
    notify(`BBPhysic: 预览已启动（${fps} fps，${solveXYZ ? "XYZ 三轴" : `轴 ${axis.toUpperCase()}`}）`, 2e3);
  }
  function togglePreview() {
    if (state.previewTimer)
      stopPreview();
    else
      startPreview();
  }
  var init_preview = __esm({
    "src/preview.js"() {
      init_state();
      init_util();
      init_blockbench_api();
      init_chains_and_collision();
      init_solver();
      init_capsules();
    }
  });

  // src/plugin.js
  function safeAddToMenu(action, path) {
    try {
      MenuBar.addAction(action, path);
    } catch (e) {
      console.warn("[BBPhysic] Failed to add menu action", { path, action: action == null ? void 0 : action.id }, e);
    }
  }
  function safeRemoveFromMenu(path) {
    try {
      MenuBar.removeAction(path);
    } catch (e) {
    }
  }
  function registerPlugin() {
    Plugin.register(PLUGIN_ID, {
      title: "BBPhysic",
      author: "BBPhysic Contributors",
      description: "为 Blockbench 提供轻量裙摆物理解算与关键帧预烘培（开发中）",
      icon: "scatter_plot",
      variant: "both",
      version: PLUGIN_VERSION,
      onload() {
        loadConfigFromStorage();
        applyCapsuleVisualSettings();
        tryInitWasm();
        state.actions.step1_moving = new Action("bbphysic_step1_moving", {
          name: "BBPhysic: 第一次解算（选择运动物件）",
          icon: "directions_run",
          category: "Tools",
          click() {
            openStep1MovingObjectDialog();
          }
        });
        state.actions.step2_target = new Action("bbphysic_step2_target", {
          name: "BBPhysic: 第二次解算（选择被解算物理部件）",
          icon: "select_all",
          category: "Tools",
          click() {
            openStep2TargetObjectDialog();
          }
        });
        state.actions.settings = new Action("bbphysic_settings", {
          name: "BBPhysic: 设置",
          icon: "tune",
          category: "Tools",
          click() {
            openSettingsDialog();
          }
        });
        state.actions.bake = new Action("bbphysic_bake", {
          name: "BBPhysic: 第三次解算（碰撞 + Bake 生成关键帧）",
          icon: "key",
          category: "Tools",
          click() {
            openBakeDialog();
          }
        });
        state.actions.preview = new Action("bbphysic_preview", {
          name: "BBPhysic: 预览（开/关）",
          icon: "play_arrow",
          category: "Tools",
          click() {
            togglePreview();
          }
        });
        safeAddToMenu(state.actions.settings, "tools.0");
        safeAddToMenu(state.actions.step1_moving, "tools.0");
        safeAddToMenu(state.actions.step2_target, "tools.0");
        safeAddToMenu(state.actions.bake, "tools.0");
        safeAddToMenu(state.actions.preview, "tools.0");
        notify(`BBPhysic 已加载（v${PLUGIN_VERSION}）：仅 Bake 模式`, 2500);
      },
      onunload() {
        safeRemoveFromMenu("tools.bbphysic_settings");
        safeRemoveFromMenu("tools.bbphysic_step1_moving");
        safeRemoveFromMenu("tools.bbphysic_step2_target");
        safeRemoveFromMenu("tools.bbphysic_bake");
        safeRemoveFromMenu("tools.bbphysic_preview");
        try {
          stopPreview();
        } catch (e) {
        }
        try {
          stopCapsuleUpdates();
          const scn = getSceneForCollider();
          if (scn && state.movingCapsulesGroup)
            scn.remove(state.movingCapsulesGroup);
          if (scn && state.targetCapsulesGroup)
            scn.remove(state.targetCapsulesGroup);
          state.movingCapsulesGroup = null;
          state.targetCapsulesGroup = null;
        } catch (e) {
        }
        if (state.actions.settings)
          state.actions.settings.delete();
        if (state.actions.step1_moving)
          state.actions.step1_moving.delete();
        if (state.actions.step2_target)
          state.actions.step2_target.delete();
        if (state.actions.bake)
          state.actions.bake.delete();
        if (state.actions.preview)
          state.actions.preview.delete();
      }
    });
  }
  var init_plugin = __esm({
    "src/plugin.js"() {
      init_state();
      init_util();
      init_config_storage();
      init_dialogs();
      init_preview();
      init_collider_visual();
      init_wasm();
    }
  });

  // src/index.js
  var require_src = __commonJS({
    "src/index.js"() {
      init_plugin();
      registerPlugin();
    }
  });
  require_src();
})();

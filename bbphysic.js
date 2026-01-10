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
  function resetRuntimeState() {
    state.solveSetup = {
      movingRoot: null,
      movingBoxes: [],
      targetRoot: null,
      targetBoxes: [],
      targetAabb: null
    };
    state.previewState = null;
    if (state.previewTimer) {
      try {
        clearInterval(state.previewTimer);
      } catch (e) {
      }
      state.previewTimer = null;
    }
    state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
    state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
    state.tmpThreeVec3 = typeof THREE !== "undefined" && THREE ? new THREE.Vector3() : null;
  }
  var PLUGIN_ID, PLUGIN_VERSION, STORAGE_KEY, DEFAULT_CONFIG, state;
  var init_state = __esm({
    "src/state.js"() {
      PLUGIN_ID = "bbphysic";
      PLUGIN_VERSION = "0.0.3";
      STORAGE_KEY = `${PLUGIN_ID}:config:v3`;
      DEFAULT_CONFIG = {
        preview_fps: 30,
        bake_fps: 30,
        bake_axis: "x",
        solve_scope: "selected",
        follow_strength: 80,
        follow_damping: 18,
        max_chain_depth: 32,
        gravity_y: -9.81,
        lin_damping: 2,
        ang_damping: 2,
        air_drag: 0,
        inertia_enabled: true,
        inertia_scale: 1,
        target_self_collision: false,
        collision_enabled: false,
        collision_iterations: 6,
        cloth_enabled: false,
        cloth_roots_uuids: [],
        debug_logging: false,
        debug_log_frames: 5,
        moving_root_uuid: "",
        target_root_uuid: ""
      };
      state = {
        /** @type {{preview_fps: number, bake_fps: number, bake_axis: 'x'|'y'|'z', solve_scope: 'selected'|'all_roots', follow_strength: number, follow_damping: number, max_chain_depth: number, gravity_y: number, lin_damping: number, ang_damping: number, air_drag: number, inertia_enabled: boolean, inertia_scale: number, target_self_collision: boolean, collision_enabled: boolean, collision_iterations: number, cloth_enabled: boolean, cloth_roots_uuids: string[], debug_logging: boolean, debug_log_frames: number, moving_root_uuid: string, target_root_uuid: string}} */
        config: { ...DEFAULT_CONFIG },
        /** @type {{settings?: any, step1_moving?: any, step2_target?: any, bake?: any, preview?: any, toggle_collider?: any}} */
        actions: {},
        /** @type {{instance?: WebAssembly.Instance, memory?: WebAssembly.Memory, exports?: any, ok?: boolean}|null} */
        wasm: null,
        wasmInitTried: false,
        previewTimer: null,
        previewState: null,
        // Simulated bones visualization (runtime-only)
        simBonesVis: {
          group: null,
          enabled: false,
          lastMs: 0
        },
        // OBB ghost visualization (runtime-only, not persisted)
        ghost: {
          enabled: false,
          timer: null,
          lastMs: 0,
          moving: null,
          target: null
        },
        /**
         * 三阶段解算运行时缓存：
         * - movingBoxes: 由“运动物件根组件”自动生成的 OBB 盒列表（来自 cube）
         * - targetBoxes: 由“被解算物理部件根组件”自动生成的 OBB 盒列表（来自 cube）
         * - targetAabb: 由“被解算物理部件根组件”计算的体积信息（pivot AABB）
         */
        solveSetup: {
          /** @type {any|null} */
          movingRoot: null,
          /** @type {Array<{group_uuid: string, cube_uuid: string}>} */
          movingBoxes: [],
          /** @type {any|null} */
          targetRoot: null,
          /** @type {Array<{group_uuid: string, cube_uuid: string}>} */
          targetBoxes: [],
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
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
      if (typeof localStorage === "undefined")
        return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw)
        return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object")
        return;
      const scopeRaw = String((_a = parsed.solve_scope) != null ? _a : state.config.solve_scope);
      const solve_scope = scopeRaw === "all_roots" ? "all_roots" : "selected";
      const cloth_enabled = Boolean((_b = parsed.cloth_enabled) != null ? _b : state.config.cloth_enabled);
      const cloth_roots_uuids = [];
      let bake_axis = "x";
      try {
        const bakeAxisRaw = String((_d = (_c = parsed.bake_axis) != null ? _c : state.config.bake_axis) != null ? _d : "x").trim().toLowerCase();
        bake_axis = bakeAxisRaw === "y" ? "y" : bakeAxisRaw === "z" ? "z" : "x";
      } catch (e) {
        bake_axis = "x";
      }
      state.config = {
        ...state.config,
        preview_fps: Math.round(clampNumber(parsed.preview_fps, 1, 120, state.config.preview_fps)),
        bake_fps: Math.round(clampNumber(parsed.bake_fps, 1, 120, state.config.bake_fps)),
        bake_axis,
        solve_scope,
        follow_strength: clampNumber(parsed.follow_strength, 0, 500, state.config.follow_strength),
        follow_damping: clampNumber(parsed.follow_damping, 0, 200, state.config.follow_damping),
        max_chain_depth: Math.round(clampNumber(parsed.max_chain_depth, 1, 128, state.config.max_chain_depth)),
        gravity_y: clampNumber(parsed.gravity_y, -200, 200, state.config.gravity_y),
        lin_damping: clampNumber(parsed.lin_damping, 0, 50, state.config.lin_damping),
        ang_damping: clampNumber(parsed.ang_damping, 0, 50, state.config.ang_damping),
        air_drag: clampNumber(parsed.air_drag, 0, 50, state.config.air_drag),
        inertia_enabled: Boolean((_e = parsed.inertia_enabled) != null ? _e : state.config.inertia_enabled),
        inertia_scale: clampNumber(parsed.inertia_scale, 0, 5, state.config.inertia_scale),
        target_self_collision: Boolean((_f = parsed.target_self_collision) != null ? _f : state.config.target_self_collision),
        collision_enabled: Boolean((_g = parsed.collision_enabled) != null ? _g : state.config.collision_enabled),
        collision_iterations: Math.round(clampNumber(parsed.collision_iterations, 0, 64, state.config.collision_iterations)),
        cloth_enabled,
        cloth_roots_uuids,
        debug_logging: Boolean((_h = parsed.debug_logging) != null ? _h : state.config.debug_logging),
        debug_log_frames: Math.round(clampNumber(parsed.debug_log_frames, 0, 60, state.config.debug_log_frames)),
        moving_root_uuid: "",
        target_root_uuid: ""
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
          preview_fps: state.config.preview_fps,
          bake_fps: state.config.bake_fps,
          bake_axis: state.config.bake_axis,
          solve_scope: state.config.solve_scope,
          follow_strength: state.config.follow_strength,
          follow_damping: state.config.follow_damping,
          max_chain_depth: state.config.max_chain_depth,
          gravity_y: state.config.gravity_y,
          lin_damping: state.config.lin_damping,
          ang_damping: state.config.ang_damping,
          air_drag: state.config.air_drag,
          inertia_enabled: state.config.inertia_enabled,
          inertia_scale: state.config.inertia_scale,
          target_self_collision: state.config.target_self_collision,
          collision_enabled: state.config.collision_enabled,
          collision_iterations: state.config.collision_iterations,
          cloth_enabled: state.config.cloth_enabled,
          debug_logging: state.config.debug_logging,
          debug_log_frames: state.config.debug_log_frames
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
  function v3add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  function v3sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function v3len(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
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
  function getOutlinerSelectedNodes() {
    try {
      if (typeof Outliner !== "undefined" && Outliner && Array.isArray(Outliner.selected)) {
        return Outliner.selected.slice();
      }
    } catch (e) {
    }
    return [];
  }
  function findParentGroup(node) {
    let cur = node;
    for (let i = 0; i < 64; i++) {
      if (!cur)
        return null;
      if (isOutlinerGroup(cur))
        return cur;
      const p = cur.parent;
      if (!p || p === "root")
        return null;
      cur = p;
    }
    return null;
  }
  function uniqueGroups(groups) {
    const byId = /* @__PURE__ */ new Map();
    const fallback = [];
    for (const g of groups) {
      if (!g)
        continue;
      const id = typeof g.uuid === "string" ? g.uuid : "";
      if (id) {
        if (!byId.has(id))
          byId.set(id, g);
      } else {
        fallback.push(g);
      }
    }
    return [...byId.values(), ...fallback];
  }
  function filterRootWithinSelection(groups) {
    const list = uniqueGroups(groups).filter(isOutlinerGroup);
    const ids = new Set(list.map((g) => String((g == null ? void 0 : g.uuid) || "")).filter((s) => s));
    return list.filter((g) => {
      let p = g == null ? void 0 : g.parent;
      for (let i = 0; i < 64; i++) {
        if (!p || p === "root")
          return true;
        const pid = String((p == null ? void 0 : p.uuid) || "");
        if (pid && ids.has(pid))
          return false;
        p = p.parent;
      }
      return true;
    });
  }
  function getSelectedRootGroups() {
    try {
      if (typeof Group !== "undefined" && Group) {
        if (Array.isArray(Group.multi_selected) && Group.multi_selected.length) {
          return filterRootWithinSelection(Group.multi_selected);
        }
        if (Group.selected && isOutlinerGroup(Group.selected))
          return [Group.selected];
      }
    } catch (e) {
    }
    try {
      const nodes = getOutlinerSelectedNodes();
      if (nodes.length) {
        const groups = [];
        for (const n of nodes) {
          const g = findParentGroup(n);
          if (g)
            groups.push(g);
        }
        return filterRootWithinSelection(groups);
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
      if (!exports || !memory || typeof exports.bbp_alloc !== "function" || typeof exports.bbp_rapier_step !== "function") {
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

  // src/chains.js
  function buildChainsFromRoot(root, maxDepth) {
    const out = [];
    if (!root)
      return out;
    if (isBoneGroup(root)) {
      return buildChainsFromStart(root, maxDepth);
    }
    const children0 = (root.children || []).filter(isBoneGroup);
    if (!children0.length)
      return [];
    for (const ch of children0)
      out.push(...buildChainsFromStart(ch, maxDepth));
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
  var init_chains = __esm({
    "src/chains.js"() {
      init_blockbench_api();
    }
  });

  // src/chain_flatten.js
  function flattenChainsWithParentAnchors(chains) {
    const bones = [];
    const parentIndex = [];
    const isRoot = [];
    const chainStarts = [];
    const chainLengths = [];
    const indexByUUID = /* @__PURE__ */ new Map();
    function indexOfGroup(g) {
      const id = String((g == null ? void 0 : g.uuid) || "");
      if (!id)
        return -1;
      const v = indexByUUID.get(id);
      return typeof v === "number" ? v : -1;
    }
    function pushBone(g, pIdx, rootFlag) {
      bones.push(g);
      parentIndex.push(pIdx | 0);
      isRoot.push(rootFlag ? 1 : 0);
      const id = String((g == null ? void 0 : g.uuid) || "");
      if (id)
        indexByUUID.set(id, bones.length - 1);
      return bones.length - 1;
    }
    for (let ci = 0; ci < chains.length; ci++) {
      const chain = chains[ci];
      if (!Array.isArray(chain) || chain.length === 0)
        continue;
      const head = chain[0];
      const headUuid = String((head == null ? void 0 : head.uuid) || "");
      let realParent = null;
      try {
        const p = head == null ? void 0 : head.parent;
        if (p && p !== "root" && String(p.uuid || ""))
          realParent = p;
      } catch (e) {
        realParent = null;
      }
      let anchorIdx = -1;
      if (headUuid) {
        const anchor = {
          uuid: `__bbp_anchor_${headUuid}`,
          mesh: (realParent == null ? void 0 : realParent.mesh) || (head == null ? void 0 : head.mesh) || null,
          __bbp_anchor: true,
          __bbp_anchor_source: realParent || head,
          __bbp_anchor_fixed: !realParent
        };
        anchorIdx = indexOfGroup(anchor);
        if (anchorIdx < 0) {
          anchorIdx = pushBone(anchor, -1, true);
        }
      }
      chainStarts.push(bones.length);
      chainLengths.push(chain.length);
      for (let local = 0; local < chain.length; local++) {
        const g = chain[local];
        if (local === 0) {
          if (anchorIdx >= 0)
            pushBone(g, anchorIdx, false);
          else
            pushBone(g, -1, true);
          continue;
        }
        pushBone(g, bones.length - 1, false);
      }
    }
    return { bones, parentIndex, isRoot, chainStarts, chainLengths };
  }
  var init_chain_flatten = __esm({
    "src/chain_flatten.js"() {
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
  function v3normalizeLocal(v) {
    const l = v3len(v);
    if (l <= 1e-10)
      return [0, 1, 0];
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function computeOrientedCubeBoxLocal(group, cube) {
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
    const center0 = [(fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5];
    const pivot = readVec3Any(cube.origin) || center0;
    const cubeRotDeg = readVec3Any(cube.rotation);
    const center = applyCubeRotationToPoint(center0, cubeRotDeg, pivot);
    let ax = [1, 0, 0];
    let ay = [0, 1, 0];
    let az = [0, 0, 1];
    if (cubeRotDeg) {
      const m = m3fromEulerXYZDeg(cubeRotDeg);
      ax = v3normalizeLocal(m3mulV3(m, [1, 0, 0]));
      ay = v3normalizeLocal(m3mulV3(m, [0, 1, 0]));
      az = v3normalizeLocal(m3mulV3(m, [0, 0, 1]));
    }
    const half = [Math.max(0.05, dx * 0.5), Math.max(0.05, dy * 0.5), Math.max(0.05, dz * 0.5)];
    const go = readGroupOrigin(group);
    return {
      center: (
        /** @type {[number,number,number]} */
        [center[0] - go[0], center[1] - go[1], center[2] - go[2]]
      ),
      axes: (
        /** @type {any} */
        [ax, ay, az]
      ),
      half: (
        /** @type {[number,number,number]} */
        [half[0], half[1], half[2]]
      )
    };
  }
  function computeGroupApproxRadius(group) {
    if (!group)
      return 0;
    try {
      const cubes = collectCubesUnderGroup(group);
      let r = 0;
      for (const cube of cubes) {
        const obb = computeOrientedCubeBoxLocal(group, cube);
        if (!obb)
          continue;
        const half = obb.half;
        const rr = Math.max(0.05, Math.min(Number(half == null ? void 0 : half[0]) || 0, Number(half == null ? void 0 : half[1]) || 0, Number(half == null ? void 0 : half[2]) || 0));
        if (rr > r)
          r = rr;
      }
      if (r > 1e-6)
        return r;
    } catch (e) {
    }
    return 0.5;
  }
  function buildBoxDefsFromRoot(rootGroup) {
    const boxes = [];
    if (!rootGroup || !isOutlinerGroup(rootGroup))
      return boxes;
    const groups = collectGroupsDepthFirst(rootGroup);
    for (const g of groups) {
      if (!isBoneGroup(g) || !(g == null ? void 0 : g.uuid))
        continue;
      const cubes = collectCubesUnderGroup(g);
      for (const cube of cubes) {
        const cuuid = String((cube == null ? void 0 : cube.uuid) || "");
        if (!cuuid)
          continue;
        boxes.push({ group_uuid: String(g.uuid), cube_uuid: cuuid });
      }
    }
    return boxes;
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
  function computeBoxesWorldNow(boxDefs) {
    const out = [];
    if (!Array.isArray(boxDefs) || boxDefs.length === 0)
      return out;
    if (typeof THREE === "undefined" || !THREE)
      return out;
    for (const b of boxDefs) {
      const gNode = getNodeByUUID(b.group_uuid);
      if (!isOutlinerGroup(gNode))
        continue;
      const cNode = getNodeByUUID(b.cube_uuid);
      if (!isCubeLike(cNode))
        continue;
      try {
        if (!gNode.mesh)
          continue;
        const gPos = (
          /** @type {[number, number, number]} */
          computeGroupPivotWorldCurrentPose(gNode)
        );
        const q = gNode.mesh.getWorldQuaternion(new THREE.Quaternion());
        const local = computeOrientedCubeBoxLocal(gNode, cNode);
        if (!local)
          continue;
        const cOff = local.center;
        const cw = new THREE.Vector3(cOff[0], cOff[1], cOff[2]).applyQuaternion(q);
        const centerWorld = (
          /** @type {[number,number,number]} */
          [gPos[0] + cw.x, gPos[1] + cw.y, gPos[2] + cw.z]
        );
        const ax = new THREE.Vector3(local.axes[0][0], local.axes[0][1], local.axes[0][2]).applyQuaternion(q).normalize();
        const ay = new THREE.Vector3(local.axes[1][0], local.axes[1][1], local.axes[1][2]).applyQuaternion(q).normalize();
        const az = new THREE.Vector3(local.axes[2][0], local.axes[2][1], local.axes[2][2]).applyQuaternion(q).normalize();
        out.push({
          center: centerWorld,
          axes: (
            /** @type {any} */
            [
              [ax.x, ax.y, ax.z],
              [ay.x, ay.y, ay.z],
              [az.x, az.y, az.z]
            ]
          ),
          half: local.half
        });
      } catch (e) {
      }
    }
    return out;
  }
  function packBoxesWorldToF32(boxesWorld) {
    if (!Array.isArray(boxesWorld) || boxesWorld.length === 0)
      return new Float32Array(0);
    const out = new Float32Array(boxesWorld.length * 15);
    let o = 0;
    for (const b of boxesWorld) {
      const c = b == null ? void 0 : b.center;
      const axes = b == null ? void 0 : b.axes;
      const half = b == null ? void 0 : b.half;
      out[o++] = Number(c == null ? void 0 : c[0]) || 0;
      out[o++] = Number(c == null ? void 0 : c[1]) || 0;
      out[o++] = Number(c == null ? void 0 : c[2]) || 0;
      for (let i = 0; i < 3; i++) {
        const a = axes == null ? void 0 : axes[i];
        out[o++] = Number(a == null ? void 0 : a[0]) || 0;
        out[o++] = Number(a == null ? void 0 : a[1]) || 0;
        out[o++] = Number(a == null ? void 0 : a[2]) || 0;
      }
      out[o++] = Number(half == null ? void 0 : half[0]) || 0;
      out[o++] = Number(half == null ? void 0 : half[1]) || 0;
      out[o++] = Number(half == null ? void 0 : half[2]) || 0;
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

  // src/rapier_wasm_solver.js
  function align4(x) {
    return x + 3 & ~3;
  }
  var RapierWasmSolver;
  var init_rapier_wasm_solver = __esm({
    "src/rapier_wasm_solver.js"() {
      init_state();
      init_util();
      init_wasm();
      RapierWasmSolver = class {
        /**
         * @param {number} boneCount
         * @param {number} maxBoxCount
         * @param {number} maxClothLinkCount
         */
        constructor(boneCount, maxBoxCount, maxClothLinkCount = 0) {
          this.boneCount = Math.max(0, boneCount | 0);
          this.maxBoxCount = Math.max(0, maxBoxCount | 0);
          this.maxClothLinkCount = Math.max(0, maxClothLinkCount | 0);
          this.ptrBase = 0;
          this.memBuf = null;
          this.views = null;
        }
        async init() {
          await tryInitWasm();
          if (!state.wasm || !state.wasm.ok) {
            throw new Error("BBPhysic: 未能加载 WASM（Rapier 解算需要 bbphysic_wasm.wasm）");
          }
          const ex = state.wasm.exports;
          if (!ex || typeof ex.bbp_alloc !== "function" || typeof ex.bbp_rapier_step !== "function") {
            throw new Error("BBPhysic: WASM 导出缺失（需要 bbp_alloc + bbp_rapier_step）");
          }
          this.ensureViews();
        }
        ensureViews() {
          var _a;
          const n = this.boneCount;
          const m = this.maxBoxCount;
          const k = this.maxClothLinkCount;
          if (!state.wasm || !state.wasm.ok)
            return false;
          const mem = state.wasm.memory;
          if (!mem)
            return false;
          if (this.views && this.memBuf === mem.buffer && (((_a = mem.buffer) == null ? void 0 : _a.byteLength) || 0) > 0)
            return true;
          const bytesParent = n * 4;
          const bytesRoot = align4(n * 1);
          const bytesPos = 3 * n * 4;
          const bytesQuat = 4 * n * 4;
          const bytesLinVel = 3 * n * 4;
          const bytesAngVel = 3 * n * 4;
          const bytesTargetLocal = 3 * n * 4;
          const bytesRadius = n * 4;
          const bytesTargetWorldPos = 3 * n * 4;
          const bytesTargetWorldQuat = 4 * n * 4;
          const bytesClothLinks = 3 * k * 4;
          const bytesBoxes = 15 * m * 4;
          const bytesOutPos = 3 * n * 4;
          const bytesOutQuat = 4 * n * 4;
          const total = bytesParent + bytesRoot + bytesPos + bytesQuat + bytesLinVel + bytesAngVel + bytesTargetLocal + bytesRadius + bytesTargetWorldPos + bytesTargetWorldQuat + bytesClothLinks + bytesBoxes + bytesOutPos + bytesOutQuat;
          if (!this.ptrBase) {
            this.ptrBase = state.wasm.exports.bbp_alloc(total);
          }
          if (!this.ptrBase)
            return false;
          let buf = mem.buffer;
          if (!buf || (buf.byteLength || 0) === 0) {
            buf = mem.buffer;
          }
          if (!buf || (buf.byteLength || 0) === 0)
            return false;
          let p = this.ptrBase;
          this.memBuf = buf;
          let parent;
          let root;
          let worldPos;
          let worldQuat;
          let linvel;
          let angvel;
          let targetLocal;
          let radius;
          let targetWorldPos;
          let targetWorldQuat;
          let clothLinks;
          let boxes;
          let outWorldPos;
          let outWorldQuat;
          try {
            parent = new Int32Array(buf, p, n);
            p += bytesParent;
            root = new Uint8Array(buf, p, n);
            p += bytesRoot;
            p = align4(p);
            worldPos = new Float32Array(buf, p, 3 * n);
            p += bytesPos;
            worldQuat = new Float32Array(buf, p, 4 * n);
            p += bytesQuat;
            linvel = new Float32Array(buf, p, 3 * n);
            p += bytesLinVel;
            angvel = new Float32Array(buf, p, 3 * n);
            p += bytesAngVel;
            targetLocal = new Float32Array(buf, p, 3 * n);
            p += bytesTargetLocal;
            radius = new Float32Array(buf, p, n);
            p += bytesRadius;
            targetWorldPos = new Float32Array(buf, p, 3 * n);
            p += bytesTargetWorldPos;
            targetWorldQuat = new Float32Array(buf, p, 4 * n);
            p += bytesTargetWorldQuat;
            clothLinks = new Float32Array(buf, p, 3 * k);
            p += bytesClothLinks;
            boxes = new Float32Array(buf, p, 15 * m);
            p += bytesBoxes;
            outWorldPos = new Float32Array(buf, p, 3 * n);
            p += bytesOutPos;
            outWorldQuat = new Float32Array(buf, p, 4 * n);
            p += bytesOutQuat;
          } catch (e) {
            try {
              buf = mem.buffer;
              if (!buf || (buf.byteLength || 0) === 0)
                return false;
              p = this.ptrBase;
              this.memBuf = buf;
              parent = new Int32Array(buf, p, n);
              p += bytesParent;
              root = new Uint8Array(buf, p, n);
              p += bytesRoot;
              p = align4(p);
              worldPos = new Float32Array(buf, p, 3 * n);
              p += bytesPos;
              worldQuat = new Float32Array(buf, p, 4 * n);
              p += bytesQuat;
              linvel = new Float32Array(buf, p, 3 * n);
              p += bytesLinVel;
              angvel = new Float32Array(buf, p, 3 * n);
              p += bytesAngVel;
              targetLocal = new Float32Array(buf, p, 3 * n);
              p += bytesTargetLocal;
              radius = new Float32Array(buf, p, n);
              p += bytesRadius;
              targetWorldPos = new Float32Array(buf, p, 3 * n);
              p += bytesTargetWorldPos;
              targetWorldQuat = new Float32Array(buf, p, 4 * n);
              p += bytesTargetWorldQuat;
              clothLinks = new Float32Array(buf, p, 3 * k);
              p += bytesClothLinks;
              boxes = new Float32Array(buf, p, 15 * m);
              p += bytesBoxes;
              outWorldPos = new Float32Array(buf, p, 3 * n);
              p += bytesOutPos;
              outWorldQuat = new Float32Array(buf, p, 4 * n);
              p += bytesOutQuat;
            } catch (e2) {
              return false;
            }
          }
          this.views = {
            parent,
            root,
            worldPos,
            worldQuat,
            linvel,
            angvel,
            targetLocal,
            radius,
            targetWorldPos,
            targetWorldQuat,
            clothLinks,
            boxes,
            outWorldPos,
            outWorldQuat
          };
          return true;
        }
        /**
         * @param {{dt:number, substeps:number, gravityY:number, linDamping:number, angDamping:number, airDrag?:number, inertiaScale?:number, targetSelfCollision?:boolean, motorStiffness:number, motorDamping:number, clothLinkCount?:number, boxCount:number}} params
         */
        step(params) {
          if (!this.ensureViews())
            throw new Error("BBPhysic: WASM 内存视图初始化失败");
          try {
            const ex = state.wasm.exports;
            const v = this.views;
            const ret = ex.bbp_rapier_step(
              this.boneCount,
              Number(params.dt) || 0,
              Math.max(1, Math.min(32, Math.round(Number(params.substeps) || 1))),
              Number(params.gravityY) || 0,
              Number(params.linDamping) || 0,
              Number(params.angDamping) || 0,
              Number(params.motorStiffness) || 0,
              Number(params.motorDamping) || 0,
              Math.max(0, Number(params.airDrag) || 0),
              Math.max(0, Number(params.inertiaScale) || 0),
              params.targetSelfCollision ? 1 : 0,
              Math.max(0, Math.min(this.maxClothLinkCount, Math.round(Number(params.clothLinkCount) || 0))),
              v.clothLinks.byteOffset,
              v.parent.byteOffset,
              v.root.byteOffset,
              v.worldPos.byteOffset,
              v.worldQuat.byteOffset,
              v.linvel.byteOffset,
              v.angvel.byteOffset,
              v.targetLocal.byteOffset,
              v.radius.byteOffset,
              v.targetWorldPos.byteOffset,
              v.targetWorldQuat.byteOffset,
              Math.max(0, Math.min(this.maxBoxCount, Math.round(Number(params.boxCount) || 0))),
              v.boxes.byteOffset,
              v.outWorldPos.byteOffset,
              v.outWorldQuat.byteOffset
            );
            if (!this.ensureViews())
              throw new Error("BBPhysic: WASM 内存视图刷新失败");
            return ret;
          } catch (e) {
            debugWarn("bbp_rapier_step 调用失败", e);
            throw e;
          }
        }
      };
    }
  });

  // src/bake.js
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
  function getGroupsByUUIDs(uuids) {
    const out = [];
    if (!Array.isArray(uuids) || uuids.length === 0)
      return out;
    for (const u of uuids) {
      const g = getGroupByUUID(String(u || ""));
      if (g)
        out.push(g);
    }
    return out;
  }
  async function bakeToKeyframes(opts) {
    var _a, _b, _c, _d, _e, _f, _g;
    const animation = getSelectedAnimation();
    if (!animation) {
      showMessage("BBPhysic", "请先在动画面板选择一个动画，再执行 Bake。");
      return;
    }
    const targetRoot = state.config.target_root_uuid ? getGroupByUUID(state.config.target_root_uuid) : null;
    if (!targetRoot) {
      showMessage("BBPhysic", "未找到被解算根组件（请先完成第二次解算：选择被解算物理部件）。");
      return;
    }
    let roots = [targetRoot];
    if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
      const captured = getGroupsByUUIDs(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
      if (captured.length)
        roots = captured;
    }
    const chains = roots.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth)).filter((c) => Array.isArray(c) && c.length);
    if (!chains.length) {
      showMessage("BBPhysic", "未能从所选根骨骼构建出骨骼链。");
      return;
    }
    const flat = flattenChainsWithParentAnchors(chains);
    const bones = flat.bones;
    const chainStarts = flat.chainStarts;
    const chainLengths = flat.chainLengths;
    const fps = Math.round(clampNumber(opts.fps, 1, 120, state.config.bake_fps));
    const dt = 1 / fps;
    const animEnd = Math.max(0, Number(animation.length) || 0);
    const start = clampNumber(opts.start, 0, animEnd, 0);
    const end = clampNumber(opts.end, 0, animEnd, animEnd);
    if (!(end > start)) {
      showMessage("BBPhysic", "时间区间无效：end 必须大于 start。");
      return;
    }
    const anchorEnabled = Boolean(opts.anchor_enabled);
    const anchorTimeClamped = clampNumber((_a = opts.anchor_time) != null ? _a : start, start, end, start);
    const axisIndex = opts.axis === "x" ? 0 : opts.axis === "y" ? 1 : 2;
    const logFrames = Math.max(0, Math.min(60, Math.round(Number(state.config.debug_log_frames) || 0)));
    const shouldLog = (frameIndex) => state.config.debug_logging && frameIndex < logFrames;
    const nearZero = (x) => Math.abs(Number(x) || 0) < 1e-6;
    const allNearZero = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v2) => nearZero(v2));
    if (typeof THREE === "undefined" || !THREE) {
      showMessage("BBPhysic", "Bake 需要 THREE（Blockbench 场景未就绪）。");
      return;
    }
    function readWorldPose3(group, outPos3, outQuat4) {
      try {
        if ((group == null ? void 0 : group.__bbp_anchor) && group.__bbp_anchor_source) {
          const isFixed = Boolean(group.__bbp_anchor_fixed);
          if (isFixed) {
            const cachedP = group.__bbp_anchor_cached_pos;
            const cachedQ = group.__bbp_anchor_cached_quat;
            if (Array.isArray(cachedP) && cachedP.length === 3 && Array.isArray(cachedQ) && cachedQ.length === 4) {
              outPos3[0] = cachedP[0];
              outPos3[1] = cachedP[1];
              outPos3[2] = cachedP[2];
              outQuat4[0] = cachedQ[0];
              outQuat4[1] = cachedQ[1];
              outQuat4[2] = cachedQ[2];
              outQuat4[3] = cachedQ[3];
              return true;
            }
          }
          const src = group.__bbp_anchor_source;
          if (src && src !== group) {
            const p = [0, 0, 0];
            const q = [0, 0, 0, 1];
            if (readWorldPose3(src, p, q)) {
              if (isFixed) {
                group.__bbp_anchor_cached_pos = [p[0], p[1], p[2]];
                group.__bbp_anchor_cached_quat = [q[0], q[1], q[2], q[3]];
              }
              outPos3[0] = p[0];
              outPos3[1] = p[1];
              outPos3[2] = p[2];
              outQuat4[0] = q[0];
              outQuat4[1] = q[1];
              outQuat4[2] = q[2];
              outQuat4[3] = q[3];
              return true;
            }
          }
        }
        const mesh = group == null ? void 0 : group.mesh;
        if (mesh && typeof mesh.getWorldPosition === "function" && typeof mesh.getWorldQuaternion === "function") {
          const v3 = state.tmpThreeVec3 || (state.tmpThreeVec3 = new THREE.Vector3());
          const q4 = state.tmpThreeQuat || (state.tmpThreeQuat = new THREE.Quaternion());
          mesh.getWorldPosition(v3);
          mesh.getWorldQuaternion(q4);
          outPos3[0] = v3.x;
          outPos3[1] = v3.y;
          outPos3[2] = v3.z;
          outQuat4[0] = q4.x;
          outQuat4[1] = q4.y;
          outQuat4[2] = q4.z;
          outQuat4[3] = q4.w;
          return true;
        }
      } catch (e) {
      }
      return false;
    }
    const parentIndex = flat.parentIndex;
    const isRoot = flat.isRoot;
    const times = [];
    const targetRotations = [];
    const targetWorldPosPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
    const targetWorldQuatPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
    const movingBoxesPackedPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
    const prevTime = typeof Timeline !== "undefined" && Timeline ? Timeline.time : 0;
    const movingRoot = state.config.moving_root_uuid ? getGroupByUUID(state.config.moving_root_uuid) : null;
    const movingBoxDefs = state.config.collision_enabled && movingRoot ? buildBoxDefsFromRoot(movingRoot) : [];
    if (state.config.collision_enabled && (!movingRoot || movingBoxDefs.length === 0)) {
      debugWarn("已启用碰撞，但未生成运动物件 OBB 盒（请先完成第一次解算：选择运动物件）。本次 Bake 将不会执行碰撞。");
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
        {
          const pos = new Float32Array(3 * bones.length);
          const quat = new Float32Array(4 * bones.length);
          for (let b = 0; b < bones.length; b++) {
            if (!isRoot[b])
              continue;
            const p = [0, 0, 0];
            const q = [0, 0, 0, 1];
            readWorldPose3(bones[b], p, q);
            pos[b * 3 + 0] = p[0];
            pos[b * 3 + 1] = p[1];
            pos[b * 3 + 2] = p[2];
            quat[b * 4 + 0] = q[0];
            quat[b * 4 + 1] = q[1];
            quat[b * 4 + 2] = q[2];
            quat[b * 4 + 3] = q[3];
          }
          targetWorldPosPerFrame[frameIndex] = pos;
          targetWorldQuatPerFrame[frameIndex] = quat;
        }
        if (shouldLog(frameIndex)) {
          const b0 = bones[0];
          let meshRotDeg = null;
          try {
            const mr = (_b = b0 == null ? void 0 : b0.mesh) == null ? void 0 : _b.rotation;
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
            bone0_axis_deg: (_c = frameRot[0]) == null ? void 0 : _c[axisIndex]
          });
        }
        if (state.config.collision_enabled && movingBoxDefs.length) {
          const w = computeBoxesWorldNow(movingBoxDefs);
          movingBoxesPackedPerFrame[frameIndex] = packBoxesWorldToF32(w);
        } else {
          movingBoxesPackedPerFrame[frameIndex] = new Float32Array(0);
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
        const firstAxis = (_d = targetRotations == null ? void 0 : targetRotations[0]) == null ? void 0 : _d.map((r) => r[axisIndex]);
        if (Array.isArray(firstAxis) && allNearZero(firstAxis)) {
          debugWarn("采样得到的 axis 角全为 0（或接近 0）。这通常表示预览姿态没有刷新、骨骼没有旋转通道、或读取姿态来源不对。", {
            axis: opts.axis,
            boneCount: bones.length,
            collision_enabled: state.config.collision_enabled
          });
        }
      } catch (e) {
      }
    }
    let anchorIndex = 0;
    if (anchorEnabled) {
      let bestI = 0;
      let bestAbs = Infinity;
      for (let i = 0; i < times.length; i++) {
        const d = Math.abs((times[i] || 0) - anchorTimeClamped);
        if (d < bestAbs) {
          bestAbs = d;
          bestI = i;
        }
      }
      anchorIndex = bestI;
    }
    const clothLinkCount = Boolean(state.config.cloth_enabled) && chains.length >= 2 ? chains.length : 0;
    const rapier = new RapierWasmSolver(bones.length, movingBoxDefs.length, clothLinkCount);
    try {
      await rapier.init();
    } catch (e) {
      showMessage("BBPhysic", String((e == null ? void 0 : e.message) || e || "WASM 初始化失败"));
      return;
    }
    let v = rapier.views;
    for (let i = 0; i < bones.length; i++) {
      v.parent[i] = parentIndex[i] | 0;
      v.root[i] = isRoot[i] ? 1 : 0;
      v.radius[i] = Math.max(0, Number(computeGroupApproxRadius(bones[i])) || 0);
      v.linvel[i * 3 + 0] = 0;
      v.linvel[i * 3 + 1] = 0;
      v.linvel[i * 3 + 2] = 0;
      v.angvel[i * 3 + 0] = 0;
      v.angvel[i * 3 + 1] = 0;
      v.angvel[i * 3 + 2] = 0;
    }
    try {
      const tAnchor = (_e = times[anchorIndex]) != null ? _e : times[0];
      if (typeof Timeline !== "undefined" && Timeline && typeof Timeline.setTime === "function") {
        Timeline.setTime(tAnchor, true);
      }
      if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
        Animator.preview(true);
      }
      for (let b = 0; b < bones.length; b++) {
        const p = [0, 0, 0];
        const q = [0, 0, 0, 1];
        readWorldPose3(bones[b], p, q);
        v.worldPos[b * 3 + 0] = p[0];
        v.worldPos[b * 3 + 1] = p[1];
        v.worldPos[b * 3 + 2] = p[2];
        v.worldQuat[b * 4 + 0] = q[0];
        v.worldQuat[b * 4 + 1] = q[1];
        v.worldQuat[b * 4 + 2] = q[2];
        v.worldQuat[b * 4 + 3] = q[3];
        v.targetWorldPos[b * 3 + 0] = p[0];
        v.targetWorldPos[b * 3 + 1] = p[1];
        v.targetWorldPos[b * 3 + 2] = p[2];
        v.targetWorldQuat[b * 4 + 0] = q[0];
        v.targetWorldQuat[b * 4 + 1] = q[1];
        v.targetWorldQuat[b * 4 + 2] = q[2];
        v.targetWorldQuat[b * 4 + 3] = q[3];
      }
    } catch (e) {
    }
    if (clothLinkCount > 0 && v.clothLinks && v.clothLinks.length >= 3 * clothLinkCount) {
      for (let ci = 0; ci < chains.length; ci++) {
        const aIdx = chainStarts[ci] + chainLengths[ci] - 1;
        const ni = (ci + 1) % chains.length;
        const bIdx = chainStarts[ni] + chainLengths[ni] - 1;
        const ax = v.worldPos[aIdx * 3 + 0];
        const ay = v.worldPos[aIdx * 3 + 1];
        const az = v.worldPos[aIdx * 3 + 2];
        const bx = v.worldPos[bIdx * 3 + 0];
        const by = v.worldPos[bIdx * 3 + 1];
        const bz = v.worldPos[bIdx * 3 + 2];
        const dx = ax - bx;
        const dy = ay - by;
        const dz = az - bz;
        const rest = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz));
        v.clothLinks[ci * 3 + 0] = aIdx;
        v.clothLinks[ci * 3 + 1] = bIdx;
        v.clothLinks[ci * 3 + 2] = rest;
      }
    }
    const solvedRotationsPerFrame = new Array(times.length);
    async function runPass(indices) {
      const qParent = new THREE.Quaternion();
      const qChild = new THREE.Quaternion();
      const qLocal = new THREE.Quaternion();
      const euler = new THREE.Euler(0, 0, 0, "XYZ");
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        rapier.ensureViews();
        v = rapier.views;
        const baseRotFrame = targetRotations[i];
        for (let b = 0; b < bones.length; b++) {
          v.targetLocal[b * 3 + 0] = degToRad(baseRotFrame[b][0]);
          v.targetLocal[b * 3 + 1] = degToRad(baseRotFrame[b][1]);
          v.targetLocal[b * 3 + 2] = degToRad(baseRotFrame[b][2]);
        }
        const pos = targetWorldPosPerFrame[i];
        const quat = targetWorldQuatPerFrame[i];
        if (pos && quat) {
          for (let b = 0; b < bones.length; b++) {
            if (!isRoot[b])
              continue;
            v.targetWorldPos[b * 3 + 0] = pos[b * 3 + 0];
            v.targetWorldPos[b * 3 + 1] = pos[b * 3 + 1];
            v.targetWorldPos[b * 3 + 2] = pos[b * 3 + 2];
            v.targetWorldQuat[b * 4 + 0] = quat[b * 4 + 0];
            v.targetWorldQuat[b * 4 + 1] = quat[b * 4 + 1];
            v.targetWorldQuat[b * 4 + 2] = quat[b * 4 + 2];
            v.targetWorldQuat[b * 4 + 3] = quat[b * 4 + 3];
          }
        }
        let boxCount = 0;
        if (state.config.collision_enabled && movingBoxDefs.length) {
          const packed = movingBoxesPackedPerFrame[i] || new Float32Array(0);
          boxCount = Math.min(movingBoxDefs.length, Math.floor(packed.length / 15));
          v.boxes.set(packed.subarray(0, 15 * boxCount));
        }
        rapier.step({
          dt,
          substeps: Math.max(1, Math.min(32, Math.round(Number(state.config.collision_iterations) || 4))),
          gravityY: Number(state.config.gravity_y) || -9.81,
          linDamping: Math.max(0, Number(state.config.lin_damping) || 0),
          angDamping: Math.max(0, Number(state.config.ang_damping) || 0),
          airDrag: Math.max(0, Number(state.config.air_drag) || 0),
          inertiaScale: state.config.inertia_enabled ? Math.max(0, Math.min(5, Number(state.config.inertia_scale) || 1)) : 0,
          motorStiffness: Math.max(0, Number(state.config.follow_strength) || 0),
          motorDamping: Math.max(0, Number(state.config.follow_damping) || 0),
          targetSelfCollision: Boolean(state.config.target_self_collision),
          clothLinkCount,
          boxCount
        });
        v = rapier.views;
        v.worldPos.set(v.outWorldPos);
        v.worldQuat.set(v.outWorldQuat);
        const outRot = baseRotFrame.map((r) => [r[0], r[1], r[2]]);
        for (let b = 0; b < bones.length; b++) {
          const pIdx = parentIndex[b] | 0;
          if (pIdx < 0)
            continue;
          qParent.set(v.worldQuat[pIdx * 4 + 0], v.worldQuat[pIdx * 4 + 1], v.worldQuat[pIdx * 4 + 2], v.worldQuat[pIdx * 4 + 3]);
          qChild.set(v.worldQuat[b * 4 + 0], v.worldQuat[b * 4 + 1], v.worldQuat[b * 4 + 2], v.worldQuat[b * 4 + 3]);
          qLocal.copy(qParent).invert().multiply(qChild);
          euler.setFromQuaternion(qLocal, "XYZ");
          outRot[b] = [radToDeg(euler.x), radToDeg(euler.y), radToDeg(euler.z)];
        }
        solvedRotationsPerFrame[i] = outRot;
        if (i % 30 === 0)
          await sleep0();
      }
    }
    if (anchorEnabled) {
      const forward = [];
      for (let i = anchorIndex; i < times.length; i++)
        forward.push(i);
      await runPass(forward);
      try {
        for (let b = 0; b < bones.length; b++) {
          v.linvel[b * 3 + 0] = 0;
          v.linvel[b * 3 + 1] = 0;
          v.linvel[b * 3 + 2] = 0;
          v.angvel[b * 3 + 0] = 0;
          v.angvel[b * 3 + 1] = 0;
          v.angvel[b * 3 + 2] = 0;
        }
        const tAnchor = (_f = times[anchorIndex]) != null ? _f : times[0];
        if (typeof Timeline !== "undefined" && Timeline && typeof Timeline.setTime === "function") {
          Timeline.setTime(tAnchor, true);
        }
        if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
          Animator.preview(true);
        }
        for (let b = 0; b < bones.length; b++) {
          const p = [0, 0, 0];
          const q = [0, 0, 0, 1];
          readWorldPose3(bones[b], p, q);
          v.worldPos[b * 3 + 0] = p[0];
          v.worldPos[b * 3 + 1] = p[1];
          v.worldPos[b * 3 + 2] = p[2];
          v.worldQuat[b * 4 + 0] = q[0];
          v.worldQuat[b * 4 + 1] = q[1];
          v.worldQuat[b * 4 + 2] = q[2];
          v.worldQuat[b * 4 + 3] = q[3];
        }
      } catch (e) {
      }
      const backward = [];
      for (let i = anchorIndex - 1; i >= 0; i--)
        backward.push(i);
      await runPass(backward);
    } else {
      const forward = [];
      for (let i = 0; i < times.length; i++)
        forward.push(i);
      await runPass(forward);
    }
    const createdKeyframes = [];
    Undo.initEdit({ animations: [animation] });
    try {
      notify("BBPhysic: 写入关键帧...", 2e3);
      for (let i = 0; i < times.length; i++) {
        const outRot = solvedRotationsPerFrame[i] || targetRotations[i];
        for (let b = 0; b < bones.length; b++) {
          if ((_g = bones[b]) == null ? void 0 : _g.__bbp_anchor)
            continue;
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
      init_chains();
      init_chain_flatten();
      init_math();
      init_capsules();
      init_rapier_wasm_solver();
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
  function openStep1MovingObjectDialog() {
    const options = getGroupOptionsForDialog();
    const dialog = new Dialog("bbphysic_step1_moving", {
      title: "BBPhysic 第一次解算：选择运动物件（生成碰撞体）",
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
        const root = uuid ? getGroupByUUID2(uuid) : null;
        if (!root) {
          showMessage("BBPhysic", "请选择一个有效的运动物件根组件（Group）。");
          return;
        }
        state.config.moving_root_uuid = uuid;
        state.solveSetup.movingRoot = root;
        state.solveSetup.movingBoxes = buildBoxDefsFromRoot(root);
        saveConfigToStorage();
        showMessage("BBPhysic", `已生成运动物件碰撞体（OBB）：${state.solveSetup.movingBoxes.length} 个`);
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
        },
        cloth_capture_selected: {
          label: "将当前选中的根骨骼保存为“布料组”（多条链互相弹性连接）",
          type: "checkbox",
          value: Boolean(state.config.cloth_enabled)
        }
      },
      onConfirm(formResult) {
        const uuid = String(formResult.target_root_uuid || "");
        const root = uuid ? getGroupByUUID2(uuid) : null;
        if (!root) {
          showMessage("BBPhysic", "请选择一个有效的被解算根组件（Group）。");
          return;
        }
        state.config.target_root_uuid = uuid;
        state.solveSetup.targetRoot = root;
        state.solveSetup.targetBoxes = buildBoxDefsFromRoot(root);
        state.solveSetup.targetAabb = computePivotAabbWorld(root);
        state.config.cloth_enabled = Boolean(state.config.cloth_enabled) || Boolean(formResult.cloth_capture_selected);
        if (Boolean(state.config.cloth_enabled) && Boolean(formResult.cloth_capture_selected)) {
          try {
            const roots = getSelectedRootGroups();
            state.config.cloth_roots_uuids = Array.isArray(roots) ? roots.map((g) => String((g == null ? void 0 : g.uuid) || "")).filter((s) => s) : [];
          } catch (e) {
            state.config.cloth_roots_uuids = [];
          }
        }
        saveConfigToStorage();
        const aabb = state.solveSetup.targetAabb;
        showMessage(
          "BBPhysic",
          `已计算被解算部件体积（pivot AABB）：中心(${aabb.center.map((v) => v.toFixed(2)).join(", ")})，尺寸(${aabb.size.map((v) => v.toFixed(2)).join(", ")})，节点数 ${aabb.count}`
        );
      }
    });
    dialog.show();
  }
  function openSettingsBasicDialog() {
    const dialog = new Dialog("bbphysic_settings_basic", {
      title: "BBPhysic 设置 / 基础",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        solve_scope: {
          label: "解算范围",
          type: "select",
          value: state.config.solve_scope,
          options: { selected: "仅选中的根骨骼", all_roots: "所有根骨骼（全模型）" }
        },
        max_chain_depth: { label: "链条最大深度", type: "number", value: state.config.max_chain_depth, min: 1, max: 128, step: 1 },
        preview_fps: { label: "预览帧率 (fps)", type: "number", value: state.config.preview_fps, min: 1, max: 120, step: 1 },
        bake_fps: { label: "Bake 采样帧率 (fps)", type: "number", value: state.config.bake_fps, min: 1, max: 120, step: 1 }
      },
      onConfirm(formResult) {
        var _a;
        const scopeRaw = String((_a = formResult.solve_scope) != null ? _a : state.config.solve_scope);
        const solve_scope = scopeRaw === "all_roots" ? "all_roots" : "selected";
        state.config = {
          ...state.config,
          solve_scope,
          max_chain_depth: Math.round(clampNumber(formResult.max_chain_depth, 1, 128, state.config.max_chain_depth)),
          preview_fps: Math.round(clampNumber(formResult.preview_fps, 1, 120, state.config.preview_fps)),
          bake_fps: Math.round(clampNumber(formResult.bake_fps, 1, 120, state.config.bake_fps))
        };
        saveConfigToStorage();
        showMessage("BBPhysic", "设置已保存（基础）。");
      }
    });
    dialog.show();
  }
  function openSettingsPhysicsDialog() {
    const dialog = new Dialog("bbphysic_settings_physics", {
      title: "BBPhysic 设置 / 物理（Rapier）",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        follow_strength: { label: "电机刚度 (stiffness)", type: "number", value: state.config.follow_strength, min: 0, max: 5e3, step: 1 },
        follow_damping: { label: "电机阻尼 (damping)", type: "number", value: state.config.follow_damping, min: 0, max: 2e3, step: 1 },
        gravity_y: { label: "重力 Y (m/s^2)", type: "number", value: state.config.gravity_y, min: -200, max: 200, step: 0.1 },
        lin_damping: { label: "线阻尼", type: "number", value: state.config.lin_damping, min: 0, max: 50, step: 0.1 },
        ang_damping: { label: "角阻尼", type: "number", value: state.config.ang_damping, min: 0, max: 50, step: 0.1 },
        collision_iterations: { label: "子步数 (substeps)", type: "number", value: state.config.collision_iterations, min: 1, max: 32, step: 1 }
      },
      onConfirm(formResult) {
        state.config = {
          ...state.config,
          follow_strength: clampNumber(formResult.follow_strength, 0, 5e3, state.config.follow_strength),
          follow_damping: clampNumber(formResult.follow_damping, 0, 2e3, state.config.follow_damping),
          gravity_y: clampNumber(formResult.gravity_y, -200, 200, state.config.gravity_y),
          lin_damping: clampNumber(formResult.lin_damping, 0, 50, state.config.lin_damping),
          ang_damping: clampNumber(formResult.ang_damping, 0, 50, state.config.ang_damping),
          collision_iterations: Math.round(clampNumber(formResult.collision_iterations, 1, 32, state.config.collision_iterations))
        };
        saveConfigToStorage();
        state.wasmInitTried = false;
        state.wasm = null;
        tryInitWasm();
        showMessage("BBPhysic", "设置已保存（物理）。");
      }
    });
    dialog.show();
  }
  function openSettingsCollisionDialog() {
    const dialog = new Dialog("bbphysic_settings_collision", {
      title: "BBPhysic 设置 / 碰撞（OBB）",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        collision_enabled: { label: "启用碰撞（仅 OBB）", type: "checkbox", value: Boolean(state.config.collision_enabled) }
      },
      onConfirm(formResult) {
        state.config = { ...state.config, collision_enabled: Boolean(formResult.collision_enabled) };
        saveConfigToStorage();
        showMessage("BBPhysic", "设置已保存（碰撞）。");
      }
    });
    dialog.show();
  }
  function openSettingsClothDialog() {
    const dialog = new Dialog("bbphysic_settings_cloth", {
      title: "BBPhysic 设置 / 布料组（Tip Ring）",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        cloth_enabled: { label: "启用布料组（多条链末端环连接）", type: "checkbox", value: Boolean(state.config.cloth_enabled) }
      },
      onConfirm(formResult) {
        state.config = { ...state.config, cloth_enabled: Boolean(formResult.cloth_enabled) };
        saveConfigToStorage();
        showMessage("BBPhysic", "设置已保存（布料组）。");
      }
    });
    dialog.show();
  }
  function openSettingsDebugDialog() {
    const dialog = new Dialog("bbphysic_settings_debug", {
      title: "BBPhysic 设置 / 调试",
      buttons: ["保存", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        debug_logging: { label: "输出调试日志（控制台）", type: "checkbox", value: Boolean(state.config.debug_logging) },
        debug_log_frames: { label: "调试输出帧数", type: "number", value: state.config.debug_log_frames, min: 0, max: 60, step: 1 }
      },
      onConfirm(formResult) {
        state.config = {
          ...state.config,
          debug_logging: Boolean(formResult.debug_logging),
          debug_log_frames: Math.round(clampNumber(formResult.debug_log_frames, 0, 60, state.config.debug_log_frames))
        };
        saveConfigToStorage();
        showMessage("BBPhysic", "设置已保存（调试）。");
      }
    });
    dialog.show();
  }
  function openSettingsDialogLegacy() {
    const dialog = new Dialog("bbphysic_settings", {
      title: "BBPhysic 设置",
      buttons: ["打开", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        category: {
          label: "类别",
          type: "select",
          value: "basic",
          options: {
            basic: "基础",
            physics: "物理（Rapier）",
            collision: "碰撞（OBB）",
            cloth: "布料组（Tip Ring）",
            debug: "调试"
          }
        }
      },
      onConfirm(formResult) {
        const c = String(formResult.category || "basic");
        if (c === "physics")
          return openSettingsPhysicsDialog();
        if (c === "collision")
          return openSettingsCollisionDialog();
        if (c === "cloth")
          return openSettingsClothDialog();
        if (c === "debug")
          return openSettingsDebugDialog();
        return openSettingsBasicDialog();
      }
    });
    dialog.show();
  }
  function openSettingsDialog() {
    try {
      const html = String.raw`<style>
			#bbp_settings_root{display:flex;gap:12px;width:860px;max-width:100%;min-width:0;box-sizing:border-box;}
			#bbp_settings_nav{display:flex;flex-direction:column;gap:6px;flex:0 0 180px;min-width:140px;}
			#bbp_settings_nav button{width:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
			#bbp_settings_panels{flex:1 1 auto;min-width:0;}
			#bbp_settings_root input[type="number"],
			#bbp_settings_root select{
				color: inherit;
				background: rgba(255,255,255,0.06);
				border: 1px solid rgba(255,255,255,0.18);
				border-radius: 4px;
				padding: 6px 8px;
				box-sizing: border-box;
			}
			#bbp_settings_root input[type="number"]:focus,
			#bbp_settings_root select:focus{
				outline: 1px solid rgba(255,255,255,0.35);
				outline-offset: 1px;
			}
			#bbp_settings_root input[type="checkbox"]{
				accent-color: rgba(255,255,255,0.65);
			}
			.bbp_settings_panel{display:none;}
			.bbp_settings_panel[data-active="1"]{display:block;}
			.bbp_settings_section_title{margin:0 0 8px 0;font-weight:600;}
			.bbp_settings_field{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;}
			.bbp_settings_field label{flex:1 1 auto;}
			.bbp_settings_field input[type="number"],
			.bbp_settings_field select{flex:0 0 220px;max-width:260px;min-width:0;}
			/* number input + reset button group */
			.bbp_num_group{flex:0 0 260px;display:flex;align-items:center;gap:6px;max-width:320px;min-width:0;}
			.bbp_num_group input[type="number"]{flex:1 1 auto;min-width:0;}
			.bbp_reset_btn{flex:0 0 auto;padding:4px 8px;font-size:12px;cursor:pointer;
				background: rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:4px;color:inherit;}
			.bbp_reset_btn:hover{background: rgba(255,255,255,0.14);} 
			.bbp_settings_hint{opacity:0.8;font-size:0.95em;line-height:1.4;margin:6px 0 0 0;}
		</style>
		<div id="bbp_settings_root">
			<div id="bbp_settings_nav">
				<button type="button" data-page="basic">基础</button>
				<button type="button" data-page="physics">物理（Rapier）</button>
				<button type="button" data-page="collision">碰撞（OBB）</button>
				<button type="button" data-page="cloth">布料组（Tip Ring）</button>
				<button type="button" data-page="debug">调试</button>
			</div>
			<div id="bbp_settings_panels">
				<div class="bbp_settings_panel" data-page="basic">
					<div class="bbp_settings_section_title">基础</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_solve_scope">解算范围</label>
						<select id="bbp_cfg_solve_scope">
							<option value="selected">仅选中的根骨骼</option>
							<option value="all_roots">所有根骨骼（全模型）</option>
						</select>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_max_chain_depth">链条最大深度</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_max_chain_depth" type="number" min="1" max="128" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_max_chain_depth">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_preview_fps">预览帧率 (fps)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_preview_fps" type="number" min="1" max="120" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_preview_fps">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_bake_fps">Bake 采样帧率 (fps)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_bake_fps" type="number" min="1" max="120" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_bake_fps">恢复默认</button>
						</div>
					</div>
				</div>

				<div class="bbp_settings_panel" data-page="physics">
					<div class="bbp_settings_section_title">物理（Rapier）</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_follow_strength">电机刚度 (stiffness)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_follow_strength" type="number" min="0" max="5000" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_follow_strength">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_follow_damping">电机阻尼 (damping)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_follow_damping" type="number" min="0" max="2000" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_follow_damping">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_gravity_y">重力 Y (m/s^2)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_gravity_y" type="number" min="-200" max="200" step="0.1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_gravity_y">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_lin_damping">线阻尼</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_lin_damping" type="number" min="0" max="50" step="0.1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_lin_damping">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_ang_damping">角阻尼</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_ang_damping" type="number" min="0" max="50" step="0.1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_ang_damping">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_air_drag">空气阻力</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_air_drag" type="number" min="0" max="50" step="0.1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_air_drag">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_inertia_enabled">启用惯性</label>
						<input id="bbp_cfg_inertia_enabled" type="checkbox" />
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_inertia_scale">惯性系数</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_inertia_scale" type="number" min="0" max="5" step="0.05" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_inertia_scale">恢复默认</button>
						</div>
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_collision_iterations">子步数 (substeps)</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_collision_iterations" type="number" min="1" max="32" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_collision_iterations">恢复默认</button>
						</div>
					</div>
					<p class="bbp_settings_hint">提示：这些参数会在 Preview/Bake 每帧传给 Rapier/WASM，不需要重启。</p>
				</div>

				<div class="bbp_settings_panel" data-page="collision">
					<div class="bbp_settings_section_title">碰撞（OBB）</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_collision_enabled">启用碰撞（仅 OBB）</label>
						<input id="bbp_cfg_collision_enabled" type="checkbox" />
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_target_self_collision">被解算部件内自碰撞</label>
						<input id="bbp_cfg_target_self_collision" type="checkbox" />
					</div>
				</div>

				<div class="bbp_settings_panel" data-page="cloth">
					<div class="bbp_settings_section_title">布料组（Tip Ring）</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_cloth_enabled">启用布料组（多条链末端环连接）</label>
						<input id="bbp_cfg_cloth_enabled" type="checkbox" />
					</div>
				</div>

				<div class="bbp_settings_panel" data-page="debug">
					<div class="bbp_settings_section_title">调试</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_debug_logging">输出调试日志（控制台）</label>
						<input id="bbp_cfg_debug_logging" type="checkbox" />
					</div>
					<div class="bbp_settings_field">
						<label for="bbp_cfg_debug_log_frames">调试输出帧数</label>
						<div class="bbp_num_group">
							<input id="bbp_cfg_debug_log_frames" type="number" min="0" max="60" step="1" />
							<button type="button" class="bbp_reset_btn" data-for="bbp_cfg_debug_log_frames">恢复默认</button>
						</div>
					</div>
				</div>
			</div>
		</div>`;
      const dialog = new Dialog("bbphysic_settings", {
        title: "BBPhysic 设置",
        buttons: ["保存", "关闭"],
        confirmIndex: 0,
        cancelIndex: 1,
        // Some Blockbench versions honor width/height; safe if ignored.
        width: 920,
        height: 520,
        lines: [html],
        onConfirm() {
          function el(id) {
            try {
              return (
                /** @type {any} */
                document.getElementById(id)
              );
            } catch (e) {
              return null;
            }
          }
          function readNumber(id, min, max, fallback) {
            var _a;
            const v = Number((_a = el(id)) == null ? void 0 : _a.value);
            return clampNumber(v, min, max, fallback);
          }
          function readInt(id, min, max, fallback) {
            return Math.round(readNumber(id, min, max, fallback));
          }
          function readBool(id, fallback = false) {
            const x = el(id);
            if (!x)
              return Boolean(fallback);
            return Boolean(x.checked);
          }
          function readStr(id, fallback = "") {
            var _a, _b;
            const v = String((_b = (_a = el(id)) == null ? void 0 : _a.value) != null ? _b : fallback);
            return v;
          }
          const scopeRaw = readStr("bbp_cfg_solve_scope", state.config.solve_scope);
          const solve_scope = scopeRaw === "all_roots" ? "all_roots" : "selected";
          state.config = {
            ...state.config,
            solve_scope,
            max_chain_depth: readInt("bbp_cfg_max_chain_depth", 1, 128, state.config.max_chain_depth),
            preview_fps: readInt("bbp_cfg_preview_fps", 1, 120, state.config.preview_fps),
            bake_fps: readInt("bbp_cfg_bake_fps", 1, 120, state.config.bake_fps),
            follow_strength: readNumber("bbp_cfg_follow_strength", 0, 5e3, state.config.follow_strength),
            follow_damping: readNumber("bbp_cfg_follow_damping", 0, 2e3, state.config.follow_damping),
            gravity_y: readNumber("bbp_cfg_gravity_y", -200, 200, state.config.gravity_y),
            lin_damping: readNumber("bbp_cfg_lin_damping", 0, 50, state.config.lin_damping),
            ang_damping: readNumber("bbp_cfg_ang_damping", 0, 50, state.config.ang_damping),
            hair_drag: readNumber("bbp_cfg_air_drag", 0, 50, state.config.air_drag),
            inertia_enabled: readBool("bbp_cfg_inertia_enabled", state.config.inertia_enabled),
            inertia_scale: readNumber("bbp_cfg_inertia_scale", 0, 5, state.config.inertia_scale),
            collision_iterations: readInt("bbp_cfg_collision_iterations", 1, 32, state.config.collision_iterations),
            collision_enabled: readBool("bbp_cfg_collision_enabled", state.config.collision_enabled),
            target_self_collision: readBool("bbp_cfg_target_self_collision", state.config.target_self_collision),
            cloth_enabled: readBool("bbp_cfg_cloth_enabled", state.config.cloth_enabled),
            debug_logging: readBool("bbp_cfg_debug_logging", state.config.debug_logging),
            debug_log_frames: readInt("bbp_cfg_debug_log_frames", 0, 60, state.config.debug_log_frames)
          };
          saveConfigToStorage();
          showMessage("BBPhysic", "设置已保存。");
        }
      });
      dialog.show();
      setTimeout(() => {
        try {
          let setActive = function(page) {
            const panels = Array.from(root.querySelectorAll(".bbp_settings_panel"));
            for (const p of panels) {
              p.dataset.active = p.getAttribute("data-page") === page ? "1" : "0";
            }
            const btns2 = Array.from(root.querySelectorAll("#bbp_settings_nav button[data-page]"));
            for (const b of btns2) {
              const on = b.getAttribute("data-page") === page;
              b.style.fontWeight = on ? "600" : "";
            }
          }, setValue = function(id, v) {
            const e = (
              /** @type {any} */
              document.getElementById(id)
            );
            if (!e)
              return;
            if (e.type === "checkbox")
              e.checked = Boolean(v);
            else
              e.value = String(v);
          };
          const root = document.getElementById("bbp_settings_root");
          if (!root)
            return;
          setValue("bbp_cfg_solve_scope", state.config.solve_scope);
          setValue("bbp_cfg_max_chain_depth", state.config.max_chain_depth);
          setValue("bbp_cfg_preview_fps", state.config.preview_fps);
          setValue("bbp_cfg_bake_fps", state.config.bake_fps);
          setValue("bbp_cfg_follow_strength", state.config.follow_strength);
          setValue("bbp_cfg_follow_damping", state.config.follow_damping);
          setValue("bbp_cfg_gravity_y", state.config.gravity_y);
          setValue("bbp_cfg_lin_damping", state.config.lin_damping);
          setValue("bbp_cfg_ang_damping", state.config.ang_damping);
          setValue("bbp_cfg_air_drag", state.config.air_drag);
          setValue("bbp_cfg_inertia_enabled", state.config.inertia_enabled);
          setValue("bbp_cfg_inertia_scale", state.config.inertia_scale);
          setValue("bbp_cfg_collision_iterations", state.config.collision_iterations);
          setValue("bbp_cfg_collision_enabled", state.config.collision_enabled);
          setValue("bbp_cfg_target_self_collision", state.config.target_self_collision);
          setValue("bbp_cfg_cloth_enabled", state.config.cloth_enabled);
          setValue("bbp_cfg_debug_logging", state.config.debug_logging);
          setValue("bbp_cfg_debug_log_frames", state.config.debug_log_frames);
          const defaults = {
            bbp_cfg_max_chain_depth: DEFAULT_CONFIG.max_chain_depth,
            bbp_cfg_preview_fps: DEFAULT_CONFIG.preview_fps,
            bbp_cfg_bake_fps: DEFAULT_CONFIG.bake_fps,
            bbp_cfg_follow_strength: DEFAULT_CONFIG.follow_strength,
            bbp_cfg_follow_damping: DEFAULT_CONFIG.follow_damping,
            bbp_cfg_gravity_y: DEFAULT_CONFIG.gravity_y,
            bbp_cfg_lin_damping: DEFAULT_CONFIG.lin_damping,
            bbp_cfg_ang_damping: DEFAULT_CONFIG.ang_damping,
            bbp_cfg_air_drag: DEFAULT_CONFIG.air_drag,
            bbp_cfg_inertia_scale: DEFAULT_CONFIG.inertia_scale,
            bbp_cfg_collision_iterations: DEFAULT_CONFIG.collision_iterations,
            bbp_cfg_debug_log_frames: DEFAULT_CONFIG.debug_log_frames
          };
          const resetButtons = Array.from(root.querySelectorAll(".bbp_reset_btn"));
          for (const btn of resetButtons) {
            btn.addEventListener("click", () => {
              var _a;
              const id = String(btn.getAttribute("data-for") || "");
              if (!id)
                return;
              const def = (
                /** @type {any} */
                defaults[id]
              );
              const inp = (
                /** @type {any} */
                document.getElementById(id)
              );
              if (!inp || typeof def === "undefined")
                return;
              inp.value = String(def);
              try {
                inp.dispatchEvent(new Event("change"));
                (_a = inp.animate) == null ? void 0 : _a.call(inp, [
                  { background: "rgba(120,200,120,0.25)" },
                  { background: "transparent" }
                ], { duration: 300, easing: "ease-out" });
              } catch (_) {
              }
            });
          }
          const btns = Array.from(root.querySelectorAll("#bbp_settings_nav button[data-page]"));
          for (const b of btns) {
            b.addEventListener("click", () => {
              const page = String(b.getAttribute("data-page") || "basic");
              setActive(page);
            });
          }
          setActive("basic");
        } catch (e) {
        }
      }, 0);
    } catch (e) {
      openSettingsDialogLegacy();
    }
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
    let nowTime = 0;
    try {
      if (typeof Timeline !== "undefined" && Timeline)
        nowTime = Number(Timeline.time) || 0;
    } catch (e) {
    }
    const dialog = new Dialog("bbphysic_bake", {
      title: "BBPhysic Bake（预烘培）",
      buttons: ["开始 Bake", "取消"],
      confirmIndex: 0,
      cancelIndex: 1,
      form: {
        start: { label: "起始时间 (s)", type: "number", value: 0, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
        end: { label: "结束时间 (s)", type: "number", value: endDefault, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
        anchor_enabled: { label: "从锚点时间开始解算（向前+向后）", type: "checkbox", value: false },
        anchor_time: { label: "锚点时间 (s)", type: "number", value: nowTime, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
        fps: { label: "采样帧率 (fps)", type: "number", value: state.config.bake_fps, min: 1, max: 120, step: 1 },
        axis: {
          label: "作用轴",
          type: "select",
          value: state.config.bake_axis,
          options: { x: "X", y: "Y", z: "Z" }
        },
        overwrite: { label: "覆盖同时间已有关键帧", type: "checkbox", value: true }
      },
      onConfirm(formResult) {
        const start = clampNumber(formResult.start, 0, endDefault, 0);
        const end = clampNumber(formResult.end, 0, endDefault, endDefault);
        const anchor_enabled = Boolean(formResult.anchor_enabled);
        const anchor_time = clampNumber(formResult.anchor_time, 0, endDefault, nowTime);
        const fps = Math.round(clampNumber(formResult.fps, 1, 120, state.config.bake_fps));
        const axisRawSafe = formResult && typeof formResult.axis === "string" ? formResult.axis : state.config.bake_axis;
        const axisRaw = String(axisRawSafe || state.config.bake_axis || "x").trim().toLowerCase();
        const axis = axisRaw === "x" || axisRaw === "y" || axisRaw === "z" ? axisRaw : state.config.bake_axis || "x";
        state.config = { ...state.config, bake_axis: (
          /** @type {any} */
          axis
        ) };
        saveConfigToStorage();
        const overwrite = Boolean(formResult.overwrite);
        bakeToKeyframes({ start, end, fps, axis, overwrite, anchor_enabled, anchor_time });
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
      init_bake();
      init_capsules();
    }
  });

  // src/sim_bone_visual.js
  function getScene() {
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
  function buildMarkerMesh(opacity) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 16777215,
      wireframe: true,
      transparent: true,
      opacity,
      depthTest: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 999;
    return mesh;
  }
  function readWorldPose(group, outPos3, outQuat4) {
    try {
      const mesh = group == null ? void 0 : group.mesh;
      if (mesh && typeof mesh.getWorldPosition === "function" && typeof mesh.getWorldQuaternion === "function") {
        const v3 = state.tmpThreeVec3 || (state.tmpThreeVec3 = new THREE.Vector3());
        const q4 = state.tmpThreeQuat || (state.tmpThreeQuat = new THREE.Quaternion());
        mesh.getWorldPosition(v3);
        mesh.getWorldQuaternion(q4);
        outPos3[0] = v3.x;
        outPos3[1] = v3.y;
        outPos3[2] = v3.z;
        outQuat4[0] = q4.x;
        outQuat4[1] = q4.y;
        outQuat4[2] = q4.z;
        outQuat4[3] = q4.w;
        return true;
      }
    } catch (e) {
    }
    return false;
  }
  function ensureGroup() {
    if (typeof THREE === "undefined" || !THREE)
      return null;
    const scn = getScene();
    if (!scn)
      return null;
    if (!state.simBonesVis) {
      state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
    }
    if (!state.simBonesVis.group) {
      const g = new THREE.Group();
      g.name = "BBPhysic_SimBonesGhost";
      g.visible = false;
      g.renderOrder = 999;
      scn.add(g);
      state.simBonesVis.group = g;
    }
    return state.simBonesVis.group;
  }
  function ensureMarkers(group, count) {
    var _a;
    const existing = Array.isArray((_a = group.userData) == null ? void 0 : _a.markers) ? group.userData.markers : [];
    if (existing.length === count)
      return;
    clearGroup(group);
    const markers = [];
    for (let i = 0; i < count; i++) {
      const mesh = buildMarkerMesh(0.22);
      group.add(mesh);
      markers.push(mesh);
    }
    group.userData.markers = markers;
  }
  function enableSimBoneMarkers() {
    if (!state.simBonesVis)
      state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
    state.simBonesVis.enabled = true;
    const g = ensureGroup();
    if (g)
      g.visible = true;
    requestCanvasUpdate();
  }
  function disableSimBoneMarkers() {
    if (!state.simBonesVis)
      state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
    state.simBonesVis.enabled = false;
    try {
      if (state.simBonesVis.group) {
        state.simBonesVis.group.visible = false;
        clearGroup(state.simBonesVis.group);
      }
    } catch (e) {
    }
    requestCanvasUpdate();
  }
  function updateSimBoneMarkers(bones, force = false) {
    var _a;
    if (!((_a = state.simBonesVis) == null ? void 0 : _a.enabled))
      return;
    const group = ensureGroup();
    if (!group)
      return;
    const now = Date.now();
    const minDt = 1e3 / 15;
    if (!force && now - (state.simBonesVis.lastMs || 0) < minDt)
      return;
    state.simBonesVis.lastMs = now;
    const list = Array.isArray(bones) ? bones : [];
    group.visible = list.length > 0;
    ensureMarkers(group, list.length);
    const markers = group.userData.markers;
    const q = new THREE.Quaternion();
    for (let i = 0; i < list.length; i++) {
      const bone = list[i];
      const mesh = markers[i];
      if (!mesh)
        continue;
      const p = [0, 0, 0];
      const qq = [0, 0, 0, 1];
      readWorldPose(bone, p, qq);
      mesh.position.set(p[0], p[1], p[2]);
      q.set(qq[0], qq[1], qq[2], qq[3]);
      mesh.quaternion.copy(q);
      mesh.scale.set(0.6, 0.6, 0.6);
    }
    requestCanvasUpdate();
  }
  var init_sim_bone_visual = __esm({
    "src/sim_bone_visual.js"() {
      init_state();
    }
  });

  // src/preview.js
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
  function getGroupsByUUIDs2(uuids) {
    const out = [];
    if (!Array.isArray(uuids) || uuids.length === 0)
      return out;
    for (const u of uuids) {
      const g = getGroupByUUID3(String(u || ""));
      if (g)
        out.push(g);
    }
    return out;
  }
  function stopPreview() {
    if (state.previewTimer) {
      clearInterval(state.previewTimer);
      state.previewTimer = null;
    }
    state.previewState = null;
    try {
      disableSimBoneMarkers();
    } catch (e) {
    }
    try {
      if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
        Animator.preview(true);
      }
    } catch (e) {
    }
    notify("BBPhysic: 预览已停止", 1500);
  }
  function readWorldPose2(group, outPos3, outQuat4) {
    try {
      if ((group == null ? void 0 : group.__bbp_anchor) && group.__bbp_anchor_source) {
        const isFixed = Boolean(group.__bbp_anchor_fixed);
        if (isFixed) {
          const cachedP = group.__bbp_anchor_cached_pos;
          const cachedQ = group.__bbp_anchor_cached_quat;
          if (Array.isArray(cachedP) && cachedP.length === 3 && Array.isArray(cachedQ) && cachedQ.length === 4) {
            outPos3[0] = cachedP[0];
            outPos3[1] = cachedP[1];
            outPos3[2] = cachedP[2];
            outQuat4[0] = cachedQ[0];
            outQuat4[1] = cachedQ[1];
            outQuat4[2] = cachedQ[2];
            outQuat4[3] = cachedQ[3];
            return true;
          }
        }
        const src = group.__bbp_anchor_source;
        if (src && src !== group) {
          const p = [0, 0, 0];
          const q = [0, 0, 0, 1];
          if (readWorldPose2(src, p, q)) {
            if (isFixed) {
              group.__bbp_anchor_cached_pos = [p[0], p[1], p[2]];
              group.__bbp_anchor_cached_quat = [q[0], q[1], q[2], q[3]];
            }
            outPos3[0] = p[0];
            outPos3[1] = p[1];
            outPos3[2] = p[2];
            outQuat4[0] = q[0];
            outQuat4[1] = q[1];
            outQuat4[2] = q[2];
            outQuat4[3] = q[3];
            return true;
          }
        }
      }
      const mesh = group == null ? void 0 : group.mesh;
      if (mesh && typeof mesh.getWorldPosition === "function" && typeof mesh.getWorldQuaternion === "function") {
        if (!state.tmpThreeVec3)
          state.tmpThreeVec3 = new THREE.Vector3();
        if (!state.tmpThreeQuat)
          state.tmpThreeQuat = new THREE.Quaternion();
        mesh.getWorldPosition(state.tmpThreeVec3);
        mesh.getWorldQuaternion(state.tmpThreeQuat);
        outPos3[0] = state.tmpThreeVec3.x;
        outPos3[1] = state.tmpThreeVec3.y;
        outPos3[2] = state.tmpThreeVec3.z;
        outQuat4[0] = state.tmpThreeQuat.x;
        outQuat4[1] = state.tmpThreeQuat.y;
        outQuat4[2] = state.tmpThreeQuat.z;
        outQuat4[3] = state.tmpThreeQuat.w;
        return true;
      }
    } catch (e) {
    }
    return false;
  }
  function orthonormalizeAxes(ax, ay) {
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const muls = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const norm = (a) => {
      const l = Math.hypot(a[0], a[1], a[2]);
      return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0];
    };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const ax1 = norm(ax);
    let ayp = sub(ay, muls(ax1, dot(ay, ax1)));
    if (Math.hypot(ayp[0], ayp[1], ayp[2]) < 1e-9) {
      ayp = Math.abs(ax1[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      ayp = sub(ayp, muls(ax1, dot(ayp, ax1)));
    }
    const ay1 = norm(ayp);
    const az1 = norm(cross(ax1, ay1));
    return [ax1, ay1, az1];
  }
  function sanitizeBoxesWorld(boxes, debug) {
    const finite = (x) => Number.isFinite(x) && Math.abs(x) <= 1e6;
    const out = [];
    let anomalies = 0;
    for (const b of boxes) {
      if (!b)
        continue;
      const c = b.center || [0, 0, 0];
      let ax = b.axes && b.axes[0] || [1, 0, 0];
      let ay = b.axes && b.axes[1] || [0, 1, 0];
      let az = b.axes && b.axes[2] || [0, 0, 1];
      const h = b.half || [0.5, 0.5, 0.5];
      if (!finite(c[0]) || !finite(c[1]) || !finite(c[2])) {
        anomalies++;
        continue;
      }
      if (!finite(h[0]) || !finite(h[1]) || !finite(h[2])) {
        anomalies++;
        continue;
      }
      const [ax1, ay1, az1] = orthonormalizeAxes([+ax[0] || 0, +ax[1] || 0, +ax[2] || 0], [+ay[0] || 0, +ay[1] || 0, +ay[2] || 0]);
      ax = ax1;
      ay = ay1;
      az = az1;
      const hh = [Math.max(0.02, +h[0] || 0), Math.max(0.02, +h[1] || 0), Math.max(0.02, +h[2] || 0)];
      out.push({ center: [c[0], c[1], c[2]], axes: [ax, ay, az], half: hh });
    }
    if (debug && anomalies) {
      console.warn("[BBPhysic] sanitizeBoxesWorld filtered anomalies:", anomalies, "kept:", out.length);
    }
    return out;
  }
  async function startPreview() {
    if (state.previewTimer)
      return;
    if (typeof THREE === "undefined" || !THREE) {
      showMessage("BBPhysic", "预览需要 THREE（Blockbench 场景未就绪）。");
      return;
    }
    const animation = getSelectedAnimation();
    if (!animation) {
      showMessage("BBPhysic", "请先在动画面板选择一个动画，再启动预览。");
      return;
    }
    let roots = getSolveRootGroups();
    if (state.config.solve_scope === "selected" && roots.length && state.config.target_root_uuid) {
      const target = getGroupByUUID3(state.config.target_root_uuid);
      const targetUuid = String(state.config.target_root_uuid || "");
      const movingUuid = String(state.config.moving_root_uuid || "");
      const hasTargetInSelection = roots.some((g) => String((g == null ? void 0 : g.uuid) || "") === targetUuid);
      const hasMovingInSelection = movingUuid ? roots.some((g) => String((g == null ? void 0 : g.uuid) || "") === movingUuid) : false;
      if (target && !hasTargetInSelection && hasMovingInSelection) {
        if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
          const captured = getGroupsByUUIDs2(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
          if (captured.length)
            roots = captured;
          else
            roots = [target];
        } else {
          roots = [target];
        }
      }
    }
    if (!roots.length) {
      if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
        const captured = getGroupsByUUIDs2(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
        if (captured.length)
          roots = captured;
      }
      if (!roots.length && state.config.target_root_uuid) {
        const tr = getGroupByUUID3(state.config.target_root_uuid);
        if (tr && isOutlinerGroup(tr))
          roots = [tr];
      }
    }
    if (!roots.length) {
      showMessage(
        "BBPhysic",
        state.config.solve_scope === "all_roots" ? "未找到任何根骨骼（Group）。" : "请先在设置里指定被解算根骨骼（或在 Outliner 里选中根骨骼 Group）。"
      );
      return;
    }
    const chains = roots.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth)).filter((c) => Array.isArray(c) && c.length);
    if (!chains.length) {
      showMessage("BBPhysic", "未能从所选根骨骼构建出骨骼链。");
      return;
    }
    const flat = flattenChainsWithParentAnchors(chains);
    const bones = flat.bones;
    const chainStarts = flat.chainStarts;
    const chainLengths = flat.chainLengths;
    const parentIndex = flat.parentIndex;
    const isRoot = flat.isRoot;
    const fps = Math.round(Math.max(1, Math.min(120, Number(state.config.preview_fps) || 30)));
    const dtNominal = 1 / fps;
    try {
      enableSimBoneMarkers();
      updateSimBoneMarkers(bones, true);
    } catch (e) {
    }
    let movingBoxDefs = [];
    try {
      const movingRoot = state.config.moving_root_uuid ? getGroupByUUID3(state.config.moving_root_uuid) : null;
      if (state.config.collision_enabled && movingRoot) {
        movingBoxDefs = buildBoxDefsFromRoot(movingRoot);
      }
    } catch (e) {
      movingBoxDefs = [];
    }
    let clothLinkCount = 0;
    if (Boolean(state.config.cloth_enabled) && chains.length >= 2) {
      clothLinkCount = chains.length;
    }
    const rapier = new RapierWasmSolver(bones.length, movingBoxDefs.length, clothLinkCount);
    try {
      await rapier.init();
    } catch (e) {
      showMessage("BBPhysic", String((e == null ? void 0 : e.message) || e || "WASM 初始化失败"));
      return;
    }
    let v = rapier.views;
    for (let i = 0; i < bones.length; i++) {
      v.parent[i] = parentIndex[i] | 0;
      v.root[i] = isRoot[i] ? 1 : 0;
      v.radius[i] = Math.max(0, Number(computeGroupApproxRadius(bones[i])) || 0);
      v.linvel[i * 3 + 0] = 0;
      v.linvel[i * 3 + 1] = 0;
      v.linvel[i * 3 + 2] = 0;
      v.angvel[i * 3 + 0] = 0;
      v.angvel[i * 3 + 1] = 0;
      v.angvel[i * 3 + 2] = 0;
      const p = [0, 0, 0];
      const q = [0, 0, 0, 1];
      readWorldPose2(bones[i], p, q);
      v.worldPos[i * 3 + 0] = p[0];
      v.worldPos[i * 3 + 1] = p[1];
      v.worldPos[i * 3 + 2] = p[2];
      v.worldQuat[i * 4 + 0] = q[0];
      v.worldQuat[i * 4 + 1] = q[1];
      v.worldQuat[i * 4 + 2] = q[2];
      v.worldQuat[i * 4 + 3] = q[3];
      v.targetWorldPos[i * 3 + 0] = p[0];
      v.targetWorldPos[i * 3 + 1] = p[1];
      v.targetWorldPos[i * 3 + 2] = p[2];
      v.targetWorldQuat[i * 4 + 0] = q[0];
      v.targetWorldQuat[i * 4 + 1] = q[1];
      v.targetWorldQuat[i * 4 + 2] = q[2];
      v.targetWorldQuat[i * 4 + 3] = q[3];
      v.targetLocal[i * 3 + 0] = 0;
      v.targetLocal[i * 3 + 1] = 0;
      v.targetLocal[i * 3 + 2] = 0;
    }
    if (clothLinkCount > 0 && v.clothLinks && v.clothLinks.length >= 3 * clothLinkCount) {
      for (let ci = 0; ci < chains.length; ci++) {
        const aIdx = chainStarts[ci] + chainLengths[ci] - 1;
        const ni = (ci + 1) % chains.length;
        const bIdx = chainStarts[ni] + chainLengths[ni] - 1;
        const ax = v.worldPos[aIdx * 3 + 0];
        const ay = v.worldPos[aIdx * 3 + 1];
        const az = v.worldPos[aIdx * 3 + 2];
        const bx = v.worldPos[bIdx * 3 + 0];
        const by = v.worldPos[bIdx * 3 + 1];
        const bz = v.worldPos[bIdx * 3 + 2];
        const dx = ax - bx;
        const dy = ay - by;
        const dz = az - bz;
        const rest = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz));
        v.clothLinks[ci * 3 + 0] = aIdx;
        v.clothLinks[ci * 3 + 1] = bIdx;
        v.clothLinks[ci * 3 + 2] = rest;
      }
    }
    state.previewState = {
      animation,
      chains,
      bones,
      chainStarts,
      chainLengths,
      parentIndex,
      isRoot,
      lastTime: typeof Timeline !== "undefined" && Timeline ? Timeline.time : 0,
      lastWallMs: typeof performance !== "undefined" && performance && typeof performance.now === "function" ? performance.now() : Date.now(),
      dtNominal,
      rapier,
      movingBoxDefs,
      clothLinkCount
    };
    state.previewTimer = setInterval(() => {
      var _a;
      try {
        if (!state.previewState)
          return;
        try {
          updateSimBoneMarkers(state.previewState.bones, false);
        } catch (e) {
        }
        if (state.previewState.rapier && typeof state.previewState.rapier.ensureViews === "function") {
          state.previewState.rapier.ensureViews();
        }
        const animNow = getSelectedAnimation();
        if (!animNow || animNow !== state.previewState.animation) {
          stopPreview();
          return;
        }
        const wallNowMs = typeof performance !== "undefined" && performance && typeof performance.now === "function" ? performance.now() : Date.now();
        let dtWall = (wallNowMs - (Number(state.previewState.lastWallMs) || wallNowMs)) / 1e3;
        state.previewState.lastWallMs = wallNowMs;
        if (!Number.isFinite(dtWall) || dtWall <= 0)
          dtWall = state.previewState.dtNominal;
        dtWall = Math.max(1 / 240, Math.min(1 / 15, dtWall));
        const tNow = typeof Timeline !== "undefined" && Timeline ? Number(Timeline.time) || 0 : 0;
        let dt = dtWall;
        const jump = tNow - (Number(state.previewState.lastTime) || 0);
        if (!Number.isFinite(jump) || Math.abs(jump) > 0.5 || jump < -1e-6) {
          try {
            if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
              Animator.preview(true);
            }
          } catch (e) {
          }
          const v22 = state.previewState.rapier.views;
          for (let i = 0; i < state.previewState.bones.length; i++) {
            const p = [0, 0, 0];
            const q = [0, 0, 0, 1];
            readWorldPose2(state.previewState.bones[i], p, q);
            v22.worldPos[i * 3 + 0] = p[0];
            v22.worldPos[i * 3 + 1] = p[1];
            v22.worldPos[i * 3 + 2] = p[2];
            v22.worldQuat[i * 4 + 0] = q[0];
            v22.worldQuat[i * 4 + 1] = q[1];
            v22.worldQuat[i * 4 + 2] = q[2];
            v22.worldQuat[i * 4 + 3] = q[3];
            v22.linvel[i * 3 + 0] = 0;
            v22.linvel[i * 3 + 1] = 0;
            v22.linvel[i * 3 + 2] = 0;
            v22.angvel[i * 3 + 0] = 0;
            v22.angvel[i * 3 + 1] = 0;
            v22.angvel[i * 3 + 2] = 0;
          }
          state.previewState.lastWallMs = wallNowMs;
          dt = state.previewState.dtNominal;
        } else if (jump > 1e-6) {
          dt = dtWall;
        }
        state.previewState.lastTime = tNow;
        try {
          if (typeof Animator !== "undefined" && Animator && typeof Animator.preview === "function") {
            Animator.preview(true);
          }
        } catch (e) {
        }
        const baseRot = state.previewState.bones.map((g) => readGroupRotationDeg(g));
        const v2 = state.previewState.rapier.views;
        for (let i = 0; i < baseRot.length; i++) {
          v2.targetLocal[i * 3 + 0] = degToRad(baseRot[i][0]);
          v2.targetLocal[i * 3 + 1] = degToRad(baseRot[i][1]);
          v2.targetLocal[i * 3 + 2] = degToRad(baseRot[i][2]);
        }
        for (let i = 0; i < state.previewState.bones.length; i++) {
          if (!state.previewState.isRoot[i])
            continue;
          const p = [0, 0, 0];
          const q = [0, 0, 0, 1];
          readWorldPose2(state.previewState.bones[i], p, q);
          v2.targetWorldPos[i * 3 + 0] = p[0];
          v2.targetWorldPos[i * 3 + 1] = p[1];
          v2.targetWorldPos[i * 3 + 2] = p[2];
          v2.targetWorldQuat[i * 4 + 0] = q[0];
          v2.targetWorldQuat[i * 4 + 1] = q[1];
          v2.targetWorldQuat[i * 4 + 2] = q[2];
          v2.targetWorldQuat[i * 4 + 3] = q[3];
        }
        let boxCount = 0;
        if (state.config.collision_enabled && ((_a = state.previewState.movingBoxDefs) == null ? void 0 : _a.length)) {
          let boxesNow = computeBoxesWorldNow(state.previewState.movingBoxDefs);
          const debug = Boolean(state.config.debug_logging);
          boxesNow = sanitizeBoxesWorld(boxesNow, debug);
          const packed = packBoxesWorldToF32(boxesNow);
          boxCount = Math.min(boxesNow.length, Math.floor(packed.length / 15));
          if (boxCount > 0)
            v2.boxes.set(packed.subarray(0, 15 * boxCount));
          if (debug && (state.previewState.debugLogCount | 0) < Math.max(1, Math.min(60, Number(state.config.debug_log_frames) || 5))) {
            const sample = boxesNow.slice(0, Math.min(3, boxesNow.length));
            console.log("[BBPhysic] frame OBBs", { boxCount, sample });
          }
        }
        const stepParams = {
          dt,
          substeps: Math.max(1, Math.min(32, Math.round(Number(state.config.collision_iterations) || 4))),
          gravityY: Number(state.config.gravity_y) || -9.81,
          linDamping: Math.max(0, Number(state.config.lin_damping) || 0),
          angDamping: Math.max(0, Number(state.config.ang_damping) || 0),
          airDrag: Math.max(0, Number(state.config.air_drag) || 0),
          inertiaScale: state.config.inertia_enabled ? Math.max(0, Math.min(5, Number(state.config.inertia_scale) || 1)) : 0,
          motorStiffness: Math.max(0, Number(state.config.follow_strength) || 0),
          motorDamping: Math.max(0, Number(state.config.follow_damping) || 0),
          targetSelfCollision: Boolean(state.config.target_self_collision),
          clothLinkCount: state.previewState.clothLinkCount || 0,
          boxCount
        };
        if (state.config.debug_logging && (state.previewState.debugLogCount | 0) < Math.max(1, Math.min(60, Number(state.config.debug_log_frames) || 5))) {
          console.log("[BBPhysic] step params", stepParams);
          state.previewState.debugLogCount = (state.previewState.debugLogCount | 0) + 1;
        }
        state.previewState.rapier.step(stepParams);
        const v3 = state.previewState.rapier.views;
        v3.worldPos.set(v3.outWorldPos);
        v3.worldQuat.set(v3.outWorldQuat);
        const qParent = new THREE.Quaternion();
        const qChild = new THREE.Quaternion();
        const qLocal = new THREE.Quaternion();
        const euler = new THREE.Euler(0, 0, 0, "XYZ");
        for (let i = 0; i < state.previewState.bones.length; i++) {
          const pIdx = state.previewState.parentIndex[i] | 0;
          if (pIdx < 0) {
            continue;
          }
          qParent.set(
            v3.worldQuat[pIdx * 4 + 0],
            v3.worldQuat[pIdx * 4 + 1],
            v3.worldQuat[pIdx * 4 + 2],
            v3.worldQuat[pIdx * 4 + 3]
          );
          qChild.set(
            v3.worldQuat[i * 4 + 0],
            v3.worldQuat[i * 4 + 1],
            v3.worldQuat[i * 4 + 2],
            v3.worldQuat[i * 4 + 3]
          );
          qLocal.copy(qParent).invert().multiply(qChild);
          euler.setFromQuaternion(qLocal, "XYZ");
          writeGroupRotationDeg(state.previewState.bones[i], [radToDeg(euler.x), radToDeg(euler.y), radToDeg(euler.z)]);
        }
      } catch (e) {
        console.error("[BBPhysic] Preview tick failed", e);
        stopPreview();
      }
    }, Math.round(1e3 / fps));
    state.previewState.debugLogCount = 0;
    notify(`BBPhysic: 预览已启动（${fps} fps，Rapier/WASM）`, 2e3);
  }
  function togglePreview() {
    if (state.previewTimer)
      stopPreview();
    else
      startPreview().catch((e) => {
        showMessage("BBPhysic", String((e == null ? void 0 : e.message) || e || "预览启动失败"));
      });
  }
  var init_preview = __esm({
    "src/preview.js"() {
      init_state();
      init_util();
      init_blockbench_api();
      init_chains();
      init_capsules();
      init_rapier_wasm_solver();
      init_math();
      init_sim_bone_visual();
      init_chain_flatten();
    }
  });

  // src/box_visual.js
  function getSceneForGhost() {
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
  function requestCanvasUpdate2() {
    try {
      if (typeof Canvas !== "undefined" && Canvas && typeof Canvas.updateView === "function") {
        Canvas.updateView({});
      }
    } catch (e) {
    }
  }
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
  function clearGroup2(group) {
    if (!group)
      return;
    try {
      for (const ch of group.children.slice())
        group.remove(ch);
    } catch (e) {
    }
    group.userData = {};
  }
  function buildBoxMesh(opacity) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 16777215,
      wireframe: true,
      transparent: true,
      opacity,
      depthTest: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 999;
    return mesh;
  }
  function ensureGhostGroups() {
    if (typeof THREE === "undefined" || !THREE)
      return null;
    const scn = getSceneForGhost();
    if (!scn)
      return null;
    if (!state.ghost)
      state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
    if (!state.ghost.moving) {
      const g = new THREE.Group();
      g.name = "BBPhysic_MovingBoxesGhost";
      g.visible = false;
      g.renderOrder = 999;
      scn.add(g);
      state.ghost.moving = g;
    }
    if (!state.ghost.target) {
      const g = new THREE.Group();
      g.name = "BBPhysic_TargetBoxesGhost";
      g.visible = false;
      g.renderOrder = 999;
      scn.add(g);
      state.ghost.target = g;
    }
    return { scn, moving: state.ghost.moving, target: state.ghost.target };
  }
  function ensureGroupBoxes(group, count, opacity) {
    var _a, _b;
    if (!group)
      return;
    const existing = Array.isArray((_a = group.userData) == null ? void 0 : _a.boxes) ? group.userData.boxes : [];
    if (existing.length === count && ((_b = group.userData) == null ? void 0 : _b.opacity) === opacity)
      return;
    clearGroup2(group);
    group.userData.opacity = opacity;
    const boxes = [];
    for (let i = 0; i < count; i++) {
      const mesh = buildBoxMesh(opacity);
      group.add(mesh);
      boxes.push(mesh);
    }
    group.userData.boxes = boxes;
  }
  function updateBoxes(group, boxesWorld, opacity) {
    if (!group)
      return;
    ensureGroupBoxes(group, boxesWorld.length, opacity);
    const meshes = group.userData.boxes;
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const ax = new THREE.Vector3();
    const ay = new THREE.Vector3();
    const az = new THREE.Vector3();
    for (let i = 0; i < boxesWorld.length; i++) {
      const b = boxesWorld[i];
      const mesh = meshes[i];
      if (!b || !mesh)
        continue;
      const c = b.center;
      const half = b.half;
      const axes = b.axes;
      ax.set(axes[0][0], axes[0][1], axes[0][2]);
      ay.set(axes[1][0], axes[1][1], axes[1][2]);
      az.set(axes[2][0], axes[2][1], axes[2][2]);
      m.makeBasis(ax, ay, az);
      q.setFromRotationMatrix(m);
      mesh.position.set(c[0], c[1], c[2]);
      mesh.quaternion.copy(q);
      mesh.scale.set((half[0] || 0) * 2, (half[1] || 0) * 2, (half[2] || 0) * 2);
    }
  }
  function ensureDefsFromConfigIfMissing() {
    try {
      if ((!state.solveSetup.movingBoxes || state.solveSetup.movingBoxes.length === 0) && state.config.moving_root_uuid) {
        const root = getGroupByUUID4(state.config.moving_root_uuid);
        if (root)
          state.solveSetup.movingBoxes = buildBoxDefsFromRoot(root);
      }
      if ((!state.solveSetup.targetBoxes || state.solveSetup.targetBoxes.length === 0) && state.config.target_root_uuid) {
        const root = getGroupByUUID4(state.config.target_root_uuid);
        if (root)
          state.solveSetup.targetBoxes = buildBoxDefsFromRoot(root);
      }
    } catch (e) {
    }
  }
  function stopBoxGhost() {
    var _a;
    if ((_a = state.ghost) == null ? void 0 : _a.timer) {
      try {
        clearInterval(state.ghost.timer);
      } catch (e) {
      }
      state.ghost.timer = null;
    }
  }
  function updateBoxGhost(force = false) {
    var _a;
    if (!((_a = state.ghost) == null ? void 0 : _a.enabled))
      return;
    const groups = ensureGhostGroups();
    if (!groups)
      return;
    const now = Date.now();
    const minDt = 1e3 / 15;
    if (!force && now - (state.ghost.lastMs || 0) < minDt)
      return;
    state.ghost.lastMs = now;
    ensureDefsFromConfigIfMissing();
    const movingDefs = Array.isArray(state.solveSetup.movingBoxes) ? state.solveSetup.movingBoxes : [];
    const targetDefs = Array.isArray(state.solveSetup.targetBoxes) ? state.solveSetup.targetBoxes : [];
    const movingVisible = movingDefs.length > 0;
    const targetVisible = targetDefs.length > 0;
    groups.moving.visible = movingVisible;
    groups.target.visible = targetVisible;
    if (movingVisible)
      updateBoxes(groups.moving, computeBoxesWorldNow(movingDefs), 0.35);
    if (targetVisible)
      updateBoxes(groups.target, computeBoxesWorldNow(targetDefs), 0.18);
    requestCanvasUpdate2();
  }
  function toggleBoxGhost() {
    if (!state.ghost)
      state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
    state.ghost.enabled = !state.ghost.enabled;
    const groups = ensureGhostGroups();
    if (!state.ghost.enabled) {
      stopBoxGhost();
      try {
        if (groups == null ? void 0 : groups.moving)
          groups.moving.visible = false;
        if (groups == null ? void 0 : groups.target)
          groups.target.visible = false;
      } catch (e) {
      }
      requestCanvasUpdate2();
      showMessage("BBPhysic", "OBB 虚影：已关闭");
      return;
    }
    try {
      updateBoxGhost(true);
    } catch (e) {
    }
    stopBoxGhost();
    state.ghost.timer = setInterval(() => {
      try {
        updateBoxGhost(false);
      } catch (e) {
      }
    }, 1e3 / 15);
    showMessage("BBPhysic", "OBB 虚影：已开启（Tools 菜单可快速开关）");
  }
  function disposeBoxGhost() {
    var _a, _b;
    stopBoxGhost();
    try {
      const scn = getSceneForGhost();
      if (scn && ((_a = state.ghost) == null ? void 0 : _a.moving))
        scn.remove(state.ghost.moving);
      if (scn && ((_b = state.ghost) == null ? void 0 : _b.target))
        scn.remove(state.ghost.target);
    } catch (e) {
    }
    if (state.ghost) {
      state.ghost.moving = null;
      state.ghost.target = null;
    }
    requestCanvasUpdate2();
  }
  var init_box_visual = __esm({
    "src/box_visual.js"() {
      init_state();
      init_util();
      init_capsules();
      init_blockbench_api();
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
        resetRuntimeState();
        loadConfigFromStorage();
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
        state.actions.ghost = new Action("bbphysic_ghost", {
          name: "BBPhysic: OBB 虚影（开/关）",
          icon: "visibility",
          category: "Tools",
          click() {
            toggleBoxGhost();
          }
        });
        safeAddToMenu(state.actions.settings, "tools.0");
        safeAddToMenu(state.actions.step1_moving, "tools.0");
        safeAddToMenu(state.actions.step2_target, "tools.0");
        safeAddToMenu(state.actions.bake, "tools.0");
        safeAddToMenu(state.actions.preview, "tools.0");
        safeAddToMenu(state.actions.ghost, "tools.0");
        notify(`BBPhysic 已加载（v${PLUGIN_VERSION}）：仅 Bake 模式`, 2500);
      },
      onunload() {
        resetRuntimeState();
        safeRemoveFromMenu("tools.bbphysic_settings");
        safeRemoveFromMenu("tools.bbphysic_step1_moving");
        safeRemoveFromMenu("tools.bbphysic_step2_target");
        safeRemoveFromMenu("tools.bbphysic_bake");
        safeRemoveFromMenu("tools.bbphysic_preview");
        safeRemoveFromMenu("tools.bbphysic_ghost");
        try {
          stopPreview();
        } catch (e) {
        }
        try {
          disposeBoxGhost();
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
        if (state.actions.ghost)
          state.actions.ghost.delete();
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
      init_box_visual();
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

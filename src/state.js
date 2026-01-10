export const PLUGIN_ID = 'bbphysic';
export const PLUGIN_VERSION = '0.0.3';
export const STORAGE_KEY = `${PLUGIN_ID}:config:v3`;

export const DEFAULT_CONFIG = {
	preview_fps: 30,
	bake_fps: 30,
	bake_axis: 'x',
	solve_scope: 'selected',
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
	moving_root_uuid: '',
	target_root_uuid: '',
};

export const state = {
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
		lastMs: 0,
	},

	// OBB ghost visualization (runtime-only, not persisted)
	ghost: {
		enabled: false,
		timer: null,
		lastMs: 0,
		moving: null,
		target: null,
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
		targetAabb: null,
	},

	tmpThreeVec3: (typeof THREE !== 'undefined' && THREE) ? new THREE.Vector3() : null,
};

export function resetRuntimeState() {
	state.solveSetup = {
		movingRoot: null,
		movingBoxes: [],
		targetRoot: null,
		targetBoxes: [],
		targetAabb: null,
	};
	state.previewState = null;
	if (state.previewTimer) {
		try {
			clearInterval(state.previewTimer);
		} catch (e) {
			// ignore
		}
		state.previewTimer = null;
	}
	state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
	state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
	state.tmpThreeVec3 = (typeof THREE !== 'undefined' && THREE) ? new THREE.Vector3() : null;
}

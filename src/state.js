export const PLUGIN_ID = 'bbphysic';
export const PLUGIN_VERSION = '0.0.3';
export const STORAGE_KEY = `${PLUGIN_ID}:config:v2`;

export const state = {
	/** @type {{bake_fps: number, axis: 'x'|'y'|'z', solve_scope: 'selected'|'all_roots', use_wasm: boolean, follow_strength: number, follow_damping: number, tip_falloff: number, max_chain_depth: number, chain_coupling: number, chain_iterations: number, collision_enabled: boolean, collision_iterations: number, collision_strength: number, collision_sweep_substeps_max: number, debug_logging: boolean, debug_log_frames: number, show_moving_capsules: boolean, show_target_capsules: boolean, capsule_update_fps: number, solve_xyz: boolean, moving_root_uuid: string, target_root_uuid: string}} */
	config: {
		bake_fps: 30,
		axis: 'x',
		solve_xyz: true,
		solve_scope: 'selected',
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
		moving_root_uuid: '',
		target_root_uuid: '',
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
		targetAabb: null,
	},

	tmpThreeVec3: (typeof THREE !== 'undefined' && THREE) ? new THREE.Vector3() : null,
};

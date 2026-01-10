import { state, STORAGE_KEY } from './state.js';
import { clampNumber } from './util.js';

export function loadConfigFromStorage() {
	try {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return;

		const scopeRaw = String(parsed.solve_scope ?? state.config.solve_scope);
		const solve_scope = scopeRaw === 'all_roots' ? 'all_roots' : 'selected';
		const cloth_enabled = Boolean(parsed.cloth_enabled ?? state.config.cloth_enabled);
		// 第一次/第二次解算产生的根组件、布料根等只应保存在运行时，不写入模型或本地存储。
		// 因此忽略持久化的 root/cloth 根列表，强制使用默认空值。
		const cloth_roots_uuids = [];
		let bake_axis = 'x';
		try {
			const bakeAxisRaw = String(parsed.bake_axis ?? state.config.bake_axis ?? 'x').trim().toLowerCase();
			bake_axis = bakeAxisRaw === 'y' ? 'y' : bakeAxisRaw === 'z' ? 'z' : 'x';
		} catch (e) {
			bake_axis = 'x';
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
			inertia_enabled: Boolean(parsed.inertia_enabled ?? state.config.inertia_enabled),
			inertia_scale: clampNumber(parsed.inertia_scale, 0, 5, state.config.inertia_scale),
			target_self_collision: Boolean(parsed.target_self_collision ?? state.config.target_self_collision),
			collision_enabled: Boolean(parsed.collision_enabled ?? state.config.collision_enabled),
			collision_iterations: Math.round(clampNumber(parsed.collision_iterations, 0, 64, state.config.collision_iterations)),
			cloth_enabled,
			cloth_roots_uuids,
			debug_logging: Boolean(parsed.debug_logging ?? state.config.debug_logging),
			debug_log_frames: Math.round(clampNumber(parsed.debug_log_frames, 0, 60, state.config.debug_log_frames)),
			moving_root_uuid: '',
			target_root_uuid: '',
		};
	} catch (e) {
		console.warn('[BBPhysic] Failed to load config', e);
	}
}

export function saveConfigToStorage() {
	try {
		if (typeof localStorage === 'undefined') return;
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
				debug_log_frames: state.config.debug_log_frames,
			})
		);
	} catch (e) {
		console.warn('[BBPhysic] Failed to save config', e);
	}
}

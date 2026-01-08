import { state, STORAGE_KEY } from './state.js';
import { clampNumber } from './util.js';

export function loadConfigFromStorage() {
	try {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return;

		const axis = String(parsed.axis ?? state.config.axis).trim().toLowerCase();
		const scopeRaw = String(parsed.solve_scope ?? state.config.solve_scope);
		const solve_scope = scopeRaw === 'all_roots' ? 'all_roots' : 'selected';

		const solve_xyz = Boolean(parsed.solve_xyz ?? state.config.solve_xyz);

		state.config = {
			...state.config,
			bake_fps: Math.round(clampNumber(parsed.bake_fps, 1, 120, state.config.bake_fps)),
			axis: axis === 'x' || axis === 'y' || axis === 'z' ? axis : state.config.axis,
			solve_xyz,
			solve_scope,
			use_wasm: Boolean(parsed.use_wasm ?? state.config.use_wasm),
			follow_strength: clampNumber(parsed.follow_strength, 0, 500, state.config.follow_strength),
			follow_damping: clampNumber(parsed.follow_damping, 0, 200, state.config.follow_damping),
			tip_falloff: clampNumber(parsed.tip_falloff, 0, 1, state.config.tip_falloff),
			max_chain_depth: Math.round(clampNumber(parsed.max_chain_depth, 1, 128, state.config.max_chain_depth)),
			chain_coupling: clampNumber(parsed.chain_coupling, 0, 1, state.config.chain_coupling),
			chain_iterations: Math.round(clampNumber(parsed.chain_iterations, 0, 64, state.config.chain_iterations)),
			collision_enabled: Boolean(parsed.collision_enabled ?? state.config.collision_enabled),
			collision_iterations: Math.round(clampNumber(parsed.collision_iterations, 0, 64, state.config.collision_iterations)),
			collision_strength: clampNumber(parsed.collision_strength, 0, 5, state.config.collision_strength),
			collision_sweep_substeps_max: Math.round(clampNumber(parsed.collision_sweep_substeps_max, 1, 32, state.config.collision_sweep_substeps_max)),
			debug_logging: Boolean(parsed.debug_logging ?? state.config.debug_logging),
			debug_log_frames: Math.round(clampNumber(parsed.debug_log_frames, 0, 60, state.config.debug_log_frames)),
			show_moving_capsules: Boolean(parsed.show_moving_capsules ?? state.config.show_moving_capsules),
			show_target_capsules: Boolean(parsed.show_target_capsules ?? state.config.show_target_capsules),
			capsule_update_fps: Math.round(clampNumber(parsed.capsule_update_fps, 1, 60, state.config.capsule_update_fps)),
			moving_root_uuid: String(parsed.moving_root_uuid ?? state.config.moving_root_uuid ?? ''),
			target_root_uuid: String(parsed.target_root_uuid ?? state.config.target_root_uuid ?? ''),
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
				target_root_uuid: state.config.target_root_uuid,
			})
		);
	} catch (e) {
		console.warn('[BBPhysic] Failed to save config', e);
	}
}

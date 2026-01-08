import { state } from './state.js';
import { clampNumber, showMessage } from './util.js';
import { getSelectedAnimation, isGroup, isOutlinerGroup } from './blockbench_api.js';
import { saveConfigToStorage } from './config_storage.js';
import { tryInitWasm } from './wasm.js';
import { applyCapsuleVisualSettings } from './collider_visual.js';
import { bakeToKeyframes } from './bake.js';
import { buildCapsuleDefsFromRoot, computePivotAabbWorld } from './capsules.js';

function getGroupOptionsForDialog() {
	/** @type {Record<string, string>} */
	const options = { '': '(未选择)' };
	try {
		if (typeof Group !== 'undefined' && Group && Array.isArray(Group.all)) {
			const all = Group.all.slice().filter(isOutlinerGroup);
			all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
			for (const g of all) {
				if (g && typeof g.uuid === 'string') options[g.uuid] = String(g.name || g.uuid);
			}
		}
	} catch (e) {
		// ignore
	}
	return options;
}

function getGroupByUUID(uuid) {
	try {
		if (typeof OutlinerNode !== 'undefined' && OutlinerNode?.uuids) {
			const node = OutlinerNode.uuids[String(uuid)];
			if (isOutlinerGroup(node)) return node;
		}
	} catch (e) {
		// ignore
	}
	return null;
}

export function openStep1MovingObjectDialog() {
	const options = getGroupOptionsForDialog();
	const dialog = new Dialog('bbphysic_step1_moving', {
		title: 'BBPhysic 第一次解算：选择运动物件（生成碰撞胶囊）',
		buttons: ['确定', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			moving_root_uuid: {
				label: '运动物件根组件（Group）',
				type: 'select',
				value: state.config.moving_root_uuid || '',
				options,
			},
		},
		onConfirm(formResult) {
			const uuid = String(formResult.moving_root_uuid || '');
			const root = uuid ? getGroupByUUID(uuid) : null;
			if (!root) {
				showMessage('BBPhysic', '请选择一个有效的运动物件根组件（Group）。');
				return;
			}
			state.config.moving_root_uuid = uuid;
			state.solveSetup.movingRoot = root;
			state.solveSetup.movingCapsules = buildCapsuleDefsFromRoot(root);
			saveConfigToStorage();
			applyCapsuleVisualSettings();
			showMessage('BBPhysic', `已生成运动物件碰撞胶囊：${state.solveSetup.movingCapsules.length} 段`);
		},
	});
	dialog.show();
}

export function openStep2TargetObjectDialog() {
	const options = getGroupOptionsForDialog();
	const dialog = new Dialog('bbphysic_step2_target', {
		title: 'BBPhysic 第二次解算：选择被解算物理部件（计算体积）',
		buttons: ['确定', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			target_root_uuid: {
				label: '被解算物理部件根组件（Group）',
				type: 'select',
				value: state.config.target_root_uuid || '',
				options,
			},
		},
		onConfirm(formResult) {
			const uuid = String(formResult.target_root_uuid || '');
			const root = uuid ? getGroupByUUID(uuid) : null;
			if (!root) {
				showMessage('BBPhysic', '请选择一个有效的被解算根组件（Group）。');
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
				'BBPhysic',
				`已计算被解算部件体积（pivot AABB）：中心(${aabb.center.map((v) => v.toFixed(2)).join(', ')})，尺寸(${aabb.size
					.map((v) => v.toFixed(2))
					.join(', ')})，节点数 ${aabb.count}`
			);
		},
	});
	dialog.show();
}

export function openSettingsDialog() {
	const dialog = new Dialog('bbphysic_settings', {
		title: 'BBPhysic 设置（Bake + 解算）',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			bake_fps: { label: 'Bake 采样帧率 (fps)', type: 'number', value: state.config.bake_fps, min: 1, max: 120, step: 1 },
			solve_xyz: { label: '同时解算 XYZ 三轴', type: 'checkbox', value: Boolean(state.config.solve_xyz) },
			axis: { label: '单轴模式：作用轴 (x/y/z)', type: 'text', value: state.config.axis },
			solve_scope: {
				label: '解算范围',
				type: 'select',
				value: state.config.solve_scope,
				options: { selected: '仅选中的根骨骼', all_roots: '所有根骨骼（全模型）' },
			},
			use_wasm: { label: '尝试使用 WASM（Rust）加速（实验）', type: 'checkbox', value: state.config.use_wasm },
			follow_strength: { label: '跟随强度 (k)', type: 'number', value: state.config.follow_strength, min: 0, max: 500, step: 1 },
			follow_damping: { label: '跟随阻尼 (c)', type: 'number', value: state.config.follow_damping, min: 0, max: 200, step: 1 },
			tip_falloff: { label: '末端衰减 (0-1)', type: 'number', value: state.config.tip_falloff, min: 0, max: 1, step: 0.05 },
			max_chain_depth: { label: '链条最大深度', type: 'number', value: state.config.max_chain_depth, min: 1, max: 128, step: 1 },
			chain_coupling: { label: '链耦合强度 (0-1)', type: 'number', value: state.config.chain_coupling, min: 0, max: 1, step: 0.05 },
			chain_iterations: { label: '链耦合迭代次数', type: 'number', value: state.config.chain_iterations, min: 0, max: 64, step: 1 },
			collision_enabled: { label: '启用碰撞（胶囊）', type: 'checkbox', value: state.config.collision_enabled },
			collision_iterations: { label: '碰撞迭代次数', type: 'number', value: state.config.collision_iterations, min: 0, max: 64, step: 1 },
			collision_strength: { label: '碰撞强度', type: 'number', value: state.config.collision_strength, min: 0, max: 5, step: 0.1 },
			collision_sweep_substeps_max: { label: '碰撞插帧上限（运动物件移动快时）', type: 'number', value: state.config.collision_sweep_substeps_max, min: 1, max: 32, step: 1 },
			show_moving_capsules: { label: '显示运动物件胶囊虚影（第1次解算）', type: 'checkbox', value: state.config.show_moving_capsules },
			show_target_capsules: { label: '显示被解算部件胶囊虚影（第2次解算）', type: 'checkbox', value: state.config.show_target_capsules },
			capsule_update_fps: { label: '胶囊虚影刷新率 (fps)', type: 'number', value: state.config.capsule_update_fps, min: 1, max: 60, step: 1 },
			debug_logging: { label: '输出调试日志（控制台）', type: 'checkbox', value: state.config.debug_logging },
			debug_log_frames: { label: '调试输出帧数', type: 'number', value: state.config.debug_log_frames, min: 0, max: 60, step: 1 },
		},
		onConfirm(formResult) {
			const axisRaw = String(formResult.axis ?? state.config.axis).trim().toLowerCase();
			const scopeRaw = String(formResult.solve_scope ?? state.config.solve_scope);
			const solve_scope = scopeRaw === 'all_roots' ? 'all_roots' : 'selected';
			state.config = {
				...state.config,
				bake_fps: Math.round(clampNumber(formResult.bake_fps, 1, 120, state.config.bake_fps)),
				axis: axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : state.config.axis,
				solve_xyz: Boolean(formResult.solve_xyz),
				solve_scope: /** @type {'selected'|'all_roots'} */ (solve_scope),
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
				debug_log_frames: Math.round(clampNumber(formResult.debug_log_frames, 0, 60, state.config.debug_log_frames)),
			};
			saveConfigToStorage();
			state.wasmInitTried = false;
			state.wasm = null;
			tryInitWasm();
			applyCapsuleVisualSettings();
			showMessage('BBPhysic', '设置已保存（写入本机存储）。');
		},
	});
	dialog.show();
}

export function openBakeDialog() {
	if (!state.config.moving_root_uuid) {
		showMessage('BBPhysic', '请先执行：BBPhysic 第一次解算（选择运动物件）。');
		return;
	}
	if (!state.config.target_root_uuid) {
		showMessage('BBPhysic', '请先执行：BBPhysic 第二次解算（选择被解算物理部件）。');
		return;
	}
	const animation = getSelectedAnimation();
	if (!animation) {
		showMessage('BBPhysic', '请先在动画面板选择一个动画，再执行 Bake。');
		return;
	}

	const endDefault = Math.max(0, Number(animation.length) || 0);
	const dialog = new Dialog('bbphysic_bake', {
		title: 'BBPhysic Bake（预烘培）',
		buttons: ['开始 Bake', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			start: { label: '起始时间 (s)', type: 'number', value: 0, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
			end: { label: '结束时间 (s)', type: 'number', value: endDefault, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
			fps: { label: '采样帧率 (fps)', type: 'number', value: state.config.bake_fps, min: 1, max: 120, step: 1 },
			axis: {
				label: '作用轴',
				type: 'select',
				value: state.config.axis,
				options: { x: 'X', y: 'Y', z: 'Z' },
			},
			overwrite: { label: '覆盖同时间已有关键帧', type: 'checkbox', value: true },
		},
		onConfirm(formResult) {
			const start = clampNumber(formResult.start, 0, endDefault, 0);
			const end = clampNumber(formResult.end, 0, endDefault, endDefault);
			const fps = Math.round(clampNumber(formResult.fps, 1, 120, state.config.bake_fps));
			const axisRaw = String(formResult.axis ?? state.config.axis).trim().toLowerCase();
			const axis = axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : state.config.axis;
			const overwrite = Boolean(formResult.overwrite);
			bakeToKeyframes({ start, end, fps, axis, overwrite });
		},
	});
	dialog.show();
}

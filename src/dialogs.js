import { state, DEFAULT_CONFIG } from './state.js';
import { clampNumber, showMessage } from './util.js';
import { getSelectedAnimation, isGroup, isOutlinerGroup, getSelectedRootGroups } from './blockbench_api.js';
import { saveConfigToStorage } from './config_storage.js';
import { tryInitWasm } from './wasm.js';
import { bakeToKeyframes } from './bake.js';
import { buildBoxDefsFromRoot, computePivotAabbWorld } from './capsules.js';

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
		title: 'BBPhysic 第一次解算：选择运动物件（生成碰撞体）',
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
			state.solveSetup.movingBoxes = buildBoxDefsFromRoot(root);
			saveConfigToStorage();
			showMessage('BBPhysic', `已生成运动物件碰撞体（OBB）：${state.solveSetup.movingBoxes.length} 个`);
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
			cloth_capture_selected: {
				label: '将当前选中的根骨骼保存为“布料组”（多条链互相弹性连接）',
				type: 'checkbox',
				value: Boolean(state.config.cloth_enabled),
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
			state.solveSetup.targetBoxes = buildBoxDefsFromRoot(root);
			state.solveSetup.targetAabb = computePivotAabbWorld(root);

			// Optional: enable cloth group and capture roots
			state.config.cloth_enabled = Boolean(state.config.cloth_enabled) || Boolean(formResult.cloth_capture_selected);

			// Capture cloth group roots from current Outliner selection
			if (Boolean(state.config.cloth_enabled) && Boolean(formResult.cloth_capture_selected)) {
				try {
					const roots = getSelectedRootGroups();
					state.config.cloth_roots_uuids = Array.isArray(roots)
						? roots.map((g) => String(g?.uuid || '')).filter((s) => s)
						: [];
				} catch (e) {
					state.config.cloth_roots_uuids = [];
				}
			}
			saveConfigToStorage();
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

function openSettingsBasicDialog() {
	const dialog = new Dialog('bbphysic_settings_basic', {
		title: 'BBPhysic 设置 / 基础',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			solve_scope: {
				label: '解算范围',
				type: 'select',
				value: state.config.solve_scope,
				options: { selected: '仅选中的根骨骼', all_roots: '所有根骨骼（全模型）' },
			},
			max_chain_depth: { label: '链条最大深度', type: 'number', value: state.config.max_chain_depth, min: 1, max: 128, step: 1 },
			preview_fps: { label: '预览帧率 (fps)', type: 'number', value: state.config.preview_fps, min: 1, max: 120, step: 1 },
			bake_fps: { label: 'Bake 采样帧率 (fps)', type: 'number', value: state.config.bake_fps, min: 1, max: 120, step: 1 },
		},
		onConfirm(formResult) {
			const scopeRaw = String(formResult.solve_scope ?? state.config.solve_scope);
			const solve_scope = scopeRaw === 'all_roots' ? 'all_roots' : 'selected';
			state.config = {
				...state.config,
				solve_scope,
				max_chain_depth: Math.round(clampNumber(formResult.max_chain_depth, 1, 128, state.config.max_chain_depth)),
				preview_fps: Math.round(clampNumber(formResult.preview_fps, 1, 120, state.config.preview_fps)),
				bake_fps: Math.round(clampNumber(formResult.bake_fps, 1, 120, state.config.bake_fps)),
			};
			saveConfigToStorage();
			showMessage('BBPhysic', '设置已保存（基础）。');
		},
	});
	dialog.show();
}

function openSettingsPhysicsDialog() {
	const dialog = new Dialog('bbphysic_settings_physics', {
		title: 'BBPhysic 设置 / 物理（Rapier）',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			follow_strength: { label: '电机刚度 (stiffness)', type: 'number', value: state.config.follow_strength, min: 0, max: 5000, step: 1 },
			follow_damping: { label: '电机阻尼 (damping)', type: 'number', value: state.config.follow_damping, min: 0, max: 2000, step: 1 },
			gravity_y: { label: '重力 Y (m/s^2)', type: 'number', value: state.config.gravity_y, min: -200, max: 200, step: 0.1 },
			lin_damping: { label: '线阻尼', type: 'number', value: state.config.lin_damping, min: 0, max: 50, step: 0.1 },
			ang_damping: { label: '角阻尼', type: 'number', value: state.config.ang_damping, min: 0, max: 50, step: 0.1 },
			collision_iterations: { label: '子步数 (substeps)', type: 'number', value: state.config.collision_iterations, min: 1, max: 32, step: 1 },
		},
		onConfirm(formResult) {
			state.config = {
				...state.config,
				follow_strength: clampNumber(formResult.follow_strength, 0, 5000, state.config.follow_strength),
				follow_damping: clampNumber(formResult.follow_damping, 0, 2000, state.config.follow_damping),
				gravity_y: clampNumber(formResult.gravity_y, -200, 200, state.config.gravity_y),
				lin_damping: clampNumber(formResult.lin_damping, 0, 50, state.config.lin_damping),
				ang_damping: clampNumber(formResult.ang_damping, 0, 50, state.config.ang_damping),
				collision_iterations: Math.round(clampNumber(formResult.collision_iterations, 1, 32, state.config.collision_iterations)),
			};
			saveConfigToStorage();
			state.wasmInitTried = false;
			state.wasm = null;
			tryInitWasm();
			showMessage('BBPhysic', '设置已保存（物理）。');
		},
	});
	dialog.show();
}

function openSettingsCollisionDialog() {
	const dialog = new Dialog('bbphysic_settings_collision', {
		title: 'BBPhysic 设置 / 碰撞（OBB）',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			collision_enabled: { label: '启用碰撞（仅 OBB）', type: 'checkbox', value: Boolean(state.config.collision_enabled) },
		},
		onConfirm(formResult) {
			state.config = { ...state.config, collision_enabled: Boolean(formResult.collision_enabled) };
			saveConfigToStorage();
			showMessage('BBPhysic', '设置已保存（碰撞）。');
		},
	});
	dialog.show();
}

function openSettingsClothDialog() {
	const dialog = new Dialog('bbphysic_settings_cloth', {
		title: 'BBPhysic 设置 / 布料组（Tip Ring）',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			cloth_enabled: { label: '启用布料组（多条链末端环连接）', type: 'checkbox', value: Boolean(state.config.cloth_enabled) },
		},
		onConfirm(formResult) {
			state.config = { ...state.config, cloth_enabled: Boolean(formResult.cloth_enabled) };
			saveConfigToStorage();
			showMessage('BBPhysic', '设置已保存（布料组）。');
		},
	});
	dialog.show();
}

function openSettingsDebugDialog() {
	const dialog = new Dialog('bbphysic_settings_debug', {
		title: 'BBPhysic 设置 / 调试',
		buttons: ['保存', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			debug_logging: { label: '输出调试日志（控制台）', type: 'checkbox', value: Boolean(state.config.debug_logging) },
			debug_log_frames: { label: '调试输出帧数', type: 'number', value: state.config.debug_log_frames, min: 0, max: 60, step: 1 },
		},
		onConfirm(formResult) {
			state.config = {
				...state.config,
				debug_logging: Boolean(formResult.debug_logging),
				debug_log_frames: Math.round(clampNumber(formResult.debug_log_frames, 0, 60, state.config.debug_log_frames)),
			};
			saveConfigToStorage();
			showMessage('BBPhysic', '设置已保存（调试）。');
		},
	});
	dialog.show();
}

function openSettingsDialogLegacy() {
	const dialog = new Dialog('bbphysic_settings', {
		title: 'BBPhysic 设置',
		buttons: ['打开', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			category: {
				label: '类别',
				type: 'select',
				value: 'basic',
				options: {
					basic: '基础',
					physics: '物理（Rapier）',
					collision: '碰撞（OBB）',
					cloth: '布料组（Tip Ring）',
					debug: '调试',
				},
			},
		},
		onConfirm(formResult) {
			const c = String(formResult.category || 'basic');
			if (c === 'physics') return openSettingsPhysicsDialog();
			if (c === 'collision') return openSettingsCollisionDialog();
			if (c === 'cloth') return openSettingsClothDialog();
			if (c === 'debug') return openSettingsDebugDialog();
			return openSettingsBasicDialog();
		},
	});
	dialog.show();
}

export function openSettingsDialog() {
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

		const dialog = new Dialog('bbphysic_settings', {
			title: 'BBPhysic 设置',
			buttons: ['保存', '关闭'],
			confirmIndex: 0,
			cancelIndex: 1,
			// Some Blockbench versions honor width/height; safe if ignored.
			width: 920,
			height: 520,
			lines: [html],
			onConfirm() {
				function el(id) {
					try {
						return /** @type {any} */ (document.getElementById(id));
					} catch (e) {
						return null;
					}
				}
				function readNumber(id, min, max, fallback) {
					const v = Number(el(id)?.value);
					return clampNumber(v, min, max, fallback);
				}
				function readInt(id, min, max, fallback) {
					return Math.round(readNumber(id, min, max, fallback));
				}
				function readBool(id, fallback = false) {
					const x = el(id);
					if (!x) return Boolean(fallback);
					return Boolean(x.checked);
				}
				function readStr(id, fallback = '') {
					const v = String(el(id)?.value ?? fallback);
					return v;
				}

				const scopeRaw = readStr('bbp_cfg_solve_scope', state.config.solve_scope);
				const solve_scope = scopeRaw === 'all_roots' ? 'all_roots' : 'selected';
				state.config = {
					...state.config,
					solve_scope,
					max_chain_depth: readInt('bbp_cfg_max_chain_depth', 1, 128, state.config.max_chain_depth),
					preview_fps: readInt('bbp_cfg_preview_fps', 1, 120, state.config.preview_fps),
					bake_fps: readInt('bbp_cfg_bake_fps', 1, 120, state.config.bake_fps),
					follow_strength: readNumber('bbp_cfg_follow_strength', 0, 5000, state.config.follow_strength),
					follow_damping: readNumber('bbp_cfg_follow_damping', 0, 2000, state.config.follow_damping),
					gravity_y: readNumber('bbp_cfg_gravity_y', -200, 200, state.config.gravity_y),
					lin_damping: readNumber('bbp_cfg_lin_damping', 0, 50, state.config.lin_damping),
					ang_damping: readNumber('bbp_cfg_ang_damping', 0, 50, state.config.ang_damping),
					hair_drag: readNumber('bbp_cfg_air_drag', 0, 50, state.config.air_drag),
					inertia_enabled: readBool('bbp_cfg_inertia_enabled', state.config.inertia_enabled),
					inertia_scale: readNumber('bbp_cfg_inertia_scale', 0, 5, state.config.inertia_scale),
					collision_iterations: readInt('bbp_cfg_collision_iterations', 1, 32, state.config.collision_iterations),
					collision_enabled: readBool('bbp_cfg_collision_enabled', state.config.collision_enabled),
					target_self_collision: readBool('bbp_cfg_target_self_collision', state.config.target_self_collision),
					cloth_enabled: readBool('bbp_cfg_cloth_enabled', state.config.cloth_enabled),
					debug_logging: readBool('bbp_cfg_debug_logging', state.config.debug_logging),
					debug_log_frames: readInt('bbp_cfg_debug_log_frames', 0, 60, state.config.debug_log_frames),
				};
				saveConfigToStorage();
				showMessage('BBPhysic', '设置已保存。');
			},
		});
		dialog.show();

		// Wire navigation + fill defaults (best-effort; fails gracefully on older Blockbench).
		setTimeout(() => {
			try {
				const root = document.getElementById('bbp_settings_root');
				if (!root) return;

				/** @param {string} page */
				function setActive(page) {
					const panels = Array.from(root.querySelectorAll('.bbp_settings_panel'));
					for (const p of panels) {
						p.dataset.active = p.getAttribute('data-page') === page ? '1' : '0';
					}
					const btns = Array.from(root.querySelectorAll('#bbp_settings_nav button[data-page]'));
					for (const b of btns) {
						const on = b.getAttribute('data-page') === page;
						b.style.fontWeight = on ? '600' : '';
					}
				}

				function setValue(id, v) {
					const e = /** @type {any} */ (document.getElementById(id));
					if (!e) return;
					if (e.type === 'checkbox') e.checked = Boolean(v);
					else e.value = String(v);
				}

				setValue('bbp_cfg_solve_scope', state.config.solve_scope);
				setValue('bbp_cfg_max_chain_depth', state.config.max_chain_depth);
				setValue('bbp_cfg_preview_fps', state.config.preview_fps);
				setValue('bbp_cfg_bake_fps', state.config.bake_fps);
				setValue('bbp_cfg_follow_strength', state.config.follow_strength);
				setValue('bbp_cfg_follow_damping', state.config.follow_damping);
				setValue('bbp_cfg_gravity_y', state.config.gravity_y);
				setValue('bbp_cfg_lin_damping', state.config.lin_damping);
				setValue('bbp_cfg_ang_damping', state.config.ang_damping);
				setValue('bbp_cfg_air_drag', state.config.air_drag);
				setValue('bbp_cfg_inertia_enabled', state.config.inertia_enabled);
				setValue('bbp_cfg_inertia_scale', state.config.inertia_scale);
				setValue('bbp_cfg_collision_iterations', state.config.collision_iterations);
				setValue('bbp_cfg_collision_enabled', state.config.collision_enabled);
				setValue('bbp_cfg_target_self_collision', state.config.target_self_collision);
				setValue('bbp_cfg_cloth_enabled', state.config.cloth_enabled);
				setValue('bbp_cfg_debug_logging', state.config.debug_logging);
				setValue('bbp_cfg_debug_log_frames', state.config.debug_log_frames);

				// Hook reset-default buttons for number inputs
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
					bbp_cfg_debug_log_frames: DEFAULT_CONFIG.debug_log_frames,
				};
				const resetButtons = Array.from(root.querySelectorAll('.bbp_reset_btn'));
				for (const btn of resetButtons) {
					btn.addEventListener('click', () => {
						const id = String(btn.getAttribute('data-for') || '');
						if (!id) return;
						const def = /** @type {any} */ (defaults)[id];
						const inp = /** @type {any} */ (document.getElementById(id));
						if (!inp || typeof def === 'undefined') return;
						inp.value = String(def);
						try {
							inp.dispatchEvent(new Event('change'));
							inp.animate?.([
								{ background: 'rgba(120,200,120,0.25)' },
								{ background: 'transparent' },
							], { duration: 300, easing: 'ease-out' });
						} catch (_) {}
					});
				}

				const btns = Array.from(root.querySelectorAll('#bbp_settings_nav button[data-page]'));
				for (const b of btns) {
					b.addEventListener('click', () => {
						const page = String(b.getAttribute('data-page') || 'basic');
						setActive(page);
					});
				}
				setActive('basic');
			} catch (e) {
				// ignore
			}
		}, 0);
	} catch (e) {
		// Older Blockbench versions may not support Dialog.lines HTML; fallback.
		openSettingsDialogLegacy();
	}
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
	let nowTime = 0;
	try {
		if (typeof Timeline !== 'undefined' && Timeline) nowTime = Number(Timeline.time) || 0;
	} catch (e) {
		// ignore
	}
		const dialog = new Dialog('bbphysic_bake', {
		title: 'BBPhysic Bake（预烘培）',
		buttons: ['开始 Bake', '取消'],
		confirmIndex: 0,
		cancelIndex: 1,
		form: {
			start: { label: '起始时间 (s)', type: 'number', value: 0, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
			end: { label: '结束时间 (s)', type: 'number', value: endDefault, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
			anchor_enabled: { label: '从锚点时间开始解算（向前+向后）', type: 'checkbox', value: false },
			anchor_time: { label: '锚点时间 (s)', type: 'number', value: nowTime, min: 0, max: endDefault, step: 1 / Math.max(1, state.config.bake_fps) },
			fps: { label: '采样帧率 (fps)', type: 'number', value: state.config.bake_fps, min: 1, max: 120, step: 1 },
			axis: {
				label: '作用轴',
				type: 'select',
				value: state.config.bake_axis,
				options: { x: 'X', y: 'Y', z: 'Z' },
			},
			overwrite: { label: '覆盖同时间已有关键帧', type: 'checkbox', value: true },
		},
		onConfirm(formResult) {
			const start = clampNumber(formResult.start, 0, endDefault, 0);
			const end = clampNumber(formResult.end, 0, endDefault, endDefault);
			const anchor_enabled = Boolean(formResult.anchor_enabled);
			const anchor_time = clampNumber(formResult.anchor_time, 0, endDefault, nowTime);
			const fps = Math.round(clampNumber(formResult.fps, 1, 120, state.config.bake_fps));
			const axisRawSafe = formResult && typeof formResult.axis === 'string' ? formResult.axis : state.config.bake_axis;
			const axisRaw = String(axisRawSafe || state.config.bake_axis || 'x').trim().toLowerCase();
			const axis = axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : state.config.bake_axis || 'x';
			state.config = { ...state.config, bake_axis: /** @type {any} */ (axis) };
			saveConfigToStorage();
			const overwrite = Boolean(formResult.overwrite);
			bakeToKeyframes({ start, end, fps, axis, overwrite, anchor_enabled, anchor_time });
		},
	});
	dialog.show();
}

import { PLUGIN_ID, PLUGIN_VERSION, state, resetRuntimeState } from './state.js';
import { notify } from './util.js';
import { loadConfigFromStorage } from './config_storage.js';
import { openBakeDialog, openSettingsDialog, openStep1MovingObjectDialog, openStep2TargetObjectDialog } from './dialogs.js';
import { togglePreview, stopPreview } from './preview.js';
import { toggleBoxGhost, disposeBoxGhost } from './box_visual.js';
import { tryInitWasm } from './wasm.js';

function safeAddToMenu(action, path) {
	try {
		MenuBar.addAction(action, path);
	} catch (e) {
		console.warn('[BBPhysic] Failed to add menu action', { path, action: action?.id }, e);
	}
}

function safeRemoveFromMenu(path) {
	try {
		MenuBar.removeAction(path);
	} catch (e) {
		// ignore
	}
}

export function registerPlugin() {
	Plugin.register(PLUGIN_ID, {
		title: 'BBPhysic',
		author: 'BBPhysic Contributors',
		description: '为 Blockbench 提供轻量裙摆物理解算与关键帧预烘培（开发中）',
		icon: 'scatter_plot',
		variant: 'both',
		version: PLUGIN_VERSION,

		onload() {
			resetRuntimeState();
			loadConfigFromStorage();
			tryInitWasm();

			state.actions.step1_moving = new Action('bbphysic_step1_moving', {
				name: 'BBPhysic: 第一次解算（选择运动物件）',
				icon: 'directions_run',
				category: 'Tools',
				click() {
					openStep1MovingObjectDialog();
				},
			});

			state.actions.step2_target = new Action('bbphysic_step2_target', {
				name: 'BBPhysic: 第二次解算（选择被解算物理部件）',
				icon: 'select_all',
				category: 'Tools',
				click() {
					openStep2TargetObjectDialog();
				},
			});

			state.actions.settings = new Action('bbphysic_settings', {
				name: 'BBPhysic: 设置',
				icon: 'tune',
				category: 'Tools',
				click() {
					openSettingsDialog();
				},
			});

			state.actions.bake = new Action('bbphysic_bake', {
				name: 'BBPhysic: 第三次解算（碰撞 + Bake 生成关键帧）',
				icon: 'key',
				category: 'Tools',
				click() {
					openBakeDialog();
				},
			});

			state.actions.preview = new Action('bbphysic_preview', {
				name: 'BBPhysic: 预览（开/关）',
				icon: 'play_arrow',
				category: 'Tools',
				click() {
					togglePreview();
				},
			});

			state.actions.ghost = new Action('bbphysic_ghost', {
				name: 'BBPhysic: OBB 虚影（开/关）',
				icon: 'visibility',
				category: 'Tools',
				click() {
					toggleBoxGhost();
				},
			});

			safeAddToMenu(state.actions.settings, 'tools.0');
			safeAddToMenu(state.actions.step1_moving, 'tools.0');
			safeAddToMenu(state.actions.step2_target, 'tools.0');
			safeAddToMenu(state.actions.bake, 'tools.0');
			safeAddToMenu(state.actions.preview, 'tools.0');
			safeAddToMenu(state.actions.ghost, 'tools.0');

			notify(`BBPhysic 已加载（v${PLUGIN_VERSION}）：仅 Bake 模式`, 2500);
		},

		onunload() {
			resetRuntimeState();
			safeRemoveFromMenu('tools.bbphysic_settings');
			safeRemoveFromMenu('tools.bbphysic_step1_moving');
			safeRemoveFromMenu('tools.bbphysic_step2_target');
			safeRemoveFromMenu('tools.bbphysic_bake');
			safeRemoveFromMenu('tools.bbphysic_preview');
			safeRemoveFromMenu('tools.bbphysic_ghost');

			try {
				stopPreview();
			} catch (e) {
				// ignore
			}

			try {
				disposeBoxGhost();
			} catch (e) {
				// ignore
			}

			if (state.actions.settings) state.actions.settings.delete();
			if (state.actions.step1_moving) state.actions.step1_moving.delete();
			if (state.actions.step2_target) state.actions.step2_target.delete();
			if (state.actions.bake) state.actions.bake.delete();
			if (state.actions.preview) state.actions.preview.delete();
			if (state.actions.ghost) state.actions.ghost.delete();
		},
	});
}

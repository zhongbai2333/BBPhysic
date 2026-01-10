import type { BBPhysicWasmExports } from '../wasm/loader';
import { loadBBPhysicWasm } from '../wasm/loader';
import { registerBBPhysicTranslations, t } from '../i18n';
import { openBBPhysicSettingsDialog } from '../ui/settings_dialog';
import { openBBPhysicSolveDialog } from '../ui/solve_dialog';
import { disableWireframe, enableWireframe, isWireframeEnabled } from '../debug/wireframe';

let wasmExports: BBPhysicWasmExports | undefined;
let uiDeletables: Deletable[] = [];

let selectedSolveRootUuid: string | null = null;
let previewEnabled = false;
let debugWireframeEnabled = false;

function safeDeleteAll(items: Deletable[]) {
  for (const it of items.splice(0, items.length)) {
    try {
      it.delete();
    } catch {
      // ignore
    }
  }
}

function registerTopMenu(plugin: Plugin) {
  const actions: (Action | Toggle)[] = [];

  const actionSettings = new Action('bbphysic_menu_settings', {
    name: t('bbphysic.action.settings', '设置'),
    icon: 'tune',
    category: 'Tools',
    click() {
      openBBPhysicSettingsDialog();
    },
  });
  actions.push(actionSettings);

  const actionPickRoot = new Action('bbphysic_menu_pick_root', {
    name: t('bbphysic.action.pick_root', '选择参与解算的根 Group'),
    icon: 'account_tree',
    category: 'Tools',
    click() {
      // New flow: open the solve dialog (two-group selection)
      openBBPhysicSolveDialog();
    },
  });
  actions.push(actionPickRoot);

  const actionSolveOnce = new Action('bbphysic_menu_solve', {
    name: t('bbphysic.action.solve_once', '开始解算'),
    icon: 'play_arrow',
    category: 'Tools',
    click() {
      openBBPhysicSolveDialog();
    },
  });
  actions.push(actionSolveOnce);

  const actionPreview = new Toggle('bbphysic_menu_preview', {
    name: t('bbphysic.action.preview', '预览（实时解算）'),
    icon: 'visibility',
    category: 'Tools',
    default: previewEnabled,
    onChange(value) {
      previewEnabled = value;
      Blockbench.showQuickMessage(
        value
          ? t('bbphysic.msg.preview_on', 'BBPhysic: 预览 开启（TODO）')
          : t('bbphysic.msg.preview_off', 'BBPhysic: 预览 关闭（TODO）'),
        1800
      );
    },
  });
  actions.push(actionPreview);

  const actionWireframe = new Toggle('bbphysic_menu_wireframe', {
    name: t('bbphysic.action.wireframe', '线框标出关节/碰撞体'),
    icon: 'grid_on',
    category: 'Tools',
    default: debugWireframeEnabled,
    onChange(value) {
      debugWireframeEnabled = value;
      if (value) enableWireframe();
      else disableWireframe();
    },
  });
  actions.push(actionWireframe);

  // Create a top-level menu tab in the title/menu bar.
  const menu = new BarMenu('bbphysic', [
    actionSettings,
    actionPickRoot,
    actionSolveOnce,
    actionPreview,
    actionWireframe,
  ]);
  try {
    menu.name = t('menu.bbphysic', 'BBPhysic');
  } catch {
    // ignore
  }

  try {
    (MenuBar as any).menus['bbphysic'] = menu;
    MenuBar.update();
  } catch (e) {
    console.warn('[BBPhysic] Failed to register top menu', e);
  }

  // Track for cleanup
  uiDeletables.push(...actions, menu);

  // Ensure plugin owns these deletables
  for (const d of uiDeletables) {
    try {
      (d as any).plugin = (plugin as any).id;
    } catch {
      // ignore
    }
  }
}

export function registerBBPhysicPlugin() {
  const pluginApi = ((globalThis as any).BBPlugin ?? (globalThis as any).Plugin) as {
    register: (id: string, data: PluginOptions) => Plugin;
  };

  // NOTE: 插件 ID 必须与最终文件名一致（dist/bbphysic.js -> id: 'bbphysic'）
  pluginApi.register('bbphysic', {
    title: 'BBPhysic',
    author: 'zhongbai2333',
    description: 'Physics/collision helpers for Blockbench (work in progress)',
    icon: 'sports_mma',
    version: '0.0.1',
    variant: 'both',
    async onload(this: Plugin) {
      registerBBPhysicTranslations();

      // UI first (menu entries are available even if WASM fails)
      safeDeleteAll(uiDeletables);
      registerTopMenu(this);

      try {
        const wasm = await loadBBPhysicWasm(this);
        const abi = wasm.exports.bbp_abi_version();
        wasmExports = wasm.exports;
        Blockbench.showQuickMessage(`BBPhysic wasm 已加载 (ABI ${abi})`, 1500);
      } catch (e) {
        console.error('[BBPhysic] Failed to load wasm', e);
        Blockbench.showQuickMessage('BBPhysic wasm 加载失败（仅插件骨架可用）', 4000);
      }
    },
    onunload() {
      wasmExports = undefined;
      selectedSolveRootUuid = null;
      previewEnabled = false;
      debugWireframeEnabled = false;
      try {
        if (isWireframeEnabled()) disableWireframe();
      } catch {
        // ignore
      }
      try {
        delete (MenuBar as any).menus['bbphysic'];
        MenuBar.update();
      } catch {
        // ignore
      }
      safeDeleteAll(uiDeletables);
    }
  });
}

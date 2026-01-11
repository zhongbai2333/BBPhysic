import type { BBPhysicWasmExports } from '../wasm/loader';
import { ensureBBPhysicWasmModule, clearBBPhysicWasmModule, setBBPhysicPlugin } from '../wasm/runtime';
import { registerBBPhysicTranslations, t } from '../i18n';
import { openBBPhysicSettingsDialog } from '../ui/settings_dialog';
import { openBBPhysicSolveDialog } from '../ui/solve_dialog';
import { disableWireframe, enableWireframe, isWireframeEnabled } from '../debug/wireframe';
import { 
  startPhysicsPreview, 
  stopPhysicsPreview, 
  togglePausePhysicsPreview,
  resetPhysicsPreview,
  isPreviewRunning 
} from '../physics/preview';

let wasmExports: BBPhysicWasmExports | undefined;
let uiDeletables: Deletable[] = [];

let selectedSolveRootUuid: string | null = null;
let previewEnabled = false;
let debugWireframeEnabled = false;

let physicsMode: any | null = null;
let physicsDragTool: any | null = null;

function safeDeleteBarItemById(id: string) {
  try {
    const it = (BarItems as any)?.[id];
    if (it && typeof it.delete === 'function') {
      it.delete();
    }
  } catch {
    // ignore
  }
}

function safeDeleteModeById(id: string) {
  try {
    const it = (Modes as any)?.options?.[id];
    if (it && typeof it.delete === 'function') {
      it.delete();
    }
  } catch {
    // ignore
  }
}

function removeToolButtonsFromDom(toolId: string, keepOne: boolean) {
  if (typeof document === 'undefined') return;
  try {
    const nodes = Array.from(document.querySelectorAll(`[id="${toolId}"]`));
    if (nodes.length <= 1) return;
    const start = keepOne ? 1 : 0;
    for (let i = nodes.length - 1; i >= start; i--) {
      const el = nodes[i] as any as HTMLElement;
      el?.remove?.();
    }
  } catch {
    // ignore
  }
}

function cleanupStalePhysicsUI() {
  // Be robust against Blockbench UI caching or failed previous unload.
  safeDeleteBarItemById('bbphysic_drag');
  safeDeleteModeById('bbphysic_physics');
  // If Blockbench ended up rendering duplicates, remove all remnants.
  removeToolButtonsFromDom('bbphysic_drag', false);
}

function refreshModesBarUI() {
  const attempt = () => {
    try {
      const modes: any = (globalThis as any).Modes;
      const vue = modes?.vue;
      vue?.$forceUpdate?.();
      vue?.$nextTick?.(() => {
        try {
          vue?.$forceUpdate?.();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  };

  attempt();
  try {
    setTimeout(attempt, 0);
    setTimeout(attempt, 100);
    setTimeout(attempt, 500);
  } catch {
    // ignore
  }
}

function safeDeleteAll(items: Deletable[]) {
  for (const it of items.splice(0, items.length)) {
    try {
      it.delete();
    } catch {
      // ignore
    }
  }
}

function registerPhysicsMode(plugin: Plugin) {
  // Blockbench supports custom modes via `new Mode(id, options)`.
  // We use it as a "Physics Mode" entry: onSelect starts preview, onUnselect stops.
  try {
    const existing = (Modes as any)?.options?.['bbphysic_physics'];
    if (existing) {
      physicsMode = existing;
      return;
    }
  } catch {
    // ignore
  }

  try {
    const ModeCtor = (globalThis as any).Mode as any;
    if (typeof ModeCtor !== 'function') return;

    physicsMode = new ModeCtor('bbphysic_physics', {
      name: t('bbphysic.mode.physics', '物理'),
      icon: 'sports_mma',
      // Use a built-in-ish category so it shows up in the top-right mode bar consistently.
      category: 'edit',
      // In physics mode, default to the custom drag tool so left-drag can be captured reliably.
      default_tool: 'bbphysic_drag',
      selectElements: true,
      onSelect: async () => {
        try {
          await startPhysicsPreview();
        } catch {
          // ignore
        }
      },
      onUnselect: () => {
        try {
          stopPhysicsPreview();
        } catch {
          // ignore
        }
      },
    });
    try {
      (physicsMode as any).plugin = (plugin as any).id;
    } catch {
      // ignore
    }
    uiDeletables.push(physicsMode as any);
    refreshModesBarUI();
  } catch (e) {
    console.warn('[BBPhysic] Failed to register physics mode', e);
  }
}

function registerPhysicsDragTool(plugin: Plugin) {
  try {
    const existing = (BarItems as any)?.['bbphysic_drag'];
    if (existing) {
      physicsDragTool = existing;
      // In case UI duplicated, keep only one button.
      removeToolButtonsFromDom('bbphysic_drag', true);
      return;
    }
  } catch {
    // ignore
  }

  try {
    const ToolCtor = (globalThis as any).Tool as any;
    if (typeof ToolCtor !== 'function') return;

    physicsDragTool = new ToolCtor('bbphysic_drag', {
      name: t('bbphysic.tool.drag', '物理拖拽'),
      icon: 'pan_tool',
      category: 'BBPhysic',
      modes: ['bbphysic_physics'],
      selectElements: true,
      click() {
        // Tool selection is handled by Blockbench; input is handled in preview.ts.
      },
    });

    try {
      (physicsDragTool as any).plugin = (plugin as any).id;
    } catch {
      // ignore
    }

    uiDeletables.push(physicsDragTool as any);
    // NOTE: Blockbench will place tools into the toolbox automatically.
    // Explicit Toolbox.add can cause duplicate buttons depending on BB version.
    removeToolButtonsFromDom('bbphysic_drag', true);
  } catch (e) {
    console.warn('[BBPhysic] Failed to register physics drag tool', e);
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
    name: t('bbphysic.action.preview', '预览（实时OBB解算）'),
    icon: 'visibility',
    category: 'Tools',
    default: previewEnabled,
    async onChange(value) {
      previewEnabled = value;
      if (value) {
        // Start preview
        const success = await startPhysicsPreview();
        if (!success) {
          // Revert toggle if failed
          previewEnabled = false;
          this.value = false;
        }
      } else {
        // Stop preview
        stopPhysicsPreview();
      }
    },
  });
  actions.push(actionPreview);

  // Add pause/resume action
  const actionPause = new Action('bbphysic_menu_pause', {
    name: t('bbphysic.action.pause', '暂停/恢复预览'),
    icon: 'pause',
    category: 'Tools',
    condition: () => isPreviewRunning(),
    click() {
      togglePausePhysicsPreview();
    },
  });
  actions.push(actionPause);

  // Add reset action
  const actionReset = new Action('bbphysic_menu_reset', {
    name: t('bbphysic.action.reset', '重置预览'),
    icon: 'refresh',
    category: 'Tools',
    condition: () => isPreviewRunning(),
    click() {
      resetPhysicsPreview();
    },
  });
  actions.push(actionReset);

  const actionEnterPhysicsMode = new Action('bbphysic_menu_physics_mode', {
    name: t('bbphysic.action.physics_mode', '进入物理模式'),
    icon: 'sports_mma',
    category: 'Tools',
    click() {
      try {
        const m = (Modes as any)?.options?.['bbphysic_physics'] ?? physicsMode;
        if (m && typeof m.select === 'function') {
          m.select();
          return;
        }
      } catch {
        // ignore
      }
      try {
        Blockbench.showQuickMessage('物理模式未注册（可能是 Blockbench 版本较旧）', 2000);
      } catch {
        // ignore
      }
    },
  });
  actions.push(actionEnterPhysicsMode);

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
    '_', // Separator
    actionPreview,
    actionPause,
    actionReset,
    actionEnterPhysicsMode,
    '_', // Separator
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

      // Hard cleanup first: avoids duplicated tools/modes in some Blockbench reload paths.
      cleanupStalePhysicsUI();

      // Make settings available globally for preview without requiring opening the settings dialog.
      try {
        const raw = localStorage.getItem('bbphysic.settings.v1');
        (window as any).BBPhysicSettings = raw ? JSON.parse(raw) : {};
      } catch {
        try {
          (window as any).BBPhysicSettings = {};
        } catch {
          // ignore
        }
      }

      // Make plugin reference available to preview/wasm loader.
      setBBPhysicPlugin(this);

      // UI first (menu entries are available even if WASM fails)
      safeDeleteAll(uiDeletables);
      registerPhysicsDragTool(this);
      registerPhysicsMode(this);
      registerTopMenu(this);

      try {
          const wasm = await ensureBBPhysicWasmModule(this);
        const abi = wasm.exports.bbp_abi_version();
        wasmExports = wasm.exports;
        Blockbench.showQuickMessage(`BBPhysic wasm 已加载 (ABI ${abi})`, 1500);
      } catch (e) {
        console.error('[BBPhysic] Failed to load wasm', e);
        Blockbench.showQuickMessage('BBPhysic wasm 加载失败（仅插件骨架可用）', 4000);
      }
    },
    onunload() {
      // Stop physics preview if running
      try {
        if (isPreviewRunning()) stopPhysicsPreview();
      } catch {
        // ignore
      }
      physicsMode = null;
      physicsDragTool = null;
      wasmExports = undefined;
        clearBBPhysicWasmModule();
        setBBPhysicPlugin(null);
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

      // Extra safety: ensure no stray duplicate buttons remain.
      removeToolButtonsFromDom('bbphysic_drag', false);

      try {
        delete (window as any).BBPhysicSettings;
      } catch {
        // ignore
      }
    }
  });
}

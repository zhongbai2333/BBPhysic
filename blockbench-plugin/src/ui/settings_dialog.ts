import { t } from '../i18n';

type BBPhysicSettings = {
  enabled: boolean;
  unit_scale: number;

  gravity: [number, number, number];
  timestep: number;
  iterations: number;
  linear_damping: number;
  max_linear_velocity: number;
  max_angular_velocity: number;
  max_step_displacement: number;

  collision_layer: string;
  collision_mask: string;
  self_collision: boolean;
  friction: number;
  restitution: number;

  wireframe_color: string;
  wireframe_opacity: number;
  show_joint_markers: boolean;
  show_collider_markers: boolean;

  debug_wireframe: boolean;
  debug_log_level: 'off' | 'error' | 'warn' | 'info' | 'debug';
};

const SETTINGS_STORAGE_KEY = 'bbphysic.settings.v1';

const DEFAULT_SETTINGS: BBPhysicSettings = {
  enabled: true,
  unit_scale: 1,

  gravity: [0, -9.81, 0],
  timestep: 1 / 60,
  iterations: 8,
  linear_damping: 0.05,
  max_linear_velocity: 100,
  max_angular_velocity: 50,
  max_step_displacement: 2,

  collision_layer: 'default',
  collision_mask: 'default',
  self_collision: false,
  friction: 0.5,
  restitution: 0.0,

  wireframe_color: '#00c8ff',
  wireframe_opacity: 0.5,
  show_joint_markers: true,
  show_collider_markers: true,

  debug_wireframe: false,
  debug_log_level: 'warn',
};

function loadSettings(): BBPhysicSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<BBPhysicSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      gravity: (Array.isArray(parsed.gravity) && parsed.gravity.length === 3
        ? (parsed.gravity as any)
        : DEFAULT_SETTINGS.gravity) as [number, number, number],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: BBPhysicSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function ensureStylesInjected() {
  const id = 'bbphysic_settings_styles';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
  .dialog#bbphysic_settings, #bbphysic_settings {
    min-height: 560px;
  }
  .bbphysic-reset-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-left: 6px;
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.75;
    user-select: none;
  }
  .bbphysic-reset-btn:hover {
    opacity: 1;
    background: var(--color-back, rgba(0,0,0,0.08));
  }
  .bbphysic-reset-btn i {
    font-size: 18px;
    line-height: 18px;
  }
  `;
  document.head.appendChild(style);
}

let settingsDialog: Dialog | null = null;
let rafHandle: number | null = null;
let fpsLastTs = 0;
let fpsFrames = 0;
let fpsValue = 0;

export function openBBPhysicSettingsDialog() {
  ensureStylesInjected();

  if (settingsDialog) {
    try {
      settingsDialog.show();
      settingsDialog.focus();
      return;
    } catch {
      settingsDialog = null;
    }
  }

  let settings = loadSettings();

  const pageFields: Record<string, string[]> = {
    general: ['enabled', 'unit_scale'],
    physics: [
      'gravity',
      'timestep',
      'iterations',
      'linear_damping',
      'max_linear_velocity',
      'max_angular_velocity',
      'max_step_displacement',
    ],
    collision: ['collision_layer', 'collision_mask', 'self_collision', 'friction', 'restitution'],
    display: [
      'wireframe_color',
      'wireframe_opacity',
      'show_joint_markers',
      'show_collider_markers',
      'wireframe_fps',
    ],
    debug: ['debug_wireframe', 'debug_log_level'],
  };

  const defaultsByKey: Record<string, any> = {
    enabled: DEFAULT_SETTINGS.enabled,
    unit_scale: DEFAULT_SETTINGS.unit_scale,

    gravity: DEFAULT_SETTINGS.gravity,
    timestep: DEFAULT_SETTINGS.timestep,
    iterations: DEFAULT_SETTINGS.iterations,
    linear_damping: DEFAULT_SETTINGS.linear_damping,
    max_linear_velocity: DEFAULT_SETTINGS.max_linear_velocity,
    max_angular_velocity: DEFAULT_SETTINGS.max_angular_velocity,
    max_step_displacement: DEFAULT_SETTINGS.max_step_displacement,

    collision_layer: DEFAULT_SETTINGS.collision_layer,
    collision_mask: DEFAULT_SETTINGS.collision_mask,
    self_collision: DEFAULT_SETTINGS.self_collision,
    friction: DEFAULT_SETTINGS.friction,
    restitution: DEFAULT_SETTINGS.restitution,

    wireframe_color: DEFAULT_SETTINGS.wireframe_color,
    wireframe_opacity: DEFAULT_SETTINGS.wireframe_opacity,
    show_joint_markers: DEFAULT_SETTINGS.show_joint_markers,
    show_collider_markers: DEFAULT_SETTINGS.show_collider_markers,

    debug_wireframe: DEFAULT_SETTINGS.debug_wireframe,
    debug_log_level: DEFAULT_SETTINGS.debug_log_level,
  };

  const form: InputFormConfig = {
    enabled: {
      label: t('bbphysic.settings.enabled', '启用 BBPhysic'),
      type: 'checkbox',
      style: 'toggle_switch',
      value: settings.enabled,
    },
    unit_scale: {
      label: t('bbphysic.settings.unit_scale', '单位缩放'),
      description: t('bbphysic.settings.unit_scale.desc', '将 Blockbench 单位映射到物理世界单位的倍率'),
      type: 'number',
      min: 0.0001,
      step: 0.01,
      value: settings.unit_scale,
    },

    gravity: {
      label: t('bbphysic.settings.gravity', '重力'),
      type: 'vector',
      dimensions: 3,
      value: settings.gravity,
    },
    timestep: {
      label: t('bbphysic.settings.timestep', '时间步长'),
      description: t('bbphysic.settings.timestep.desc', '单次 step 的 dt（秒），预览模式会以该 dt 推进'),
      type: 'number',
      min: 0.0001,
      step: 0.0001,
      value: settings.timestep,
    },
    iterations: {
      label: t('bbphysic.settings.iterations', '迭代次数'),
      type: 'number',
      min: 1,
      step: 1,
      force_step: true,
      value: settings.iterations,
    },
    linear_damping: {
      label: t('bbphysic.settings.linear_damping', '线性阻尼'),
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      value: settings.linear_damping,
    },
    max_linear_velocity: {
      label: t('bbphysic.settings.max_linear_velocity', '最大线速度'),
      description: t('bbphysic.settings.max_linear_velocity.desc', '用于限制解算结果的最大线速度（单位/秒）'),
      type: 'number',
      min: 0,
      step: 0.1,
      value: settings.max_linear_velocity,
    },
    max_angular_velocity: {
      label: t('bbphysic.settings.max_angular_velocity', '最大角速度'),
      description: t('bbphysic.settings.max_angular_velocity.desc', '用于限制解算结果的最大角速度（弧度/秒）'),
      type: 'number',
      min: 0,
      step: 0.1,
      value: settings.max_angular_velocity,
    },
    max_step_displacement: {
      label: t('bbphysic.settings.max_step_displacement', '最大单步位移'),
      description: t('bbphysic.settings.max_step_displacement.desc', '用于限制单次 step 的最大位移（单位）'),
      type: 'number',
      min: 0,
      step: 0.01,
      value: settings.max_step_displacement,
    },

    collision_layer: {
      label: t('bbphysic.settings.collision_layer', '碰撞层'),
      type: 'select',
      value: settings.collision_layer,
      options: {
        default: t('bbphysic.settings.collision_layer.default', '默认'),
        layer1: t('bbphysic.settings.collision_layer.layer1', '层 1'),
        layer2: t('bbphysic.settings.collision_layer.layer2', '层 2'),
        layer3: t('bbphysic.settings.collision_layer.layer3', '层 3'),
      },
    },
    collision_mask: {
      label: t('bbphysic.settings.collision_mask', '碰撞过滤'),
      description: t(
        'bbphysic.settings.collision_mask.desc',
        '用于过滤可碰撞对象的规则（占位：后续可做成多选/位掩码）'
      ),
      type: 'text',
      value: settings.collision_mask,
    },
    self_collision: {
      label: t('bbphysic.settings.self_collision', '启用自碰撞'),
      type: 'checkbox',
      style: 'toggle_switch',
      value: settings.self_collision,
    },
    friction: {
      label: t('bbphysic.settings.friction', '摩擦系数'),
      type: 'number',
      min: 0,
      step: 0.01,
      value: settings.friction,
    },
    restitution: {
      label: t('bbphysic.settings.restitution', '弹性系数'),
      type: 'number',
      min: 0,
      step: 0.01,
      value: settings.restitution,
    },

    wireframe_color: {
      label: t('bbphysic.settings.wireframe_color', '线框颜色'),
      type: 'color',
      value: settings.wireframe_color,
    },
    wireframe_opacity: {
      label: t('bbphysic.settings.wireframe_opacity', '线框透明度'),
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      value: settings.wireframe_opacity,
    },
    show_joint_markers: {
      label: t('bbphysic.settings.show_joint_markers', '显示关节标识'),
      type: 'checkbox',
      style: 'checkbox',
      value: settings.show_joint_markers,
    },
    show_collider_markers: {
      label: t('bbphysic.settings.show_collider_markers', '显示碰撞体标识'),
      type: 'checkbox',
      style: 'checkbox',
      value: settings.show_collider_markers,
    },
    wireframe_fps: {
      label: t('bbphysic.settings.wireframe_fps', '线框预览 FPS'),
      description: t('bbphysic.settings.wireframe_fps.desc', '预览/线框渲染的帧率（占位）'),
      type: 'text',
      readonly: true,
      value: '--',
    },

    debug_wireframe: {
      label: t('bbphysic.settings.debug_wireframe', '线框调试'),
      type: 'checkbox',
      style: 'checkbox',
      value: settings.debug_wireframe,
    },
    debug_log_level: {
      label: t('bbphysic.settings.debug_log_level', '日志等级'),
      type: 'select',
      value: settings.debug_log_level,
      options: {
        off: t('bbphysic.settings.log.off', '关闭'),
        error: t('bbphysic.settings.log.error', '错误'),
        warn: t('bbphysic.settings.log.warn', '警告'),
        info: t('bbphysic.settings.log.info', '信息'),
        debug: t('bbphysic.settings.log.debug', '调试'),
      },
    },
  };

  const setPageVisibility = (dialog: Dialog, page: string) => {
    for (const [p, keys] of Object.entries(pageFields)) {
      const visible = p === page;
      for (const key of keys) {
        try {
          const bar = dialog.getFormBar(key);
          bar.toggle(visible);
        } catch {
          // ignore
        }
      }
    }
  };

  const stopFpsLoop = () => {
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  };

  const startFpsLoop = () => {
    stopFpsLoop();
    fpsLastTs = performance.now();
    fpsFrames = 0;
    fpsValue = 0;

    const tick = (ts: number) => {
      fpsFrames++;
      const dt = ts - fpsLastTs;
      if (dt >= 1000) {
        fpsValue = Math.max(0, Math.round((fpsFrames * 1000) / dt));
        fpsFrames = 0;
        fpsLastTs = ts;
        try {
          const current = settingsDialog!.getFormResult();
          const enabled = Boolean((current as any).debug_wireframe);
          settingsDialog!.setFormValues({ wireframe_fps: enabled ? String(fpsValue) : '--' }, false);
        } catch {
          // ignore
        }
      }
      rafHandle = requestAnimationFrame(tick);
    };

    rafHandle = requestAnimationFrame(tick);
  };

  settingsDialog = new Dialog('bbphysic_settings', {
    title: t('bbphysic.settings.title', 'BBPhysic 设置'),
    width: 720,
    resizable: 'xy',
    buttons: [t('generic.close', '关闭')],
    singleButton: true,
    form,
    sidebar: {
      page: 'general',
      pages: {
        general: {
          label: t('bbphysic.settings.page.general', '常规'),
          icon: 'tune',
        },
        physics: {
          label: t('bbphysic.settings.page.physics', '物理'),
          icon: 'motion_photos_on',
        },
        collision: {
          label: t('bbphysic.settings.page.collision', '碰撞'),
          icon: 'select_all',
        },
        display: {
          label: t('bbphysic.settings.page.display', '显示'),
          icon: 'visibility',
        },
        debug: {
          label: t('bbphysic.settings.page.debug', '调试'),
          icon: 'bug_report',
        },
      },
      onPageSwitch(page) {
        setPageVisibility(settingsDialog!, page);
      },
    },
    onOpen() {
      // Refresh values from storage each open
      settings = loadSettings();
      settingsDialog!.setFormValues(
        {
          enabled: settings.enabled,
          unit_scale: settings.unit_scale,
          gravity: settings.gravity,
          timestep: settings.timestep,
          iterations: settings.iterations,
          linear_damping: settings.linear_damping,
          max_linear_velocity: settings.max_linear_velocity,
          max_angular_velocity: settings.max_angular_velocity,
          max_step_displacement: settings.max_step_displacement,
          collision_layer: settings.collision_layer,
          collision_mask: settings.collision_mask,
          self_collision: settings.self_collision,
          friction: settings.friction,
          restitution: settings.restitution,
          wireframe_color: settings.wireframe_color,
          wireframe_opacity: settings.wireframe_opacity,
          show_joint_markers: settings.show_joint_markers,
          show_collider_markers: settings.show_collider_markers,
          debug_wireframe: settings.debug_wireframe,
          debug_log_level: settings.debug_log_level,
          wireframe_fps: settings.debug_wireframe ? String(fpsValue || '--') : '--',
        },
        false
      );

      startFpsLoop();
    },
    onBuild() {
      // Enforce a minimum height so it doesn't look too flat
      try {
        const root = (settingsDialog!.object as any as HTMLElement).closest('.dialog') as HTMLElement | null;
        if (root) {
          root.style.minHeight = '560px';
        }
      } catch {
        // ignore
      }

      // Add per-field reset buttons
      const keys = Object.keys(form);
      for (const key of keys) {
        // Skip if missing default or if it's not a real input
        if (!(key in defaultsByKey)) continue;

        let barEl: HTMLElement | undefined;
        try {
          const bar = settingsDialog!.getFormBar(key);
          barEl = bar.get(0) as any;
        } catch {
          barEl = undefined;
        }
        if (!barEl) continue;

        const btn = document.createElement('div');
        btn.className = 'bbphysic-reset-btn';
        btn.title = t('bbphysic.settings.reset', '重置为默认值');
        btn.innerHTML = '<i class="material-icons">replay</i>';
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          settingsDialog!.setFormValues({ [key]: defaultsByKey[key] }, true);
        });

        barEl.appendChild(btn);
      }

      // Initial page visibility
      setPageVisibility(settingsDialog!, 'general');
    },
    onFormChange(result) {
      // Persist
      settings = {
        enabled: Boolean(result.enabled),
        unit_scale: Number(result.unit_scale),
        gravity: (result.gravity as any) as [number, number, number],
        timestep: Number(result.timestep),
        iterations: Number(result.iterations),
        linear_damping: Number(result.linear_damping),
        max_linear_velocity: Number((result as any).max_linear_velocity),
        max_angular_velocity: Number((result as any).max_angular_velocity),
        max_step_displacement: Number((result as any).max_step_displacement),
        collision_layer: String((result as any).collision_layer || DEFAULT_SETTINGS.collision_layer),
        collision_mask: String((result as any).collision_mask || DEFAULT_SETTINGS.collision_mask),
        self_collision: Boolean((result as any).self_collision),
        friction: Number((result as any).friction),
        restitution: Number((result as any).restitution),
        wireframe_color: String((result as any).wireframe_color),
        wireframe_opacity: Number((result as any).wireframe_opacity),
        show_joint_markers: Boolean((result as any).show_joint_markers),
        show_collider_markers: Boolean((result as any).show_collider_markers),
        debug_wireframe: Boolean(result.debug_wireframe),
        debug_log_level: (result.debug_log_level as any) as BBPhysicSettings['debug_log_level'],
      };
      saveSettings(settings);

      // Keep FPS field consistent when toggling wireframe debug
      try {
        settingsDialog!.setFormValues(
          { wireframe_fps: settings.debug_wireframe ? String(fpsValue || '--') : '--' },
          false
        );
      } catch {
        // ignore
      }
    },
    onClose() {
      // Allow opening again
      stopFpsLoop();
      settingsDialog = null;
    },
  });

  settingsDialog.show();
}

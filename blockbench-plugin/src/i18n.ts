type TLVars = string | number | (string | number)[];

export function t(key: string, fallback: string, vars?: TLVars): string {
  try {
    return tl(key, vars as any, fallback);
  } catch {
    return fallback;
  }
}

export function registerBBPhysicTranslations() {
  const en: Record<string, string> = {
    'menu.bbphysic': 'BBPhysic',

    'bbphysic.action.settings': 'Settings',
    'bbphysic.action.pick_root': 'Select Solve Root Group',
    'bbphysic.action.solve_once': 'Start Solve',
    'bbphysic.action.preview': 'Preview (Realtime)',
    'bbphysic.action.wireframe': 'Debug Wireframe (Joints/Colliders)',

    'bbphysic.msg.settings_todo': 'BBPhysic: Settings (TODO)',
    'bbphysic.msg.pick_root_need_select': 'Select a Group in the Outliner first',
    'bbphysic.msg.pick_root_selected': 'Solve root selected: %0',
    'bbphysic.msg.solve_todo': 'BBPhysic: Start Solve (TODO)',
    'bbphysic.msg.preview_on': 'BBPhysic: Preview enabled (TODO)',
    'bbphysic.msg.preview_off': 'BBPhysic: Preview disabled (TODO)',
    'bbphysic.msg.wireframe_on': 'BBPhysic: Wireframe enabled (TODO)',
    'bbphysic.msg.wireframe_off': 'BBPhysic: Wireframe disabled (TODO)',

    'bbphysic.settings.title': 'BBPhysic Settings',
    'bbphysic.settings.reset': 'Reset to default',
    'bbphysic.settings.page.general': 'General',
    'bbphysic.settings.page.physics': 'Physics',
    'bbphysic.settings.page.collision': 'Collision',
    'bbphysic.settings.page.display': 'Display',
    'bbphysic.settings.page.debug': 'Debug',
    'bbphysic.settings.enabled': 'Enable BBPhysic',
    'bbphysic.settings.unit_scale': 'Unit Scale',
    'bbphysic.settings.unit_scale.desc': 'Scale factor from Blockbench units to physics units',
    'bbphysic.settings.gravity': 'Gravity',
    'bbphysic.settings.timestep': 'Timestep',
    'bbphysic.settings.timestep.desc': 'dt (seconds) per physics step (preview uses this)',
    'bbphysic.settings.iterations': 'Iterations',
    'bbphysic.settings.linear_damping': 'Linear Damping',
    'bbphysic.settings.max_linear_velocity': 'Max Linear Velocity',
    'bbphysic.settings.max_linear_velocity.desc': 'Clamp maximum linear velocity (units/second)',
    'bbphysic.settings.max_angular_velocity': 'Max Angular Velocity',
    'bbphysic.settings.max_angular_velocity.desc': 'Clamp maximum angular velocity (rad/second)',
    'bbphysic.settings.max_step_displacement': 'Max Step Displacement',
    'bbphysic.settings.max_step_displacement.desc': 'Clamp max displacement per step (units)',

    'bbphysic.settings.collision_layer': 'Collision Layer',
    'bbphysic.settings.collision_layer.default': 'Default',
    'bbphysic.settings.collision_layer.layer1': 'Layer 1',
    'bbphysic.settings.collision_layer.layer2': 'Layer 2',
    'bbphysic.settings.collision_layer.layer3': 'Layer 3',
    'bbphysic.settings.collision_mask': 'Collision Filter',
    'bbphysic.settings.collision_mask.desc': 'Filtering rules (placeholder, later can be multi-select/bitmask)',
    'bbphysic.settings.self_collision': 'Enable Self Collision',
    'bbphysic.settings.friction': 'Friction',
    'bbphysic.settings.restitution': 'Restitution',

    'bbphysic.settings.wireframe_color': 'Wireframe Color',
    'bbphysic.settings.wireframe_opacity': 'Wireframe Opacity',
    'bbphysic.settings.show_joint_markers': 'Show Joint Markers',
    'bbphysic.settings.show_collider_markers': 'Show Collider Markers',
    'bbphysic.settings.wireframe_fps': 'Wireframe Preview FPS',
    'bbphysic.settings.wireframe_fps.desc': 'Preview / wireframe render framerate (placeholder)',
    'bbphysic.settings.debug_wireframe': 'Debug Wireframe',
    'bbphysic.settings.debug_log_level': 'Log Level',
    'bbphysic.settings.log.off': 'Off',
    'bbphysic.settings.log.error': 'Error',
    'bbphysic.settings.log.warn': 'Warn',
    'bbphysic.settings.log.info': 'Info',
    'bbphysic.settings.log.debug': 'Debug',

    'generic.close': 'Close',

    'bbphysic.solve.title': 'BBPhysic Root Group Solve',
    'bbphysic.solve.run': 'Solve',
    'bbphysic.solve.none': '(Not set)',
    'bbphysic.solve.moving_group': 'Moving Objects Group (OBB)',
    'bbphysic.solve.moving_group.desc': 'Group to adjust later (currently: prepare selected cube vertex/edge data only)',
    'bbphysic.solve.collider_group': 'Collider Objects Group',
    'bbphysic.solve.collider_group.desc': 'Group used as static colliders',
    'bbphysic.solve.pick_from_selection': 'Pick From Outliner',
    'bbphysic.solve.use_selected': 'Use currently selected Group',
    'bbphysic.solve.need_select_group': 'Select a Group in the Outliner first',
    'bbphysic.solve.need_two_groups': 'Please select two Groups',
    'bbphysic.solve.groups_must_differ': 'The two Groups must be different',
    'bbphysic.solve.no_selected_cubes': 'Select cubes to prepare (current phase only collects vertices/edges)',
    'bbphysic.solve.prepared': 'Prepared: collected vertex/edge data for %0 cube(s)',
    'bbphysic.solve.info': 'Notes',
    'bbphysic.solve.info.text': 'Current phase: preparation only. Collect vertices/edges for selected cubes. Later: OBB / joint rotation / collision solving.',

    'bbphysic.wireframe.enabled': 'BBPhysic: Wireframe enabled',
    'bbphysic.wireframe.disabled': 'BBPhysic: Wireframe disabled',
  };

  const zh: Record<string, string> = {
    'menu.bbphysic': 'BBPhysic',

    'bbphysic.action.settings': '设置',
    'bbphysic.action.pick_root': '选择参与解算的根 Group',
    'bbphysic.action.solve_once': '开始解算',
    'bbphysic.action.preview': '预览（实时解算）',
    'bbphysic.action.wireframe': '线框标出关节/碰撞体',

    'bbphysic.msg.settings_todo': 'BBPhysic: 设置（TODO）',
    'bbphysic.msg.pick_root_need_select': '请先在 Outliner 选中一个 Group（根骨骼）',
    'bbphysic.msg.pick_root_selected': '已选择根 Group: %0',
    'bbphysic.msg.solve_todo': 'BBPhysic: 开始解算（TODO）',
    'bbphysic.msg.preview_on': 'BBPhysic: 预览 开启（TODO）',
    'bbphysic.msg.preview_off': 'BBPhysic: 预览 关闭（TODO）',
    'bbphysic.msg.wireframe_on': 'BBPhysic: 线框 开启（TODO）',
    'bbphysic.msg.wireframe_off': 'BBPhysic: 线框 关闭（TODO）',

    'bbphysic.settings.title': 'BBPhysic 设置',
    'bbphysic.settings.reset': '重置为默认值',
    'bbphysic.settings.page.general': '常规',
    'bbphysic.settings.page.physics': '物理',
    'bbphysic.settings.page.collision': '碰撞',
    'bbphysic.settings.page.display': '显示',
    'bbphysic.settings.page.debug': '调试',
    'bbphysic.settings.enabled': '启用 BBPhysic',
    'bbphysic.settings.unit_scale': '单位缩放',
    'bbphysic.settings.unit_scale.desc': '将 Blockbench 单位映射到物理世界单位的倍率',
    'bbphysic.settings.gravity': '重力',
    'bbphysic.settings.timestep': '时间步长',
    'bbphysic.settings.timestep.desc': '单次 step 的 dt（秒），预览模式会以该 dt 推进',
    'bbphysic.settings.iterations': '迭代次数',
    'bbphysic.settings.linear_damping': '线性阻尼',
    'bbphysic.settings.max_linear_velocity': '最大线速度',
    'bbphysic.settings.max_linear_velocity.desc': '用于限制解算结果的最大线速度（单位/秒）',
    'bbphysic.settings.max_angular_velocity': '最大角速度',
    'bbphysic.settings.max_angular_velocity.desc': '用于限制解算结果的最大角速度（弧度/秒）',
    'bbphysic.settings.max_step_displacement': '最大单步位移',
    'bbphysic.settings.max_step_displacement.desc': '用于限制单次 step 的最大位移（单位）',

    'bbphysic.settings.collision_layer': '碰撞层',
    'bbphysic.settings.collision_layer.default': '默认',
    'bbphysic.settings.collision_layer.layer1': '层 1',
    'bbphysic.settings.collision_layer.layer2': '层 2',
    'bbphysic.settings.collision_layer.layer3': '层 3',
    'bbphysic.settings.collision_mask': '碰撞过滤',
    'bbphysic.settings.collision_mask.desc': '用于过滤可碰撞对象的规则（占位：后续可做成多选/位掩码）',
    'bbphysic.settings.self_collision': '启用自碰撞',
    'bbphysic.settings.friction': '摩擦系数',
    'bbphysic.settings.restitution': '弹性系数',

    'bbphysic.settings.wireframe_color': '线框颜色',
    'bbphysic.settings.wireframe_opacity': '线框透明度',
    'bbphysic.settings.show_joint_markers': '显示关节标识',
    'bbphysic.settings.show_collider_markers': '显示碰撞体标识',
    'bbphysic.settings.wireframe_fps': '线框预览 FPS',
    'bbphysic.settings.wireframe_fps.desc': '预览/线框渲染的帧率（占位）',
    'bbphysic.settings.debug_wireframe': '线框调试',
    'bbphysic.settings.debug_log_level': '日志等级',
    'bbphysic.settings.log.off': '关闭',
    'bbphysic.settings.log.error': '错误',
    'bbphysic.settings.log.warn': '警告',
    'bbphysic.settings.log.info': '信息',
    'bbphysic.settings.log.debug': '调试',

    'generic.close': '关闭',

    'bbphysic.solve.title': 'BBPhysic 根 Group 解算',
    'bbphysic.solve.run': '开始解算',
    'bbphysic.solve.none': '（未选择）',
    'bbphysic.solve.moving_group': '运动物体（OBB）Group',
    'bbphysic.solve.moving_group.desc': '选择后续需要被调整位置/旋转以避免碰撞的 Group（当前阶段仅做数据准备）',
    'bbphysic.solve.collider_group': '被碰撞物体 Group',
    'bbphysic.solve.collider_group.desc': '选择作为“静态碰撞体集合”的 Group',
    'bbphysic.solve.pick_from_selection': '从 Outliner 选择',
    'bbphysic.solve.use_selected': '使用当前选中 Group',
    'bbphysic.solve.need_select_group': '请先在 Outliner 选中一个 Group',
    'bbphysic.solve.need_two_groups': '请分别选择 2 个 Group',
    'bbphysic.solve.groups_must_differ': '两个 Group 不能相同',
    'bbphysic.solve.no_selected_cubes': '请先选择要参与解算的 Cube（当前阶段仅收集顶点/边信息）',
    'bbphysic.solve.prepared': '已准备：收集了 %0 个 Cube 的顶点/边数据',
    'bbphysic.solve.info': '说明',
    'bbphysic.solve.info.text': '当前阶段：只做准备（收集选中 Cube 的顶点/边信息）。后续再做 OBB/关节旋转/碰撞解算。',

    'bbphysic.wireframe.enabled': 'BBPhysic: 线框显示已开启',
    'bbphysic.wireframe.disabled': 'BBPhysic: 线框显示已关闭',
  };

  try {
    Language.addTranslations('en', en);
    Language.addTranslations('zh', zh);
    Language.addTranslations('zh_tw', zh);
    translateUI();
  } catch {
    // ignore
  }
}

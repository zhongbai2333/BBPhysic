import { t } from '../i18n';
import { setWireframeTargets, updateWireframeOnce } from '../debug/wireframe';
import { prepareSelectedCubesPhysicsJob, preparePhysicsJobFromGroups } from '../physics/prep';

let movingGroupUuid: string | null = null;
let colliderGroupUuid: string | null = null;

function getGroupOptions(): Record<string, string> {
  const opts: Record<string, string> = {
    '': t('bbphysic.solve.none', '（未选择）'),
  };

  const groups = (Group as any).all as Group[] | undefined;
  if (!Array.isArray(groups)) return opts;

  for (const g of groups) {
    if (!g || typeof (g as any).uuid !== 'string') continue;
    const name = typeof (g as any).name === 'string' && (g as any).name ? (g as any).name : (g as any).uuid;
    opts[(g as any).uuid] = name;
  }
  return opts;
}

function resolveGroupByUuid(uuid: string | null): Group | null {
  if (!uuid) return null;
  const groups = (Group as any).all as Group[] | undefined;
  if (!Array.isArray(groups)) return null;
  const g = groups.find((x) => x && (x as any).uuid === uuid);
  return (g as any) || null;
}

function getSelectedGroupUuidFromOutliner(): string | null {
  try {
    const sel = (globalThis as any).Outliner?.selected;
    const first = Array.isArray(sel) ? sel[0] : null;
    if (first && (first as any).type === 'group' && typeof (first as any).uuid === 'string') {
      return (first as any).uuid;
    }
  } catch {
    // ignore
  }
  // Also allow selecting via Group.first_selected
  try {
    const g = (Group as any).first_selected as Group | undefined;
    if (g && typeof (g as any).uuid === 'string') return (g as any).uuid;
  } catch {
    // ignore
  }
  return null;
}

function resetSolveSession() {
  // No persistent state; ensure we never reuse previous run data.
  // (Only selections are kept in-memory for convenience.)
}

export function openBBPhysicSolveDialog() {
  // Drop stale selection if group was deleted/merged
  if (movingGroupUuid && !resolveGroupByUuid(movingGroupUuid)) movingGroupUuid = null;
  if (colliderGroupUuid && !resolveGroupByUuid(colliderGroupUuid)) colliderGroupUuid = null;

  const dialog = new Dialog('bbphysic_solve', {
    title: t('bbphysic.solve.title', 'BBPhysic 根 Group 解算'),
    width: 720,
    resizable: 'xy',
    buttons: [t('bbphysic.solve.run', '开始解算'), t('generic.close', '关闭')],
    confirmIndex: 0,
    cancelIndex: 1,
    form: {
      moving_group_uuid: {
        label: t('bbphysic.solve.moving_group', '运动物体（OBB）Group'),
        description: t(
          'bbphysic.solve.moving_group.desc',
          '选择后续需要被调整位置/旋转以避免碰撞的 Group（当前阶段仅做数据准备）'
        ),
        type: 'select',
        value: movingGroupUuid ?? '',
        options: () => getGroupOptions(),
      },
      pick_moving_from_selection: {
        label: t('bbphysic.solve.pick_from_selection', '从 Outliner 选择'),
        type: 'buttons',
        buttons: [t('bbphysic.solve.use_selected', '使用当前选中 Group')],
        click() {
          const uuid = getSelectedGroupUuidFromOutliner();
          if (!uuid) {
            Blockbench.showQuickMessage(t('bbphysic.solve.need_select_group', '请先在 Outliner 选中一个 Group'), 2500);
            return;
          }
          movingGroupUuid = uuid;
          dialog.setFormValues({ moving_group_uuid: uuid }, true);
        },
      },

      collider_group_uuid: {
        label: t('bbphysic.solve.collider_group', '被碰撞物体 Group'),
        description: t('bbphysic.solve.collider_group.desc', '选择作为“静态碰撞体集合”的 Group'),
        type: 'select',
        value: colliderGroupUuid ?? '',
        options: () => getGroupOptions(),
      },
      pick_collider_from_selection: {
        label: t('bbphysic.solve.pick_from_selection', '从 Outliner 选择'),
        type: 'buttons',
        buttons: [t('bbphysic.solve.use_selected', '使用当前选中 Group')],
        click() {
          const uuid = getSelectedGroupUuidFromOutliner();
          if (!uuid) {
            Blockbench.showQuickMessage(t('bbphysic.solve.need_select_group', '请先在 Outliner 选中一个 Group'), 2500);
            return;
          }
          colliderGroupUuid = uuid;
          dialog.setFormValues({ collider_group_uuid: uuid }, true);
        },
      },

      info: {
        label: t('bbphysic.solve.info', '说明'),
        type: 'info',
        text: t(
          'bbphysic.solve.info.text',
          '当前阶段：只做准备（收集选中 Cube 的顶点/边信息）。后续再做 OBB/关节旋转/碰撞解算。'
        ),
        full_width: true,
      },
    },
    onFormChange(result) {
      movingGroupUuid = typeof (result as any).moving_group_uuid === 'string' ? ((result as any).moving_group_uuid || null) : null;
      colliderGroupUuid = typeof (result as any).collider_group_uuid === 'string' ? ((result as any).collider_group_uuid || null) : null;

      setWireframeTargets({ movingGroupUuid, colliderGroupUuid });
    },
    onConfirm() {
      resetSolveSession();

      const moving = resolveGroupByUuid(movingGroupUuid);
      const collider = resolveGroupByUuid(colliderGroupUuid);

      if (!moving || !collider) {
        Blockbench.showQuickMessage(t('bbphysic.solve.need_two_groups', '请分别选择 2 个 Group'), 3000);
        return false;
      }
      if ((moving as any).uuid === (collider as any).uuid) {
        Blockbench.showQuickMessage(t('bbphysic.solve.groups_must_differ', '两个 Group 不能相同'), 3000);
        return false;
      }

      // Current stage: PREPARE ONLY.
      // Collect vertex/edge data from cubes within the selected groups and store in memory for later physics solving.
      const job = preparePhysicsJobFromGroups([moving, collider]);

      try {
        setWireframeTargets({ movingGroupUuid, colliderGroupUuid });
        updateWireframeOnce(true);
      } catch {
        // ignore
      }

      if (job.cubeCount <= 0) {
        Blockbench.showQuickMessage(
          t('bbphysic.solve.no_cubes_in_groups', '选中的 Group 中没有找到 Cube。请确保 Group 包含 Cube 元素。'),
          3500
        );
      } else {
        Blockbench.showQuickMessage(
          t('bbphysic.solve.prepared', '已准备：收集了 %0 个 Cube 的顶点/边数据').replace('%0', String(job.cubeCount)),
          3500
        );
      }

      // Keep dialog open for iterative tweaking
      return false;
    },
  });

  dialog.show();
}

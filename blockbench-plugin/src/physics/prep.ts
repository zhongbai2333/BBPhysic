import type { Vec3 } from './types';

export type PreparedCube = {
  uuid: string;
  name: string;
  vertices_world: Vec3[];
  edges: [number, number][];
  role: 'moving' | 'collider';
  is_collider: boolean;
};

export type PreparedPhysicsJob = {
  createdAt: number;
  cubeCount: number;
  cubes: PreparedCube[];
  movingGroupUuid?: string;
  colliderGroupUuid?: string;
};

let currentJob: PreparedPhysicsJob | null = null;

function cubeEdgesFor8Vertices(): [number, number][] {
  // Standard cuboid edges for a consistent vertex ordering.
  // If vertex order differs, the edge pairs are still useful as a stable template.
  return [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],

    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],

    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
}

function safeGetCubeVerticesWorld(cube: Cube): Vec3[] {
  try {
    const verts = cube.getGlobalVertexPositions();
    if (!Array.isArray(verts)) return [];
    return verts
      .filter((v) => Array.isArray(v) && v.length >= 3)
      .map((v) => [Number(v[0]), Number(v[1]), Number(v[2])] as Vec3);
  } catch {
    return [];
  }
}

function collectCubesFromGroup(group: Group, role: 'moving' | 'collider', cubeByUuid: Map<string, Cube>, roleByUuid: Map<string, 'moving' | 'collider'>) {
  try {
    const children = (group as any).children;
    if (!Array.isArray(children)) return;

    for (const child of children) {
      if (!child) continue;

      if ((child as any).type === 'cube') {
        const uuid = String((child as any).uuid ?? '');
        if (!uuid) continue;
        if (!cubeByUuid.has(uuid)) {
          cubeByUuid.set(uuid, child as Cube);
        }
        // Prefer the first role (moving before collider) to avoid duplicates.
        if (!roleByUuid.has(uuid)) {
          roleByUuid.set(uuid, role);
        }
      } else if ((child as any).type === 'group') {
        collectCubesFromGroup(child as Group, role, cubeByUuid, roleByUuid);
      }
    }
  } catch (e) {
    console.warn('BBPhysic: Error collecting cubes from group:', e);
  }
}

export function clearPreparedPhysicsJob() {
  currentJob = null;
}

export function getPreparedPhysicsJob() {
  return currentJob;
}

export function prepareSelectedCubesPhysicsJob(): PreparedPhysicsJob {
  clearPreparedPhysicsJob();

  const selected = (Cube as any).selected as Cube[] | undefined;
  const cubes = Array.isArray(selected) ? selected : [];

  const prepared: PreparedCube[] = [];
  for (const cube of cubes) {
    if (!cube) continue;
    const vertices_world = safeGetCubeVerticesWorld(cube);
    const edges = vertices_world.length === 8 ? cubeEdgesFor8Vertices() : [];
    prepared.push({
      uuid: String((cube as any).uuid ?? ''),
      name: String((cube as any).name ?? ''),
      vertices_world,
      edges,
      role: 'moving',
      is_collider: false,
    });
  }

  currentJob = {
    createdAt: Date.now(),
    cubeCount: prepared.length,
    cubes: prepared,
  };

  return currentJob;
}

/**
 * 从指定的 Groups 中收集所有 Cube 的物理数据。
 * NOTE: Solve 对话框会以 [moving, collider] 的顺序传入。
 */
export function preparePhysicsJobFromGroups(groups: Group[]): PreparedPhysicsJob {
  clearPreparedPhysicsJob();

  const cubeByUuid = new Map<string, Cube>();
  const roleByUuid = new Map<string, 'moving' | 'collider'>();

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    const role: 'moving' | 'collider' = i === 0 ? 'moving' : 'collider';
    collectCubesFromGroup(group, role, cubeByUuid, roleByUuid);
  }

  const prepared: PreparedCube[] = [];
  for (const [uuid, cube] of cubeByUuid.entries()) {
    if (!cube) continue;
    const vertices_world = safeGetCubeVerticesWorld(cube);
    const edges = vertices_world.length === 8 ? cubeEdgesFor8Vertices() : [];
    const role = roleByUuid.get(uuid) ?? 'moving';
    prepared.push({
      uuid,
      name: String((cube as any).name ?? ''),
      vertices_world,
      edges,
      role,
      is_collider: role === 'collider',
    });
  }

  currentJob = {
    createdAt: Date.now(),
    cubeCount: prepared.length,
    cubes: prepared,
  };

  return currentJob;
}

export function preparePhysicsJobFromMovingAndColliderGroups(movingGroup: Group, colliderGroup: Group): PreparedPhysicsJob {
  const job = preparePhysicsJobFromGroups([movingGroup, colliderGroup]);
  job.movingGroupUuid = String((movingGroup as any).uuid ?? '');
  job.colliderGroupUuid = String((colliderGroup as any).uuid ?? '');
  return job;
}

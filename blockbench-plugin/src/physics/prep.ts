import type { Vec3 } from './types';

export type PreparedCube = {
  uuid: string;
  name: string;
  vertices_world: Vec3[];
  edges: [number, number][];
};

export type PreparedPhysicsJob = {
  createdAt: number;
  cubeCount: number;
  cubes: PreparedCube[];
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

export function clearPreparedPhysicsJob() {
  currentJob = null;
}

export function getPreparedPhysicsJob() {
  return currentJob;
}

export function prepareSelectedCubesPhysicsJob(): PreparedPhysicsJob {
  // Hard reset to avoid any previous job affecting current job.
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
    });
  }

  currentJob = {
    createdAt: Date.now(),
    cubeCount: prepared.length,
    cubes: prepared,
  };

  return currentJob;
}

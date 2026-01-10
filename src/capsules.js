import { isOutlinerGroup, isBoneGroup, computeGroupPivotWorldCurrentPose, readGroupOrigin } from './blockbench_api.js';
import { v3len, v3sub, m3fromEulerXYZDeg, m3mulV3 } from './math.js';

/**
 * BoxDef (OBB from cube geometry)
 * @typedef {{
 *  group_uuid: string,
 *  cube_uuid: string
 * }} BoxDef
 * @typedef {{
 *  center: [number,number,number],
 *  axes: [[number,number,number],[number,number,number],[number,number,number]],
 *  half: [number,number,number]
 * }} BoxWorld
 */

function isCubeLike(node) {
	if (!node) return false;
	if (node.type === 'cube' || node.constructor?.name === 'Cube') return true;
	const f = node.from;
	const t = node.to;
	return Array.isArray(f) && f.length >= 3 && Array.isArray(t) && t.length >= 3;
}

function collectGroupsDepthFirst(root) {
	/** @type {any[]} */
	const out = [];
	/** @type {any[]} */
	const stack = [];
	if (root) stack.push(root);
	while (stack.length) {
		const cur = stack.pop();
		if (!cur) continue;
		if (isOutlinerGroup(cur)) out.push(cur);
		const children = cur.children;
		if (Array.isArray(children)) {
			// Reverse order so stack pops in tree order
			for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
		}
	}
	return out;
}

function collectCubesUnderGroup(group) {
	/** @type {any[]} */
	const cubes = [];
	if (!group) return cubes;
	const children = group.children;
	// Direct children only, or also depth? 
	// To be safe, look at direct children for geometry attached to *this* bone.
	// (Deep children usually belong to child bones)
	if (!Array.isArray(children)) return cubes;
	for (const ch of children) {
		if (isCubeLike(ch)) cubes.push(ch);
	}
	return cubes;
}

function readVec3Any(v) {
	if (Array.isArray(v) && v.length >= 3) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
	if (v && typeof v === 'object') return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
	return null;
}

/**
 * Apply cube local rotation (around cube.origin) to a point in group space.
 * @param {[number,number,number]} p
 * @param {[number,number,number]|null} cubeRotDeg
 * @param {[number,number,number]} cubePivot
 */
function applyCubeRotationToPoint(p, cubeRotDeg, cubePivot) {
	if (!cubeRotDeg) return p;
	const m = m3fromEulerXYZDeg(cubeRotDeg);
	const rel = v3sub(p, cubePivot);
	const rr = m3mulV3(m, rel);
	return [cubePivot[0] + rr[0], cubePivot[1] + rr[1], cubePivot[2] + rr[2]];
}

function v3normalizeLocal(v) {
	const l = v3len(v);
	if (l <= 1e-10) return [0, 1, 0];
	return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Build an oriented box for a single cube in GROUP SPACE, then convert to offsets relative to group.origin.
 * Box axes follow cube.rotation (about cube.origin).
 * @param {any} group
 * @param {any} cube
 * @returns {{center:[number,number,number], axes:[[number,number,number],[number,number,number],[number,number,number]], half:[number,number,number]}|null}
 */
function computeOrientedCubeBoxLocal(group, cube) {
	if (!group || !cube) return null;
	const f = cube.from;
	const t = cube.to;
	if (!Array.isArray(f) || !Array.isArray(t)) return null;
	const fx = Number(f[0]) || 0, fy = Number(f[1]) || 0, fz = Number(f[2]) || 0;
	const tx = Number(t[0]) || 0, ty = Number(t[1]) || 0, tz = Number(t[2]) || 0;
	const dx = Math.abs(tx - fx);
	const dy = Math.abs(ty - fy);
	const dz = Math.abs(tz - fz);

	const center0 = [(fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5];
	const pivot = readVec3Any(cube.origin) || center0;
	const cubeRotDeg = readVec3Any(cube.rotation);
	const center = applyCubeRotationToPoint(center0, cubeRotDeg, pivot);

	let ax = [1, 0, 0];
	let ay = [0, 1, 0];
	let az = [0, 0, 1];
	if (cubeRotDeg) {
		const m = m3fromEulerXYZDeg(cubeRotDeg);
		ax = v3normalizeLocal(m3mulV3(m, [1, 0, 0]));
		ay = v3normalizeLocal(m3mulV3(m, [0, 1, 0]));
		az = v3normalizeLocal(m3mulV3(m, [0, 0, 1]));
	}

	const half = [Math.max(0.05, dx * 0.5), Math.max(0.05, dy * 0.5), Math.max(0.05, dz * 0.5)];
	const go = readGroupOrigin(group);
	return {
		center: /** @type {[number,number,number]} */ ([center[0] - go[0], center[1] - go[1], center[2] - go[2]]),
		axes: /** @type {any} */ ([ax, ay, az]),
		half: /** @type {[number,number,number]} */ ([half[0], half[1], half[2]]),
	};
}
export function computeGroupApproxRadius(group) {
	if (!group) return 0;
	// Use the max inscribed radius among direct cubes (derived from OBB half-extents)
	try {
		const cubes = collectCubesUnderGroup(group);
		let r = 0;
		for (const cube of cubes) {
			const obb = computeOrientedCubeBoxLocal(group, cube);
			if (!obb) continue;
			const half = obb.half;
			const rr = Math.max(0.05, Math.min(Number(half?.[0]) || 0, Number(half?.[1]) || 0, Number(half?.[2]) || 0));
			if (rr > r) r = rr;
		}
		if (r > 1e-6) return r;
	} catch (e) {
		// ignore
	}
	// Fallback: very small default if no cubes
	return 0.5;
}

/**
 * Build OBB(box) defs from a root group, per direct cube under each bone group.
 * @param {any} rootGroup
 * @returns {BoxDef[]}
 */
export function buildBoxDefsFromRoot(rootGroup) {
	/** @type {BoxDef[]} */
	const boxes = [];
	if (!rootGroup || !isOutlinerGroup(rootGroup)) return boxes;
	const groups = collectGroupsDepthFirst(rootGroup);
	for (const g of groups) {
		if (!isBoneGroup(g) || !g?.uuid) continue;
		const cubes = collectCubesUnderGroup(g);
		for (const cube of cubes) {
			const cuuid = String(cube?.uuid || '');
			if (!cuuid) continue;
			boxes.push({ group_uuid: String(g.uuid), cube_uuid: cuuid });
		}
	}
	return boxes;
}

function getNodeByUUID(uuid) {
	try {
		if (typeof OutlinerNode !== 'undefined' && OutlinerNode?.uuids) {
			return OutlinerNode.uuids[String(uuid)];
		}
	} catch (e) {
		// ignore
	}
	return null;
}

/**
 * Resolve box defs into world OBBs for current pose.
 * @param {BoxDef[]} boxDefs
 * @returns {BoxWorld[]}
 */
export function computeBoxesWorldNow(boxDefs) {
	/** @type {BoxWorld[]} */
	const out = [];
	if (!Array.isArray(boxDefs) || boxDefs.length === 0) return out;
	if (typeof THREE === 'undefined' || !THREE) return out;

	for (const b of boxDefs) {
		const gNode = getNodeByUUID(b.group_uuid);
		if (!isOutlinerGroup(gNode)) continue;
		const cNode = getNodeByUUID(b.cube_uuid);
		if (!isCubeLike(cNode)) continue;
		try {
			if (!gNode.mesh) continue;
			const gPos = /** @type {[number, number, number]} */ (computeGroupPivotWorldCurrentPose(gNode));
			const q = gNode.mesh.getWorldQuaternion(new THREE.Quaternion());
			const local = computeOrientedCubeBoxLocal(gNode, cNode);
			if (!local) continue;
			const cOff = local.center;
			const cw = new THREE.Vector3(cOff[0], cOff[1], cOff[2]).applyQuaternion(q);
			const centerWorld = /** @type {[number,number,number]} */ ([gPos[0] + cw.x, gPos[1] + cw.y, gPos[2] + cw.z]);
			const ax = new THREE.Vector3(local.axes[0][0], local.axes[0][1], local.axes[0][2]).applyQuaternion(q).normalize();
			const ay = new THREE.Vector3(local.axes[1][0], local.axes[1][1], local.axes[1][2]).applyQuaternion(q).normalize();
			const az = new THREE.Vector3(local.axes[2][0], local.axes[2][1], local.axes[2][2]).applyQuaternion(q).normalize();
			out.push({
				center: centerWorld,
				axes: /** @type {any} */ ([
					[ax.x, ax.y, ax.z],
					[ay.x, ay.y, ay.z],
					[az.x, az.y, az.z],
				]),
				half: local.half,
			});
		} catch (e) {
			// ignore
		}
	}
	return out;
}

/**
 * Pack BoxWorld array into f32 layout for wasm query (15 floats per box):
 * center(3), axes(9), half(3)
 * @param {Array<{center:[number,number,number], axes:[[number,number,number],[number,number,number],[number,number,number]], half:[number,number,number]}>} boxesWorld
 */
export function packBoxesWorldToF32(boxesWorld) {
	if (!Array.isArray(boxesWorld) || boxesWorld.length === 0) return new Float32Array(0);
	const out = new Float32Array(boxesWorld.length * 15);
	let o = 0;
	for (const b of boxesWorld) {
		const c = b?.center;
		const axes = b?.axes;
		const half = b?.half;
		out[o++] = Number(c?.[0]) || 0;
		out[o++] = Number(c?.[1]) || 0;
		out[o++] = Number(c?.[2]) || 0;
		for (let i = 0; i < 3; i++) {
			const a = axes?.[i];
			out[o++] = Number(a?.[0]) || 0;
			out[o++] = Number(a?.[1]) || 0;
			out[o++] = Number(a?.[2]) || 0;
		}
		out[o++] = Number(half?.[0]) || 0;
		out[o++] = Number(half?.[1]) || 0;
		out[o++] = Number(half?.[2]) || 0;
	}
	return out;
}


/**
 * Compute a simple AABB (world) from group pivot points.
 * @param {any} rootGroup
 */
export function computePivotAabbWorld(rootGroup) {
	const groups = collectGroupsDepthFirst(rootGroup);
	let minX = Infinity;
	let minY = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let maxZ = -Infinity;
	let count = 0;
	for (const g of groups) {
		try {
			const p = computeGroupPivotWorldCurrentPose(g);
			const x = Number(p[0]) || 0;
			const y = Number(p[1]) || 0;
			const z = Number(p[2]) || 0;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			minZ = Math.min(minZ, z);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
			maxZ = Math.max(maxZ, z);
			count++;
		} catch (e) {
			// ignore
		}
	}
	if (count === 0) {
		return { center: /** @type {[number,number,number]} */ ([0, 0, 0]), size: /** @type {[number,number,number]} */ ([0, 0, 0]), count: 0 };
	}
	const cx = (minX + maxX) * 0.5;
	const cy = (minY + maxY) * 0.5;
	const cz = (minZ + maxZ) * 0.5;
	return {
		center: /** @type {[number,number,number]} */ ([cx, cy, cz]),
		size: /** @type {[number,number,number]} */ ([maxX - minX, maxY - minY, maxZ - minZ]),
		count,
	};
}

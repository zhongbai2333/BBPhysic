import { isOutlinerGroup, isBoneGroup, computeGroupPivotWorldCurrentPose, readGroupOrigin } from './blockbench_api.js';
import { v3len, v3sub, v3add, v3scale, m3fromEulerXYZDeg, m3mulV3 } from './math.js';

/**
 * CapsuleDef
 * - If `start_offset_local`/`end_offset_local` exist, endpoints are computed from the same bone's pivot.
 * - If `cube_uuid` is set and `dynamic_from_cube` is true, offsets and radius are recomputed each frame from that cube geometry.
 * @typedef {{
 *  a_uuid: string,
 *  b_uuid: string,
 *  radius: number,
 *  start_offset_local?: [number,number,number],
 *  end_offset_local?: [number,number,number],
 *  cube_uuid?: string,
 *  dynamic_from_cube?: boolean
 * }} CapsuleDef
 * @typedef {{a: [number, number, number], b: [number, number, number], radius: number}} CapsuleWorld
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

/**
 * Build an oriented capsule for a single cube in GROUP SPACE, then convert to offsets relative to group.origin.
 * Endpoints follow cube.rotation (about cube.origin), axis follows the cube's longest dimension.
 * @param {any} group
 * @param {any} cube
 * @returns {{start:[number,number,number], end:[number,number,number], radius:number}|null}
 */
function computeOrientedCubeCapsuleOffsetsLocal(group, cube) {
	if (!group || !cube) return null;
	const f = cube.from;
	const t = cube.to;
	if (!Array.isArray(f) || !Array.isArray(t)) return null;
	const fx = Number(f[0]) || 0, fy = Number(f[1]) || 0, fz = Number(f[2]) || 0;
	const tx = Number(t[0]) || 0, ty = Number(t[1]) || 0, tz = Number(t[2]) || 0;
	const dx = Math.abs(tx - fx);
	const dy = Math.abs(ty - fy);
	const dz = Math.abs(tz - fz);

	// Determine major axis in the cube's unrotated space
	/** @type {[number,number,number]} */
	let axis = [1, 0, 0];
	let halfLen = 0.5 * dx;
	let radius = 0.5 * Math.max(0.1, Math.min(dy, dz));
	if (dy >= dx && dy >= dz) {
		axis = [0, 1, 0];
		halfLen = 0.5 * dy;
		radius = 0.5 * Math.max(0.1, Math.min(dx, dz));
	} else if (dz >= dx && dz >= dy) {
		axis = [0, 0, 1];
		halfLen = 0.5 * dz;
		radius = 0.5 * Math.max(0.1, Math.min(dx, dy));
	}

	// If degenerate, force a small length
	if (!(halfLen > 1e-4)) halfLen = 0.5;
	if (!(radius > 1e-4)) radius = 0.1;

	const center = [(fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5];
	const pivot = readVec3Any(cube.origin) || center;
	const cubeRotDeg = readVec3Any(cube.rotation);

	const a0 = v3sub(v3add(center, v3scale(axis, -halfLen)), [0, 0, 0]);
	const b0 = v3sub(v3add(center, v3scale(axis, +halfLen)), [0, 0, 0]);

	const aRot = applyCubeRotationToPoint(a0, cubeRotDeg, pivot);
	const bRot = applyCubeRotationToPoint(b0, cubeRotDeg, pivot);

	const go = readGroupOrigin(group);
	const start = /** @type {[number,number,number]} */ ([aRot[0] - go[0], aRot[1] - go[1], aRot[2] - go[2]]);
	const end = /** @type {[number,number,number]} */ ([bRot[0] - go[0], bRot[1] - go[1], bRot[2] - go[2]]);
	return { start, end, radius: Math.max(0.1, Math.min(64, radius)) };
}


export function computeGroupApproxRadius(group) {
	if (!group) return 0;
	// Use the max radius among direct cubes
	try {
		const cubes = collectCubesUnderGroup(group);
		let r = 0;
		for (const cube of cubes) {
			const seg = computeOrientedCubeCapsuleOffsetsLocal(group, cube);
			if (seg && seg.radius > r) r = seg.radius;
		}
		if (r > 1e-6) return r;
	} catch (e) {
		// ignore
	}
	// Fallback: very small default if no cubes
	return 0.5;
}

/**
 * Build capsule segments from a root group based on bone connections AND cube geometry.
 * @param {any} rootGroup
 * @returns {CapsuleDef[]}
 */
export function buildCapsuleDefsFromRoot(rootGroup) {
	/** @type {CapsuleDef[]} */
	const capsules = [];
	if (!rootGroup || !isOutlinerGroup(rootGroup)) return capsules;
	const groups = collectGroupsDepthFirst(rootGroup);

	// Prefer cube-based capsules PER CUBE (these follow cube rotation and thickness)
	for (const g of groups) {
		if (!isBoneGroup(g) || !g?.uuid) continue;
		const cubes = collectCubesUnderGroup(g);
		for (const cube of cubes) {
			const cuuid = String(cube?.uuid || '');
			if (!cuuid) continue;
			const seg = computeOrientedCubeCapsuleOffsetsLocal(g, cube);
			if (!seg) continue;
			capsules.push({
				a_uuid: String(g.uuid),
				b_uuid: String(g.uuid),
				radius: seg.radius,
				start_offset_local: seg.start,
				end_offset_local: seg.end,
				cube_uuid: cuuid,
				dynamic_from_cube: true,
			});
		}
	}

	// Fallback: if nothing had cubes (rare), build joint-to-joint capsules
	if (capsules.length === 0) {
		for (const parent of groups) {
			if (!isBoneGroup(parent) || !parent?.uuid) continue;
			const children = (parent.children || []).filter(isOutlinerGroup);
			for (const ch of children) {
				if (!ch?.uuid) continue;
				capsules.push({
					a_uuid: String(parent.uuid),
					b_uuid: String(ch.uuid),
					radius: Math.max(0.1, computeGroupApproxRadius(parent)),
				});
			}
		}
	}

	return capsules;
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
 * Resolve capsule defs into world endpoints for current pose.
 * @param {CapsuleDef[]} capsuleDefs
 * @returns {CapsuleWorld[]}
 */
export function computeCapsulesWorldNow(capsuleDefs) {
	/** @type {CapsuleWorld[]} */
	const out = [];
	if (!Array.isArray(capsuleDefs) || capsuleDefs.length === 0) return out;
	
	// Pre-fetch world matrices could be faster, but here we do it per capsule
	for (const c of capsuleDefs) {
		const aNode = getNodeByUUID(c.a_uuid);
		if (!isOutlinerGroup(aNode)) continue;
		const aPos = /** @type {[number, number, number]} */ (computeGroupPivotWorldCurrentPose(aNode)); // this returns Pivot in World

		let bPos = [0, 0, 0];
		const hasOffsets = Array.isArray(c.start_offset_local) && c.start_offset_local.length >= 3 && Array.isArray(c.end_offset_local) && c.end_offset_local.length >= 3;
		if (hasOffsets || c.dynamic_from_cube) {
			try {
				if (!aNode.mesh || typeof THREE === 'undefined') continue;
				const q = aNode.mesh.getWorldQuaternion(new THREE.Quaternion());

				let localA = /** @type {[number,number,number]} */ (c.start_offset_local);
				let localB = /** @type {[number,number,number]} */ (c.end_offset_local);
				let radius = Math.max(0.1, Number(c.radius) || 0);
				if (c.dynamic_from_cube && c.cube_uuid) {
					// Recompute from the cube itself so edits (from/to/rotation/origin) update live
					const cubeNode = getNodeByUUID(c.cube_uuid);
					if (!isCubeLike(cubeNode)) continue;
					const seg = computeOrientedCubeCapsuleOffsetsLocal(aNode, cubeNode);
					if (!seg) continue;
					localA = seg.start;
					localB = seg.end;
					radius = seg.radius;
				}
				if (!Array.isArray(localA) || !Array.isArray(localB)) continue;

				const va = new THREE.Vector3(localA[0], localA[1], localA[2]).applyQuaternion(q);
				const vb = new THREE.Vector3(localB[0], localB[1], localB[2]).applyQuaternion(q);
				const aw = /** @type {[number,number,number]} */ ([aPos[0] + va.x, aPos[1] + va.y, aPos[2] + va.z]);
				bPos = /** @type {[number,number,number]} */ ([aPos[0] + vb.x, aPos[1] + vb.y, aPos[2] + vb.z]);
				out.push({ a: aw, b: bPos, radius });
				continue;
			} catch (e) {
				continue;
			}
		} else {
			// Standard segment a -> b
			const bNode = getNodeByUUID(c.b_uuid);
			if (!isOutlinerGroup(bNode)) continue;
			bPos = /** @type {[number, number, number]} */ (computeGroupPivotWorldCurrentPose(bNode));
		}
		out.push({ a: aPos, b: bPos, radius: Math.max(0.1, Number(c.radius) || 0) });
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

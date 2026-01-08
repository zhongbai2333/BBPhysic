import { state } from './state.js';
import { clampNumber } from './util.js';
import { v3, v3add, v3sub, v3len, v3scale, v3normalize, v3dot, m3fromEulerXYZDeg, m3mul, m3mulV3 } from './math.js';
import { isBoneGroup, readGroupOrigin } from './blockbench_api.js';

/**
 * Compute chain tip world position using only Group.origin + Euler rotations.
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} eulerDegPerBone
 */
export function computeChainTipWorld(chainGroups, eulerDegPerBone) {
	return computeChainTipWorldWithExtra(chainGroups, eulerDegPerBone, [0, 0, 0]);
}

function isCubeLike(node) {
	if (!node) return false;
	if (node.type === 'cube' || node.constructor?.name === 'Cube') return true;
	const f = node.from;
	const t = node.to;
	return Array.isArray(f) && f.length >= 3 && Array.isArray(t) && t.length >= 3;
}

function collectCubesUnderGroup(group) {
	/** @type {any[]} */
	const cubes = [];
	if (!group) return cubes;
	
	function traverse(node) {
		if (isCubeLike(node)) {
			cubes.push(node);
		}
		if (node && Array.isArray(node.children)) {
			for (const ch of node.children) {
				traverse(ch);
			}
		}
	}
	traverse(group);
	return cubes;
}

/**
 * Compute extra rest-space offset for the chain tip based on cubes under the last bone group.
 * Returns null if no valid extension found.
 * @param {any[]} chainGroups
 * @returns {[number,number,number]|null}
 */
export function computeChainTipExtraRestOffset(chainGroups) {
	if (!Array.isArray(chainGroups) || chainGroups.length < 2) return null;
	const last = chainGroups[chainGroups.length - 1];
	const prev = chainGroups[chainGroups.length - 2];
	if (!last || !prev) return null;
	const oLast = readGroupOrigin(last);
	const oPrev = readGroupOrigin(prev);
	const lastOffset = v3sub(oLast, oPrev);
	const len = v3len(lastOffset);
	if (!(len > 1e-6)) return null;
	const dir = v3scale(lastOffset, 1 / len);

	let maxProj = -1;
	let foundAny = false;
	try {
		const cubes = collectCubesUnderGroup(last);
		for (const cube of cubes) {
			const f = cube.from;
			const t = cube.to;
			if (!Array.isArray(f) || !Array.isArray(t)) continue;
			const xs = [Number(f[0]) || 0, Number(t[0]) || 0];
			const ys = [Number(f[1]) || 0, Number(t[1]) || 0];
			const zs = [Number(f[2]) || 0, Number(t[2]) || 0];
			for (const x of xs) {
				for (const y of ys) {
					for (const z of zs) {
						const v = v3sub([x, y, z], oLast);
						const p = v3dot(v, dir);
						if (p > maxProj) maxProj = p;
						foundAny = true;
					}
				}
			}
		}
	} catch (e) {
		// ignore
	}

	if (!foundAny || maxProj < 1e-4) return null;
	// Use maxProj directly as the length from origin
	const clamped = Math.min(maxProj, Math.max(0, len * 10)); // Allow longer extension if needed, but cap reasonable
	return /** @type {[number,number,number]} */ (v3scale(dir, clamped));
}

/**
 * Compute chain tip world position using only Group.origin + Euler rotations,
 * with an optional extra rest-space offset added to the last segment.
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} eulerDegPerBone
 * @param {[number,number,number]|null} tipExtraRestOffset
 */
export function computeChainTipWorldWithExtra(chainGroups, eulerDegPerBone, tipExtraRestOffset) {
	if (!Array.isArray(chainGroups) || chainGroups.length === 0) return v3(0, 0, 0);
	const origins = chainGroups.map(readGroupOrigin);
	let worldPos = origins[0];
	let worldRot = m3fromEulerXYZDeg(eulerDegPerBone[0] || [0, 0, 0]);
	for (let i = 1; i < chainGroups.length; i++) {
		const restOffset = v3sub(origins[i], origins[i - 1]);
		const rotatedOffset = m3mulV3(worldRot, restOffset);
		worldPos = v3add(worldPos, rotatedOffset);
		const localRot = m3fromEulerXYZDeg(eulerDegPerBone[i] || [0, 0, 0]);
		worldRot = m3mul(worldRot, localRot);
	}
	if (chainGroups.length >= 2) {
		const lastOffset = v3sub(origins[origins.length - 1], origins[origins.length - 2]);
		
		// If explicit tip extra is provided valid, use it INSTEAD of lastOffset extension logic.
		// Otherwise fallback to extending by lastOffset (bone length).
		// But note: 'tipExtraRestOffset' here is the vector from LastOrigin to Tip.
		// 'lastOffset' is the vector from PrevOrigin to LastOrigin.
		// In default FK visualization, we often duplicate the last bone vector.
		
		let tipVecLocal = lastOffset;
		if (Array.isArray(tipExtraRestOffset) && tipExtraRestOffset.length >= 3) {
             // If caller provided an offset, use it directly as the vector from last origin
			tipVecLocal = tipExtraRestOffset;
		}
		
		const tipOffset = m3mulV3(worldRot, tipVecLocal);
		return v3add(worldPos, tipOffset);
	}
	return worldPos;
}

/**
 * Build multiple linear chains from a root group.
 * @param {any} root
 * @param {number} maxDepth
 * @returns {any[][]}
 */
export function buildChainsFromRoot(root, maxDepth) {
	const out = [];
	if (!root) return out;
	const children0 = (root.children || []).filter(isBoneGroup);
	if (!children0.length) return [[root]];
	for (const ch of children0) {
		out.push(...buildChainsFromStart(ch, maxDepth));
	}
	return out;
}

/**
 * @param {any} start
 * @param {number} maxDepth
 * @returns {any[][]}
 */
export function buildChainsFromStart(start, maxDepth) {
	const out = [];
	if (!start) return out;
	let current = start;
	/** @type {any[]} */
	let chain = [start];
	const cap = Math.max(1, Math.round(maxDepth ?? 32));
	for (let depth = 0; depth < cap; depth++) {
		const children = (current.children || []).filter(isBoneGroup);
		if (!children.length) {
			out.push(chain);
			return out;
		}
		if (children.length === 1) {
			current = children[0];
			chain.push(current);
			continue;
		}
		out.push(chain);
		for (const ch of children) {
			out.push(...buildChainsFromStart(ch, cap - depth - 1));
		}
		return out;
	}
	out.push(chain);
	return out;
}

/**
 * Minimal collision constraint: keep chain tip outside a sphere by tweaking per-bone axis angle (deg).
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} baseEulerDegPerBone
 * @param {number[]} axisAnglesDeg Mutable
 * @param {number} axisIndex
 */
export function applySphereCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerWorld, collisionMemory) {
	return applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerWorld, null, collisionMemory, null);
}

/**
 * Sphere collision with optional radius override.
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} baseEulerDegPerBone
 * @param {number[]} axisAnglesDeg
 * @param {number} axisIndex
 * @param {[number,number,number]} centerWorld
 * @param {number|null} radiusOverride
 * @param {{lastNormalWorld?: [number,number,number]|null}|null} collisionMemory
 */
export function applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerWorld, radiusOverride, collisionMemory, tipExtraRestOffset) {
	if (!state.config.collision_enabled) return;
	const radius = radiusOverride == null ? Math.max(0, Number(state.config.collision_radius) || 0) : Math.max(0, Number(radiusOverride) || 0);
	if (radius <= 1e-6) return;
	const center = Array.isArray(centerWorld) && centerWorld.length >= 3 ? centerWorld : state.config.collision_center;
	const c = [Number(center[0]) || 0, Number(center[1]) || 0, Number(center[2]) || 0];
	const iters = Math.max(0, Math.min(64, Math.round(state.config.collision_iterations)));
	const strength = clampNumber(state.config.collision_strength, 0, 5, 1);
	if (iters <= 0 || strength <= 0) return;

	const tipExtra = Array.isArray(tipExtraRestOffset) && tipExtraRestOffset.length >= 3 ? tipExtraRestOffset : computeChainTipExtraRestOffset(chainGroups);

	const eps = 0.5;
	const maxStep = 6;

	function tipInfo() {
		const eulers = baseEulerDegPerBone.map((r, i) => {
			const out = [r[0], r[1], r[2]];
			out[axisIndex] = axisAnglesDeg[i];
			return out;
		});
		const tip = computeChainTipWorldWithExtra(chainGroups, eulers, tipExtra);
		const to = v3sub(tip, c);
		const d = v3len(to);
		const n = d > 1e-6 ? v3scale(to, 1 / d) : [0, 0, 0];
		return { tip, to, d, n };
	}

	let info = tipInfo();
	let d = info.d;
	let touched = false;
	for (let iter = 0; iter < iters && d < radius; iter++) {
		touched = true;
		const penetration = radius - d;
		let pushDir = info.n;
		if (collisionMemory && Array.isArray(collisionMemory.lastNormalWorld)) {
			const last = collisionMemory.lastNormalWorld;
			if (v3len(last) > 1e-6 && v3dot(last, pushDir) < 0.2) {
				pushDir = last;
			}
		}
		pushDir = v3normalize(pushDir);
		if (v3len(pushDir) <= 1e-8) break;

		let progressed = false;
		for (let j = axisAnglesDeg.length - 1; j >= 0; j--) {
			const old = axisAnglesDeg[j];
			const baseSigned = v3dot(info.to, pushDir);

			axisAnglesDeg[j] = old + eps;
			let infoPlus = tipInfo();
			const sPlus = v3dot(infoPlus.to, pushDir);
			axisAnglesDeg[j] = old - eps;
			let infoMinus = tipInfo();
			const sMinus = v3dot(infoMinus.to, pushDir);

			const dir = sPlus >= sMinus ? 1 : -1;
			axisAnglesDeg[j] = old + dir * Math.min(maxStep, penetration * strength);
			const infoNew = tipInfo();
			const sNew = v3dot(infoNew.to, pushDir);
			if (sNew >= baseSigned + 1e-4 || infoNew.d >= d + 1e-4) {
				info = infoNew;
				d = infoNew.d;
				progressed = true;
				if (d >= radius) break;
			} else {
				axisAnglesDeg[j] = old;
			}
		}
		if (!progressed) break;
	}
	if (touched && collisionMemory) {
		collisionMemory.lastNormalWorld = pushDir;
	}
}

/**
 * Moving sphere collision using segment-closest CCD + final center pass.
 */
export function applyMovingSphereCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerPrevWorld, centerNowWorld, collisionMemory) {
	return applyMovingSphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerPrevWorld, centerNowWorld, null, collisionMemory, null);
}

/**
 * Moving sphere collision using segment-closest CCD + final center pass.
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} baseEulerDegPerBone
 * @param {number[]} axisAnglesDeg
 * @param {number} axisIndex
 * @param {[number,number,number]} centerPrevWorld
 * @param {[number,number,number]} centerNowWorld
 * @param {number|null} radiusOverride
 * @param {{lastNormalWorld?: [number,number,number]|null}|null} collisionMemory
 */
export function applyMovingSphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, centerPrevWorld, centerNowWorld, radiusOverride, collisionMemory, tipExtraRestOffset) {
	if (!state.config.collision_enabled) return;
	const radius = radiusOverride == null ? Math.max(0, Number(state.config.collision_radius) || 0) : Math.max(0, Number(radiusOverride) || 0);
	if (radius <= 1e-6) return;
	const prev = Array.isArray(centerPrevWorld) && centerPrevWorld.length >= 3 ? centerPrevWorld : centerNowWorld;
	const now = Array.isArray(centerNowWorld) && centerNowWorld.length >= 3 ? centerNowWorld : state.config.collision_center;
	const dp = [Number(prev[0]) || 0, Number(prev[1]) || 0, Number(prev[2]) || 0];
	const dn = [Number(now[0]) || 0, Number(now[1]) || 0, Number(now[2]) || 0];

	const tipExtra = Array.isArray(tipExtraRestOffset) && tipExtraRestOffset.length >= 3 ? tipExtraRestOffset : computeChainTipExtraRestOffset(chainGroups);

	const seg = v3sub(dn, dp);
	const segLen2 = v3dot(seg, seg);
	if (segLen2 > 1e-10) {
		const eulersNow = baseEulerDegPerBone.map((r, i) => {
			const out = [r[0], r[1], r[2]];
			out[axisIndex] = axisAnglesDeg[i];
			return out;
		});
		const tipNow = computeChainTipWorldWithExtra(chainGroups, eulersNow, tipExtra);
		let t = v3dot(v3sub(tipNow, dp), seg) / segLen2;
		t = Math.max(0, Math.min(1, t));
		const closest = v3add(dp, v3scale(seg, t));
		const dClosest = v3len(v3sub(tipNow, closest));
		if (dClosest < radius) {
			applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, closest, radius, collisionMemory, tipExtra);
		}
	}
	applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, dn, radius, collisionMemory, tipExtra);
}

function clamp01(t) {
	return Math.max(0, Math.min(1, Number(t) || 0));
}

/** @param {[number,number,number]} a @param {[number,number,number]} b @param {number} t */
function v3lerpLocal(a, b, t) {
	const tt = clamp01(t);
	return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt];
}

/**
 * Closest point on segment AB to point P.
 * @param {[number,number,number]} p
 * @param {[number,number,number]} a
 * @param {[number,number,number]} b
 */
export function closestPointOnSegment(p, a, b) {
	const ab = v3sub(b, a);
	const ab2 = v3dot(ab, ab);
	if (ab2 <= 1e-10) return a;
	let t = v3dot(v3sub(p, a), ab) / ab2;
	t = clamp01(t);
	return v3add(a, v3scale(ab, t));
}

/**
 * Apply capsule collision: treat capsule as a swept sphere along segment AB.
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} baseEulerDegPerBone
 * @param {number[]} axisAnglesDeg
 * @param {number} axisIndex
 * @param {Array<{a:[number,number,number], b:[number,number,number], radius:number}>} capsulesWorld
 * @param {number} pointRadius
 * @param {{lastNormalWorld?: [number,number,number]|null}|null} collisionMemory
 */
export function applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesWorld, pointRadius, collisionMemory) {
	if (!state.config.collision_enabled) return;
	if (!Array.isArray(capsulesWorld) || capsulesWorld.length === 0) return;
	const pr = Math.max(0, Number(pointRadius) || 0);
	const tipExtra = computeChainTipExtraRestOffset(chainGroups);

	// Compute current tip once (base for closest-point queries). During correction the tip changes;
	// we re-evaluate per capsule by delegating to applySphereCollisionToChainAxisWithRadius.
	for (const cap of capsulesWorld) {
		if (!cap || !Array.isArray(cap.a) || !Array.isArray(cap.b)) continue;
		const r = Math.max(0, Number(cap.radius) || 0) + pr;
		if (r <= 1e-6) continue;

		// Use current pose tip to pick closest point on this capsule segment.
		const eulersNow = baseEulerDegPerBone.map((rot, i) => {
			const out = [rot[0], rot[1], rot[2]];
			out[axisIndex] = axisAnglesDeg[i];
			return out;
		});
		const tipNow = computeChainTipWorldWithExtra(chainGroups, eulersNow, tipExtra);
		const closest = closestPointOnSegment(tipNow, cap.a, cap.b);
		const d = v3len(v3sub(tipNow, closest));
		if (d < r) {
			applySphereCollisionToChainAxisWithRadius(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, closest, r, collisionMemory, tipExtra);
		}
	}
}

/**
 * Apply moving-capsule collision by interpolating capsule endpoints (substeps).
 * @param {any[]} chainGroups
 * @param {Array<[number, number, number]>} baseEulerDegPerBone
 * @param {number[]} axisAnglesDeg
 * @param {number} axisIndex
 * @param {Array<{a:[number,number,number], b:[number,number,number], radius:number}>} capsulesPrev
 * @param {Array<{a:[number,number,number], b:[number,number,number], radius:number}>} capsulesNow
 * @param {number} pointRadius
 * @param {{lastNormalWorld?: [number,number,number]|null}|null} collisionMemory
 */
export function applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesPrev, capsulesNow, pointRadius, collisionMemory) {
	if (!state.config.collision_enabled) return;
	if (!Array.isArray(capsulesNow) || capsulesNow.length === 0) return;
	if (!Array.isArray(capsulesPrev) || capsulesPrev.length === 0) {
		applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, capsulesNow, pointRadius, collisionMemory);
		return;
	}

	const maxSub = Math.max(1, Math.min(32, Math.round(Number(state.config.collision_sweep_substeps_max) || 6)));
	let maxDisp = 0;
	for (let i = 0; i < Math.min(capsulesPrev.length, capsulesNow.length); i++) {
		const p = capsulesPrev[i];
		const n = capsulesNow[i];
		if (!p || !n) continue;
		try {
			maxDisp = Math.max(maxDisp, v3len(v3sub(n.a, p.a)), v3len(v3sub(n.b, p.b)));
		} catch (e) {
			// ignore
		}
	}
	let base = 0;
	try {
		base = Math.max(0.5, Number(capsulesNow[0]?.radius) || 0);
	} catch (e) {
		base = 0.5;
	}
	const sub = Math.max(1, Math.min(maxSub, Math.ceil(maxDisp / Math.max(1e-3, base))));
	for (let s = 1; s <= sub; s++) {
		const t = s / sub;
		/** @type {Array<{a:[number,number,number], b:[number,number,number], radius:number}>} */
		const interp = [];
		for (let i = 0; i < Math.min(capsulesPrev.length, capsulesNow.length); i++) {
			const p = capsulesPrev[i];
			const n = capsulesNow[i];
			if (!p || !n) continue;
			interp.push({
				a: v3lerpLocal(p.a, n.a, t),
				b: v3lerpLocal(p.b, n.b, t),
				radius: Math.max(0, Number(n.radius) || 0),
			});
		}
		applyCapsuleCollisionToChainAxis(chainGroups, baseEulerDegPerBone, axisAnglesDeg, axisIndex, interp, pointRadius, collisionMemory);
	}
}

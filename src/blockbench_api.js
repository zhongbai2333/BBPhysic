import { state } from './state.js';
import { degToRad, radToDeg, v3add, v3sub, m3fromEulerXYZDeg, m3mul, m3mulV3 } from './math.js';

export function getSelectedAnimation() {
	try {
		if (typeof Animator !== 'undefined' && Animator && Animator.selected) return Animator.selected;
		if (typeof AnimationItem !== 'undefined' && AnimationItem && AnimationItem.selected) return AnimationItem.selected;
	} catch (e) {
		// ignore
	}
	return null;
}

export function isGroup(obj) {
	return !!obj && (obj.type === 'group' || obj.constructor?.name === 'Group') && obj.rotation != null;
}

// Outliner group node (may be a folder/container without rotation)
export function isOutlinerGroup(obj) {
	return !!obj && (obj.type === 'group' || obj.constructor?.name === 'Group');
}

// Bone-like group: has a mesh instance (folders/containers typically do not)
export function isBoneGroup(obj) {
	return isOutlinerGroup(obj) && !!obj.mesh;
}

export function getSelectedRootGroups() {
	try {
		if (typeof Group !== 'undefined' && Group) {
			if (Array.isArray(Group.multi_selected) && Group.multi_selected.length) {
				return Group.multi_selected.filter(isBoneGroup);
			}
			if (Group.selected && isBoneGroup(Group.selected)) return [Group.selected];
		}
	} catch (e) {
		// ignore
	}
	return [];
}

export function getAllRootGroups() {
	try {
		if (typeof Group !== 'undefined' && Group && Array.isArray(Group.all)) {
			return Group.all
				.filter(isBoneGroup)
				.filter((g) => {
					const p = g.parent;
					return !p || p === 'root' || !isBoneGroup(p);
				});
		}
	} catch (e) {
		// ignore
	}
	return [];
}

export function getSolveRootGroups() {
	if (state.config.solve_scope === 'all_roots') return getAllRootGroups();
	return getSelectedRootGroups();
}

export function readGroupOrigin(group) {
	const o = group?.origin;
	if (Array.isArray(o) && o.length >= 3) return [Number(o[0]) || 0, Number(o[1]) || 0, Number(o[2]) || 0];
	if (typeof o === 'object' && o) return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0];
	return [0, 0, 0];
}

export function readGroupRotationDeg(group) {
	const r = group?.rotation;
	if (Array.isArray(r) && r.length >= 3) return [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0];
	if (typeof r === 'object' && r) return [Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0];
	try {
		const mesh = group?.mesh;
		const mr = mesh?.rotation;
		if (mr && typeof mr.x === 'number' && typeof mr.y === 'number' && typeof mr.z === 'number') {
			return [radToDeg(mr.x), radToDeg(mr.y), radToDeg(mr.z)];
		}
	} catch (e) {
		// ignore
	}
	return [0, 0, 0];
}

export function writeGroupRotationDeg(group, rotDeg) {
	if (!group) return;
	const x = Number(rotDeg?.[0]) || 0;
	const y = Number(rotDeg?.[1]) || 0;
	const z = Number(rotDeg?.[2]) || 0;
	try {
		const r = group.rotation;
		if (Array.isArray(r) && r.length >= 3) {
			r[0] = x;
			r[1] = y;
			r[2] = z;
		} else if (typeof r === 'object' && r) {
			r.x = x;
			r.y = y;
			r.z = z;
		}
	} catch (e) {
		// ignore
	}
	try {
		const mesh = group.mesh;
		if (mesh && mesh.rotation) {
			mesh.rotation.set(degToRad(x), degToRad(y), degToRad(z));
		}
	} catch (e) {
		// ignore
	}
	try {
		if (typeof Canvas !== 'undefined' && Canvas && typeof Canvas.updateView === 'function') {
			Canvas.updateView({});
		}
	} catch (e) {
		// ignore
	}
}

/**
 * Compute a group's pivot world position for the current pose (as reflected in group.rotation values).
 * Note: This ignores translation animation channels; it uses origins + rotations only.
 * @param {any} group
 */
export function computeGroupPivotWorldCurrentPose(group) {
	if (!group) return [0, 0, 0];
	try {
		const mesh = group.mesh;
		if (mesh && state.tmpThreeVec3 && typeof mesh.getWorldPosition === 'function') {
			mesh.getWorldPosition(state.tmpThreeVec3);
			return [state.tmpThreeVec3.x, state.tmpThreeVec3.y, state.tmpThreeVec3.z];
		}
	} catch (e) {
		// ignore
	}
	/** @type {any[]} */
	const chain = [];
	let cur = group;
	while (cur && cur !== 'root') {
		if (cur.type === 'group' || cur.constructor?.name === 'Group') chain.push(cur);
		const p = cur.parent;
		if (!p || p === 'root') break;
		cur = p;
	}
	chain.reverse();
	if (!chain.length) return [0, 0, 0];

	const origins = chain.map(readGroupOrigin);
	const rots = chain.map(readGroupRotationDeg);
	let worldPos = origins[0];
	let worldRot = m3fromEulerXYZDeg(rots[0]);
	for (let i = 1; i < chain.length; i++) {
		const restOffset = v3sub(origins[i], origins[i - 1]);
		worldPos = v3add(worldPos, m3mulV3(worldRot, restOffset));
		worldRot = m3mul(worldRot, m3fromEulerXYZDeg(rots[i]));
	}
	return worldPos;
}

function pickRotationChannel(animator) {
	const channels = animator?.channels;
	if (channels && typeof channels === 'object') {
		if (channels.rotation) return 'rotation';
		if (channels.rotations) return 'rotations';
	}
	return 'rotation';
}

export function addRotationKeyframe(boneAnimator, timeSec, rotDeg) {
	const channel = pickRotationChannel(boneAnimator);
	try {
		return boneAnimator.addKeyframe({
			channel,
			time: timeSec,
			data_points: [{ x: rotDeg[0], y: rotDeg[1], z: rotDeg[2] }],
		});
	} catch (e1) {
		return boneAnimator.addKeyframe({
			channel,
			time: timeSec,
			data_points: [[rotDeg[0], rotDeg[1], rotDeg[2]]],
		});
	}
}

import { state } from './state.js';
import { isOutlinerGroup } from './blockbench_api.js';
import { buildCapsuleDefsFromRoot, computeCapsulesWorldNow } from './capsules.js';

export function getSceneForCollider() {
	try {
		if (typeof Canvas !== 'undefined' && Canvas && Canvas.scene) return Canvas.scene;
	} catch (e) {
		// ignore
	}
	try {
		if (typeof scene !== 'undefined' && scene) return scene;
	} catch (e) {
		// ignore
	}
	return null;
}

function requestCanvasUpdate() {
	try {
		if (typeof Canvas !== 'undefined' && Canvas && typeof Canvas.updateView === 'function') {
			Canvas.updateView({});
		}
	} catch (e) {
		// ignore
	}
}

/** @returns {boolean} */
function anyCapsuleGhostEnabled() {
	return Boolean(state.config.show_moving_capsules || state.config.show_target_capsules);
}

function ensureCapsuleGroups() {
	if (typeof THREE === 'undefined' || !THREE) return null;
	const scn = getSceneForCollider();
	if (!scn) return null;

	if (!state.movingCapsulesGroup) {
		const g = new THREE.Group();
		g.name = 'BBPhysic_MovingCapsules';
		g.visible = false;
		g.renderOrder = 999;
		scn.add(g);
		state.movingCapsulesGroup = g;
	}
	if (!state.targetCapsulesGroup) {
		const g = new THREE.Group();
		g.name = 'BBPhysic_TargetCapsules';
		g.visible = false;
		g.renderOrder = 999;
		scn.add(g);
		state.targetCapsulesGroup = g;
	}
	return { moving: state.movingCapsulesGroup, target: state.targetCapsulesGroup };
}

function getGroupByUUID(uuid) {
	try {
		if (typeof OutlinerNode !== 'undefined' && OutlinerNode?.uuids) {
			const node = OutlinerNode.uuids[String(uuid)];
			if (isOutlinerGroup(node)) return node;
		}
	} catch (e) {
		// ignore
	}
	return null;
}

function clearGroup(group) {
	if (!group) return;
	try {
		for (const ch of group.children.slice()) group.remove(ch);
	} catch (e) {
		// ignore
	}
	group.userData = {};
}

function buildCapsuleSegmentObjects(opacity) {
	const lineGeom = new THREE.BufferGeometry();
	const positions = new Float32Array(6);
	lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	lineGeom.attributes.position.setUsage(THREE.DynamicDrawUsage);
	const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthTest: false });
	const line = new THREE.Line(lineGeom, lineMat);
	line.renderOrder = 999;

	const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
	const cylMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		wireframe: true,
		transparent: true,
		opacity,
		depthTest: false,
	});
	const cyl = new THREE.Mesh(cylGeom, cylMat);
	cyl.renderOrder = 999;

	const sphereGeom = new THREE.SphereGeometry(1, 10, 8);
	const sphereMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		wireframe: true,
		transparent: true,
		opacity,
		depthTest: false,
	});
	const a = new THREE.Mesh(sphereGeom, sphereMat);
	const b = new THREE.Mesh(sphereGeom, sphereMat);
	a.renderOrder = 999;
	b.renderOrder = 999;
	return { line, cyl, a, b };
}

function ensureGroupSegments(group, count, opacity) {
	if (!group) return;
	const existing = Array.isArray(group.userData?.segments) ? group.userData.segments : [];
	if (existing.length === count) return;
	clearGroup(group);
	/** @type {Array<any>} */
	const segments = [];
	for (let i = 0; i < count; i++) {
		const seg = buildCapsuleSegmentObjects(opacity);
		group.add(seg.line);
		group.add(seg.cyl);
		group.add(seg.a);
		group.add(seg.b);
		segments.push(seg);
	}
	group.userData.segments = segments;
}

function updateSegmentsFromCapsulesWorld(group, capsulesWorld, opacity) {
	if (!group) return;
	ensureGroupSegments(group, capsulesWorld.length, opacity);
	const segments = group.userData.segments;
	for (let i = 0; i < capsulesWorld.length; i++) {
		const c = capsulesWorld[i];
		const seg = segments[i];
		const r = Math.max(0, Number(c.radius) || 0);
		const ax = c.a[0], ay = c.a[1], az = c.a[2];
		const bx = c.b[0], by = c.b[1], bz = c.b[2];
		const dx = bx - ax, dy = by - ay, dz = bz - az;
		const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;
		seg.a.position.set(c.a[0], c.a[1], c.a[2]);
		seg.b.position.set(c.b[0], c.b[1], c.b[2]);
		seg.a.scale.set(r, r, r);
		seg.b.scale.set(r, r, r);
		// Cylinder: oriented along segment direction (Y axis is cylinder axis)
		if (len > 1e-3 && r > 1e-6) {
			seg.cyl.visible = true;
			seg.cyl.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
			seg.cyl.scale.set(r, len, r);
			const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
			const q = new THREE.Quaternion();
			q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			seg.cyl.quaternion.copy(q);
		} else {
			seg.cyl.visible = false;
		}
		const attr = seg.line.geometry.attributes.position;
		attr.setXYZ(0, ax, ay, az);
		attr.setXYZ(1, bx, by, bz);
		attr.needsUpdate = true;
	}
}

export function stopCapsuleUpdates() {
	if (state.capsuleTimer) {
		clearInterval(state.capsuleTimer);
		state.capsuleTimer = null;
	}
}

export function updateCapsuleVisuals(force = false) {
	if (!anyCapsuleGhostEnabled()) return;
	const groups = ensureCapsuleGroups();
	if (!groups) return;

	const now = Date.now();
	const minDt = Math.round(1000 / Math.max(1, Math.min(60, Math.round(state.config.capsule_update_fps || 10))));
	if (!force && now - state.capsuleLastUpdateMs < minDt) return;
	state.capsuleLastUpdateMs = now;

	try {
		if ((!state.solveSetup.movingCapsules || state.solveSetup.movingCapsules.length === 0) && state.config.moving_root_uuid) {
			const root = getGroupByUUID(state.config.moving_root_uuid);
			if (root) state.solveSetup.movingCapsules = buildCapsuleDefsFromRoot(root);
		}
		if ((!state.solveSetup.targetCapsules || state.solveSetup.targetCapsules.length === 0) && state.config.target_root_uuid) {
			const root = getGroupByUUID(state.config.target_root_uuid);
			if (root) state.solveSetup.targetCapsules = buildCapsuleDefsFromRoot(root);
		}
	} catch (e) {
		// ignore
	}

	const movingVisible = Boolean(state.config.show_moving_capsules) && Array.isArray(state.solveSetup.movingCapsules) && state.solveSetup.movingCapsules.length > 0;
	const targetVisible = Boolean(state.config.show_target_capsules) && Array.isArray(state.solveSetup.targetCapsules) && state.solveSetup.targetCapsules.length > 0;

	groups.moving.visible = movingVisible;
	groups.target.visible = targetVisible;

	if (movingVisible) {
		const movingWorld = computeCapsulesWorldNow(state.solveSetup.movingCapsules);
		updateSegmentsFromCapsulesWorld(groups.moving, movingWorld, 0.35);
	}
	if (targetVisible) {
		const targetWorld = computeCapsulesWorldNow(state.solveSetup.targetCapsules);
		updateSegmentsFromCapsulesWorld(groups.target, targetWorld, 0.18);
	}

	requestCanvasUpdate();
}

export function startCapsuleUpdates() {
	stopCapsuleUpdates();
	if (!anyCapsuleGhostEnabled()) return;
	ensureCapsuleGroups();
	updateCapsuleVisuals(true);
	const fps = Math.max(1, Math.min(60, Math.round(state.config.capsule_update_fps || 10)));
	state.capsuleTimer = setInterval(() => {
		try {
			updateCapsuleVisuals(false);
		} catch (e) {
			// ignore
		}
	}, Math.round(1000 / fps));
}

/**
 * 根据当前 config 应用虚影显示：
 * - show_moving_capsules/show_target_capsules
 * - capsule_update_fps
 */
export function applyCapsuleVisualSettings() {
	const groups = ensureCapsuleGroups();
	if (!groups) return;

	if (!anyCapsuleGhostEnabled()) {
		groups.moving.visible = false;
		groups.target.visible = false;
		stopCapsuleUpdates();
		requestCanvasUpdate();
		return;
	}
	startCapsuleUpdates();
}

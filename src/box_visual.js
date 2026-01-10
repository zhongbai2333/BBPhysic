import { state } from './state.js';
import { showMessage } from './util.js';
import { buildBoxDefsFromRoot, computeBoxesWorldNow } from './capsules.js';
import { isOutlinerGroup } from './blockbench_api.js';

function getSceneForGhost() {
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

function buildBoxMesh(opacity) {
	const geom = new THREE.BoxGeometry(1, 1, 1);
	const mat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		wireframe: true,
		transparent: true,
		opacity,
		depthTest: false,
	});
	const mesh = new THREE.Mesh(geom, mat);
	mesh.renderOrder = 999;
	return mesh;
}

function buildBoneMarkerMesh(opacity) {
	const geom = new THREE.BoxGeometry(1, 1, 1);
	const mat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		wireframe: true,
		transparent: true,
		opacity,
		depthTest: false,
	});
	const mesh = new THREE.Mesh(geom, mat);
	mesh.renderOrder = 999;
	return mesh;
}

function ensureGhostGroups() {
	if (typeof THREE === 'undefined' || !THREE) return null;
	const scn = getSceneForGhost();
	if (!scn) return null;

	if (!state.ghost) state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
	if (!state.ghost.moving) {
		const g = new THREE.Group();
		g.name = 'BBPhysic_MovingBoxesGhost';
		g.visible = false;
		g.renderOrder = 999;
		scn.add(g);
		state.ghost.moving = g;
	}
	if (!state.ghost.target) {
		const g = new THREE.Group();
		g.name = 'BBPhysic_TargetBoxesGhost';
		g.visible = false;
		g.renderOrder = 999;
		scn.add(g);
		state.ghost.target = g;
	}
	return { scn, moving: state.ghost.moving, target: state.ghost.target };
}

function ensureGroupBoxes(group, count, opacity) {
	if (!group) return;
	const existing = Array.isArray(group.userData?.boxes) ? group.userData.boxes : [];
	if (existing.length === count && group.userData?.opacity === opacity) return;
	clearGroup(group);
	group.userData.opacity = opacity;
	/** @type {any[]} */
	const boxes = [];
	for (let i = 0; i < count; i++) {
		const mesh = buildBoxMesh(opacity);
		group.add(mesh);
		boxes.push(mesh);
	}
	group.userData.boxes = boxes;
}


function updateBoxes(group, boxesWorld, opacity) {
	if (!group) return;
	ensureGroupBoxes(group, boxesWorld.length, opacity);
	const meshes = group.userData.boxes;
	const q = new THREE.Quaternion();
	const m = new THREE.Matrix4();
	const ax = new THREE.Vector3();
	const ay = new THREE.Vector3();
	const az = new THREE.Vector3();
	for (let i = 0; i < boxesWorld.length; i++) {
		const b = boxesWorld[i];
		const mesh = meshes[i];
		if (!b || !mesh) continue;
		const c = b.center;
		const half = b.half;
		const axes = b.axes;
		ax.set(axes[0][0], axes[0][1], axes[0][2]);
		ay.set(axes[1][0], axes[1][1], axes[1][2]);
		az.set(axes[2][0], axes[2][1], axes[2][2]);
		m.makeBasis(ax, ay, az);
		q.setFromRotationMatrix(m);
		mesh.position.set(c[0], c[1], c[2]);
		mesh.quaternion.copy(q);
		mesh.scale.set((half[0] || 0) * 2, (half[1] || 0) * 2, (half[2] || 0) * 2);
	}
}

function ensureDefsFromConfigIfMissing() {
	try {
		if ((!state.solveSetup.movingBoxes || state.solveSetup.movingBoxes.length === 0) && state.config.moving_root_uuid) {
			const root = getGroupByUUID(state.config.moving_root_uuid);
			if (root) state.solveSetup.movingBoxes = buildBoxDefsFromRoot(root);
		}
		if ((!state.solveSetup.targetBoxes || state.solveSetup.targetBoxes.length === 0) && state.config.target_root_uuid) {
			const root = getGroupByUUID(state.config.target_root_uuid);
			if (root) state.solveSetup.targetBoxes = buildBoxDefsFromRoot(root);
		}
	} catch (e) {
		// ignore
	}
}

export function stopBoxGhost() {
	if (state.ghost?.timer) {
		try {
			clearInterval(state.ghost.timer);
		} catch (e) {
			// ignore
		}
		state.ghost.timer = null;
	}
}

export function updateBoxGhost(force = false) {
	if (!state.ghost?.enabled) return;
	const groups = ensureGhostGroups();
	if (!groups) return;

	const now = Date.now();
	const minDt = 1000 / 15;
	if (!force && now - (state.ghost.lastMs || 0) < minDt) return;
	state.ghost.lastMs = now;

	ensureDefsFromConfigIfMissing();

	const movingDefs = Array.isArray(state.solveSetup.movingBoxes) ? state.solveSetup.movingBoxes : [];
	const targetDefs = Array.isArray(state.solveSetup.targetBoxes) ? state.solveSetup.targetBoxes : [];
	const movingVisible = movingDefs.length > 0;
	const targetVisible = targetDefs.length > 0;
	groups.moving.visible = movingVisible;
	groups.target.visible = targetVisible;
	if (movingVisible) updateBoxes(groups.moving, computeBoxesWorldNow(movingDefs), 0.35);
	if (targetVisible) updateBoxes(groups.target, computeBoxesWorldNow(targetDefs), 0.18);

	requestCanvasUpdate();
}

export function toggleBoxGhost() {
	if (!state.ghost) state.ghost = { enabled: false, timer: null, lastMs: 0, moving: null, target: null };
	state.ghost.enabled = !state.ghost.enabled;
	const groups = ensureGhostGroups();
	if (!state.ghost.enabled) {
		stopBoxGhost();
		try {
			if (groups?.moving) groups.moving.visible = false;
			if (groups?.target) groups.target.visible = false;
		} catch (e) {
			// ignore
		}
		requestCanvasUpdate();
		showMessage('BBPhysic', 'OBB 虚影：已关闭');
		return;
	}

	// enable
	try {
		updateBoxGhost(true);
	} catch (e) {
		// ignore
	}
	stopBoxGhost();
	state.ghost.timer = setInterval(() => {
		try {
			updateBoxGhost(false);
		} catch (e) {
			// ignore
		}
	}, 1000 / 15);
	showMessage('BBPhysic', 'OBB 虚影：已开启（Tools 菜单可快速开关）');
}

export function disposeBoxGhost() {
	stopBoxGhost();
	try {
		const scn = getSceneForGhost();
		if (scn && state.ghost?.moving) scn.remove(state.ghost.moving);
		if (scn && state.ghost?.target) scn.remove(state.ghost.target);
	} catch (e) {
		// ignore
	}
	if (state.ghost) {
		state.ghost.moving = null;
		state.ghost.target = null;
	}
	requestCanvasUpdate();
}

import { state } from './state.js';

function getScene() {
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

function clearGroup(group) {
	if (!group) return;
	try {
		for (const ch of group.children.slice()) group.remove(ch);
	} catch (e) {
		// ignore
	}
	group.userData = {};
}

function buildMarkerMesh(opacity) {
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

function readWorldPose(group, outPos3, outQuat4) {
	try {
		const mesh = group?.mesh;
		if (mesh && typeof mesh.getWorldPosition === 'function' && typeof mesh.getWorldQuaternion === 'function') {
			const v3 = state.tmpThreeVec3 || (state.tmpThreeVec3 = new THREE.Vector3());
			const q4 = state.tmpThreeQuat || (state.tmpThreeQuat = new THREE.Quaternion());
			mesh.getWorldPosition(v3);
			mesh.getWorldQuaternion(q4);
			outPos3[0] = v3.x;
			outPos3[1] = v3.y;
			outPos3[2] = v3.z;
			outQuat4[0] = q4.x;
			outQuat4[1] = q4.y;
			outQuat4[2] = q4.z;
			outQuat4[3] = q4.w;
			return true;
		}
	} catch (e) {
		// ignore
	}
	return false;
}

function ensureGroup() {
	if (typeof THREE === 'undefined' || !THREE) return null;
	const scn = getScene();
	if (!scn) return null;
	if (!state.simBonesVis) {
		state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
	}
	if (!state.simBonesVis.group) {
		const g = new THREE.Group();
		g.name = 'BBPhysic_SimBonesGhost';
		g.visible = false;
		g.renderOrder = 999;
		scn.add(g);
		state.simBonesVis.group = g;
	}
	return state.simBonesVis.group;
}

function ensureMarkers(group, count) {
	const existing = Array.isArray(group.userData?.markers) ? group.userData.markers : [];
	if (existing.length === count) return;
	clearGroup(group);
	/** @type {any[]} */
	const markers = [];
	for (let i = 0; i < count; i++) {
		const mesh = buildMarkerMesh(0.22);
		group.add(mesh);
		markers.push(mesh);
	}
	group.userData.markers = markers;
}

export function enableSimBoneMarkers() {
	if (!state.simBonesVis) state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
	state.simBonesVis.enabled = true;
	const g = ensureGroup();
	if (g) g.visible = true;
	requestCanvasUpdate();
}

export function disableSimBoneMarkers() {
	if (!state.simBonesVis) state.simBonesVis = { group: null, enabled: false, lastMs: 0 };
	state.simBonesVis.enabled = false;
	try {
		if (state.simBonesVis.group) {
			state.simBonesVis.group.visible = false;
			clearGroup(state.simBonesVis.group);
		}
	} catch (e) {
		// ignore
	}
	requestCanvasUpdate();
}

export function updateSimBoneMarkers(bones, force = false) {
	if (!state.simBonesVis?.enabled) return;
	const group = ensureGroup();
	if (!group) return;
	const now = Date.now();
	const minDt = 1000 / 15;
	if (!force && now - (state.simBonesVis.lastMs || 0) < minDt) return;
	state.simBonesVis.lastMs = now;

	const list = Array.isArray(bones) ? bones : [];
	group.visible = list.length > 0;
	ensureMarkers(group, list.length);
	const markers = group.userData.markers;
	const q = new THREE.Quaternion();
	for (let i = 0; i < list.length; i++) {
		const bone = list[i];
		const mesh = markers[i];
		if (!mesh) continue;
		const p = [0, 0, 0];
		const qq = [0, 0, 0, 1];
		readWorldPose(bone, p, qq);
		mesh.position.set(p[0], p[1], p[2]);
		q.set(qq[0], qq[1], qq[2], qq[3]);
		mesh.quaternion.copy(q);
		mesh.scale.set(0.6, 0.6, 0.6);
	}
	requestCanvasUpdate();
}

export function disposeSimBoneMarkers() {
	try {
		disableSimBoneMarkers();
		const scn = getScene();
		if (scn && state.simBonesVis?.group) scn.remove(state.simBonesVis.group);
	} catch (e) {
		// ignore
	}
	if (state.simBonesVis) state.simBonesVis.group = null;
	requestCanvasUpdate();
}

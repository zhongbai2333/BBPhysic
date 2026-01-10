import { state } from './state.js';
import { clampNumber, debugLog, debugWarn, notify, showMessage, sleep0 } from './util.js';
import {
	addRotationKeyframe,
	getSelectedAnimation,
	isGroup,
	isOutlinerGroup,
	readGroupRotationDeg,
} from './blockbench_api.js';
import {
	buildChainsFromRoot,
	// physics solving is now handled by Rapier in Rust/WASM
} from './chains.js';
import { flattenChainsWithParentAnchors } from './chain_flatten.js';
import { degToRad, radToDeg } from './math.js';
import { buildBoxDefsFromRoot, computeBoxesWorldNow, packBoxesWorldToF32, computeGroupApproxRadius } from './capsules.js';
import { RapierWasmSolver } from './rapier_wasm_solver.js';

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

function getGroupsByUUIDs(uuids) {
	/** @type {any[]} */
	const out = [];
	if (!Array.isArray(uuids) || uuids.length === 0) return out;
	for (const u of uuids) {
		const g = getGroupByUUID(String(u || ''));
		if (g) out.push(g);
	}
	return out;
}

/**
 * @param {{start: number, end: number, fps: number, axis: 'x'|'y'|'z', overwrite: boolean, anchor_enabled?: boolean, anchor_time?: number}} opts
 */
export async function bakeToKeyframes(opts) {
	const animation = getSelectedAnimation();
	if (!animation) {
		showMessage('BBPhysic', '请先在动画面板选择一个动画，再执行 Bake。');
		return;
	}
	const targetRoot = state.config.target_root_uuid ? getGroupByUUID(state.config.target_root_uuid) : null;
	if (!targetRoot) {
		showMessage('BBPhysic', '未找到被解算根组件（请先完成第二次解算：选择被解算物理部件）。');
		return;
	}
	let roots = [targetRoot];
	if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
		const captured = getGroupsByUUIDs(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
		if (captured.length) roots = captured;
	}

	const chains = roots
		.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth))
		.filter((c) => Array.isArray(c) && c.length);
	if (!chains.length) {
		showMessage('BBPhysic', '未能从所选根骨骼构建出骨骼链。');
		return;
	}

	const flat = flattenChainsWithParentAnchors(chains);
	const bones = flat.bones;
	const chainStarts = flat.chainStarts;
	const chainLengths = flat.chainLengths;

	const fps = Math.round(clampNumber(opts.fps, 1, 120, state.config.bake_fps));
	const dt = 1 / fps;
	const animEnd = Math.max(0, Number(animation.length) || 0);
	const start = clampNumber(opts.start, 0, animEnd, 0);
	const end = clampNumber(opts.end, 0, animEnd, animEnd);
	if (!(end > start)) {
		showMessage('BBPhysic', '时间区间无效：end 必须大于 start。');
		return;
	}
	const anchorEnabled = Boolean(opts.anchor_enabled);
	const anchorTimeClamped = clampNumber(opts.anchor_time ?? start, start, end, start);

	const axisIndex = opts.axis === 'x' ? 0 : opts.axis === 'y' ? 1 : 2;
	const logFrames = Math.max(0, Math.min(60, Math.round(Number(state.config.debug_log_frames) || 0)));
	const shouldLog = (frameIndex) => state.config.debug_logging && frameIndex < logFrames;
	const nearZero = (x) => Math.abs(Number(x) || 0) < 1e-6;
	const allNearZero = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v) => nearZero(v));

	if (typeof THREE === 'undefined' || !THREE) {
		showMessage('BBPhysic', 'Bake 需要 THREE（Blockbench 场景未就绪）。');
		return;
	}

	function readWorldPose(group, outPos3, outQuat4) {
		try {
			if (group?.__bbp_anchor && group.__bbp_anchor_source) {
				const isFixed = Boolean(group.__bbp_anchor_fixed);
				if (isFixed) {
					const cachedP = group.__bbp_anchor_cached_pos;
					const cachedQ = group.__bbp_anchor_cached_quat;
					if (
						Array.isArray(cachedP) && cachedP.length === 3 &&
						Array.isArray(cachedQ) && cachedQ.length === 4
					) {
						outPos3[0] = cachedP[0]; outPos3[1] = cachedP[1]; outPos3[2] = cachedP[2];
						outQuat4[0] = cachedQ[0]; outQuat4[1] = cachedQ[1]; outQuat4[2] = cachedQ[2]; outQuat4[3] = cachedQ[3];
						return true;
					}
				}

				const src = group.__bbp_anchor_source;
				if (src && src !== group) {
					const p = [0, 0, 0];
					const q = [0, 0, 0, 1];
					if (readWorldPose(src, p, q)) {
						if (isFixed) {
							group.__bbp_anchor_cached_pos = [p[0], p[1], p[2]];
							group.__bbp_anchor_cached_quat = [q[0], q[1], q[2], q[3]];
						}
						outPos3[0] = p[0]; outPos3[1] = p[1]; outPos3[2] = p[2];
						outQuat4[0] = q[0]; outQuat4[1] = q[1]; outQuat4[2] = q[2]; outQuat4[3] = q[3];
						return true;
					}
				}
			}

			const mesh = group?.mesh;
			if (mesh && typeof mesh.getWorldPosition === 'function' && typeof mesh.getWorldQuaternion === 'function') {
				const v3 = state.tmpThreeVec3 || (state.tmpThreeVec3 = new THREE.Vector3());
				const q4 = state.tmpThreeQuat || (state.tmpThreeQuat = new THREE.Quaternion());
				mesh.getWorldPosition(v3);
				mesh.getWorldQuaternion(q4);
				outPos3[0] = v3.x; outPos3[1] = v3.y; outPos3[2] = v3.z;
				outQuat4[0] = q4.x; outQuat4[1] = q4.y; outQuat4[2] = q4.z; outQuat4[3] = q4.w;
				return true;
			}
		} catch (e) {
			// ignore
		}
		return false;
	}

	const parentIndex = flat.parentIndex;
	const isRoot = flat.isRoot;

	/** @type {number[]} */
	const times = [];
	/** @type {Array<Array<[number, number, number]>>} */
	const targetRotations = [];
	/** @type {Array<Float32Array>} */
	const targetWorldPosPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
	/** @type {Array<Float32Array>} */
	const targetWorldQuatPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
	/** @type {Array<Float32Array>} */
	const movingBoxesPackedPerFrame = new Array(Math.ceil((end - start) * fps) + 2);
	const prevTime = (typeof Timeline !== 'undefined' && Timeline) ? Timeline.time : 0;

	const movingRoot = state.config.moving_root_uuid ? getGroupByUUID(state.config.moving_root_uuid) : null;
	const movingBoxDefs = (state.config.collision_enabled && movingRoot)
		? buildBoxDefsFromRoot(movingRoot)
		: [];
	if (state.config.collision_enabled && (!movingRoot || movingBoxDefs.length === 0)) {
		debugWarn('已启用碰撞，但未生成运动物件 OBB 盒（请先完成第一次解算：选择运动物件）。本次 Bake 将不会执行碰撞。');
	}

	try {
		notify(`BBPhysic: 采样中（${fps} fps，${start.toFixed(3)}s→${end.toFixed(3)}s）...`, 2500);
		let frameIndex = 0;
		for (let t = start; t <= end + 1e-6; t += dt, frameIndex++) {
			const tt = Math.min(end, t);
			times.push(tt);
			if (typeof Timeline !== 'undefined' && Timeline && typeof Timeline.setTime === 'function') {
				Timeline.setTime(tt, true);
			}
			if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
				Animator.preview(true);
			}
			const frameRot = bones.map((g) => readGroupRotationDeg(g));
			targetRotations.push(frameRot);

			// record root world poses for this sampled time
			{
				const pos = new Float32Array(3 * bones.length);
				const quat = new Float32Array(4 * bones.length);
				for (let b = 0; b < bones.length; b++) {
					if (!isRoot[b]) continue;
					const p = [0, 0, 0];
					const q = [0, 0, 0, 1];
					readWorldPose(bones[b], p, q);
					pos[b * 3 + 0] = p[0]; pos[b * 3 + 1] = p[1]; pos[b * 3 + 2] = p[2];
					quat[b * 4 + 0] = q[0]; quat[b * 4 + 1] = q[1]; quat[b * 4 + 2] = q[2]; quat[b * 4 + 3] = q[3];
				}
				targetWorldPosPerFrame[frameIndex] = pos;
				targetWorldQuatPerFrame[frameIndex] = quat;
			}
			if (shouldLog(frameIndex)) {
				const b0 = bones[0];
				let meshRotDeg = null;
				try {
					const mr = b0?.mesh?.rotation;
					if (mr) meshRotDeg = [radToDeg(mr.x || 0), radToDeg(mr.y || 0), radToDeg(mr.z || 0)];
				} catch (e) {
					// ignore
				}
				debugLog('sample', {
					frame: frameIndex,
					t: Number(tt.toFixed(6)),
					axis: opts.axis,
					bone0: b0?.name || b0?.uuid || 'bone0',
					bone0_group_rot_deg: frameRot[0],
					bone0_mesh_rot_deg: meshRotDeg,
					bone0_axis_deg: frameRot[0]?.[axisIndex],
				});
			}
			if (state.config.collision_enabled && movingBoxDefs.length) {
				const w = computeBoxesWorldNow(movingBoxDefs);
				movingBoxesPackedPerFrame[frameIndex] = packBoxesWorldToF32(w);
			} else {
				movingBoxesPackedPerFrame[frameIndex] = new Float32Array(0);
			}

			if (times.length % 30 === 0) await sleep0();
		}
	} finally {
		try {
			if (typeof Timeline !== 'undefined' && Timeline && typeof Timeline.setTime === 'function') {
				Timeline.setTime(prevTime, true);
			}
			if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
				Animator.preview(true);
			}
		} catch (e) {
			// ignore
		}
	}

	if (state.config.debug_logging) {
		try {
			const firstAxis = targetRotations?.[0]?.map((r) => r[axisIndex]);
			if (Array.isArray(firstAxis) && allNearZero(firstAxis)) {
				debugWarn('采样得到的 axis 角全为 0（或接近 0）。这通常表示预览姿态没有刷新、骨骼没有旋转通道、或读取姿态来源不对。', {
					axis: opts.axis,
					boneCount: bones.length,
					collision_enabled: state.config.collision_enabled,
				});
			}
		} catch (e) {
			// ignore
		}
	}

	let anchorIndex = 0;
	if (anchorEnabled) {
		let bestI = 0;
		let bestAbs = Infinity;
		for (let i = 0; i < times.length; i++) {
			const d = Math.abs((times[i] || 0) - anchorTimeClamped);
			if (d < bestAbs) {
				bestAbs = d;
				bestI = i;
			}
		}
		anchorIndex = bestI;
	}

	// ---------------------------
	// Rapier/WASM solve (no JS solver fallback)
	// ---------------------------

	const clothLinkCount = (Boolean(state.config.cloth_enabled) && chains.length >= 2) ? chains.length : 0;
	const rapier = new RapierWasmSolver(bones.length, movingBoxDefs.length, clothLinkCount);
	try {
		await rapier.init();
	} catch (e) {
		showMessage('BBPhysic', String(e?.message || e || 'WASM 初始化失败'));
		return;
	}
	let v = rapier.views;
	for (let i = 0; i < bones.length; i++) {
		v.parent[i] = parentIndex[i] | 0;
		v.root[i] = isRoot[i] ? 1 : 0;
		v.radius[i] = Math.max(0, Number(computeGroupApproxRadius(bones[i])) || 0);
		v.linvel[i * 3 + 0] = 0;
		v.linvel[i * 3 + 1] = 0;
		v.linvel[i * 3 + 2] = 0;
		v.angvel[i * 3 + 0] = 0;
		v.angvel[i * 3 + 1] = 0;
		v.angvel[i * 3 + 2] = 0;
	}

	// Initialize sim pose at anchor time from current scene world transforms.
	try {
		const tAnchor = times[anchorIndex] ?? times[0];
		if (typeof Timeline !== 'undefined' && Timeline && typeof Timeline.setTime === 'function') {
			Timeline.setTime(tAnchor, true);
		}
		if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
			Animator.preview(true);
		}
		for (let b = 0; b < bones.length; b++) {
			const p = [0, 0, 0];
			const q = [0, 0, 0, 1];
			readWorldPose(bones[b], p, q);
			v.worldPos[b * 3 + 0] = p[0]; v.worldPos[b * 3 + 1] = p[1]; v.worldPos[b * 3 + 2] = p[2];
			v.worldQuat[b * 4 + 0] = q[0]; v.worldQuat[b * 4 + 1] = q[1]; v.worldQuat[b * 4 + 2] = q[2]; v.worldQuat[b * 4 + 3] = q[3];
			v.targetWorldPos[b * 3 + 0] = p[0]; v.targetWorldPos[b * 3 + 1] = p[1]; v.targetWorldPos[b * 3 + 2] = p[2];
			v.targetWorldQuat[b * 4 + 0] = q[0]; v.targetWorldQuat[b * 4 + 1] = q[1]; v.targetWorldQuat[b * 4 + 2] = q[2]; v.targetWorldQuat[b * 4 + 3] = q[3];
		}
	} catch (e) {
		// ignore
	}

	// Initialize clothLinks (tip ring) from anchor pose.
	if (clothLinkCount > 0 && v.clothLinks && v.clothLinks.length >= 3 * clothLinkCount) {
		for (let ci = 0; ci < chains.length; ci++) {
			const aIdx = chainStarts[ci] + chainLengths[ci] - 1;
			const ni = (ci + 1) % chains.length;
			const bIdx = chainStarts[ni] + chainLengths[ni] - 1;
			const ax = v.worldPos[aIdx * 3 + 0];
			const ay = v.worldPos[aIdx * 3 + 1];
			const az = v.worldPos[aIdx * 3 + 2];
			const bx = v.worldPos[bIdx * 3 + 0];
			const by = v.worldPos[bIdx * 3 + 1];
			const bz = v.worldPos[bIdx * 3 + 2];
			const dx = ax - bx;
			const dy = ay - by;
			const dz = az - bz;
			const rest = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz));
			v.clothLinks[ci * 3 + 0] = aIdx;
			v.clothLinks[ci * 3 + 1] = bIdx;
			v.clothLinks[ci * 3 + 2] = rest;
		}
	}

	/** @type {Array<Array<[number,number,number]>>} */
	const solvedRotationsPerFrame = new Array(times.length);

	async function runPass(indices) {
		const qParent = new THREE.Quaternion();
		const qChild = new THREE.Quaternion();
		const qLocal = new THREE.Quaternion();
		const euler = new THREE.Euler(0, 0, 0, 'XYZ');
		for (let k = 0; k < indices.length; k++) {
			const i = indices[k];
			// WASM memory may grow during earlier steps; refresh typed-array views before writing inputs.
			rapier.ensureViews();
			v = rapier.views;
			const baseRotFrame = targetRotations[i];
			for (let b = 0; b < bones.length; b++) {
				v.targetLocal[b * 3 + 0] = degToRad(baseRotFrame[b][0]);
				v.targetLocal[b * 3 + 1] = degToRad(baseRotFrame[b][1]);
				v.targetLocal[b * 3 + 2] = degToRad(baseRotFrame[b][2]);
			}
			// roots: target world
			const pos = targetWorldPosPerFrame[i];
			const quat = targetWorldQuatPerFrame[i];
			if (pos && quat) {
				for (let b = 0; b < bones.length; b++) {
					if (!isRoot[b]) continue;
					v.targetWorldPos[b * 3 + 0] = pos[b * 3 + 0];
					v.targetWorldPos[b * 3 + 1] = pos[b * 3 + 1];
					v.targetWorldPos[b * 3 + 2] = pos[b * 3 + 2];
					v.targetWorldQuat[b * 4 + 0] = quat[b * 4 + 0];
					v.targetWorldQuat[b * 4 + 1] = quat[b * 4 + 1];
					v.targetWorldQuat[b * 4 + 2] = quat[b * 4 + 2];
					v.targetWorldQuat[b * 4 + 3] = quat[b * 4 + 3];
				}
			}

			let boxCount = 0;
			if (state.config.collision_enabled && movingBoxDefs.length) {
				const packed = movingBoxesPackedPerFrame[i] || new Float32Array(0);
				boxCount = Math.min(movingBoxDefs.length, Math.floor(packed.length / 15));
				v.boxes.set(packed.subarray(0, 15 * boxCount));
			}

			rapier.step({
				dt,
				substeps: Math.max(1, Math.min(32, Math.round(Number(state.config.collision_iterations) || 4))),
				gravityY: Number(state.config.gravity_y) || -9.81,
				linDamping: Math.max(0, Number(state.config.lin_damping) || 0),
				angDamping: Math.max(0, Number(state.config.ang_damping) || 0),
				airDrag: Math.max(0, Number(state.config.air_drag) || 0),
				inertiaScale: state.config.inertia_enabled ? Math.max(0, Math.min(5, Number(state.config.inertia_scale) || 1)) : 0,
				motorStiffness: Math.max(0, Number(state.config.follow_strength) || 0),
				motorDamping: Math.max(0, Number(state.config.follow_damping) || 0),
				targetSelfCollision: Boolean(state.config.target_self_collision),
				clothLinkCount,
				boxCount,
			});
			// refresh views in case WASM memory buffer changed
			v = rapier.views;
			v.worldPos.set(v.outWorldPos);
			v.worldQuat.set(v.outWorldQuat);

			/** @type {Array<[number,number,number]>} */
			const outRot = baseRotFrame.map((r) => [r[0], r[1], r[2]]);
			for (let b = 0; b < bones.length; b++) {
				const pIdx = parentIndex[b] | 0;
				if (pIdx < 0) continue; // root kept by animation
				qParent.set(v.worldQuat[pIdx * 4 + 0], v.worldQuat[pIdx * 4 + 1], v.worldQuat[pIdx * 4 + 2], v.worldQuat[pIdx * 4 + 3]);
				qChild.set(v.worldQuat[b * 4 + 0], v.worldQuat[b * 4 + 1], v.worldQuat[b * 4 + 2], v.worldQuat[b * 4 + 3]);
				qLocal.copy(qParent).invert().multiply(qChild);
				euler.setFromQuaternion(qLocal, 'XYZ');
				outRot[b] = [radToDeg(euler.x), radToDeg(euler.y), radToDeg(euler.z)];
			}
			solvedRotationsPerFrame[i] = outRot;
			if (i % 30 === 0) await sleep0();
		}
	}

	if (anchorEnabled) {
		const forward = [];
		for (let i = anchorIndex; i < times.length; i++) forward.push(i);
		await runPass(forward);
		// reset to anchor pose and run reverse indices
		try {
			for (let b = 0; b < bones.length; b++) {
				v.linvel[b * 3 + 0] = 0; v.linvel[b * 3 + 1] = 0; v.linvel[b * 3 + 2] = 0;
				v.angvel[b * 3 + 0] = 0; v.angvel[b * 3 + 1] = 0; v.angvel[b * 3 + 2] = 0;
			}
			const tAnchor = times[anchorIndex] ?? times[0];
			if (typeof Timeline !== 'undefined' && Timeline && typeof Timeline.setTime === 'function') {
				Timeline.setTime(tAnchor, true);
			}
			if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
				Animator.preview(true);
			}
			for (let b = 0; b < bones.length; b++) {
				const p = [0, 0, 0];
				const q = [0, 0, 0, 1];
				readWorldPose(bones[b], p, q);
				v.worldPos[b * 3 + 0] = p[0]; v.worldPos[b * 3 + 1] = p[1]; v.worldPos[b * 3 + 2] = p[2];
				v.worldQuat[b * 4 + 0] = q[0]; v.worldQuat[b * 4 + 1] = q[1]; v.worldQuat[b * 4 + 2] = q[2]; v.worldQuat[b * 4 + 3] = q[3];
			}
		} catch (e) {
			// ignore
		}
		const backward = [];
		for (let i = anchorIndex - 1; i >= 0; i--) backward.push(i);
		await runPass(backward);
	} else {
		const forward = [];
		for (let i = 0; i < times.length; i++) forward.push(i);
		await runPass(forward);
	}

	/** @type {any[]} */
	const createdKeyframes = [];
	Undo.initEdit({ animations: [animation] });
	try {
		notify('BBPhysic: 写入关键帧...', 2000);
		for (let i = 0; i < times.length; i++) {
			const outRot = solvedRotationsPerFrame[i] || targetRotations[i];
			for (let b = 0; b < bones.length; b++) {
				if (bones[b]?.__bbp_anchor) continue;
				const boneAnimator = animation.getBoneAnimator(bones[b]);
				const kf = addRotationKeyframe(boneAnimator, times[i], outRot[b]);
				if (opts.overwrite && kf && typeof kf.replaceOthers === 'function') {
					try {
						kf.replaceOthers(null);
					} catch (e) {
						// ignore
					}
				}
				if (kf) createdKeyframes.push(kf);
			}

			if (i % 30 === 0) {
				notify(`BBPhysic: ${Math.round((i / Math.max(1, times.length - 1)) * 100)}%`, 500);
				await sleep0();
			}
		}

		Undo.finishEdit('BBPhysic: Bake to keyframes', { animations: [animation], keyframes: createdKeyframes });
		notify(`BBPhysic: Bake 完成（${createdKeyframes.length} keyframes）`, 3000);
	} catch (e) {
		Undo.cancelEdit();
		console.error('[BBPhysic] Bake failed', e);
		showMessage('BBPhysic', `Bake 失败：${e?.message || e}`);
	}
}

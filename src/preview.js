import { state } from './state.js';
import { notify, showMessage } from './util.js';
import { getSelectedAnimation, getSolveRootGroups, readGroupRotationDeg, writeGroupRotationDeg, isOutlinerGroup } from './blockbench_api.js';
import { buildChainsFromRoot } from './chains.js';
import { buildBoxDefsFromRoot, computeBoxesWorldNow, packBoxesWorldToF32, computeGroupApproxRadius } from './capsules.js';
import { RapierWasmSolver } from './rapier_wasm_solver.js';
import { degToRad, radToDeg } from './math.js';
import { enableSimBoneMarkers, disableSimBoneMarkers, updateSimBoneMarkers } from './sim_bone_visual.js';
import { flattenChainsWithParentAnchors } from './chain_flatten.js';

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

export function stopPreview() {
	if (state.previewTimer) {
		clearInterval(state.previewTimer);
		state.previewTimer = null;
	}
	state.previewState = null;
	try {
		disableSimBoneMarkers();
	} catch (e) {
		// ignore
	}
	try {
		if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
			Animator.preview(true);
		}
	} catch (e) {
		// ignore
	}
	notify('BBPhysic: 预览已停止', 1500);
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
			if (!state.tmpThreeVec3) state.tmpThreeVec3 = new THREE.Vector3();
			if (!state.tmpThreeQuat) state.tmpThreeQuat = new THREE.Quaternion();
			mesh.getWorldPosition(state.tmpThreeVec3);
			mesh.getWorldQuaternion(state.tmpThreeQuat);
			outPos3[0] = state.tmpThreeVec3.x;
			outPos3[1] = state.tmpThreeVec3.y;
			outPos3[2] = state.tmpThreeVec3.z;
			outQuat4[0] = state.tmpThreeQuat.x;
			outQuat4[1] = state.tmpThreeQuat.y;
			outQuat4[2] = state.tmpThreeQuat.z;
			outQuat4[3] = state.tmpThreeQuat.w;
			return true;
		}
	} catch (e) {
		// ignore
	}
	return false;
}

function orthonormalizeAxes(ax, ay) {
	// ax, ay are arrays length 3, assumed roughly normalized.
	const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
	const sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
	const muls = (a,s)=>[a[0]*s,a[1]*s,a[2]*s];
	const norm = (a)=>{const l=Math.hypot(a[0],a[1],a[2]);return l>1e-9?[a[0]/l,a[1]/l,a[2]/l]:[1,0,0];};
	const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
	const ax1 = norm(ax);
	let ayp = sub(ay, muls(ax1, dot(ay, ax1)));
	if (Math.hypot(ayp[0], ayp[1], ayp[2]) < 1e-9) {
		// pick a fallback perpendicular
		ayp = Math.abs(ax1[0]) < 0.9 ? [1,0,0] : [0,1,0];
		ayp = sub(ayp, muls(ax1, dot(ayp, ax1)));
	}
	const ay1 = norm(ayp);
	const az1 = norm(cross(ax1, ay1));
	return [ax1, ay1, az1];
}

function sanitizeBoxesWorld(boxes, debug) {
	const finite = (x) => Number.isFinite(x) && Math.abs(x) <= 1e6;
	const out = [];
	let anomalies = 0;
	for (const b of boxes) {
		if (!b) continue;
		const c = b.center || [0,0,0];
		let ax = (b.axes && b.axes[0]) || [1,0,0];
		let ay = (b.axes && b.axes[1]) || [0,1,0];
		let az = (b.axes && b.axes[2]) || [0,0,1];
		const h = b.half || [0.5,0.5,0.5];
		if (!finite(c[0]) || !finite(c[1]) || !finite(c[2])) { anomalies++; continue; }
		if (!finite(h[0]) || !finite(h[1]) || !finite(h[2])) { anomalies++; continue; }
		// Orthonormalize axes and clamp half extents
		const [ax1, ay1, az1] = orthonormalizeAxes([+ax[0]||0,+ax[1]||0,+ax[2]||0], [+ay[0]||0,+ay[1]||0,+ay[2]||0]);
		ax = ax1; ay = ay1; az = az1;
		const hh = [Math.max(0.02, +h[0]||0), Math.max(0.02, +h[1]||0), Math.max(0.02, +h[2]||0)];
		out.push({ center: [c[0],c[1],c[2]], axes: [ax, ay, az], half: hh });
	}
	if (debug && anomalies) {
		console.warn('[BBPhysic] sanitizeBoxesWorld filtered anomalies:', anomalies, 'kept:', out.length);
	}
	return out;
}

export async function startPreview() {
	if (state.previewTimer) return;
	if (typeof THREE === 'undefined' || !THREE) {
		showMessage('BBPhysic', '预览需要 THREE（Blockbench 场景未就绪）。');
		return;
	}

	const animation = getSelectedAnimation();
	if (!animation) {
		showMessage('BBPhysic', '请先在动画面板选择一个动画，再启动预览。');
		return;
	}
	let roots = getSolveRootGroups();
	// 刚启动 Blockbench 时，用户经常还停留在“第一次解算”的运动物件选择上。
	// 预览默认是“解算选中的根骨骼”，这会导致把运动物件当作被解算对象，
	// 从而出现“运动物件在动、被解算物体不动”的错觉。
	// 处理：当已设置 target_root_uuid，且当前选中 roots 只包含 moving_root_uuid（而不包含 target），
	// 则优先使用 target_root_uuid（或 cloth_roots_uuids）。
	if (state.config.solve_scope === 'selected' && roots.length && state.config.target_root_uuid) {
		const target = getGroupByUUID(state.config.target_root_uuid);
		const targetUuid = String(state.config.target_root_uuid || '');
		const movingUuid = String(state.config.moving_root_uuid || '');
		const hasTargetInSelection = roots.some((g) => String(g?.uuid || '') === targetUuid);
		const hasMovingInSelection = movingUuid ? roots.some((g) => String(g?.uuid || '') === movingUuid) : false;
		if (target && !hasTargetInSelection && hasMovingInSelection) {
			// Prefer configured cloth roots if present
			if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
				const captured = getGroupsByUUIDs(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
				if (captured.length) roots = captured;
				else roots = [target];
			} else {
				roots = [target];
			}
		}
	}
	// Prefer configured roots when nothing is selected.
	if (!roots.length) {
		if (Boolean(state.config.cloth_enabled) && Array.isArray(state.config.cloth_roots_uuids) && state.config.cloth_roots_uuids.length) {
			const captured = getGroupsByUUIDs(state.config.cloth_roots_uuids).filter(isOutlinerGroup);
			if (captured.length) roots = captured;
		}
		if (!roots.length && state.config.target_root_uuid) {
			const tr = getGroupByUUID(state.config.target_root_uuid);
			if (tr && isOutlinerGroup(tr)) roots = [tr];
		}
	}
	if (!roots.length) {
		showMessage(
			'BBPhysic',
			state.config.solve_scope === 'all_roots'
				? '未找到任何根骨骼（Group）。'
				: '请先在设置里指定被解算根骨骼（或在 Outliner 里选中根骨骼 Group）。'
		);
		return;
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
	const parentIndex = flat.parentIndex;
	const isRoot = flat.isRoot;

	const fps = Math.round(Math.max(1, Math.min(120, Number(state.config.preview_fps) || 30)));
	const dtNominal = 1 / fps;

	// Show simulated-bone markers whenever Preview is running.
	try {
		enableSimBoneMarkers();
		updateSimBoneMarkers(bones, true);
	} catch (e) {
		// ignore
	}

	// Build external OBB colliders from the moving root (if enabled).
	let movingBoxDefs = [];
	try {
		const movingRoot = state.config.moving_root_uuid ? getGroupByUUID(state.config.moving_root_uuid) : null;
		if (state.config.collision_enabled && movingRoot) {
			movingBoxDefs = buildBoxDefsFromRoot(movingRoot);
		}
	} catch (e) {
		movingBoxDefs = [];
	}

	// Cloth-like coupling: tip ring links (pure Rapier joints in Rust).
	let clothLinkCount = 0;
	if (Boolean(state.config.cloth_enabled) && chains.length >= 2) {
		clothLinkCount = chains.length;
	}
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
		const p = [0, 0, 0];
		const q = [0, 0, 0, 1];
		readWorldPose(bones[i], p, q);
		v.worldPos[i * 3 + 0] = p[0];
		v.worldPos[i * 3 + 1] = p[1];
		v.worldPos[i * 3 + 2] = p[2];
		v.worldQuat[i * 4 + 0] = q[0];
		v.worldQuat[i * 4 + 1] = q[1];
		v.worldQuat[i * 4 + 2] = q[2];
		v.worldQuat[i * 4 + 3] = q[3];
		v.targetWorldPos[i * 3 + 0] = p[0];
		v.targetWorldPos[i * 3 + 1] = p[1];
		v.targetWorldPos[i * 3 + 2] = p[2];
		v.targetWorldQuat[i * 4 + 0] = q[0];
		v.targetWorldQuat[i * 4 + 1] = q[1];
		v.targetWorldQuat[i * 4 + 2] = q[2];
		v.targetWorldQuat[i * 4 + 3] = q[3];
		v.targetLocal[i * 3 + 0] = 0;
		v.targetLocal[i * 3 + 1] = 0;
		v.targetLocal[i * 3 + 2] = 0;
	}

	// Initialize clothLinks (tip ring) from current pose.
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

	state.previewState = {
		animation,
		chains,
		bones,
		chainStarts,
		chainLengths,
		parentIndex,
		isRoot,
		lastTime: (typeof Timeline !== 'undefined' && Timeline) ? Timeline.time : 0,
		lastWallMs: (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now(),
		dtNominal,
		rapier,
		movingBoxDefs,
		clothLinkCount,
	};

	state.previewTimer = setInterval(() => {
		try {
			if (!state.previewState) return;
						try {
							updateSimBoneMarkers(state.previewState.bones, false);
						} catch (e) {
							// ignore
						}
			// WASM memory may grow during previous step; refresh typed-array views first.
			if (state.previewState.rapier && typeof state.previewState.rapier.ensureViews === 'function') {
				state.previewState.rapier.ensureViews();
			}
			const animNow = getSelectedAnimation();
			if (!animNow || animNow !== state.previewState.animation) {
				stopPreview();
				return;
			}

			const wallNowMs = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();
			let dtWall = (wallNowMs - (Number(state.previewState.lastWallMs) || wallNowMs)) / 1000;
			state.previewState.lastWallMs = wallNowMs;
			if (!Number.isFinite(dtWall) || dtWall <= 0) dtWall = state.previewState.dtNominal;
			dtWall = Math.max(1 / 240, Math.min(1 / 15, dtWall));

			const tNow = (typeof Timeline !== 'undefined' && Timeline) ? Number(Timeline.time) || 0 : 0;
			let dt = dtWall;
			const jump = tNow - (Number(state.previewState.lastTime) || 0);
			if (!Number.isFinite(jump) || Math.abs(jump) > 0.5 || jump < -1e-6) {
				try {
					if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
						Animator.preview(true);
					}
				} catch (e) {
					// ignore
				}
				// Reset simulation state to current pose.
				const v2 = state.previewState.rapier.views;
				for (let i = 0; i < state.previewState.bones.length; i++) {
					const p = [0, 0, 0];
					const q = [0, 0, 0, 1];
					readWorldPose(state.previewState.bones[i], p, q);
					v2.worldPos[i * 3 + 0] = p[0];
					v2.worldPos[i * 3 + 1] = p[1];
					v2.worldPos[i * 3 + 2] = p[2];
					v2.worldQuat[i * 4 + 0] = q[0];
					v2.worldQuat[i * 4 + 1] = q[1];
					v2.worldQuat[i * 4 + 2] = q[2];
					v2.worldQuat[i * 4 + 3] = q[3];
					v2.linvel[i * 3 + 0] = 0;
					v2.linvel[i * 3 + 1] = 0;
					v2.linvel[i * 3 + 2] = 0;
					v2.angvel[i * 3 + 0] = 0;
					v2.angvel[i * 3 + 1] = 0;
					v2.angvel[i * 3 + 2] = 0;
				}
				state.previewState.lastWallMs = wallNowMs;
				dt = state.previewState.dtNominal;
			} else if (jump > 1e-6) {
				// If timeline is playing, still prefer wall-clock dt for stability.
				dt = dtWall;
			}
			state.previewState.lastTime = tNow;

			try {
				if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
					Animator.preview(true);
				}
			} catch (e) {
				// ignore
			}
			const baseRot = state.previewState.bones.map((g) => readGroupRotationDeg(g));
			const v2 = state.previewState.rapier.views;
			// target local euler (radians)
			for (let i = 0; i < baseRot.length; i++) {
				v2.targetLocal[i * 3 + 0] = degToRad(baseRot[i][0]);
				v2.targetLocal[i * 3 + 1] = degToRad(baseRot[i][1]);
				v2.targetLocal[i * 3 + 2] = degToRad(baseRot[i][2]);
			}
			// target world pose for kinematic roots
			for (let i = 0; i < state.previewState.bones.length; i++) {
				if (!state.previewState.isRoot[i]) continue;
				const p = [0, 0, 0];
				const q = [0, 0, 0, 1];
				readWorldPose(state.previewState.bones[i], p, q);
				v2.targetWorldPos[i * 3 + 0] = p[0];
				v2.targetWorldPos[i * 3 + 1] = p[1];
				v2.targetWorldPos[i * 3 + 2] = p[2];
				v2.targetWorldQuat[i * 4 + 0] = q[0];
				v2.targetWorldQuat[i * 4 + 1] = q[1];
				v2.targetWorldQuat[i * 4 + 2] = q[2];
				v2.targetWorldQuat[i * 4 + 3] = q[3];
			}

			// external collision boxes (sanitize to avoid NaN/degenerate OBBs)
			let boxCount = 0;
			if (state.config.collision_enabled && state.previewState.movingBoxDefs?.length) {
				let boxesNow = computeBoxesWorldNow(state.previewState.movingBoxDefs);
				const debug = Boolean(state.config.debug_logging);
				boxesNow = sanitizeBoxesWorld(boxesNow, debug);
				const packed = packBoxesWorldToF32(boxesNow);
				boxCount = Math.min(boxesNow.length, Math.floor(packed.length / 15));
				if (boxCount > 0) v2.boxes.set(packed.subarray(0, 15 * boxCount));
				// Optional debug sample
				if (debug && (state.previewState.debugLogCount|0) < Math.max(1, Math.min(60, Number(state.config.debug_log_frames)||5))) {
					const sample = boxesNow.slice(0, Math.min(3, boxesNow.length));
					console.log('[BBPhysic] frame OBBs', { boxCount, sample });
				}
			}

			// Step Rapier
			const stepParams = {
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
				clothLinkCount: state.previewState.clothLinkCount || 0,
				boxCount,
			};
			if (state.config.debug_logging && (state.previewState.debugLogCount|0) < Math.max(1, Math.min(60, Number(state.config.debug_log_frames)||5))) {
				console.log('[BBPhysic] step params', stepParams);
				state.previewState.debugLogCount = (state.previewState.debugLogCount|0) + 1;
			}
			state.previewState.rapier.step(stepParams);

			// advance sim state (refresh views in case WASM memory buffer changed)
			const v3 = state.previewState.rapier.views;
			v3.worldPos.set(v3.outWorldPos);
			v3.worldQuat.set(v3.outWorldQuat);

			// write local eulers back
			const qParent = new THREE.Quaternion();
			const qChild = new THREE.Quaternion();
			const qLocal = new THREE.Quaternion();
			const euler = new THREE.Euler(0, 0, 0, 'XYZ');
			for (let i = 0; i < state.previewState.bones.length; i++) {
				const pIdx = state.previewState.parentIndex[i] | 0;
				if (pIdx < 0) {
					// keep root driven by animation
					continue;
				}
				qParent.set(
					v3.worldQuat[pIdx * 4 + 0],
					v3.worldQuat[pIdx * 4 + 1],
					v3.worldQuat[pIdx * 4 + 2],
					v3.worldQuat[pIdx * 4 + 3]
				);
				qChild.set(
					v3.worldQuat[i * 4 + 0],
					v3.worldQuat[i * 4 + 1],
					v3.worldQuat[i * 4 + 2],
					v3.worldQuat[i * 4 + 3]
				);
				qLocal.copy(qParent).invert().multiply(qChild);
				euler.setFromQuaternion(qLocal, 'XYZ');
				writeGroupRotationDeg(state.previewState.bones[i], [radToDeg(euler.x), radToDeg(euler.y), radToDeg(euler.z)]);
			}
		} catch (e) {
			console.error('[BBPhysic] Preview tick failed', e);
			stopPreview();
		}
	}, Math.round(1000 / fps));

	state.previewState.debugLogCount = 0;
	notify(`BBPhysic: 预览已启动（${fps} fps，Rapier/WASM）`, 2000);
}

export function togglePreview() {
	if (state.previewTimer) stopPreview();
	else startPreview().catch((e) => {
		showMessage('BBPhysic', String(e?.message || e || '预览启动失败'));
	});
}

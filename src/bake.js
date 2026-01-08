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
	applyMovingCapsulesCollisionToChainAxis,
} from './chains_and_collision.js';
import { makeChainFollowerSolver } from './solver.js';
import { radToDeg } from './math.js';
import { buildCapsuleDefsFromRoot, computeCapsulesWorldNow, computeGroupApproxRadius } from './capsules.js';

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

/**
 * @param {{start: number, end: number, fps: number, axis: 'x'|'y'|'z', overwrite: boolean}} opts
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
	const roots = [targetRoot];

	const chains = roots
		.flatMap((r) => buildChainsFromRoot(r, state.config.max_chain_depth))
		.filter((c) => Array.isArray(c) && c.length);
	if (!chains.length) {
		showMessage('BBPhysic', '未能从所选根骨骼构建出骨骼链。');
		return;
	}

	/** @type {any[]} */
	const bones = [];
	/** @type {number[]} */
	const chainStarts = [];
	/** @type {number[]} */
	const chainLengths = [];
	for (let ci = 0; ci < chains.length; ci++) {
		chainStarts.push(bones.length);
		chainLengths.push(chains[ci].length);
		chains[ci].forEach((g) => bones.push(g));
	}

	const fps = Math.round(clampNumber(opts.fps, 1, 120, state.config.bake_fps));
	const dt = 1 / fps;
	const animEnd = Math.max(0, Number(animation.length) || 0);
	const start = clampNumber(opts.start, 0, animEnd, 0);
	const end = clampNumber(opts.end, 0, animEnd, animEnd);
	if (!(end > start)) {
		showMessage('BBPhysic', '时间区间无效：end 必须大于 start。');
		return;
	}

	const axisIndex = opts.axis === 'x' ? 0 : opts.axis === 'y' ? 1 : 2;
	const solveXYZ = Boolean(state.config.solve_xyz);
	const logFrames = Math.max(0, Math.min(60, Math.round(Number(state.config.debug_log_frames) || 0)));
	const shouldLog = (frameIndex) => state.config.debug_logging && frameIndex < logFrames;
	const nearZero = (x) => Math.abs(Number(x) || 0) < 1e-6;
	const allNearZero = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v) => nearZero(v));

	/** @type {number[]} */
	const times = [];
	/** @type {Array<Array<[number, number, number]>>} */
	const targetRotations = [];
	/** @type {number[][]} */
	const targetAxis = solveXYZ ? [] : [];
	/** @type {Array<Array<{a:[number,number,number], b:[number,number,number], radius:number}>>} */
	const movingCapsulesWorldPerFrame = [];
	const prevTime = (typeof Timeline !== 'undefined' && Timeline) ? Timeline.time : 0;

	const movingRoot = state.config.moving_root_uuid ? getGroupByUUID(state.config.moving_root_uuid) : null;
	const movingCapsuleDefs = movingRoot ? buildCapsuleDefsFromRoot(movingRoot) : [];
	if (state.config.collision_enabled && (!movingRoot || movingCapsuleDefs.length === 0)) {
		debugWarn('已启用碰撞，但未生成运动物件胶囊（请先完成第一次解算：选择运动物件）。本次 Bake 将不会执行碰撞约束。');
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
			if (!solveXYZ) targetAxis.push(frameRot.map((r) => r[axisIndex]));
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
			if (state.config.collision_enabled && movingCapsuleDefs.length) {
				movingCapsulesWorldPerFrame.push(computeCapsulesWorldNow(movingCapsuleDefs));
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
			const firstAxis = solveXYZ ? targetRotations?.[0]?.map((r) => r[axisIndex]) : targetAxis[0];
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

	/** @type {number[]} */
	const restDeltaAxis = new Array(bones.length).fill(0);
	/** @type {[number[], number[], number[]]|null} */
	const restDeltaXYZ = solveXYZ ? [new Array(bones.length).fill(0), new Array(bones.length).fill(0), new Array(bones.length).fill(0)] : null;
	const firstFrameRot = targetRotations[0];
	const firstAxis = solveXYZ ? firstFrameRot.map((r) => r[axisIndex]) : targetAxis[0];
	for (let c = 0; c < chainStarts.length; c++) {
		const startIndex = chainStarts[c];
		const len = chainLengths[c];
		for (let local = 1; local < len; local++) {
			const i = startIndex + local;
			restDeltaAxis[i] = firstAxis[i] - firstAxis[i - 1];
			if (restDeltaXYZ) {
				restDeltaXYZ[0][i] = firstFrameRot[i][0] - firstFrameRot[i - 1][0];
				restDeltaXYZ[1][i] = firstFrameRot[i][1] - firstFrameRot[i - 1][1];
				restDeltaXYZ[2][i] = firstFrameRot[i][2] - firstFrameRot[i - 1][2];
			}
		}
	}

	const solver = makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex);
	solver.init(firstAxis);
	const solversXYZ = solveXYZ && restDeltaXYZ
		? [
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[0], 0),
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[1], 1),
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[2], 2),
		]
		: null;
	if (solversXYZ) {
		solversXYZ[0].init(firstFrameRot.map((r) => r[0]));
		solversXYZ[1].init(firstFrameRot.map((r) => r[1]));
		solversXYZ[2].init(firstFrameRot.map((r) => r[2]));
	}

	const collisionMemoryPerChain = chains.map(() => ({ lastNormalWorld: null }));
	const collisionMemoryPerChainXYZ = solversXYZ
		? [chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null }))]
		: null;
	const tipRadiusPerChain = chains.map((chainGroups) => {
		try {
			const tip = chainGroups?.[chainGroups.length - 1];
			return computeGroupApproxRadius(tip);
		} catch (e) {
			return 0;
		}
	});

	/** @type {any[]} */
	const createdKeyframes = [];
	Undo.initEdit({ animations: [animation] });
	try {
		notify('BBPhysic: 写入关键帧...', 2000);
		for (let i = 0; i < times.length; i++) {
			const baseRotFrame = targetRotations[i];
			const capsNow = state.config.collision_enabled ? (movingCapsulesWorldPerFrame[i] || []) : [];
			const capsPrev = state.config.collision_enabled ? (movingCapsulesWorldPerFrame[Math.max(0, i - 1)] || capsNow) : capsNow;

			if (solveXYZ && solversXYZ) {
				/** @type {Array<[number,number,number]>} */
				const outRot = baseRotFrame.map((r) => [r[0], r[1], r[2]]);
				for (let ax = 0; ax < 3; ax++) {
					const targetsAx = baseRotFrame.map((r) => r[ax]);
					const solved = solversXYZ[ax].step(targetsAx, dt);
					if (state.config.collision_enabled && capsNow && capsNow.length) {
						for (let c = 0; c < chains.length; c++) {
							const startIndex = chainStarts[c];
							const len = chainLengths[c];
							const chainGroups = chains[c];
							const baseEuler = outRot.slice(startIndex, startIndex + len);
							const axisAngles = solved.slice(startIndex, startIndex + len);
							const mem = collisionMemoryPerChainXYZ?.[ax]?.[c] || null;
							const tipR = tipRadiusPerChain[c] || 0;
							applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, ax, capsPrev, capsNow, tipR, mem);
							for (let j = 0; j < len; j++) solved[startIndex + j] = axisAngles[j];
						}
					}
					for (let b = 0; b < outRot.length; b++) outRot[b][ax] = solved[b];
				}
				if (shouldLog(i)) {
					debugLog('solve_xyz', {
						frame: i,
						t: Number(times[i].toFixed(6)),
						capsule_count: capsNow?.length || 0,
					});
				}

				for (let b = 0; b < bones.length; b++) {
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
			} else {
				const frameAxis = targetAxis[i];
				const solvedAxis = solver.step(frameAxis, dt);
			if (shouldLog(i)) {
				debugLog('solve_pre_collision', {
					frame: i,
					t: Number(times[i].toFixed(6)),
					target_axis_deg_sample: frameAxis?.slice(0, Math.min(6, bones.length)),
					solved_axis_deg_sample: solvedAxis?.slice(0, Math.min(6, bones.length)),
				});
			}

				if (state.config.collision_enabled && capsNow && capsNow.length) {
					for (let c = 0; c < chains.length; c++) {
						const startIndex = chainStarts[c];
						const len = chainLengths[c];
						const chainGroups = chains[c];
						const baseEuler = targetRotations[i].slice(startIndex, startIndex + len);
						const axisAngles = solvedAxis.slice(startIndex, startIndex + len);
						const mem = collisionMemoryPerChain[c];
						const tipR = tipRadiusPerChain[c] || 0;
						applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, axisIndex, capsPrev, capsNow, tipR, mem);
						for (let j = 0; j < len; j++) solvedAxis[startIndex + j] = axisAngles[j];
					}
					if (shouldLog(i)) {
						debugLog('collision_capsules', {
							frame: i,
							t: Number(times[i].toFixed(6)),
							capsule_count: capsNow.length,
						});
					}
				}

				for (let b = 0; b < bones.length; b++) {
					const boneAnimator = animation.getBoneAnimator(bones[b]);
					const base = targetRotations[i][b];
					const out = [base[0], base[1], base[2]];
					out[axisIndex] = solvedAxis[b];
					const kf = addRotationKeyframe(boneAnimator, times[i], out);
					if (opts.overwrite && kf && typeof kf.replaceOthers === 'function') {
						try {
							kf.replaceOthers(null);
						} catch (e) {
							// ignore
						}
					}
					if (kf) createdKeyframes.push(kf);
				}
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

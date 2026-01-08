import { state } from './state.js';
import { notify, showMessage } from './util.js';
import { getSelectedAnimation, getSolveRootGroups, readGroupRotationDeg, writeGroupRotationDeg, isGroup, isOutlinerGroup } from './blockbench_api.js';
import { buildChainsFromRoot, applyMovingCapsulesCollisionToChainAxis } from './chains_and_collision.js';
import { makeChainFollowerSolver } from './solver.js';
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

export function stopPreview() {
	if (state.previewTimer) {
		clearInterval(state.previewTimer);
		state.previewTimer = null;
	}
	state.previewState = null;
	try {
		if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
			Animator.preview(true);
		}
	} catch (e) {
		// ignore
	}
	notify('BBPhysic: 预览已停止', 1500);
}

export function startPreview() {
	if (state.previewTimer) return;
	const animation = getSelectedAnimation();
	if (!animation) {
		showMessage('BBPhysic', '请先在动画面板选择一个动画，再启动预览。');
		return;
	}
	const roots = getSolveRootGroups();
	if (!roots.length) {
		showMessage(
			'BBPhysic',
			state.config.solve_scope === 'all_roots'
				? '未找到任何根骨骼（Group）。'
				: '请先在 Outliner 里选中裙摆骨骼链的“根骨骼”(Group)。'
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

	const axisRaw = String(state.config.axis ?? 'x').trim().toLowerCase();
	const axis = axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : 'x';
	const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
	const solveXYZ = Boolean(state.config.solve_xyz);
	const fps = Math.max(1, Math.min(60, Math.round(Number(state.config.bake_fps) || 30)));
	const dtNominal = 1 / fps;

	/** @type {number[]} */
	const restDeltaAxis = new Array(bones.length).fill(0);
	/** @type {[number[], number[], number[]]|null} */
	const restDeltaXYZ = solveXYZ ? [new Array(bones.length).fill(0), new Array(bones.length).fill(0), new Array(bones.length).fill(0)] : null;
	try {
		if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
			Animator.preview(true);
		}
	} catch (e) {
		// ignore
	}
	const initialFrameRot = bones.map((g) => readGroupRotationDeg(g));
	const initialAxis = initialFrameRot.map((r) => r[axisIndex]);
	for (let c = 0; c < chainStarts.length; c++) {
		const startIndex = chainStarts[c];
		const len = chainLengths[c];
		for (let local = 1; local < len; local++) {
			const i = startIndex + local;
			restDeltaAxis[i] = initialAxis[i] - initialAxis[i - 1];
			if (restDeltaXYZ) {
				restDeltaXYZ[0][i] = initialFrameRot[i][0] - initialFrameRot[i - 1][0];
				restDeltaXYZ[1][i] = initialFrameRot[i][1] - initialFrameRot[i - 1][1];
				restDeltaXYZ[2][i] = initialFrameRot[i][2] - initialFrameRot[i - 1][2];
			}
		}
	}

	const solver = makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex);
	solver.init(initialAxis);
	const solversXYZ = solveXYZ && restDeltaXYZ
		? [
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[0], 0),
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[1], 1),
			makeChainFollowerSolver(chainStarts, chainLengths, restDeltaXYZ[2], 2),
		]
		: null;
	if (solversXYZ) {
		solversXYZ[0].init(initialFrameRot.map((r) => r[0]));
		solversXYZ[1].init(initialFrameRot.map((r) => r[1]));
		solversXYZ[2].init(initialFrameRot.map((r) => r[2]));
	}

	state.previewState = {
		animation,
		chains,
		bones,
		chainStarts,
		chainLengths,
		axisIndex,
		solveXYZ,
		lastTime: (typeof Timeline !== 'undefined' && Timeline) ? Timeline.time : 0,
		dtNominal,
		solver,
		solversXYZ,
		movingCapsuleDefs: [],
		lastCapsulesWorld: null,
		tipRadiusPerChain: chains.map((cg) => {
			try {
				const tip = cg?.[cg.length - 1];
				return computeGroupApproxRadius(tip);
			} catch (e) {
				return 0;
			}
		}),
		collisionMemoryPerChain: chains.map(() => ({ lastNormalWorld: null })),
		collisionMemoryPerChainXYZ: solversXYZ ? [chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null })), chains.map(() => ({ lastNormalWorld: null }))] : null,
	};

	try {
		const movingRoot = state.config.moving_root_uuid ? getGroupByUUID(state.config.moving_root_uuid) : null;
		if (movingRoot) state.previewState.movingCapsuleDefs = buildCapsuleDefsFromRoot(movingRoot);
	} catch (e) {
		// ignore
	}

	state.previewTimer = setInterval(() => {
		try {
			if (!state.previewState) return;
			const animNow = getSelectedAnimation();
			if (!animNow || animNow !== state.previewState.animation) {
				stopPreview();
				return;
			}

			const tNow = (typeof Timeline !== 'undefined' && Timeline) ? Number(Timeline.time) || 0 : 0;
			let dt = state.previewState.dtNominal;
			const jump = tNow - (Number(state.previewState.lastTime) || 0);
			if (!Number.isFinite(jump) || Math.abs(jump) > 0.5 || jump < -1e-6) {
				try {
					if (typeof Animator !== 'undefined' && Animator && typeof Animator.preview === 'function') {
						Animator.preview(true);
					}
				} catch (e) {
					// ignore
				}
				const frameRotReset = state.previewState.bones.map((g) => readGroupRotationDeg(g));
				const axisReset = frameRotReset.map((r) => r[state.previewState.axisIndex]);
				state.previewState.solver.init(axisReset);
				dt = state.previewState.dtNominal;
			} else if (jump > 1e-6) {
				dt = Math.max(1 / 240, Math.min(1 / 5, jump));
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
			const capsNow = (state.config.collision_enabled && state.previewState.movingCapsuleDefs?.length)
				? computeCapsulesWorldNow(state.previewState.movingCapsuleDefs)
				: [];
			const capsPrev = state.previewState.lastCapsulesWorld || capsNow;

			if (state.previewState.solveXYZ && state.previewState.solversXYZ) {
				/** @type {Array<[number,number,number]>} */
				const outRot = baseRot.map((r) => [r[0], r[1], r[2]]);
				for (let ax = 0; ax < 3; ax++) {
					const targets = baseRot.map((r) => r[ax]);
					const solved = state.previewState.solversXYZ[ax].step(targets, dt);
					if (state.config.collision_enabled && capsNow && capsNow.length) {
						for (let c = 0; c < state.previewState.chains.length; c++) {
							const startIndex = state.previewState.chainStarts[c];
							const len = state.previewState.chainLengths[c];
							const chainGroups = state.previewState.chains[c];
							const baseEuler = outRot.slice(startIndex, startIndex + len);
							const axisAngles = solved.slice(startIndex, startIndex + len);
							const mem = state.previewState.collisionMemoryPerChainXYZ?.[ax]?.[c] || null;
							const tipR = state.previewState.tipRadiusPerChain?.[c] || 0;
							applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, ax, capsPrev, capsNow, tipR, mem);
							for (let j = 0; j < len; j++) solved[startIndex + j] = axisAngles[j];
						}
					}
					for (let b = 0; b < outRot.length; b++) outRot[b][ax] = solved[b];
				}
				for (let b = 0; b < state.previewState.bones.length; b++) {
					writeGroupRotationDeg(state.previewState.bones[b], outRot[b]);
				}
			} else {
				const targets = baseRot.map((r) => r[state.previewState.axisIndex]);
				const solvedAxis = state.previewState.solver.step(targets, dt);
				if (state.config.collision_enabled && capsNow && capsNow.length) {
					for (let c = 0; c < state.previewState.chains.length; c++) {
						const startIndex = state.previewState.chainStarts[c];
						const len = state.previewState.chainLengths[c];
						const chainGroups = state.previewState.chains[c];
						const baseEuler = baseRot.slice(startIndex, startIndex + len);
						const axisAngles = solvedAxis.slice(startIndex, startIndex + len);
						const mem = state.previewState.collisionMemoryPerChain ? state.previewState.collisionMemoryPerChain[c] : null;
						const tipR = state.previewState.tipRadiusPerChain?.[c] || 0;
						applyMovingCapsulesCollisionToChainAxis(chainGroups, baseEuler, axisAngles, state.previewState.axisIndex, capsPrev, capsNow, tipR, mem);
						for (let j = 0; j < len; j++) solvedAxis[startIndex + j] = axisAngles[j];
					}
				}
				for (let b = 0; b < state.previewState.bones.length; b++) {
					const base = baseRot[b];
					const out = [base[0], base[1], base[2]];
					out[state.previewState.axisIndex] = solvedAxis[b];
					writeGroupRotationDeg(state.previewState.bones[b], out);
				}
			}

			if (state.config.collision_enabled && capsNow && capsNow.length) {
				state.previewState.lastCapsulesWorld = capsNow;
			}
		} catch (e) {
			console.error('[BBPhysic] Preview tick failed', e);
			stopPreview();
		}
	}, Math.round(1000 / fps));

	notify(`BBPhysic: 预览已启动（${fps} fps，${solveXYZ ? 'XYZ 三轴' : `轴 ${axis.toUpperCase()}` }）`, 2000);
}

export function togglePreview() {
	if (state.previewTimer) stopPreview();
	else startPreview();
}

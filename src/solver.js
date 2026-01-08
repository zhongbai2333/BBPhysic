import { state } from './state.js';
import { clampNumber, debugWarn } from './util.js';

export function makeChainFollowerSolver(chainStarts, chainLengths, restDeltaAxis, axisIndex) {
	const boneCount = restDeltaAxis.length;
	const value = new Array(boneCount).fill(0);
	const vel = new Array(boneCount).fill(0);
	/** @type {Float32Array|null} */
	let wValue = null;
	/** @type {Float32Array|null} */
	let wVel = null;
	/** @type {Float32Array|null} */
	let wTargets = null;
	/** @type {Float32Array|null} */
	let wRest = null;
	/** @type {Uint32Array|null} */
	let wChainStarts = null;
	/** @type {Uint32Array|null} */
	let wChainLens = null;

	function ensureWasmViews() {
		if (!state.wasm || !state.wasm.ok || !state.wasm.exports || !state.wasm.memory) return false;
		if (wValue && wValue.length === boneCount) return true;
		const f32 = 4;
		const u32 = 4;
		const bytes = boneCount * f32 * 4 + chainStarts.length * u32 * 2;
		if (typeof state.wasm.exports.bbp_alloc !== 'function') return false;
		const basePtr = state.wasm.exports.bbp_alloc(bytes);
		if (!basePtr) return false;
		let p = basePtr;
		const memBuf = state.wasm.memory.buffer;
		wValue = new Float32Array(memBuf, p, boneCount);
		p += boneCount * f32;
		wVel = new Float32Array(memBuf, p, boneCount);
		p += boneCount * f32;
		wTargets = new Float32Array(memBuf, p, boneCount);
		p += boneCount * f32;
		wRest = new Float32Array(memBuf, p, boneCount);
		p += boneCount * f32;
		wChainStarts = new Uint32Array(memBuf, p, chainStarts.length);
		p += chainStarts.length * u32;
		wChainLens = new Uint32Array(memBuf, p, chainLengths.length);
		p += chainLengths.length * u32;
		for (let i = 0; i < boneCount; i++) wRest[i] = Number(restDeltaAxis[i]) || 0;
		for (let i = 0; i < chainStarts.length; i++) wChainStarts[i] = chainStarts[i] >>> 0;
		for (let i = 0; i < chainLengths.length; i++) wChainLens[i] = chainLengths[i] >>> 0;
		return true;
	}

	return {
		init(initialTargets) {
			for (let i = 0; i < boneCount; i++) {
				value[i] = initialTargets[i];
				vel[i] = 0;
			}
			if (wValue) {
				for (let i = 0; i < boneCount; i++) {
					wValue[i] = Number(value[i]) || 0;
					wVel[i] = 0;
				}
			}
		},
		step(targets, dt) {
			if (state.wasm && state.wasm.ok && ensureWasmViews()) {
				try {
					for (let i = 0; i < boneCount; i++) wTargets[i] = Number(targets[i]) || 0;
					state.wasm.exports.bbp_solve_step(
						boneCount,
						Number(dt) || 0,
						Number(state.config.follow_strength) || 0,
						Number(state.config.follow_damping) || 0,
						wValue.byteOffset,
						wVel.byteOffset,
						wTargets.byteOffset,
						chainStarts.length,
						wChainStarts.byteOffset,
						wChainLens.byteOffset,
						wRest.byteOffset,
						Number(state.config.chain_coupling) || 0,
						Number(state.config.chain_iterations) || 0,
						Number(state.config.tip_falloff) || 0
					);
					for (let i = 0; i < boneCount; i++) value[i] = wValue[i];
					return value.slice();
				} catch (e) {
					debugWarn('wasm step failed, fallback to JS', e);
				}
			}

			for (let i = 0; i < boneCount; i++) {
				const x = value[i];
				const v = vel[i];
				const xT = targets[i];
				const accel = (xT - x) * Math.max(0, state.config.follow_strength) - v * Math.max(0, state.config.follow_damping);
				const v2 = v + accel * dt;
				const x2 = x + v2 * dt;
				vel[i] = v2;
				value[i] = x2;
			}

			const iters = Math.max(0, Math.min(64, Math.round(state.config.chain_iterations)));
			const baseCoupling = clampNumber(state.config.chain_coupling, 0, 1, 0.6);
			for (let iter = 0; iter < iters; iter++) {
				for (let c = 0; c < chainStarts.length; c++) {
					const start = chainStarts[c];
					const len = chainLengths[c];
					for (let local = 1; local < len; local++) {
						const i = start + local;
						const parent = i - 1;
						const t = len <= 1 ? 0 : local / (len - 1);
						const coupling = baseCoupling * (1 - clampNumber(state.config.tip_falloff, 0, 1, 0.5) * t);
						const desired = value[parent] + restDeltaAxis[i];
						value[i] = value[i] + (desired - value[i]) * coupling;
					}
				}
			}

			return value.slice();
		},
	};
}

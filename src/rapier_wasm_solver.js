import { state } from './state.js';
import { debugWarn } from './util.js';
import { tryInitWasm } from './wasm.js';

function align4(x) {
	return (x + 3) & ~3;
}

export class RapierWasmSolver {
	/**
	 * @param {number} boneCount
	 * @param {number} maxBoxCount
	 * @param {number} maxClothLinkCount
	 */
	constructor(boneCount, maxBoxCount, maxClothLinkCount = 0) {
		this.boneCount = Math.max(0, boneCount | 0);
		this.maxBoxCount = Math.max(0, maxBoxCount | 0);
		this.maxClothLinkCount = Math.max(0, maxClothLinkCount | 0);
		this.ptrBase = 0;
		this.memBuf = null;
		this.views = null;
	}

	async init() {
		await tryInitWasm();
		if (!state.wasm || !state.wasm.ok) {
			throw new Error('BBPhysic: 未能加载 WASM（Rapier 解算需要 bbphysic_wasm.wasm）');
		}
		const ex = state.wasm.exports;
		if (!ex || typeof ex.bbp_alloc !== 'function' || typeof ex.bbp_rapier_step !== 'function') {
			throw new Error('BBPhysic: WASM 导出缺失（需要 bbp_alloc + bbp_rapier_step）');
		}
		this.ensureViews();
	}

	ensureViews() {
		const n = this.boneCount;
		const m = this.maxBoxCount;
		const k = this.maxClothLinkCount;
		if (!state.wasm || !state.wasm.ok) return false;
		const mem = state.wasm.memory;
		if (!mem) return false;
		// If buffer is unchanged and not detached, reuse existing views.
		if (this.views && this.memBuf === mem.buffer && (mem.buffer?.byteLength || 0) > 0) return true;

		const bytesParent = n * 4;
		const bytesRoot = align4(n * 1);
		const bytesPos = 3 * n * 4;
		const bytesQuat = 4 * n * 4;
		const bytesLinVel = 3 * n * 4;
		const bytesAngVel = 3 * n * 4;
		const bytesTargetLocal = 3 * n * 4;
		const bytesRadius = n * 4;
		const bytesTargetWorldPos = 3 * n * 4;
		const bytesTargetWorldQuat = 4 * n * 4;
		const bytesClothLinks = 3 * k * 4;
		const bytesBoxes = 15 * m * 4;
		const bytesOutPos = 3 * n * 4;
		const bytesOutQuat = 4 * n * 4;

		const total =
			bytesParent +
			bytesRoot +
			bytesPos +
			bytesQuat +
			bytesLinVel +
			bytesAngVel +
			bytesTargetLocal +
			bytesRadius +
			bytesTargetWorldPos +
			bytesTargetWorldQuat +
			bytesClothLinks +
			bytesBoxes +
			bytesOutPos +
			bytesOutQuat;

		if (!this.ptrBase) {
			// bbp_alloc may grow WASM memory and detach the old ArrayBuffer.
			this.ptrBase = state.wasm.exports.bbp_alloc(total);
		}
		if (!this.ptrBase) return false;

		// Re-read buffer AFTER allocation to avoid using a detached buffer.
		let buf = mem.buffer;
		if (!buf || (buf.byteLength || 0) === 0) {
			// Try one more time; some environments update buffer lazily.
			buf = mem.buffer;
		}
		if (!buf || (buf.byteLength || 0) === 0) return false;

		let p = this.ptrBase;
		this.memBuf = buf;
		let parent;
		let root;
		let worldPos;
		let worldQuat;
		let linvel;
		let angvel;
		let targetLocal;
		let radius;
		let targetWorldPos;
		let targetWorldQuat;
		let clothLinks;
		let boxes;
		let outWorldPos;
		let outWorldQuat;
		try {
			parent = new Int32Array(buf, p, n);
		p += bytesParent;
			root = new Uint8Array(buf, p, n);
		p += bytesRoot;
		p = align4(p);
			worldPos = new Float32Array(buf, p, 3 * n);
		p += bytesPos;
			worldQuat = new Float32Array(buf, p, 4 * n);
		p += bytesQuat;
			linvel = new Float32Array(buf, p, 3 * n);
		p += bytesLinVel;
			angvel = new Float32Array(buf, p, 3 * n);
		p += bytesAngVel;
			targetLocal = new Float32Array(buf, p, 3 * n);
		p += bytesTargetLocal;
			radius = new Float32Array(buf, p, n);
		p += bytesRadius;
			targetWorldPos = new Float32Array(buf, p, 3 * n);
		p += bytesTargetWorldPos;
			targetWorldQuat = new Float32Array(buf, p, 4 * n);
		p += bytesTargetWorldQuat;
			clothLinks = new Float32Array(buf, p, 3 * k);
		p += bytesClothLinks;
			boxes = new Float32Array(buf, p, 15 * m);
		p += bytesBoxes;
			outWorldPos = new Float32Array(buf, p, 3 * n);
		p += bytesOutPos;
			outWorldQuat = new Float32Array(buf, p, 4 * n);
		p += bytesOutQuat;
		} catch (e) {
			// If buffer got detached mid-construction, retry once with the latest buffer.
			try {
				buf = mem.buffer;
				if (!buf || (buf.byteLength || 0) === 0) return false;
				p = this.ptrBase;
				this.memBuf = buf;
				parent = new Int32Array(buf, p, n);
				p += bytesParent;
				root = new Uint8Array(buf, p, n);
				p += bytesRoot;
				p = align4(p);
				worldPos = new Float32Array(buf, p, 3 * n);
				p += bytesPos;
				worldQuat = new Float32Array(buf, p, 4 * n);
				p += bytesQuat;
				linvel = new Float32Array(buf, p, 3 * n);
				p += bytesLinVel;
				angvel = new Float32Array(buf, p, 3 * n);
				p += bytesAngVel;
				targetLocal = new Float32Array(buf, p, 3 * n);
				p += bytesTargetLocal;
				radius = new Float32Array(buf, p, n);
				p += bytesRadius;
				targetWorldPos = new Float32Array(buf, p, 3 * n);
				p += bytesTargetWorldPos;
				targetWorldQuat = new Float32Array(buf, p, 4 * n);
				p += bytesTargetWorldQuat;
				clothLinks = new Float32Array(buf, p, 3 * k);
				p += bytesClothLinks;
				boxes = new Float32Array(buf, p, 15 * m);
				p += bytesBoxes;
				outWorldPos = new Float32Array(buf, p, 3 * n);
				p += bytesOutPos;
				outWorldQuat = new Float32Array(buf, p, 4 * n);
				p += bytesOutQuat;
			} catch (e2) {
				return false;
			}
		}

		this.views = {
			parent,
			root,
			worldPos,
			worldQuat,
			linvel,
			angvel,
			targetLocal,
			radius,
			targetWorldPos,
			targetWorldQuat,
			clothLinks,
			boxes,
			outWorldPos,
			outWorldQuat,
		};
		return true;
	}

	/**
	 * @param {{dt:number, substeps:number, gravityY:number, linDamping:number, angDamping:number, airDrag?:number, inertiaScale?:number, targetSelfCollision?:boolean, motorStiffness:number, motorDamping:number, clothLinkCount?:number, boxCount:number}} params
	 */
	step(params) {
		if (!this.ensureViews()) throw new Error('BBPhysic: WASM 内存视图初始化失败');
		try {
			const ex = state.wasm.exports;
			const v = this.views;
			const ret = ex.bbp_rapier_step(
				this.boneCount,
				Number(params.dt) || 0,
				Math.max(1, Math.min(32, Math.round(Number(params.substeps) || 1))),
				Number(params.gravityY) || 0,
				Number(params.linDamping) || 0,
				Number(params.angDamping) || 0,
				Number(params.motorStiffness) || 0,
				Number(params.motorDamping) || 0,
				Math.max(0, Number(params.airDrag) || 0),
				Math.max(0, Number(params.inertiaScale) || 0),
				params.targetSelfCollision ? 1 : 0,
				Math.max(0, Math.min(this.maxClothLinkCount, Math.round(Number(params.clothLinkCount) || 0))),
				v.clothLinks.byteOffset,
				v.parent.byteOffset,
				v.root.byteOffset,
				v.worldPos.byteOffset,
				v.worldQuat.byteOffset,
				v.linvel.byteOffset,
				v.angvel.byteOffset,
				v.targetLocal.byteOffset,
				v.radius.byteOffset,
				v.targetWorldPos.byteOffset,
				v.targetWorldQuat.byteOffset,
				Math.max(0, Math.min(this.maxBoxCount, Math.round(Number(params.boxCount) || 0))),
				v.boxes.byteOffset,
				v.outWorldPos.byteOffset,
				v.outWorldQuat.byteOffset
			);
			// bbp_rapier_step may trigger wasm memory growth; refresh views so callers don't use detached buffers.
			if (!this.ensureViews()) throw new Error('BBPhysic: WASM 内存视图刷新失败');
			return ret;
		} catch (e) {
			debugWarn('bbp_rapier_step 调用失败', e);
			throw e;
		}
	}
}

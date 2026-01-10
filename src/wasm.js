import { state, PLUGIN_ID } from './state.js';
import { debugLog, debugWarn } from './util.js';

function getBlockbenchUserDataPath() {
	try {
		if (typeof electron !== 'undefined' && electron && electron.app && typeof electron.app.getPath === 'function') {
			return electron.app.getPath('userData');
		}
	} catch (e) {
		// ignore
	}
	try {
		if (typeof electron !== 'undefined' && electron && electron.remote && electron.remote.app && typeof electron.remote.app.getPath === 'function') {
			return electron.remote.app.getPath('userData');
		}
	} catch (e) {
		// ignore
	}
	return null;
}

function joinPathSafe(...parts) {
	try {
		if (typeof PathModule !== 'undefined' && PathModule && typeof PathModule.join === 'function') {
			return PathModule.join(...parts);
		}
	} catch (e) {
		// ignore
	}
	return parts.filter(Boolean).join('/');
}

function readBinaryFileAsArrayBuffer(filePath) {
	try {
		if (typeof filePath !== 'string' || !filePath) return null;
		if (typeof fs !== 'undefined' && fs && typeof fs.readFileSync === 'function') {
			const buf = fs.readFileSync(filePath);
			const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
			return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
		}
	} catch (e) {
		// ignore
	}
	return null;
}

function readBinaryFileAsArrayBufferBB(filePath) {
	return new Promise((resolve) => {
		try {
			if (typeof filePath !== 'string' || !filePath) return resolve(null);
			if (typeof Blockbench === 'undefined' || !Blockbench || typeof Blockbench.readFile !== 'function') return resolve(null);
			Blockbench.readFile([filePath], { readtype: 'buffer', errorbox: false }, (files) => {
				try {
					const f0 = Array.isArray(files) ? files[0] : null;
					if (f0 && f0.content instanceof ArrayBuffer) return resolve(f0.content);
				} catch (e) {
					// ignore
				}
				resolve(null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function isAbsolutePath(p) {
	if (typeof p !== 'string') return false;
	if (/^[A-Za-z]:\\/.test(p)) return true;
	if (p.startsWith('\\\\')) return true;
	if (p.startsWith('/')) return true;
	return false;
}

function getThisPluginDir() {
	try {
		if (typeof Plugins !== 'undefined' && Plugins && Array.isArray(Plugins.installed)) {
			const row = Plugins.installed.find((x) => x && x.id === PLUGIN_ID);
			const p = row?.path;
			if (p && typeof p === 'string') {
				try {
					if (typeof PathModule !== 'undefined' && PathModule && typeof PathModule.dirname === 'function') {
						return PathModule.dirname(p);
					}
				} catch (e) {
					// ignore
				}
				return p.replace(/\\[^\\]+$/, '');
			}
		}
	} catch (e) {
		// ignore
	}
	try {
		if (typeof __dirname !== 'undefined' && __dirname) return String(__dirname);
	} catch (e) {
		// ignore
	}
	return null;
}

export async function tryInitWasm() {
	if (state.wasmInitTried) return state.wasm;
	state.wasmInitTried = true;
	state.wasm = { ok: false };
	// Rapier-based full solver requires WASM.
	// (We no longer support JS fallback for the solver.)
	if (typeof WebAssembly === 'undefined') return state.wasm;

	try {
		/** @type {string[]} */
		const candidates = [];
		const pluginDir = getThisPluginDir();
		if (pluginDir) candidates.push(joinPathSafe(pluginDir, 'bbphysic_wasm.wasm'));
		const userData = getBlockbenchUserDataPath();
		if (userData) candidates.push(joinPathSafe(userData, 'plugins', 'bbphysic_wasm.wasm'));
		candidates.push('./bbphysic_wasm.wasm');

		let bytes = null;
		let loadedFrom = null;
		for (const c of candidates) {
			if (!c) continue;
			if (isAbsolutePath(c)) {
				bytes = readBinaryFileAsArrayBuffer(c);
				if (!bytes) bytes = await readBinaryFileAsArrayBufferBB(c);
			}
			if (!bytes && typeof c === 'string' && c.startsWith('./')) {
				try {
					const resp = await fetch(c);
					if (resp.ok) bytes = await resp.arrayBuffer();
				} catch (e) {
					// ignore
				}
			}
			if (bytes) {
				loadedFrom = c;
				break;
			}
		}
		if (!bytes) {
			debugWarn('wasm: 未找到 bbphysic_wasm.wasm（请放到 Blockbench userData/plugins 目录）', { userData });
			return state.wasm;
		}

		const { instance } = await WebAssembly.instantiate(bytes, {});
		const exports = instance.exports;
		const memory = exports.memory;
		if (!exports || !memory || typeof exports.bbp_alloc !== 'function' || typeof exports.bbp_rapier_step !== 'function') {
			return state.wasm;
		}
		state.wasm = { instance, exports, memory, ok: true };
		debugLog('wasm', 'WASM solver loaded', { from: loadedFrom });
	} catch (e) {
		debugWarn('wasm init failed', e);
	}
	return state.wasm;
}

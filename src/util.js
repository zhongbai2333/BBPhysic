import { state } from './state.js';

export function clampNumber(value, min, max, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

export function notify(message, timeMs = 1500) {
	try {
		if (typeof Blockbench !== 'undefined' && Blockbench && typeof Blockbench.showStatusMessage === 'function') {
			Blockbench.showStatusMessage(String(message), timeMs);
			return;
		}
	} catch (e) {
		// ignore
	}
	console.log('[BBPhysic]', message);
}

export function showMessage(title, message) {
	try {
		new MessageBox({
			title,
			message,
			buttons: ['OK'],
			confirm: 0,
		}).show();
	} catch (e) {
		console.warn('[BBPhysic] MessageBox failed', e);
		if (typeof alert === 'function') alert(String(message));
	}
}

export function debugLog(...args) {
	if (!state.config.debug_logging) return;
	console.log('[BBPhysic][debug]', ...args);
}

export function debugWarn(...args) {
	if (!state.config.debug_logging) return;
	console.warn('[BBPhysic][debug]', ...args);
}

export function sleep0() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

import { isBoneGroup } from './blockbench_api.js';

/**
 * Build multiple linear chains from a root group.
 * @param {any} root
 * @param {number} maxDepth
 * @returns {any[][]}
 */
export function buildChainsFromRoot(root, maxDepth) {
	const out = [];
	if (!root) return out;

	// If the selected root is itself a bone group, include it as the chain head.
	// This avoids skipping the first segment (common for skirts split into upper/lower parts).
	if (isBoneGroup(root)) {
		return buildChainsFromStart(root, maxDepth);
	}

	const children0 = (root.children || []).filter(isBoneGroup);
	if (!children0.length) return [];
	for (const ch of children0) out.push(...buildChainsFromStart(ch, maxDepth));
	return out;
}

/**
 * @param {any} start
 * @param {number} maxDepth
 * @returns {any[][]}
 */
export function buildChainsFromStart(start, maxDepth) {
	const out = [];
	if (!start) return out;
	let current = start;
	/** @type {any[]} */
	let chain = [start];
	const cap = Math.max(1, Math.round(maxDepth ?? 32));
	for (let depth = 0; depth < cap; depth++) {
		const children = (current.children || []).filter(isBoneGroup);
		if (!children.length) {
			out.push(chain);
			return out;
		}
		if (children.length === 1) {
			current = children[0];
			chain.push(current);
			continue;
		}
		out.push(chain);
		for (const ch of children) {
			out.push(...buildChainsFromStart(ch, cap - depth - 1));
		}
		return out;
	}
	out.push(chain);
	return out;
}

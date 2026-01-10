/**
 * Flattens chains into a single bones array and parent indices.
 * Adds a kinematic parent anchor for each chain head if it has a real parent bone outside the chain.
 * This helps cases like skirts: the chain head (skirt root) becomes dynamic and can be affected by child motion.
 *
 * @param {any[][]} chains
 */
export function flattenChainsWithParentAnchors(chains) {
	/** @type {any[]} */
	const bones = [];
	/** @type {number[]} */
	const parentIndex = [];
	/** @type {number[]} */
	const isRoot = [];
	/** @type {number[]} */
	const chainStarts = [];
	/** @type {number[]} */
	const chainLengths = [];

	/** @type {Map<string, number>} */
	const indexByUUID = new Map();

	function indexOfGroup(g) {
		const id = String(g?.uuid || '');
		if (!id) return -1;
		const v = indexByUUID.get(id);
		return typeof v === 'number' ? v : -1;
	}

	function pushBone(g, pIdx, rootFlag) {
		bones.push(g);
		parentIndex.push(pIdx | 0);
		isRoot.push(rootFlag ? 1 : 0);
		const id = String(g?.uuid || '');
		if (id) indexByUUID.set(id, bones.length - 1);
		return bones.length - 1;
	}

	for (let ci = 0; ci < chains.length; ci++) {
		const chain = chains[ci];
		if (!Array.isArray(chain) || chain.length === 0) continue;

		// Always insert a runtime-only kinematic anchor for each chain head.
		// - If head has a real parent: anchor follows the parent's world pose.
		// - If no real parent: anchor is fixed to head's initial world pose (prevents "root falling" when inertia/drag on).
		const head = chain[0];
		const headUuid = String(head?.uuid || '');
		let realParent = null;
		try {
			const p = head?.parent;
			if (p && p !== 'root' && String(p.uuid || '')) realParent = p;
		} catch (e) {
			realParent = null;
		}

		let anchorIdx = -1;
		if (headUuid) {
			const anchor = {
				uuid: `__bbp_anchor_${headUuid}`,
				mesh: (realParent?.mesh || head?.mesh) || null,
				__bbp_anchor: true,
				__bbp_anchor_source: realParent || head,
				__bbp_anchor_fixed: !realParent,
			};
			anchorIdx = indexOfGroup(anchor);
			if (anchorIdx < 0) {
				anchorIdx = pushBone(anchor, -1, true);
			}
		}

		chainStarts.push(bones.length);
		chainLengths.push(chain.length);

		for (let local = 0; local < chain.length; local++) {
			const g = chain[local];
			if (local === 0) {
				// Chain head is dynamic when we can anchor it; otherwise keep as kinematic root.
				if (anchorIdx >= 0) pushBone(g, anchorIdx, false);
				else pushBone(g, -1, true);
				continue;
			}
			pushBone(g, bones.length - 1, false);
		}
	}

	return { bones, parentIndex, isRoot, chainStarts, chainLengths };
}

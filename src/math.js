export function v3(x = 0, y = 0, z = 0) {
	return [x, y, z];
}

export function v3add(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3len(a) {
	return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function v3lerp(a, b, t) {
	const tt = Number(t) || 0;
	return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt];
}

export function v3scale(a, s) {
	return [a[0] * s, a[1] * s, a[2] * s];
}

export function v3normalize(a) {
	const l = v3len(a);
	if (l > 1e-8) return [a[0] / l, a[1] / l, a[2] / l];
	return [0, 0, 0];
}

export function v3dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function degToRad(d) {
	return (d * Math.PI) / 180;
}

export function radToDeg(r) {
	return (r * 180) / Math.PI;
}

/**
 * 3x3 matrix stored row-major: [m00,m01,m02, m10,m11,m12, m20,m21,m22]
 */
export function m3Identity() {
	return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function m3mul(a, b) {
	return [
		a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
		a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
		a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
		a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
		a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
		a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
		a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
		a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
		a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
	];
}

export function m3mulV3(m, v) {
	return [
		m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
		m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
		m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
	];
}

export function m3rotX(rad) {
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function m3rotY(rad) {
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function m3rotZ(rad) {
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function m3fromEulerXYZDeg(rotDeg) {
	const rx = degToRad(rotDeg[0] || 0);
	const ry = degToRad(rotDeg[1] || 0);
	const rz = degToRad(rotDeg[2] || 0);
	// Intrinsic XYZ (approx). Order: Rz * Ry * Rx for column vectors; for our row-major + v' = M*v, use M = Rx*Ry*Rz.
	return m3mul(m3mul(m3rotX(rx), m3rotY(ry)), m3rotZ(rz));
}

import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const banner = `/* BBPhysic - Blockbench Plugin (WIP)
 * ⚠️ 此文件由构建脚本自动生成：请编辑 src/ 下的源文件
 */`;

/** @type {import('esbuild').BuildOptions} */
const options = {
	entryPoints: ['src/index.js'],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: ['es2018'],
	outfile: 'bbphysic.js',
	banner: { js: banner },
	legalComments: 'none',
	charset: 'utf8',
	logLevel: 'info',
};

if (watch) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	console.log('[BBPhysic] watching...');
} else {
	await esbuild.build(options);
	console.log('[BBPhysic] build complete');
}

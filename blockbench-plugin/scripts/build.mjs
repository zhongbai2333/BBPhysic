import * as esbuild from 'esbuild';

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const result = await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/bbphysic.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
  define: {
    // Blockbench plugins run in an isolated scope, but bundlers may inject process/env.
    'process.env.NODE_ENV': '"production"'
  }
});

if (watch) {
  const ctx = await esbuild.context({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/bbphysic.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: true,
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': '"development"'
    }
  });
  await ctx.watch();
  console.log('Watching...');
}

export default result;

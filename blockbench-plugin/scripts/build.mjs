import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const wasmWorkspaceRoot = join(projectRoot, '..');

const args = process.argv.slice(2);
const watch = args.includes('--watch');

// Ensure dist directory exists
const distDir = join(projectRoot, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Build WASM if not already built
console.log('[Build] Building WASM module...');
try {
  execSync('cargo build --release --target wasm32-unknown-unknown', {
    cwd: wasmWorkspaceRoot,
    stdio: 'inherit'
  });
  console.log('[Build] WASM build complete');
} catch (err) {
  console.error('[Build] WASM build failed:', err.message);
  console.error('[Build] Continuing without WASM (plugin will fail to load)');
}

// Copy WASM file to dist (workspace root target directory)
const wasmSource = join(wasmWorkspaceRoot, 'target', 'wasm32-unknown-unknown', 'release', 'bbphysic_wasm.wasm');
const wasmDest = join(distDir, 'bbphysic.wasm');
if (existsSync(wasmSource)) {
  copyFileSync(wasmSource, wasmDest);
  console.log('[Build] Copied WASM to dist/bbphysic.wasm');
} else {
  console.warn('[Build] WASM file not found at:', wasmSource);
}

// Build TypeScript plugin
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
  console.log('[Build] Watching TypeScript files...');
  console.log('[Build] Note: WASM changes require manual rebuild with: npm run build');
}

console.log('\n[Build] Plugin built successfully!');
console.log('[Build] Files in dist/:');
console.log('[Build]   - bbphysic.js (TypeScript plugin bundle)');
console.log('[Build]   - bbphysic.wasm (Rust physics engine)');
console.log('[Build]   - bbphysic.js.map (source map)');
console.log('\n[Build] To install in Blockbench:');
console.log('[Build]   1. Copy both bbphysic.js AND bbphysic.wasm to Blockbench plugins folder');
console.log('[Build]   2. Or use File → Plugins → Load Plugin from File and select bbphysic.js');
console.log('[Build]      (Blockbench will copy it to plugins folder automatically)\n');

export default result;

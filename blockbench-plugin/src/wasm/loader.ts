export interface BBPhysicWasmExports {
  bbp_abi_version: () => number;
  bbp_world_create: (gravityY: number) => number;
  bbp_world_step: (handle: number, dt: number) => void;
  bbp_world_free: (handle: number) => void;
}

export interface BBPhysicWasmModule {
  instance: WebAssembly.Instance;
  exports: BBPhysicWasmExports;
  wasmPath: string;
}

type BBPhysicWasmLoadMethod = 'fs.readFileSync' | 'Blockbench/Filesystem.readFile';

function isAbsolutePath(p: string): boolean {
  if (typeof p !== 'string') return false;
  if (/^[A-Za-z]:\\/.test(p)) return true;
  if (p.startsWith('\\\\')) return true;
  if (p.startsWith('/')) return true;
  return false;
}

function dirnamePortable(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, '');
}

function joinPathSafe(...parts: string[]): string {
  try {
    const PathModule = (globalThis as any).PathModule as
      | { join?: (...xs: string[]) => string; dirname?: (p: string) => string }
      | undefined;
    if (PathModule?.join) return PathModule.join(...parts);
  } catch {
    // ignore
  }
  const filtered = parts.filter((x) => typeof x === 'string' && x.length > 0);
  if (filtered.length === 0) return '';
  const base = filtered[0] ?? '';
  const sep = base.includes('\\') ? '\\' : '/';
  return filtered
    .map((p, i) => {
      if (i === 0) return p;
      return p.replace(/^[\\/]+/, '');
    })
    .join(sep);
}

function getBlockbenchUserDataPath(): string | null {
  try {
    const electron = (globalThis as any).electron as any;
    if (electron?.app?.getPath) return electron.app.getPath('userData');
  } catch {
    // ignore
  }
  try {
    const electron = (globalThis as any).electron as any;
    if (electron?.remote?.app?.getPath) return electron.remote.app.getPath('userData');
  } catch {
    // ignore
  }
  return null;
}

function getThisPluginDir(plugin: Plugin): string | null {
  const id: string | undefined = (plugin as any).id;

  // 1) plugin.path (如果存在)
  try {
    const p = (plugin as any).path as string | undefined;
    if (p && typeof p === 'string') {
      // 可能是目录或文件路径；统一转成目录
      return p.includes('/') || p.includes('\\') ? dirnamePortable(p) : p;
    }
  } catch {
    // ignore
  }

  // 2) main 分支方案：Plugins.installed
  try {
    const Plugins = (globalThis as any).Plugins as any;
    if (Plugins && Array.isArray(Plugins.installed) && id) {
      const row = Plugins.installed.find((x: any) => x && x.id === id);
      const p = row?.path;
      if (p && typeof p === 'string') {
        try {
          const PathModule = (globalThis as any).PathModule as any;
          if (PathModule?.dirname) return PathModule.dirname(p);
        } catch {
          // ignore
        }
        return p.replace(/\\[^\\]+$/, '');
      }
    }
  } catch {
    // ignore
  }

  // 3) 你这边验证必须保留的兜底：Plugins.registered / Plugins.path
  try {
    const Plugins = (globalThis as any).Plugins as any;
    const candidates: Array<string | undefined> = [];
    if (Plugins?.currently_loading && Plugins?.registered?.[Plugins.currently_loading]?.path) {
      candidates.push(Plugins.registered[Plugins.currently_loading].path);
    }
    if (id && Plugins?.registered?.[id]?.path) {
      candidates.push(Plugins.registered[id].path);
    }
    if (Plugins?.path) {
      candidates.push(Plugins.path);
    }
    const hit = candidates.find((p) => typeof p === 'string' && p.length > 0);
    if (hit && typeof hit === 'string') {
      return hit.includes('/') || hit.includes('\\') ? dirnamePortable(hit) : hit;
    }
  } catch {
    // ignore
  }

  // 4) __dirname 兜底
  try {
    const d = (globalThis as any).__dirname;
    if (d) return String(d);
  } catch {
    // ignore
  }

  return null;
}

function readBinaryFileAsArrayBuffer(filePath: string): ArrayBuffer | null {
  try {
    if (typeof filePath !== 'string' || !filePath) return null;
    const fs = (globalThis as any).fs as any;
    if (fs?.readFileSync) {
      const buf = fs.readFileSync(filePath);
      const u8: Uint8Array = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      // Node may back Uint8Array with SharedArrayBuffer; normalize to plain ArrayBuffer.
      return u8.slice().buffer;
    }
  } catch {
    // ignore
  }
  return null;
}

async function readBinaryFileAsArrayBufferBB(filePath: string): Promise<ArrayBuffer | null> {
  // main 分支用 Blockbench.readFile；你当前实现用 Filesystem.readFile。
  // 这里两个都支持，减少环境差异。
  return new Promise((resolve) => {
    try {
      if (typeof filePath !== 'string' || !filePath) return resolve(null);

      const readFileFn: any =
        (globalThis as any).Blockbench?.readFile ?? (globalThis as any).Filesystem?.readFile;
      if (typeof readFileFn !== 'function') return resolve(null);

      readFileFn([filePath], { readtype: 'buffer', errorbox: false }, (files: any[]) => {
        try {
          const f0 = Array.isArray(files) ? files[0] : null;
          const content = f0?.content;
          if (content instanceof ArrayBuffer) return resolve(content);
          if (content && typeof content === 'object' && content.buffer instanceof ArrayBuffer) {
            // 有些环境会返回 Uint8Array
            return resolve(content.buffer as ArrayBuffer);
          }
        } catch {
          // ignore
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function loadWasmBytes(filePath: string): Promise<{ bytes: ArrayBuffer; method: BBPhysicWasmLoadMethod }> {
  // Prefer the confirmed working method in your environment.
  const viaFs = readBinaryFileAsArrayBuffer(filePath);
  if (viaFs) return { bytes: viaFs, method: 'fs.readFileSync' };

  const viaBB = await readBinaryFileAsArrayBufferBB(filePath);
  if (viaBB) return { bytes: viaBB, method: 'Blockbench/Filesystem.readFile' };

  throw new Error(`Failed to read wasm bytes: ${filePath}`);
}

export async function loadBBPhysicWasm(plugin: Plugin): Promise<BBPhysicWasmModule> {
  const pluginDir = getThisPluginDir(plugin);
  if (!pluginDir) {
    throw new Error('[BBPhysic] Cannot resolve plugin directory (plugin.path/Plugins.* missing)');
  }

  const wasmPath = joinPathSafe(pluginDir, 'bbphysic.wasm');
  if (!isAbsolutePath(wasmPath)) {
    throw new Error(`[BBPhysic] Resolved wasm path is not absolute: ${wasmPath}`);
  }

  const { bytes, method } = await loadWasmBytes(wasmPath);
  console.info('[BBPhysic][wasm] loaded', { from: wasmPath, method });

  const instantiated = (await WebAssembly.instantiate(bytes, {})) as unknown;
  const instance: WebAssembly.Instance =
    (instantiated as any).instance ?? (instantiated as WebAssembly.Instance);
  const exports = instance.exports as unknown as BBPhysicWasmExports;

  if (typeof exports.bbp_abi_version !== 'function') {
    throw new Error('Invalid wasm: missing bbp_abi_version export');
  }

  return { instance, exports, wasmPath };
}

import type { BBPhysicWasmModule } from './loader';
import { loadBBPhysicWasm } from './loader';

let currentPlugin: Plugin | null = null;
let currentWasm: BBPhysicWasmModule | null = null;

export function setBBPhysicPlugin(plugin: Plugin | null) {
  currentPlugin = plugin;
}

export function getBBPhysicPlugin() {
  return currentPlugin;
}

export function getBBPhysicWasmModule() {
  return currentWasm;
}

export function clearBBPhysicWasmModule() {
  currentWasm = null;
}

export async function ensureBBPhysicWasmModule(plugin?: Plugin): Promise<BBPhysicWasmModule> {
  if (currentWasm) return currentWasm;

  const p = plugin ?? currentPlugin;
  if (!p) {
    throw new Error('[BBPhysic] No plugin reference available for wasm loading');
  }

  currentWasm = await loadBBPhysicWasm(p);
  return currentWasm;
}

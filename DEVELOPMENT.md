# BBPhysic Development Guide

## Overview

BBPhysic is a Blockbench plugin that provides physics simulation and collision detection capabilities using the Rapier physics engine compiled to WebAssembly.

## Architecture

### Components

1. **Blockbench Plugin** (`blockbench-plugin/`)
   - TypeScript source code bundled with esbuild
   - Plugin UI, menus, dialogs
   - WASM loader and interface
   - Wireframe visualization

2. **WASM Module** (`bbphysic-wasm/`)
   - Rust crate using Rapier3D physics engine
   - Compiled to WebAssembly for browser execution
   - Provides physics world management and simulation

### File Structure

```
BBPhysic/
├── blockbench-plugin/          # Plugin source code
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── plugin/            # Plugin registration
│   │   ├── ui/                # Dialogs and UI
│   │   ├── physics/           # Physics data preparation
│   │   ├── debug/             # Wireframe visualization
│   │   ├── wasm/              # WASM loader
│   │   └── i18n.ts            # Translations
│   ├── scripts/
│   │   └── build.mjs          # esbuild configuration
│   └── dist/                  # Build output (gitignored)
│       ├── bbphysic.js        # Plugin bundle
│       └── bbphysic.wasm      # WASM module
├── bbphysic-wasm/              # Rust WASM crate
│   └── src/
│       └── lib.rs             # WASM exports
├── scripts/
│   └── build_wasm.ps1         # WASM build script
└── target/                     # Rust build output (gitignored)
```

## Development Setup

### Prerequisites

- **Node.js** v20+ and npm
- **Rust** 1.70+ with `wasm32-unknown-unknown` target
- **Blockbench** for testing

### Initial Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/zhongbai2333/BBPhysic.git
   cd BBPhysic
   ```

2. Install Node.js dependencies:
   ```bash
   cd blockbench-plugin
   npm install
   ```

3. Add Rust WASM target (if not already installed):
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

## Building

### Build Plugin Only

```bash
cd blockbench-plugin
npm run build
```

This produces `blockbench-plugin/dist/bbphysic.js`.

### Build WASM Module

#### On Windows (PowerShell):
```powershell
.\scripts\build_wasm.ps1
```

#### On Linux/macOS (manual):
```bash
# Build WASM
cargo build -p bbphysic-wasm --target wasm32-unknown-unknown --release

# Copy to plugin dist
mkdir -p blockbench-plugin/dist
cp target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm blockbench-plugin/dist/bbphysic.wasm
```

### Full Build

1. Build WASM module (see above)
2. Build plugin:
   ```bash
   cd blockbench-plugin
   npm run build
   ```

## Testing in Blockbench

1. Open Blockbench
2. Go to **File → Plugins**
3. Click **Load Plugin from File**
4. Select `blockbench-plugin/dist/bbphysic.js`
5. Ensure `blockbench-plugin/dist/bbphysic.wasm` exists in the same directory

The plugin will add a **BBPhysic** menu to the menu bar with the following options:
- Settings
- Select Solve Root Group
- Start Solve
- Preview (Realtime)
- Debug Wireframe

## Development Workflow

### Watch Mode (Plugin)

For rapid iteration on the TypeScript code:

```bash
cd blockbench-plugin
npm run watch
```

This will rebuild the plugin automatically when source files change.

### WASM Development

After modifying Rust code:

1. Rebuild WASM:
   ```powershell
   .\scripts\build_wasm.ps1
   ```

2. Reload the plugin in Blockbench:
   - **File → Plugins → Manage** → Click the reload icon next to BBPhysic
   - Or unload and reload from file

## Code Organization

### Plugin Registration

- `src/plugin/register.ts`: Main plugin registration and lifecycle
  - Loads WASM module on startup
  - Creates menu items and actions
  - Handles cleanup on unload

### UI Components

- `src/ui/settings_dialog.ts`: Comprehensive settings dialog
  - Physics parameters (gravity, timestep, damping, etc.)
  - Collision settings (layers, friction, restitution)
  - Display settings (wireframe color, opacity, markers)
  - Debug options (logging, wireframe)

- `src/ui/solve_dialog.ts`: Two-group selection dialog
  - Select moving object group
  - Select collider group
  - Initiates data preparation phase

### Physics Data Preparation

- `src/physics/prep.ts`: Extracts vertex and edge data from selected cubes
- `src/physics/types.ts`: Common type definitions
- `src/physics/aabb.ts`: AABB calculations

### Wireframe Visualization

- `src/debug/wireframe.ts`: Real-time wireframe rendering
  - OBB wireframe from cube vertices
  - Joint pivot markers
  - Collider visualization
  - Configurable colors and opacity

### WASM Integration

- `src/wasm/loader.ts`: WASM module loading
  - Multiple loading strategies (fs.readFileSync, Blockbench.readFile)
  - Path resolution from plugin directory
  - Error handling and diagnostics

### Internationalization

- `src/i18n.ts`: Translation system
  - English and Chinese (Simplified & Traditional)
  - Fallback mechanism

## WASM API

Current exported functions:

```rust
// Returns ABI version (currently 1)
fn bbp_abi_version() -> u32

// Create a physics world with given gravity
fn bbp_world_create(gravity_y: f32) -> u32

// Step the simulation forward by dt seconds
fn bbp_world_step(handle: u32, dt: f32)

// Free/destroy a physics world
fn bbp_world_free(handle: u32)
```

Future exports will include:
- `bbp_add_rigid_body`, `bbp_add_collider`
- `bbp_get_transforms`, `bbp_set_transforms`
- `bbp_debug_draw`

## TypeScript Configuration

- **Target**: ES2020
- **Module**: ESNext with bundler resolution
- **Strict mode**: Enabled
- **Output**: Single IIFE bundle for Blockbench

## Rust Configuration

- **Profile**: Release build optimized for size
  - LTO enabled
  - Optimization level: `z` (minimal size)
  - Single codegen unit

## Common Issues

### WASM Not Loading

Check:
1. `bbphysic.wasm` exists in `blockbench-plugin/dist/`
2. Plugin has correct path resolution (uses plugin directory, not CWD)
3. File permissions allow reading WASM file
4. Check browser console for error messages

### Plugin Not Appearing

Check:
1. Plugin is loaded from correct path
2. No JavaScript errors in console
3. `blockbench-plugin/dist/bbphysic.js` is up to date

### TypeScript Errors

Run type checking:
```bash
cd blockbench-plugin
npx tsc --noEmit
```

## Next Development Phases

See [TODO.md](TODO.md) for detailed roadmap.

### Phase 1: Data Extraction (Current)
- ✅ Vertex/edge collection from cubes
- ✅ OBB wireframe visualization
- ✅ Joint marker rendering

### Phase 2: Physics Integration
- [ ] Design complete WASM API
- [ ] Map Blockbench transforms to Rapier
- [ ] Create rigid bodies and colliders from groups/cubes
- [ ] Handle constraints and joints

### Phase 3: Real-time Simulation
- [ ] Preview mode with render loop
- [ ] Step-by-step simulation
- [ ] Apply physics results back to Blockbench transforms

### Phase 4: Polish
- [ ] Comprehensive error handling
- [ ] Performance optimization
- [ ] User documentation
- [ ] Example models

## Contributing

When contributing code:

1. Follow existing code style
2. Run TypeScript type checking
3. Test in Blockbench before committing
4. Update documentation for API changes

## License

See repository root for license information.

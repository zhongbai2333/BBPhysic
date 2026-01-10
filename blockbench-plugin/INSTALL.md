# BBPhysic Plugin Installation Guide

## 安装方法 / Installation Methods

### Method 1: Automatic Installation (Recommended / 推荐)

1. Build the plugin (if not already built):
   ```bash
   cd blockbench-plugin
   npm install
   npm run build
   ```

2. In Blockbench:
   - Go to **File → Plugins → Load Plugin from File**
   - Select `blockbench-plugin/dist/bbphysic.js`
   - Blockbench will automatically copy BOTH `bbphysic.js` AND `bbphysic.wasm` to the plugins folder

### Method 2: Manual Installation

1. Build the plugin (if not already built):
   ```bash
   cd blockbench-plugin
   npm install
   npm run build
   ```

2. Locate your Blockbench plugins folder:
   - **Windows**: `C:\Users\<YourName>\AppData\Roaming\Blockbench\plugins\`
   - **macOS**: `~/Library/Application Support/Blockbench/plugins/`
   - **Linux**: `~/.config/Blockbench/plugins/`

3. Copy BOTH files to the plugins folder:
   - `blockbench-plugin/dist/bbphysic.js`
   - `blockbench-plugin/dist/bbphysic.wasm` ⚠️ **IMPORTANT: Must copy WASM file too!**

4. Restart Blockbench or reload plugins

## Common Issues / 常见问题

### Error: "ENOENT: no such file or directory, open '...bbphysic.wasm'"

**Problem**: The WASM file was not copied to the plugins folder.

**Solution**: 
- Make sure BOTH `bbphysic.js` AND `bbphysic.wasm` are in the plugins folder
- When using "Load Plugin from File", Blockbench should copy both automatically
- If manual install, copy both files manually

### Plugin doesn't load / 插件加载失败

**Check**:
1. Both files are in the plugins folder
2. File permissions (WASM should be readable)
3. Console errors (F12 in Blockbench)

## Development / 开发

### Watch Mode

```bash
npm run watch
```

Note: WASM changes require manual rebuild with `npm run build`

### Building WASM only

```bash
cd ..
cargo build --release --target wasm32-unknown-unknown
```

The WASM file will be at: `target/wasm32-unknown-unknown/release/bbphysic_wasm.wasm`

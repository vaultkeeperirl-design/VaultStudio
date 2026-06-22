import fs from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'node_modules', 'app-builder-lib', 'out', 'util', 'electronGet.js');

if (!fs.existsSync(target)) {
  throw new Error(`electron-builder extract helper not found: ${target}`);
}

const source = fs.readFileSync(target, 'utf8');

if (source.includes('rename failed, copying extracted Electron directory instead')) {
  console.log('electron-builder extract fallback already patched');
  process.exit(0);
}

const needle = `        await fs.rm(dir, { recursive: true, force: true });
        await fs.rename(tmpDir, dir);
`;

const replacement = `        await fs.rm(dir, { recursive: true, force: true });
        try {
            await fs.rename(tmpDir, dir);
        }
        catch (e) {
            if (process.platform !== "win32" || (e === null || e === void 0 ? void 0 : e.code) !== "EPERM" && (e === null || e === void 0 ? void 0 : e.code) !== "EACCES") {
                throw e;
            }
            builder_util_1.log.warn({ tmpDir, dir, error: e.message }, "rename failed, copying extracted Electron directory instead");
            await (0, builder_util_1.copyDir)(tmpDir, dir);
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
`;

if (!source.includes(needle)) {
  throw new Error('electron-builder extract helper changed; update patch-electron-builder-extract.mjs');
}

fs.writeFileSync(target, source.replace(needle, replacement), 'utf8');
console.log('patched electron-builder extract fallback for Windows rename locks');

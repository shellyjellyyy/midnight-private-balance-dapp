// ============================================================
// copy-artifacts.mjs
// Copies the compiled ZK artifacts (keys/ and zkir/) into the
// Vite build output (dist/) so the produced bundle can fetch
// proving/verifying keys at runtime. Cross-platform (Windows/Linux).
// ============================================================

import { cpSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(root, 'dist');

for (const dir of ['keys', 'zkir']) {
  const src = path.join(root, dir);
  const dest = path.join(distDir, dir);

  if (!existsSync(src)) {
    console.warn(`[copy-artifacts] missing source directory: ${src}`);
    continue;
  }

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[copy-artifacts] copied ${dir}/ -> dist/${dir}/`);
}
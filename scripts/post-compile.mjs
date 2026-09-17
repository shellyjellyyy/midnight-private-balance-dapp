// ============================================================
// post-compile.mjs
// Copies the freshly compiled ZK artifacts from the managed
// contract output (managed/counter/keys and managed/counter/zkir)
// into the project-root keys/ and zkir/ directories that the
// Vite dev server serves. Cross-platform (Windows/Linux).
// ============================================================

import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const managedDir = path.join(root, 'managed', 'counter');

for (const dir of ['keys', 'zkir']) {
  const src = path.join(managedDir, dir);
  const dest = path.join(root, dir);

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[post-compile] copied managed/counter/${dir}/ -> ${dir}/`);
}
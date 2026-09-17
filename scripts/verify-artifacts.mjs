// ============================================================
// verify-artifacts.mjs
// Verifies that the compiled Compact contract and its ZK artifacts
// required at runtime are committed to the repository. Uses only
// Node's standard filesystem APIs, so it runs on Windows, Linux,
// and macOS (no shell-specific constructs). Exits non-zero if any
// required file is missing.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const REQUIRED_FILES = [
  'managed/counter/compiler/contract-info.json',
  'managed/counter/contract/index.js',
  'managed/counter/contract/index.d.ts',
  'managed/counter/zkir/commitBalance.zkir',
  'managed/counter/zkir/getTotalCommitted.zkir',
  'managed/counter/keys/commitBalance.prover',
  'managed/counter/keys/getTotalCommitted.prover',
];

const missing = REQUIRED_FILES.filter((file) => {
  const full = path.join(root, file);
  if (existsSync(full)) return false;
  console.error(`[verify-artifacts] MISSING required artifact: ${file}`);
  return true;
});

if (missing.length > 0) {
  console.error(
    `[verify-artifacts] ${missing.length} required artifact(s) are missing: ${missing.join(', ')}`
  );
  process.exitCode = 1;
} else {
  console.log(
    `[verify-artifacts] All ${REQUIRED_FILES.length} committed Compact artifacts verified.`
  );
}
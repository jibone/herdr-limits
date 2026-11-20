import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../tools/quality/files.mjs';

export function tool(name, args, options = {}) {
  const run = spawnSync(join(ROOT, 'node_modules', '.bin', name), args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (run.error) throw new Error(`${name} is missing, run npm install`, { cause: run.error });
  return run;
}

export function system(name, args, hint) {
  const run = spawnSync(name, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw new Error(`${name} is missing: ${hint}`, { cause: run.error });
  return run;
}

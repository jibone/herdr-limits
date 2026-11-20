import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');

const FIXTURES = /(^|\/)fixtures\//;
const TESTS = /(^|\/)test\//;
const SHEBANG_SH = /^#!.*\bsh\b/;

const isFile = (root, path) => {
  try { return statSync(join(root, path)).isFile(); } catch { return false; }
};

export function gitFiles(root = ROOT) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(out.split('\0').filter(Boolean))]
    .filter((path) => !path.startsWith('node_modules/') && !FIXTURES.test(path) && isFile(root, path));
}

const firstLine = (root, path) => readFileSync(join(root, path), 'utf8').split('\n')[0];

function langOf(root, path) {
  if (/\.m?js$/.test(path)) return 'javascript';
  if (path.endsWith('.sh')) return 'shell';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.awk')) return 'awk';
  const extensionless = !/\.[^/]+$/.test(path);
  return extensionless && SHEBANG_SH.test(firstLine(root, path)) ? 'shell' : null;
}

export function codeFiles(root = ROOT) {
  return gitFiles(root)
    .map((path) => ({ path, lang: langOf(root, path), test: TESTS.test(path) }))
    .filter(({ lang }) => lang);
}

export const shellFiles = (root = ROOT) => codeFiles(root).filter(({ lang }) => lang === 'shell').map(({ path }) => path);

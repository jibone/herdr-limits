import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { codeFiles, ROOT } from '../../tools/quality/files.mjs';
import { tool } from './kit.mjs';

const VIEW = 'mods/usage-limits/main.js';
const LIB = 'mods/usage-limits/lib/probe.js';
const UI = 'mods/usage-limits/ui/probe.js';

const eslint = new ESLint({ cwd: ROOT });

async function rulesFor(path, source) {
  const [result] = await eslint.lintText(source, { filePath: path });
  return result.messages.map((m) => m.ruleId);
}

const methods = (count) => Array.from({ length: count }, (_, i) => `  m${i}() { return ${i}; }`).join('\n');

test('eslint passes on the whole repo', () => {
  const run = tool('eslint', ['.']);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});

test('eslint sees every javascript file the quality checks see', () => {
  const run = tool('eslint', ['--format', 'json', '.']);
  const linted = JSON.parse(run.stdout).map((r) => r.filePath.slice(ROOT.length + 1)).sort();
  const sources = codeFiles().filter((f) => f.lang === 'javascript').map((f) => f.path).sort();
  assert.deepEqual(linted, sources);
});

test('an eslint-disable comment does not switch a rule off', async () => {
  assert.ok((await rulesFor(LIB, '/* eslint-disable */\nvar x = 1;\nexport { x };\n')).includes('no-var'));
});

test('a class outside the view is refused', async () => {
  assert.ok((await rulesFor(LIB, 'export class A {}\n')).includes('no-restricted-syntax'));
  assert.ok((await rulesFor(LIB, 'export const A = class {};\n')).includes('no-restricted-syntax'));
});

test('this outside the view is refused', async () => {
  assert.ok((await rulesFor(LIB, 'export function f() { return this; }\n')).includes('no-restricted-syntax'));
});

test('the view is the one class, with a bounded number of methods', async () => {
  assert.deepEqual((await rulesFor(VIEW, `export default class V {\n${methods(12)}\n}\n`)), []);
  assert.ok((await rulesFor(VIEW, `export default class V {\n${methods(13)}\n}\n`)).includes('no-restricted-syntax'));
  assert.ok((await rulesFor(VIEW, 'export default class V {}\nexport class W {}\n')).includes('max-classes-per-file'));
});

test('lib and providers do not import the host, the ui or main', async () => {
  for (const path of [LIB, 'mods/usage-limits/providers/probe.js']) {
    for (const spec of ['herdr', 'gpui-kit', 'gpui-base', '../main.js', '../ui/bar.js']) {
      assert.ok((await rulesFor(path, `import "${spec}";\n`)).includes('no-restricted-imports'), `${path} importing ${spec}`);
    }
  }
});

test('ui draws with gpui but does not call the host', async () => {
  assert.ok((await rulesFor(UI, 'import "herdr";\n')).includes('no-restricted-imports'));
  assert.ok((await rulesFor(UI, 'import "../main.js";\n')).includes('no-restricted-imports'));
  assert.deepEqual((await rulesFor(UI, 'import "gpui-kit";\nimport "../lib/format.js";\n')), []);
});

test('io and actions do not depend on drawing', async () => {
  assert.ok((await rulesFor('mods/usage-limits/io/probe.js', 'import "../ui/kit.js";\n')).includes('no-restricted-imports'));
  assert.ok((await rulesFor('mods/usage-limits/actions.js', 'import "./ui/bar.js";\n')).includes('no-restricted-imports'));
  assert.deepEqual(await rulesFor('mods/usage-limits/io/probe.js', 'import "herdr";\nimport "../lib/mod.js";\n'), []);
});

test('functions stay short and simple', async () => {
  const long = `export function f(a) {\n${Array.from({ length: 61 }, (_, i) => `  a.push(${i});`).join('\n')}\n}\n`;
  assert.ok((await rulesFor(LIB, long)).includes('max-lines-per-function'));
  assert.ok((await rulesFor(LIB, 'export const f = (a, b, c, d, e, g) => a + b + c + d + e + g;\n')).includes('max-params'));
  assert.ok((await rulesFor(LIB, 'export const f = (a) => (a ? 1 : a === 0 ? 2 : 3);\n')).includes('no-nested-ternary'));
});

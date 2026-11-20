import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeFiles, ROOT, shellFiles } from '../../tools/quality/files.mjs';
import { system } from './kit.mjs';

const LIMIT = { code: 300, test: 600 };
const INLINE_AWK_PROGRAM = /\bawk\b(?:\s+-v\s+\S+)*\s+(?:"[^"]*")?'[^']*\n/;

test('awk programs longer than a line live in helpers/awk/*.awk, where the comment check reads them', () => {
  const inline = shellFiles().filter((path) => INLINE_AWK_PROGRAM.test(readFileSync(join(ROOT, path), 'utf8')));
  assert.deepEqual(inline, []);
});

test('the inline awk check sees a program in quotes and lets a one-liner through', () => {
  assert.ok(INLINE_AWK_PROGRAM.test("x=$(awk -v a=1 '\n  { print }')"));
  assert.ok(INLINE_AWK_PROGRAM.test(`awk "$NUM"'\n{ n++ }'`));
  assert.ok(!INLINE_AWK_PROGRAM.test("awk -v c=1 '{ print $1 }'\n"));
  assert.ok(!INLINE_AWK_PROGRAM.test("awk -f prog.awk \"$f\"\n"));
});

test('shellcheck passes on every shell script, read as POSIX sh', () => {
  const run = system('shellcheck', ['-s', 'sh', '-x', ...shellFiles()], 'brew install shellcheck');
  assert.equal(run.status, 0, run.stdout);
});

test('every shell, python and sql file stays under its line limit', () => {
  const over = codeFiles().filter(({ lang }) => lang !== 'javascript').flatMap(({ path, test: isTest }) => {
    const count = readFileSync(join(ROOT, path), 'utf8').split('\n').length - 1;
    const limit = isTest ? LIMIT.test : LIMIT.code;
    return count > limit ? [`${path}: ${count} lines, limit ${limit}`] : [];
  });
  assert.deepEqual(over, []);
});

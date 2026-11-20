import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allComments, commentsIn } from '../../tools/quality/comments.mjs';

const lines = (lang, text) => commentsIn(lang, text).map((c) => c.line);

test('no comments in the code: say it with a name, a constant, a function or a test', () => {
  assert.deepEqual(allComments(), []);
});

test('javascript: line and block comments are found, a shebang is not', () => {
  assert.deepEqual(lines('javascript', '#!/usr/bin/env node\nconst a = 1; // b\n/* c */\nconst s = "// not";\n'), [2, 3]);
});

test('shell: a # starting a word is a comment, the shebang, $# and quoted # are not', () => {
  assert.deepEqual(lines('shell', '#!/bin/sh\necho "$#" "a#b" \'#\'\n# one\necho x # two\n'), [3, 4]);
});

test('shell: a here-document body is not read for comments', () => {
  assert.deepEqual(lines('shell', 'cat <<EOF\n# kept\nEOF\n'), []);
});

test('python: comments are found, the shebang and a # in a string are not', () => {
  assert.deepEqual(lines('python', '#!/usr/bin/env python3\nx = "#"  # one\n# two\n'), [2, 3]);
});

test('awk: any # is taken for a comment, as awk programs here need no literal #', () => {
  assert.deepEqual(lines('awk', '{ print $1 }\n# one\n{ n++ } # two\n'), [2, 3]);
});

test('sql: -- and /* */ are comments, the same inside a string are not', () => {
  assert.deepEqual(lines('sql', "SELECT '--', 'a /* b */'\n-- one\nFROM t /* two */;\n"), [2, 3]);
});

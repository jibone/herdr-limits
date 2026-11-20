import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Linter } from 'eslint';
import { codeFiles, ROOT } from './files.mjs';
import { shellComments } from './shell-comments.mjs';

export function jsComments(text) {
  const linter = new Linter({ configType: 'flat' });
  const config = { files: ['**'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } };
  const fatal = linter.verify(text, config, { filename: 'probe.js' }).find((m) => m.fatal);
  if (fatal) throw new Error(`does not parse at line ${fatal.line}: ${fatal.message}`);
  return linter.getSourceCode().getAllComments()
    .filter((comment) => comment.type !== 'Shebang')
    .map((comment) => ({ line: comment.loc.start.line, text: comment.value }));
}

const PYTHON_TOKENIZER = [
  'import io, json, sys, tokenize',
  'text = sys.stdin.read()',
  'found = [[t.start[0], t.string[1:]] for t in tokenize.generate_tokens(io.StringIO(text).readline) if t.type == tokenize.COMMENT]',
  'print(json.dumps(found))',
].join('\n');

export function pythonComments(text) {
  const run = spawnSync('python3', ['-I', '-c', PYTHON_TOKENIZER], { input: text, encoding: 'utf8' });
  if (run.error) throw new Error(`python3 is needed to read comments in .py files (${run.error.message})`);
  if (run.status !== 0) throw new Error(`python3 could not tokenize: ${run.stderr.trim()}`);
  return JSON.parse(run.stdout)
    .filter(([line, body]) => !(line === 1 && body.startsWith('!')))
    .map(([line, body]) => ({ line, text: body }));
}

const SQL_TOKENS = /'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g;

export function sqlComments(text) {
  return [...text.matchAll(SQL_TOKENS)]
    .filter(([token]) => token.startsWith('--') || token.startsWith('/*'))
    .map((match) => ({ line: text.slice(0, match.index).split('\n').length, text: match[0] }));
}

export function awkComments(text) {
  return text.split('\n').flatMap((line, i) => (line.includes('#') ? [{ line: i + 1, text: line }] : []));
}

const READERS = { javascript: jsComments, python: pythonComments, shell: shellComments, sql: sqlComments, awk: awkComments };

export function commentsIn(lang, text) {
  return READERS[lang](text);
}

export function allComments(root = ROOT) {
  return codeFiles(root).flatMap(({ path, lang }) => {
    const text = readFileSync(join(root, path), 'utf8');
    try {
      return commentsIn(lang, text).map((comment) => `${path}:${comment.line} ${comment.text.trim().slice(0, 80)}`);
    } catch (error) {
      throw new Error(`${path}: ${error.message}`, { cause: error });
    }
  });
}

const WORD_START = /[\s;&|()]/;
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/;

const heredocAt = (text, i) => {
  if (text[i] !== '<' || text[i + 1] !== '<' || text[i + 2] === '<') return null;
  const match = HEREDOC.exec(text.slice(i, i + 200));
  if (!match) return null;
  return { length: match[0].length, tabs: match[1] === '-', word: match[2] ?? match[3] ?? match[4] };
};

function skipSingle(text, i) {
  const end = text.indexOf("'", i + 1);
  return end < 0 ? text.length : end + 1;
}

function bodyEnd(text, from, { word, tabs }) {
  let i = from;
  while (i < text.length) {
    const end = text.indexOf('\n', i);
    const stop = end < 0 ? text.length : end;
    const line = text.slice(i, stop);
    i = end < 0 ? text.length : end + 1;
    if ((tabs ? line.replace(/^\t+/, '') : line) === word) return i;
  }
  return -1;
}

function skipBody(text, from, heredocs) {
  let i = from;
  for (const pending of heredocs) {
    i = bodyEnd(text, i, pending);
    if (i < 0) throw new Error(`unterminated here-document ${pending.word} opened at line ${pending.line}`);
  }
  return i;
}

const countLines = (text, from, to) => text.slice(from, to).split('\n').length - 1;

const top = (s) => s.stack[s.stack.length - 1];
const at = (s, str) => s.text.startsWith(str, s.i);

function jump(s, to) {
  s.line += countLines(s.text, s.i, to);
  s.i = to;
}

function newline(s) {
  s.line++;
  s.i++;
  if (s.pending.length) jump(s, skipBody(s.text, s.i, s.pending.splice(0)));
}

function skipAnsi(s) {
  let j = s.i + 2;
  while (j < s.text.length && s.text[j] !== "'") j += s.text[j] === '\\' ? 2 : 1;
  jump(s, Math.min(j + 1, s.text.length));
}

function comment(s) {
  const end = s.text.indexOf('\n', s.i);
  const stop = end < 0 ? s.text.length : end;
  if (!(s.line === 1 && s.text[s.i + 1] === '!')) s.found.push({ line: s.line, text: s.text.slice(s.i + 1, stop) });
  s.i = stop;
}

function heredoc(s) {
  const found = heredocAt(s.text, s.i);
  if (found) s.pending.push({ ...found, line: s.line });
  s.i += found ? found.length : 1;
}

const enter = (s, mode) => { s.stack.push(mode); s.cases.push(0); };
const open = (mode, width) => (s) => { enter(s, mode); s.i += width; };
const close = (s) => { s.stack.pop(); s.cases.pop(); s.i++; };

const COMMAND_START = /(?:^|[\s;&|(){])(?:then|do|else|elif|!)$|(?:^|[\n;&|(){])$/;
const commandPosition = (s) => COMMAND_START.test(s.text.slice(Math.max(0, s.i - 12), s.i).replace(/[ \t]+$/, ''));
const atWord = (s, word) => at(s, word) && commandPosition(s) && /^[\s;&|)]?$/.test(s.text[s.i + word.length] ?? '');
const caseDepth = (delta, width) => (s) => { s.cases[s.cases.length - 1] = Math.max(0, s.cases[s.cases.length - 1] + delta); s.i += width; };
const inCase = (s) => s.cases[s.cases.length - 1] > 0;

const IN_DOUBLE = [
  [(s) => s.text[s.i] === '"', close],
  [(s) => s.text[s.i] === '`', open('bt', 1)],
  [(s) => at(s, '$('), open('code', 2)],
  [(s) => at(s, '${'), open('brace', 2)],
  [() => true, (s) => { s.i++; }],
];

const IN_CODE = [
  [(s) => s.text[s.i] === "'", (s) => jump(s, skipSingle(s.text, s.i))],
  [(s) => s.text[s.i] === '"', open('dq', 1)],
  [(s) => s.text[s.i] === '`', (s) => (top(s) === 'bt' ? close(s) : open('bt', 1)(s))],
  [(s) => at(s, '$('), open('code', 2)],
  [(s) => at(s, '${'), open('brace', 2)],
  [(s) => at(s, "$'"), skipAnsi],
  [(s) => s.text[s.i] === '}' && top(s) === 'brace', close],
  [(s) => atWord(s, 'case') && top(s) === 'code', caseDepth(1, 4)],
  [(s) => atWord(s, 'esac') && top(s) === 'code', caseDepth(-1, 4)],
  [(s) => s.text[s.i] === ')' && top(s) === 'code' && s.stack.length > 1 && inCase(s), (s) => { s.i++; }],
  [(s) => s.text[s.i] === ')' && top(s) === 'code' && s.stack.length > 1, close],
  [(s) => s.text[s.i] === '(' && top(s) !== 'brace', open('code', 1)],
  [(s) => s.text[s.i] === '#' && top(s) !== 'brace' && (s.i === 0 || WORD_START.test(s.text[s.i - 1])), comment],
  [() => true, (s) => (top(s) === 'brace' ? s.i++ : heredoc(s))],
];

function step(s) {
  if (s.text[s.i] === '\n') return newline(s);
  if (s.text[s.i] === '\\') return jump(s, Math.min(s.i + 2, s.text.length));
  const rules = top(s) === 'dq' ? IN_DOUBLE : IN_CODE;
  return rules.find(([applies]) => applies(s))[1](s);
}

export function shellComments(text) {
  const s = { text, i: 0, line: 1, stack: ['code'], cases: [0], pending: [], found: [] };
  while (s.i < text.length) step(s);
  if (s.pending.length) skipBody(text, text.length, s.pending);
  return s.found;
}

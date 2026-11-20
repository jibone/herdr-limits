import js from '@eslint/js';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

const MOD = 'mods/usage-limits';
const ENTRY = `${MOD}/main.js`;
const SOURCES = ['**/*.js', '**/*.mjs'];
const TESTS = ['test/**', '**/test/**'];
const NODE = ['tools/**', 'eslint.config.js', ...TESTS];
const HOST = ['herdr', 'gpui-kit', 'gpui-base'];
const MAX_VIEW_METHODS = 12;
const MAIN_FROM_A_FOLDER = '../main.js';

const HOST_GLOBALS = { console: 'readonly', process: 'readonly', URL: 'readonly' };

const banned = (selector, message) => ({ selector, message });
const NO_CLASSES = [
  banned('ClassDeclaration', 'functions, not classes: the one class is the View in main.js'),
  banned('ClassExpression', 'functions, not classes: the one class is the View in main.js'),
  banned('ThisExpression', 'no this outside the View: pass what a function needs'),
];
const THIN_VIEW = banned(`ClassBody > MethodDefinition:nth-child(${MAX_VIEW_METHODS + 1})`,
  `the View keeps at most ${MAX_VIEW_METHODS} methods: drawing goes to ui/, logic to lib/`);

const layer = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default [
  { ignores: ['node_modules/**', '**/fixtures/**', '**/*.d.ts', 'docs/**'] },
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
  { files: SOURCES, ...js.configs.recommended },
  {
    files: SOURCES,
    plugins: { sonarjs },
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: HOST_GLOBALS },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-shadow': ['error', { allow: ['cx'] }],
      'no-param-reassign': ['error', { props: false }],
      'no-nested-ternary': 'error',
      'no-else-return': 'error',
      'consistent-return': 'error',
      'no-duplicate-imports': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-lonely-if': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      curly: ['error', 'multi-line'],
      'default-param-last': 'error',
      'no-implicit-coercion': 'error',
      'no-restricted-syntax': ['error', ...NO_CLASSES],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-small-switch': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
    },
  },
  { files: NODE, languageOptions: { ecmaVersion: 'latest', globals: { ...globals.node } } },
  {
    files: SOURCES,
    ignores: TESTS,
    rules: {
      'max-lines': ['error', { max: 300 }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true }],
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
      'max-statements': ['error', 25],
      'max-nested-callbacks': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    files: TESTS,
    rules: {
      'max-lines': ['error', { max: 600 }],
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: [ENTRY],
    rules: {
      'max-classes-per-file': ['error', 1],
      'no-restricted-syntax': ['error', THIN_VIEW],
    },
  },
  { files: [`${MOD}/lib/**`, `${MOD}/providers/**`], rules: layer([...HOST, MAIN_FROM_A_FOLDER, '../ui/*'], 'lib and providers stay pure: no host, no ui, no main') },
  { files: [`${MOD}/ui/**`], rules: layer(['herdr', MAIN_FROM_A_FOLDER, '../io/*', '../actions.js'], 'ui only draws: it gets data and actions, it does not call the host') },
  { files: [`${MOD}/io/**`], rules: layer(['gpui-kit', 'gpui-base', '../ui/*', MAIN_FROM_A_FOLDER, '../actions.js'], 'io runs helpers: no drawing, no view') },
  { files: [`${MOD}/actions.js`], rules: layer(['gpui-kit', 'gpui-base', './ui/*', './main.js'], 'actions change state: no drawing') },
];

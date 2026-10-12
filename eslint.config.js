// CivicConnect — static analysis (M3 §9 quality gates)
//
// Defect-catching rules only. No stylistic rules: formatting is left as the
// team wrote it, so this config produces no formatting diff. Every rule is an
// error, so `npm run lint` fails the CI build on any finding.

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['docs/**', 'extras/**', 'node_modules/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Loose equality hides type mistakes; `== null` stays allowed as the idiom
      // for "null or undefined".
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // A map/filter/reduce callback that forgets to return yields undefined.
      'array-callback-return': 'error',
      // `x === x` and `"${x}"` in a plain string are almost always slips.
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      // A loop whose body always exits after one pass is a logic error.
      'no-unreachable-loop': 'error',
      // Unused variables; a leading underscore marks a deliberately unused one
      // (Express error handlers must declare all four parameters).
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // Atlas Functions run as classic scripts with Atlas-provided globals, not as
  // ES modules under Node.
  {
    files: ['scripts/atlas/app/functions/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { context: 'readonly', exports: 'writable' },
    },
  },

  // mongosh scripts (DEC-010 restore check, PROC-001) run as classic scripts
  // with the shell's globals. DRY_RUN is injected with --eval.
  {
    files: ['scripts/backup/consistency-check.js', 'scripts/retention/proc-001-anonymise.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        db: 'readonly', print: 'readonly', printjson: 'readonly', quit: 'readonly',
        DRY_RUN: 'readonly',
      },
    },
  },
];

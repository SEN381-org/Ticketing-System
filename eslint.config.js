// CivicConnect — static analysis (M3 §9 quality gates)
//
// Defect-catching rules only. No stylistic rules: formatting is left as the
// team wrote it, so this config produces no formatting diff. Every rule is an
// error, so `npm run lint` fails the CI build on any finding.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: ['docs/**', 'extras/**', 'node_modules/**', 'client/dist/**', 'e2e/test-results/**', 'e2e/playwright-report/**'],
  },

  js.configs.recommended,

  // Rules and language level for every source file, server and client. Globals
  // are deliberately not set here: they differ by runtime and are set below, so
  // a client file is never given Node globals (and the server never given
  // browser ones) that would hide a mistake.
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
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

  // Node globals for the server, tests and scripts. client/ is excluded except
  // for its Vite config, which runs under Node, not in the browser.
  {
    files: ['**/*.js'],
    ignores: ['client/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['client/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // The browser client (client/src). Browser globals only. The react plugin is
  // registered with a single rule, jsx-uses-vars, so that a component used only
  // in JSX is not reported as unused while a genuinely unused import still is.
  // The JSX runtime is automatic, so no React import is needed.
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
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

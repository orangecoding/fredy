/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// eslint.config.js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/public/**', 'db/**', 'conf/**'],
  },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        Promise: 'readonly',
        fetch: 'readonly',
        describe: 'readonly',
        after: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Frontend-only rules.
    files: ['ui/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@douyinfe/semi-ui',
              message:
                'Use @douyinfe/semi-ui-19. Importing both ships two copies of the component library and two provider trees, so the second one silently ignores the locale.',
            },
          ],
          patterns: [
            {
              // Relative escapes out of ui/ only. A package subpath that happens to contain
              // "lib" (@douyinfe/semi-ui-19/lib/es/locale/...) is not what this is about.
              group: ['../**/lib/**'],
              message:
                'The frontend must not import from lib/. That code is server-side and may grow a Node built-in at any time, which breaks the Vite build far from the cause. Copy what you need into ui/src instead - see ui/src/services/finance/ for the pattern.',
            },
          ],
        },
      ],
    },
  },

  prettier,
];

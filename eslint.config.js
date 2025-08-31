// eslint.config.js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import react from 'eslint-plugin-react';
import babelParser from '@babel/eslint-parser';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      parser: babelParser,
      sourceType: 'module',
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
        Promise: 'readonly',
        fetch: 'readonly',
        describe: 'readonly',
        after: 'readonly',
        it: 'readonly',
      },
      parserOptions: {
        requireConfigFile: false,
      },
    },
    plugins: {
      react,
    },
    rules: {
      eqeqeq: [2, 'allow-null'],

      // Semantics / Performance impacting
      strict: 0,
      'no-redeclare': [2, { builtinGlobals: false }],
      'class-methods-use-this': 'off',

      // Style
      indent: ['off', 2],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      semi: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // React
      'jsx-quotes': ['error', 'prefer-double'],
      'react/display-name': 'off',
      'react/forbid-prop-types': 'off',
      'react/jsx-closing-bracket-location': 'off',
      'react/jsx-curly-spacing': 'off',
      'react/jsx-handler-names': [
        'off',
        {
          eventHandlerPrefix: 'handle',
          eventHandlerPropPrefix: 'on',
        },
      ],
      'react/jsx-indent-props': 'off',
      'react/jsx-key': 'off',
      'react/jsx-max-props-per-line': 'off',
      'react/jsx-no-bind': [
        'error',
        {
          ignoreRefs: true,
          allowArrowFunctions: true,
          allowBind: false,
        },
      ],
      'react/jsx-no-duplicate-props': ['error', { ignoreCase: true }],
      'react/jsx-no-literals': 'off',
      'react/jsx-no-undef': 'error',
      'react/jsx-pascal-case': [
        'error',
        {
          allowAllCaps: true,
          ignore: [],
        },
      ],
      'react/sort-prop-types': [
        'off',
        {
          ignoreCase: true,
          callbacksLast: false,
          requiredFirst: false,
        },
      ],
      'react/jsx-sort-prop-types': 'off',
      'react/jsx-sort-props': 'off',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-danger': 'warn',
      'react/no-deprecated': 'error',
      'react/no-did-mount-set-state': 'error',
      'react/no-did-update-set-state': 'warn',
      'react/no-direct-mutation-state': 'off',
      'react/no-is-mounted': 'error',
      'react/no-set-state': 'off',
      'react/no-string-refs': 'warn',
      'react/no-unknown-property': 'error',
      'react/prop-types': ['error', { ignore: [], customValidators: [], skipUndeclared: true }],
      'react/react-in-jsx-scope': 'error',
      'react/require-extension': 'off',
      'react/require-render-return': 'error',
      'react/self-closing-comp': 'warn',
      'react/sort-comp': 'off',
      'react/jsx-wrap-multilines': [
        'warn',
        {
          declaration: true,
          assignment: true,
          return: true,
        },
      ],
      'react/wrap-multilines': 'off',
      'react/jsx-first-prop-new-line': 'off',
      'react/jsx-equals-spacing': ['warn', 'never'],
      'react/jsx-no-target-blank': 'error',
      'react/jsx-filename-extension': ['error', { extensions: ['.jsx'] }],
      'react/jsx-no-comment-textnodes': 'error',
      'react/no-comment-textnodes': 'off',
      'react/no-render-return-value': 'error',
      'react/require-optimization': ['off', { allowDecorators: [] }],
      'react/no-find-dom-node': 'warn',
      'react/forbid-component-props': ['off', { forbid: [] }],
      'react/no-danger-with-children': 'error',
      'react/no-unused-prop-types': [
        'warn',
        {
          customValidators: [],
          skipShapeProps: true,
        },
      ],
      'react/style-prop-object': 'error',
      'react/no-children-prop': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];

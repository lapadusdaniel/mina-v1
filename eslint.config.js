import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.firebase', 'tmp']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(?:_|Icon$)',
        caughtErrors: 'none',
        varsIgnorePattern: '^[A-Z_]',
      }],
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['worker/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(?:_|Icon$)',
        caughtErrors: 'none',
        varsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
  {
    files: ['functions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { sourceType: 'commonjs' },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(?:_|Icon$)',
        caughtErrors: 'none',
        varsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(?:_|Icon$)',
        caughtErrors: 'none',
        varsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
  {
    files: ['scripts/qa-auth.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])

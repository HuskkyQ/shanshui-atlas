import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'outputs/**', 'previews/**', 'node_modules/**', 'tests/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.worker },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];

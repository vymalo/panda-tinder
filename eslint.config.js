import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['docs/**', '_site/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    // Browser code: the app and its styles are loaded as ES modules.
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Node code: the server and the tests.
    files: ['server.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      // Unused arguments are allowed when they document a signature or are
      // deliberately skipped, as long as they come last.
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];

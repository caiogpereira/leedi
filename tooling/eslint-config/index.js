import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** @type {import('typescript-eslint').ConfigArray} */
export const base = tseslint.config(...tseslint.configs.recommended, eslintConfigPrettier, {
  rules: {
    // Allow _-prefixed variables as intentionally unused (destructuring patterns, etc.)
    '@typescript-eslint/no-unused-vars': [
      'error',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // Ban cross-domain internal imports — only import from package public API
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@leedi/*/src/**'],
            message:
              'Cross-domain internal import forbidden — import from the package public API (@leedi/<name>) only',
          },
          {
            // Second guard: relative traversal that escapes a package boundary into
            // another package's internals (e.g. ../../agent/src/use-cases/...).
            // Bare-specifier ban above does not catch relative paths.
            regex: '^\\.\\./.*/src/',
            message:
              'Relative cross-package internal import forbidden — import from the package public API (@leedi/<name>) only',
          },
        ],
      },
    ],
    // Ban direct process.env access — use @leedi/config instead
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Use @leedi/config instead of process.env directly',
      },
    ],
  },
});

export default base;

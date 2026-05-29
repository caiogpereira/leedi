import { nodeConfig } from '@leedi/eslint-config/node.js';

export default [
  ...nodeConfig,
  {
    ignores: [
      'node_modules/**',
      '.turbo/**',
      'dist/**',
      '.next/**',
      '**/.next/**',
      '**/dist/**',
    ],
  },
];

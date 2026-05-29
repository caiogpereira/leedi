import { nodeConfig } from '@leedi/eslint-config/node.js';

export default [
  ...nodeConfig,
  {
    // Allow process.env access in this package — it is the one source of truth for env vars
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];

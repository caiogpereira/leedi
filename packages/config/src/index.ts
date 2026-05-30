import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEnv } from './validate.js';

export { schema } from './schema.js';
export type { Env } from './schema.js';
export { validateEnv } from './validate.js';

// Load root .env before validation — Next.js does this automatically; Hono/tsx does not.
// Path: packages/config/src → packages/config → packages → monorepo root
const _dir = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(_dir, '../../../.env'));
} catch {
  // .env absent in production/CI — env vars come from the host environment
}

const result = validateEnv(process.env);

if (!result.success) {
  process.stderr.write(result.message + '\n');
  process.exit(1);
}

export const env = result.env;

import { validateEnv } from './validate.js';

export { schema } from './schema.js';
export type { Env } from './schema.js';
export { validateEnv } from './validate.js';

const result = validateEnv(process.env);

if (!result.success) {
  process.stderr.write(result.message + '\n');
  process.exit(1);
}

export const env = result.env;

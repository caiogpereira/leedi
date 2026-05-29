import { schema, type Env } from './schema.js';

export type ValidationResult =
  | { success: true; env: Env }
  | { success: false; message: string };

export function validateEnv(rawEnv: NodeJS.ProcessEnv): ValidationResult {
  const parsed = schema.safeParse(rawEnv);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const fieldErrors = Object.entries(flattened.fieldErrors)
      .map(([field, errors]) => `  - ${field}: ${(errors ?? []).join(', ')}`)
      .join('\n');
    const formErrors = flattened.formErrors.join('\n');
    const message = [
      '❌ Environment validation failed. Missing or invalid variables:',
      fieldErrors,
      formErrors,
    ]
      .filter(Boolean)
      .join('\n');
    return { success: false, message };
  }

  return { success: true, env: Object.freeze(parsed.data) as Env };
}

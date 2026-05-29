import { z } from 'zod';

/**
 * Password policy (Story 2.1 AC): min 8 chars, at least one uppercase letter
 * and at least one number. Messages are pt-BR per project i18n policy.
 */
export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número');

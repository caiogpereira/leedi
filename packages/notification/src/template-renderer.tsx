import { render } from '@react-email/components';
import type { ComponentType } from 'react';

type AnyEmailComponent = ComponentType<Record<string, never>>;
type TemplateModule = { default: ComponentType<never> };
type TemplateLoader = () => Promise<TemplateModule>;

/**
 * Registry of email templates. Add new templates here as they are created
 * (e.g. 'password-reset', 'invitation' in later Epic 2 stories).
 *
 * Each template owns its own strict props type; the registry erases those types
 * (the caller passes a `Record<string, unknown>` from the email pipeline), so the
 * concrete props are validated by the template author, not at this boundary.
 */
const TEMPLATES: Record<string, TemplateLoader> = {
  'email-verification': () =>
    import('./templates/email-verification.js') as unknown as Promise<TemplateModule>,
  'password-reset': () =>
    import('./templates/password-reset.js') as unknown as Promise<TemplateModule>,
};

export async function renderTemplate(
  name: string,
  data: Record<string, unknown>
): Promise<string> {
  const loader = TEMPLATES[name];
  if (!loader) {
    throw new Error(`Unknown email template: ${name}`);
  }
  const mod = await loader();
  const Component = mod.default as AnyEmailComponent;
  return render(<Component {...(data as Record<string, never>)} />);
}

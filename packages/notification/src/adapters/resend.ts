import { Resend } from 'resend';
import { env } from '@leedi/config';

const resend = new Resend(env.RESEND_API_KEY);

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

// TODO(Story 2.x): make the `from` address configurable via env once the
// verified sending domain is provisioned in Resend.
const FROM_ADDRESS = 'Leedi <noreply@leedi.digital>';

export async function sendEmailViaResend(options: SendEmailOptions): Promise<void> {
  // Dynamic import keeps React Email rendering out of the module's eager graph.
  const { renderTemplate } = await import('../template-renderer.js');
  const html = await renderTemplate(options.template, options.data);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: options.to,
    subject: options.subject,
    html,
  });

  if (error) {
    // Never include recipient PII or tokens in the thrown message.
    throw new Error(`Failed to send email (template=${options.template}): ${error.message}`);
  }
}

import { sendEmail } from '@leedi/notification';

/**
 * Sends the email-verification message. Never logs `url` (contains a token).
 */
export async function sendVerificationEmail(email: string, url: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Verifique seu e-mail — Leedi',
    template: 'email-verification',
    data: { url },
  });
}

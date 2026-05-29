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

/**
 * Sends the password-reset message (Story 2.3). Never logs `url` (contains a token).
 */
export async function sendResetPasswordEmail(email: string, url: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Redefinição de senha — Leedi',
    template: 'password-reset',
    data: { url },
  });
}

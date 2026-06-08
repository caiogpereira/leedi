export { sendEmailViaResend as sendEmail } from './adapters/resend.js';
export type { SendEmailOptions } from './adapters/resend.js';

export type { NotificationPayload, NotificationPort } from './ports/notification-port.js';
export { createNotificationStub } from './ports/notification-port.js';

export { sendBillingNotification } from './use-cases/send-billing-notification.js';
export type { BillingNotificationType } from './use-cases/send-billing-notification.js';

export { sendNotification, sendNotificationToTenantRole } from './use-cases/send-notification.js';
export type { SendNotificationInput } from './use-cases/send-notification.js';

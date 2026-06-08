/**
 * Operator notification payload.
 *
 * `userId: 'all_operators'` is a convention — Epic 18 will resolve it to the actual
 * operator user IDs for the tenant. Until then, the stub logs the intent.
 */
export interface NotificationPayload {
  tipo: string;
  tenantId: string;
  userId: string | 'all_operators';
  titulo: string;
  corpo: string;
  canal?: 'push' | 'email' | 'both';
}

export interface NotificationPort {
  send(payload: NotificationPayload): Promise<void>;
}

/**
 * No-op stub — logs the notification intent without delivering it.
 * Epic 18 replaces this with a real push/email implementation.
 */
export function createNotificationStub(): NotificationPort {
  return {
    async send(payload: NotificationPayload): Promise<void> {
      console.info('[notification:stub]', payload);
    },
  };
}

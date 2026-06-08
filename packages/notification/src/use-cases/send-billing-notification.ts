import { createNotificationStub } from '../ports/notification-port.js';

export type BillingNotificationType =
  | 'conta_reativada'
  | 'conta_bloqueada_parcial'
  | 'conta_suspensa';

const MESSAGES: Record<BillingNotificationType, { titulo: string; corpo: string }> = {
  conta_reativada: {
    titulo: 'Pagamento confirmado. Sua conta está ativa!',
    corpo: 'Seu pagamento foi confirmado e sua conta está ativa.',
  },
  conta_bloqueada_parcial: {
    titulo: 'Pagamento atrasado. Regularize para continuar enviando mensagens.',
    corpo: 'Sua conta está com envios suspensos devido a inadimplência.',
  },
  conta_suspensa: {
    titulo: 'Conta suspensa por inadimplência. Seus dados estão preservados. Regularize para reativar.',
    corpo: 'Sua conta foi suspensa. Entre em contato para regularizar.',
  },
};

const stub = createNotificationStub();

export async function sendBillingNotification(
  tipo: BillingNotificationType,
  tenantId: string
): Promise<void> {
  const msg = MESSAGES[tipo];
  await stub.send({
    tipo,
    tenantId,
    userId: 'all_operators',
    titulo: msg.titulo,
    corpo: msg.corpo,
  });
}

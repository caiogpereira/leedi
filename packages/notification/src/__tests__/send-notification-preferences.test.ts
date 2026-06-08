import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@leedi/config', () => ({
  env: {
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    VAPID_SUBJECT: 'mailto:test@test.com',
    RESEND_API_KEY: 're_test',
  },
}));

vi.mock('@leedi/observability', () => ({
  captureException: vi.fn(),
}));

const mockSendPush = vi.fn();
vi.mock('../adapters/push-provider.js', () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

const mockSendEmail = vi.fn();
vi.mock('../adapters/resend.js', () => ({
  sendEmailViaResend: (...args: unknown[]) => mockSendEmail(...args),
}));

let lastUpdateStatus: string | null = null;
const mockWithServiceRole = vi.fn();

vi.mock('@leedi/db', () => ({
  withServiceRole: (...args: unknown[]) => mockWithServiceRole(...args),
  schema: {
    notifications: {},
    notificationPreferences: { tenantId: 'tenantId', userId: 'userId', eventos: 'eventos' },
    pushSubscriptions: { userId: 'userId', endpoint: 'endpoint' },
    memberships: { tenantId: 'tenantId', userId: 'userId', role: 'role' },
    users: { id: 'id', email: 'email' },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

function makePrefsSelectTx(eventos: Record<string, unknown>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ eventos }])),
        })),
      })),
    })),
  };
}

function makeNoPrefsSelectTx() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  };
}

function makeInsertTx() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'notif-1' }])),
      })),
    })),
  };
}

function makeSelectPushSubsTx(subs: unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(subs)),
      })),
    })),
  };
}

function makeSelectUserTx(email: string) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ email }])),
        })),
      })),
    })),
  };
}

function makeUpdateTx() {
  return {
    update: vi.fn(() => ({
      set: vi.fn((data: Record<string, string>) => ({
        where: vi.fn(() => {
          lastUpdateStatus = data['status'] ?? null;
          return Promise.resolve();
        }),
      })),
    })),
  };
}

function makeMembersSelectTx(members: Array<{ userId: string }>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(members)),
      })),
    })),
  };
}

import { sendNotification, sendNotificationToTenantRole } from '../use-cases/send-notification.js';

describe('sendNotification with preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdateStatus = null;
    mockSendEmail.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue([{ endpoint: 'ep1' }]);
  });

  it('skips push when user disabled push for this event type (AC#2)', async () => {
    // Pref: venda_aprovada.push = false → push skipped, email only
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makePrefsSelectTx({ venda_aprovada: { push: false, email: true } }))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('user@test.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'venda_aprovada',
      titulo: 'Nova venda',
      corpo: 'Test',
      canal: 'both',
    });

    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it('uses defaults (all ON) when no preference row exists (AC#5)', async () => {
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectPushSubsTx([{ endpoint: 'ep1', p256dh: 'k', auth: 'a' }]))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('user@test.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'alerta_uso',
      titulo: 'Alerta',
      corpo: 'Test',
      canal: 'both',
    });

    expect(mockSendPush).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
    expect(lastUpdateStatus).toBe('enviado');
  });

  it('skips entirely when both channels disabled for event', async () => {
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makePrefsSelectTx({ alerta_uso: { push: false, email: false } }))
      );

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'alerta_uso',
      titulo: 'Alerta',
      corpo: 'Test',
      canal: 'both',
    });

    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    // No insert called either (early return)
    expect(mockWithServiceRole).toHaveBeenCalledTimes(1);
  });
});

describe('sendNotificationToTenantRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdateStatus = null;
    mockSendEmail.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue([]);
  });

  it('sends to all eligible role members and skips viewers (AC#6)', async () => {
    // Members query returns operator + admin, sendNotification called per member
    mockWithServiceRole
      // members lookup
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeMembersSelectTx([{ userId: 'user-op' }, { userId: 'user-admin' }]))
      )
      // For user-op: prefs, insert, pushSubs (empty→email), userEmail, update
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeSelectPushSubsTx([])))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('op@test.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()))
      // For user-admin: prefs, insert, pushSubs (empty→email), userEmail, update
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeSelectPushSubsTx([])))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('admin@test.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    await sendNotificationToTenantRole({
      tenantId: 'tenant-1',
      roles: ['operator', 'admin'],
      tipo: 'lead_pediu_humano',
      titulo: 'Lead aguardando',
      corpo: 'João aguardando atendimento',
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});

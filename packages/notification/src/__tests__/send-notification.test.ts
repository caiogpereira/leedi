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

// Track what was passed to the update call.
let lastUpdateStatus: string | null = null;
let lastUpdateCanal: string | null = null;

const mockWithServiceRole = vi.fn();
vi.mock('@leedi/db', () => ({
  withServiceRole: (...args: unknown[]) => mockWithServiceRole(...args),
  schema: {
    notifications: {},
    notificationPreferences: { tenantId: 'tenantId', userId: 'userId', eventos: 'eventos' },
    pushSubscriptions: { userId: 'userId', endpoint: 'endpoint' },
    users: { id: 'id', email: 'email' },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

// Preferences lookup — returns empty (use defaults: all enabled)
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
        // push subs query does NOT call .limit() — returns array directly from .where()
        where: vi.fn(() => Promise.resolve(subs)),
      })),
    })),
  };
}

function makeSelectUserTx(email: string | undefined) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve(email ? [{ email }] : [])
          ),
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
          lastUpdateCanal = data['canal'] ?? null;
          return Promise.resolve();
        }),
      })),
    })),
  };
}

import { sendNotification } from '../use-cases/send-notification.js';

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdateStatus = null;
    lastUpdateCanal = null;
    mockSendEmail.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue([]);
  });

  it('falls back to email when canal=push and no subscriptions exist (AC#3)', async () => {
    // call 0: prefs, call 1: insert, call 2: no pushSubs, call 3: user email, call 4: update
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeSelectPushSubsTx([])))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('user@example.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'test_event',
      titulo: 'Test',
      corpo: 'Test body',
      canal: 'push',
    });

    expect(mockSendEmail).toHaveBeenCalled();
    expect(lastUpdateCanal).toBe('email');
    expect(lastUpdateStatus).toBe('enviado');
  });

  it('marks notification as falhou when all push sends fail', async () => {
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectPushSubsTx([{ endpoint: 'https://ep1', p256dh: 'k', auth: 'a' }]))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    mockSendPush.mockResolvedValue([{ endpoint: 'https://ep1', failed: true }]);

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'test_event',
      titulo: 'Test',
      corpo: 'Test body',
      canal: 'push',
    });

    expect(lastUpdateStatus).toBe('falhou');
  });

  it('marks notification as enviado when push sends succeed', async () => {
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectPushSubsTx([{ endpoint: 'https://ep1', p256dh: 'k', auth: 'a' }]))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    mockSendPush.mockResolvedValue([{ endpoint: 'https://ep1' }]);

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'test_event',
      titulo: 'Test',
      corpo: 'Test body',
      canal: 'push',
    });

    expect(lastUpdateStatus).toBe('enviado');
  });

  it('sends both push and email when canal=both', async () => {
    // call 0: prefs, call 1: insert, call 2: pushSubs, call 3: user email, call 4: update
    mockWithServiceRole
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeNoPrefsSelectTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeInsertTx()))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectPushSubsTx([{ endpoint: 'https://ep1', p256dh: 'k', auth: 'a' }]))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn(makeSelectUserTx('user@example.com'))
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(makeUpdateTx()));

    mockSendPush.mockResolvedValue([{ endpoint: 'https://ep1' }]);

    await sendNotification({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tipo: 'test_event',
      titulo: 'Test',
      corpo: 'Test body',
      canal: 'both',
    });

    expect(mockSendPush).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });
});

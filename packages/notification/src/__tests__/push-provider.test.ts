import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  deletedEndpoints: [] as string[],
  sendNotificationResult: { statusCode: 200 } as { statusCode: number },
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => {
      if (state.sendNotificationResult.statusCode === 410) {
        const err = new Error('Gone') as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      if (state.sendNotificationResult.statusCode !== 200) {
        const err = new Error('Push failed') as Error & { statusCode: number };
        err.statusCode = state.sendNotificationResult.statusCode;
        throw err;
      }
      return { statusCode: 200 };
    }),
  },
}));

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
  schema: {
    pushSubscriptions: { endpoint: 'endpoint' },
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

vi.mock('@leedi/observability', () => ({
  captureException: vi.fn(),
}));

vi.mock('@leedi/config', () => ({
  env: {
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    VAPID_SUBJECT: 'mailto:test@test.com',
  },
}));

function makeTx() {
  return {
    delete: vi.fn(() => ({
      where: vi.fn((cond: unknown) => {
        const endpoint = (cond as { b: string }).b;
        state.deletedEndpoints.push(endpoint);
        return Promise.resolve();
      }),
    })),
  };
}

import { sendPush } from '../adapters/push-provider.js';

describe('PushProvider.sendPush', () => {
  beforeEach(() => {
    state.deletedEndpoints = [];
    state.sendNotificationResult = { statusCode: 200 };
    vi.clearAllMocks();
  });

  it('deletes subscription from DB when push returns 410 Gone (AC#6)', async () => {
    state.sendNotificationResult = { statusCode: 410 };

    const results = await sendPush(
      [{ endpoint: 'https://ep1', p256dh: 'key1', auth: 'auth1' }],
      { title: 'Test', body: 'Body' }
    );

    expect(results[0]?.gone).toBe(true);
    expect(state.deletedEndpoints).toContain('https://ep1');
  });

  it('logs to Sentry and marks failed on non-410 errors (AC#7)', async () => {
    state.sendNotificationResult = { statusCode: 500 };
    const { captureException } = await import('@leedi/observability');

    const results = await sendPush(
      [{ endpoint: 'https://ep1', p256dh: 'key1', auth: 'auth1' }],
      { title: 'Test', body: 'Body' }
    );

    expect(results[0]?.failed).toBe(true);
    expect(captureException).toHaveBeenCalled();
    expect(state.deletedEndpoints).toHaveLength(0);
  });

  it('returns success result when push delivers successfully', async () => {
    const results = await sendPush(
      [{ endpoint: 'https://ep1', p256dh: 'key1', auth: 'auth1' }],
      { title: 'Test', body: 'Body' }
    );

    expect(results[0]?.failed).toBeUndefined();
    expect(results[0]?.gone).toBeUndefined();
  });
});

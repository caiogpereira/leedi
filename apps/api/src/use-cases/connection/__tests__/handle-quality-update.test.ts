import { describe, it, expect, vi, beforeEach } from 'vitest';

// The connection row returned by the select-before-update (tenantId + previous rating).
let selectRows: unknown[] = [];
const setSpy = vi.fn();
const pauseSpy = vi.fn(async () => ({ paused: 2 }));
const notifySpy = vi.fn(async () => undefined);

vi.mock('../../dispatch/pause-dispatches-for-quality.js', () => ({
  pauseDispatchesForQuality: pauseSpy,
}));

vi.mock('@leedi/notification', () => ({
  sendNotificationToTenantRole: notifySpy,
}));

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(selectRows) }) }),
      }),
      update: () => ({
        set: (v: unknown) => {
          setSpy(v);
          return { where: () => Promise.resolve(undefined) };
        },
      }),
    })
  ),
  schema: { whatsappConnections: { phoneNumberId: {}, qualityRating: {}, tenantId: {} } },
  eq: vi.fn(),
}));

beforeEach(() => {
  selectRows = [];
  setSpy.mockClear();
  pauseSpy.mockClear();
  notifySpy.mockClear();
});

describe('mapQualitySignal', () => {
  it('maps FLAGGED/LOW/RED to vermelho', async () => {
    const { mapQualitySignal } = await import('../handle-quality-update.js');
    expect(mapQualitySignal('FLAGGED')).toBe('vermelho');
    expect(mapQualitySignal('RED')).toBe('vermelho');
    expect(mapQualitySignal('LOW')).toBe('vermelho');
  });
  it('maps HIGH/GREEN to verde and MEDIUM/YELLOW to amarelo', async () => {
    const { mapQualitySignal } = await import('../handle-quality-update.js');
    expect(mapQualitySignal('GREEN')).toBe('verde');
    expect(mapQualitySignal('MEDIUM')).toBe('amarelo');
  });
  it('returns null for an unknown/benign signal', async () => {
    const { mapQualitySignal } = await import('../handle-quality-update.js');
    expect(mapQualitySignal('SOMETHING_ELSE')).toBeNull();
    expect(mapQualitySignal(undefined)).toBeNull();
  });
});

describe('handleQualityUpdate', () => {
  it('pauses dispatches and notifies when the rating turns vermelho', async () => {
    selectRows = [{ tenantId: 't1', previous: 'verde' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'p1', event: 'FLAGGED' });
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ qualityRating: 'vermelho' }));
    expect(pauseSpy).toHaveBeenCalledWith('t1');
    expect(result.pausedJobs).toBe(2);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'quality_vermelho' }));
  });

  it('does not pause when rating is verde', async () => {
    selectRows = [{ tenantId: 't1', previous: 'verde' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'p1', event: 'GREEN' });
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(result.rating).toBe('verde');
  });

  it('sends a restoration notification on recovery from vermelho to GREEN/YELLOW', async () => {
    selectRows = [{ tenantId: 't1', previous: 'vermelho' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    await handleQualityUpdate({ phoneNumberId: 'p1', event: 'GREEN' });
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'quality_restaurada' }));
  });

  it('leaves state untouched and stays silent on an unknown signal', async () => {
    selectRows = [{ tenantId: 't1', previous: 'verde' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'p1', event: 'WHATEVER' });
    expect(result.updated).toBe(false);
    expect(result.rating).toBeNull();
    expect(setSpy).not.toHaveBeenCalled();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('returns updated:false when no connection matches the phone number', async () => {
    selectRows = [];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'unknown', event: 'FLAGGED' });
    expect(result.updated).toBe(false);
  });
});

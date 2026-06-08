import { describe, it, expect, vi, beforeEach } from 'vitest';

let updateReturning: unknown[] = [];
const setSpy = vi.fn();
const pauseSpy = vi.fn(async () => ({ paused: 2 }));

vi.mock('../../dispatch/pause-dispatches-for-quality.js', () => ({
  pauseDispatchesForQuality: pauseSpy,
}));

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({
      update: () => ({
        set: (v: unknown) => {
          setSpy(v);
          return { where: () => ({ returning: () => Promise.resolve(updateReturning) }) };
        },
      }),
    })
  ),
  schema: { whatsappConnections: { phoneNumberId: {}, qualityRating: {}, tenantId: {} } },
  eq: vi.fn(),
}));

beforeEach(() => {
  updateReturning = [];
  setSpy.mockClear();
  pauseSpy.mockClear();
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
});

describe('handleQualityUpdate', () => {
  it('pauses dispatches when the rating turns vermelho', async () => {
    updateReturning = [{ tenantId: 't1' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'p1', event: 'FLAGGED' });
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ qualityRating: 'vermelho' }));
    expect(pauseSpy).toHaveBeenCalledWith('t1');
    expect(result.pausedJobs).toBe(2);
  });

  it('does not pause when rating is verde', async () => {
    updateReturning = [{ tenantId: 't1' }];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'p1', event: 'GREEN' });
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(result.rating).toBe('verde');
  });

  it('returns updated:false when no connection matches the phone number', async () => {
    updateReturning = [];
    const { handleQualityUpdate } = await import('../handle-quality-update.js');
    const result = await handleQualityUpdate({ phoneNumberId: 'unknown', event: 'FLAGGED' });
    expect(result.updated).toBe(false);
  });
});

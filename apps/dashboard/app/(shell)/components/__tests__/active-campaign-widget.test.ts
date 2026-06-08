import { describe, it, expect } from 'vitest';
import { daysRemaining } from '../active-campaign-widget.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

describe('daysRemaining', () => {
  it('returns null for null dataFim', () => {
    expect(daysRemaining(null)).toBeNull();
  });

  it('returns 0 for today (same day, rounding up)', () => {
    const now = new Date('2026-06-03T12:00:00Z').getTime();
    const dataFim = '2026-06-03T23:59:59Z';
    expect(daysRemaining(dataFim, now)).toBe(1); // ceil of ~0.5
  });

  it('returns 1 for tomorrow', () => {
    const now = new Date('2026-06-03T00:00:00Z').getTime();
    const dataFim = '2026-06-04T00:00:00Z';
    expect(daysRemaining(dataFim, now)).toBe(1);
  });

  it('returns positive number for future date', () => {
    const now = new Date('2026-06-03T00:00:00Z').getTime();
    const dataFim = '2026-06-10T00:00:00Z'; // 7 days ahead
    expect(daysRemaining(dataFim, now)).toBe(7);
  });

  it('returns negative number for past date (campaign expired)', () => {
    const now = new Date('2026-06-10T00:00:00Z').getTime();
    const dataFim = '2026-06-03T00:00:00Z'; // 7 days ago
    expect(daysRemaining(dataFim, now)).toBe(-7);
  });

  it('returns 0 for exactly today midnight (end of day)', () => {
    const now = new Date('2026-06-03T00:00:00Z').getTime();
    const dataFim = new Date(now).toISOString();
    expect(daysRemaining(dataFim, now)).toBe(0);
  });

  it('handles far future dates correctly', () => {
    const now = new Date('2026-06-03T00:00:00Z').getTime();
    const dataFim = '2026-12-31T00:00:00Z'; // ~210 days
    const result = daysRemaining(dataFim, now);
    expect(result).toBeGreaterThan(200);
    expect(result).toBeLessThan(215);
  });
});

import { describe, expect, it } from 'vitest';
import { mapQualityRating, mapMessagingTier } from '../adapters/meta-mappers.js';

describe('mapQualityRating', () => {
  it('maps Meta uppercase values to domain enums', () => {
    expect(mapQualityRating('GREEN')).toBe('verde');
    expect(mapQualityRating('YELLOW')).toBe('amarelo');
    expect(mapQualityRating('RED')).toBe('vermelho');
  });

  it('accepts already-domain values (idempotent)', () => {
    expect(mapQualityRating('verde')).toBe('verde');
    expect(mapQualityRating('amarelo')).toBe('amarelo');
    expect(mapQualityRating('vermelho')).toBe('vermelho');
  });

  it('is case-insensitive', () => {
    expect(mapQualityRating('green')).toBe('verde');
    expect(mapQualityRating('Red')).toBe('vermelho');
  });

  it('maps UNKNOWN and unexpected values to null (never the raw string)', () => {
    expect(mapQualityRating('UNKNOWN')).toBeNull();
    expect(mapQualityRating('PURPLE')).toBeNull();
    expect(mapQualityRating('')).toBeNull();
    expect(mapQualityRating(null)).toBeNull();
    expect(mapQualityRating(undefined)).toBeNull();
  });
});

describe('mapMessagingTier', () => {
  it('maps Meta TIER_* values to domain enums', () => {
    expect(mapMessagingTier('TIER_1K')).toBe('1k');
    expect(mapMessagingTier('TIER_10K')).toBe('10k');
    expect(mapMessagingTier('TIER_100K')).toBe('100k');
    expect(mapMessagingTier('TIER_UNLIMITED')).toBe('unlimited');
  });

  it('accepts already-domain values (idempotent)', () => {
    expect(mapMessagingTier('1k')).toBe('1k');
    expect(mapMessagingTier('unlimited')).toBe('unlimited');
  });

  it('is case-insensitive', () => {
    expect(mapMessagingTier('tier_10k')).toBe('10k');
  });

  it('maps lower Meta tiers and unexpected values to null', () => {
    // Meta also returns TIER_50 / TIER_250 which have no domain equivalent.
    expect(mapMessagingTier('TIER_50')).toBeNull();
    expect(mapMessagingTier('TIER_250')).toBeNull();
    expect(mapMessagingTier('500k')).toBeNull();
    expect(mapMessagingTier('')).toBeNull();
    expect(mapMessagingTier(null)).toBeNull();
    expect(mapMessagingTier(undefined)).toBeNull();
  });
});

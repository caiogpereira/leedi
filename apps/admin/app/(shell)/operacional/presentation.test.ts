import { describe, it, expect } from 'vitest';
import { marginEmphasis, netGrowthDisplay } from './presentation';

describe('marginEmphasis (margin badge thresholds)', () => {
  it('is green (good) above 50%', () => {
    expect(marginEmphasis(75)).toBe('good');
    expect(marginEmphasis(50.1)).toBe('good');
  });

  it('is yellow (warn) between 30% and 50% inclusive', () => {
    expect(marginEmphasis(50)).toBe('warn');
    expect(marginEmphasis(40)).toBe('warn');
    expect(marginEmphasis(30)).toBe('warn');
  });

  it('is red (danger) below 30%', () => {
    expect(marginEmphasis(29.9)).toBe('danger');
    expect(marginEmphasis(0)).toBe('danger');
    expect(marginEmphasis(-10)).toBe('danger');
  });
});

describe('netGrowthDisplay', () => {
  it('renders "+N" in green when positive', () => {
    expect(netGrowthDisplay(2)).toEqual({ text: '+2', emphasis: 'good' });
  });

  it('renders "-N" in red when negative', () => {
    expect(netGrowthDisplay(-3)).toEqual({ text: '-3', emphasis: 'danger' });
  });

  it('renders "0" in neutral gray when zero', () => {
    expect(netGrowthDisplay(0)).toEqual({ text: '0', emphasis: 'default' });
  });
});

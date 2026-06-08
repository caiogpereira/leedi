/**
 * Pure presentation helpers for the Operacional dashboard (Story 20.3 Task 4).
 * Extracted from the server component so the threshold/formatting rules are
 * unit-testable without rendering an async server component.
 */

export type Emphasis = 'default' | 'good' | 'warn' | 'danger';

/**
 * Margin badge colour by threshold (AC: margin green > 50%, yellow 30–50%, red < 30%).
 */
export function marginEmphasis(pct: number): Extract<Emphasis, 'good' | 'warn' | 'danger'> {
  if (pct > 50) return 'good';
  if (pct >= 30) return 'warn';
  return 'danger';
}

/**
 * Net-growth card display: "+N" (good/green), "-N" (danger/red, the sign comes
 * from the negative number itself), or "0" (default/neutral).
 */
export function netGrowthDisplay(netGrowth: number): { text: string; emphasis: Emphasis } {
  if (netGrowth > 0) return { text: `+${netGrowth}`, emphasis: 'good' };
  if (netGrowth < 0) return { text: String(netGrowth), emphasis: 'danger' };
  return { text: '0', emphasis: 'default' };
}

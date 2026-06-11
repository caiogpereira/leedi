import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  return { mockExecute };
});

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({ execute: mockExecute })
  ),
  schema: {},
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
}));

import { getTopObjections } from '../use-cases/get-top-objections.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FROM = new Date('2026-05-01');
const TO = new Date('2026-05-31');

describe('getTopObjections', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('groups by categoria, falls back to texto_objecao when categoria absent', async () => {
    mockExecute.mockResolvedValue([
      {
        label: 'Preço alto',
        count: 5,
        recent_instances: [
          { leadName: 'João', date: '2026-05-20T10:00:00Z', windowId: 'w1' },
          { leadName: 'Maria', date: '2026-05-18T10:00:00Z', windowId: 'w2' },
        ],
      },
      {
        label: 'Não tenho tempo',
        count: 3,
        recent_instances: [
          { leadName: 'Pedro', date: '2026-05-15T10:00:00Z', windowId: 'w3' },
        ],
      },
    ]);

    const result = await getTopObjections(TENANT_ID, FROM, TO);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.label).toBe('Preço alto');
    expect(result.items[0]!.count).toBe(5);
    expect(result.items[0]!.recentInstances).toHaveLength(2);
    expect(result.items[0]!.recentInstances[0]!.leadName).toBe('João');
  });

  it('returns empty array (not error) when no objection events in period', async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getTopObjections(TENANT_ID, FROM, TO);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('threads the default limit (10) into the SQL query', async () => {
    mockExecute.mockResolvedValue([]);

    await getTopObjections(TENANT_ID, FROM, TO);

    // The mocked `sql` tag returns { strings, values }; the interpolated values
    // are [from, to, limit], so the default limit must appear in the query args.
    const queryArg = mockExecute.mock.calls[0]![0] as { values: unknown[] };
    expect(queryArg.values).toContain(10);
  });

  it('threads a custom limit into the SQL query', async () => {
    mockExecute.mockResolvedValue([]);

    await getTopObjections(TENANT_ID, FROM, TO, 25);

    const queryArg = mockExecute.mock.calls[0]![0] as { values: unknown[] };
    expect(queryArg.values).toContain(25);
    expect(queryArg.values).not.toContain(10);
  });

  it('returns correct top 5 recent instances (capped by SQL subquery)', async () => {
    const instances = [
      { leadName: 'A', date: '2026-05-20T10:00:00Z', windowId: 'w1' },
      { leadName: 'B', date: '2026-05-19T10:00:00Z', windowId: 'w2' },
      { leadName: 'C', date: '2026-05-18T10:00:00Z', windowId: 'w3' },
      { leadName: 'D', date: '2026-05-17T10:00:00Z', windowId: 'w4' },
      { leadName: 'E', date: '2026-05-16T10:00:00Z', windowId: 'w5' },
    ];
    mockExecute.mockResolvedValue([
      { label: 'Preço', count: 7, recent_instances: instances },
    ]);

    const result = await getTopObjections(TENANT_ID, FROM, TO);

    expect(result.items[0]!.recentInstances).toHaveLength(5);
    // most recent first
    expect(result.items[0]!.recentInstances[0]!.leadName).toBe('A');
    expect(result.items[0]!.recentInstances[0]!.date).toBe('2026-05-20T10:00:00Z');
    expect(result.items[0]!.recentInstances[0]!.windowId).toBe('w1');
  });

  it('handles null recent_instances gracefully', async () => {
    mockExecute.mockResolvedValue([
      { label: 'Preço', count: 2, recent_instances: null },
    ]);

    const result = await getTopObjections(TENANT_ID, FROM, TO);
    expect(result.items[0]!.recentInstances).toEqual([]);
  });
});

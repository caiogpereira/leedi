import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEMPLATE_ID = 'aaa-bbb-ccc';
const META_TEMPLATE_ID = '999888777';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const EXISTING_TEMPLATE = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  nome: 'meu_template',
};

let updatedRows: unknown[] = [];
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('@leedi/db', () => {
  const withServiceRole = vi.fn((fn: (tx: unknown) => unknown) => {
    return fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([EXISTING_TEMPLATE]),
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => ({
          where: () => {
            updatedRows.push(values);
            return Promise.resolve([]);
          },
        }),
      }),
    });
  });

  return {
    withServiceRole,
    schema: { templates: { metaTemplateId: {}, id: {} } },
    eq: vi.fn(),
  };
});

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  updatedRows = [];
  vi.clearAllMocks();
});

describe('handleTemplateStatusUpdate', () => {
  it('updates status to aprovado and does NOT set motivoRejeicao', async () => {
    const { handleTemplateStatusUpdate } = await import('../handle-template-status-update.js');
    await handleTemplateStatusUpdate({
      metaTemplateId: META_TEMPLATE_ID,
      newStatus: 'APPROVED',
      reason: undefined,
      wabaId: 'waba-123',
    });

    expect(updatedRows).toHaveLength(1);
    const row = updatedRows[0] as Record<string, unknown>;
    expect(row.status).toBe('aprovado');
    expect(row.motivoRejeicao).toBeNull();
  });

  it('stores motivoRejeicao on rejection', async () => {
    const { handleTemplateStatusUpdate } = await import('../handle-template-status-update.js');
    await handleTemplateStatusUpdate({
      metaTemplateId: META_TEMPLATE_ID,
      newStatus: 'REJECTED',
      reason: 'TAG_CONTENT_VIOLATION',
      wabaId: 'waba-123',
    });

    const row = updatedRows[0] as Record<string, unknown>;
    expect(row.status).toBe('rejeitado');
    expect(row.motivoRejeicao).toBe('TAG_CONTENT_VIOLATION');
  });

  it('unknown meta_template_id logs warning and returns without throwing', async () => {
    const { withServiceRole } = await import('@leedi/db');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withServiceRole).mockImplementationOnce((fn: (tx: any) => any) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]), // not found
            }),
          }),
        }),
      })
    );

    const { handleTemplateStatusUpdate } = await import('../handle-template-status-update.js');
    await expect(
      handleTemplateStatusUpdate({
        metaTemplateId: 'unknown-id',
        newStatus: 'APPROVED',
        reason: undefined,
        wabaId: 'waba-123',
      })
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No template found for meta_template_id: unknown-id')
    );
    expect(updatedRows).toHaveLength(0);
  });

  it('maps DISABLED to rejeitado', async () => {
    const { handleTemplateStatusUpdate } = await import('../handle-template-status-update.js');
    await handleTemplateStatusUpdate({
      metaTemplateId: META_TEMPLATE_ID,
      newStatus: 'DISABLED',
      reason: undefined,
      wabaId: 'waba-123',
    });

    const row = updatedRows[0] as Record<string, unknown>;
    expect(row.status).toBe('rejeitado');
  });
});

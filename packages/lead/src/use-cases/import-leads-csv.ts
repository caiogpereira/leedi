import { withTenant, schema } from '@leedi/db';

/**
 * One pre-validated, pre-normalized row ready for insertion.
 * `telefone` MUST already be in E.164 form — normalization happens upstream
 * (in the CSV parser), not here.
 */
export interface ImportLeadsCsvRow {
  telefone: string;
  nome?: string | undefined;
  email?: string | undefined;
}

export interface ImportLeadsCsvInput {
  tenantId: string;
  rows: ImportLeadsCsvRow[];
}

export interface ImportLeadsCsvResult {
  inserted: number;
  duplicated: number;
  errors: number;
}

const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Bulk-inserts CSV-imported leads for a tenant.
 *
 * Rows are inserted in chunks of 100 inside a single withTenant transaction per
 * chunk, so RLS scopes every write to the caller's tenant. Duplicates are
 * resolved by the UNIQUE(tenant_id, telefone) constraint via
 * `.onConflictDoNothing()` (no named target — the composite unique handles it).
 *
 * `inserted` counts rows actually written (from RETURNING); `duplicated` is the
 * remainder of each chunk that hit the conflict. `errors` is always 0 here —
 * malformed rows are filtered out before this use case runs.
 *
 * LGPD: never log row contents; the caller logs counts only.
 */
export async function importLeadsCsv(
  input: ImportLeadsCsvInput
): Promise<ImportLeadsCsvResult> {
  const { tenantId, rows } = input;

  if (rows.length === 0) {
    return { inserted: 0, duplicated: 0, errors: 0 };
  }

  const now = new Date();
  let inserted = 0;
  let duplicated = 0;

  for (const group of chunk(rows, CHUNK_SIZE)) {
    const values = group.map((row) => ({
      tenantId,
      telefone: row.telefone,
      nome: row.nome ?? null,
      email: row.email ?? null,
      origem: 'csv_import',
      status: 'ativo' as const,
      temperatura: 'frio' as const,
      primeiraInteracao: now,
      ultimaInteracao: now,
      comprou: false,
      leadRecorrente: false,
      qualificacao: {},
    }));

    const insertedRows = await withTenant(tenantId, async (tx) =>
      tx
        .insert(schema.leads)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: schema.leads.id })
    );

    inserted += insertedRows.length;
    duplicated += group.length - insertedRows.length;
  }

  return { inserted, duplicated, errors: 0 };
}

import { withTenant, schema, eq, and } from '@leedi/db';

export interface AddLeadTagInput {
  tenantId: string;
  leadId: string;
  tag: string;
}

export interface AddLeadTagResult {
  id: string;
  tag: string;
  origemTag: 'manual';
  createdAt: Date;
}

/**
 * Adds a manual tag to a lead.
 *
 * The insert runs through withTenant so RLS scopes the write to the caller's
 * tenant; we also stamp `tenantId` explicitly so the row carries the scope used
 * by the triple-scoped delete in removeLeadTag.
 *
 * origemTag is always 'manual' here — agent-originated tags are written by a
 * different path. Returns the created row (with its server-generated id) so the
 * UI can reconcile an optimistic insert with the real id.
 *
 * Idempotent: the DB UNIQUE (tenant_id, lead_id, tag) constraint (migration 0023)
 * means re-adding an existing tag is a no-op — ON CONFLICT DO NOTHING skips the
 * insert and we return the pre-existing row instead of throwing.
 */
export async function addLeadTag(input: AddLeadTagInput): Promise<AddLeadTagResult> {
  const tag = input.tag.trim();

  const rows = await withTenant(input.tenantId, async (tx) => {
    const inserted = await tx
      .insert(schema.leadTags)
      .values({
        leadId: input.leadId,
        tenantId: input.tenantId,
        tag,
        origemTag: 'manual',
      })
      .onConflictDoNothing({
        target: [schema.leadTags.tenantId, schema.leadTags.leadId, schema.leadTags.tag],
      })
      .returning({
        id: schema.leadTags.id,
        tag: schema.leadTags.tag,
        createdAt: schema.leadTags.createdAt,
      });

    if (inserted[0]) return inserted;

    // Tag already exists for this lead — return the existing row (idempotent).
    return tx
      .select({
        id: schema.leadTags.id,
        tag: schema.leadTags.tag,
        createdAt: schema.leadTags.createdAt,
      })
      .from(schema.leadTags)
      .where(
        and(
          eq(schema.leadTags.tenantId, input.tenantId),
          eq(schema.leadTags.leadId, input.leadId),
          eq(schema.leadTags.tag, tag)
        )
      )
      .limit(1);
  });

  const created = rows[0];
  if (!created) {
    // Should not happen: insert-or-fetch always yields the row.
    throw new Error('Failed to insert or find lead tag.');
  }

  return {
    id: created.id,
    tag: created.tag,
    origemTag: 'manual',
    createdAt: created.createdAt,
  };
}

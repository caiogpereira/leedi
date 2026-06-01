import { withTenant, schema } from '@leedi/db';

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
 */
export async function addLeadTag(input: AddLeadTagInput): Promise<AddLeadTagResult> {
  const tag = input.tag.trim();

  const rows = await withTenant(input.tenantId, async (tx) =>
    tx
      .insert(schema.leadTags)
      .values({
        leadId: input.leadId,
        tenantId: input.tenantId,
        tag,
        origemTag: 'manual',
      })
      .returning({
        id: schema.leadTags.id,
        tag: schema.leadTags.tag,
        createdAt: schema.leadTags.createdAt,
      })
  );

  const created = rows[0];
  if (!created) {
    // Should not happen: an insert without a conflict target always returns a row.
    throw new Error('Failed to insert lead tag.');
  }

  return {
    id: created.id,
    tag: created.tag,
    origemTag: 'manual',
    createdAt: created.createdAt,
  };
}

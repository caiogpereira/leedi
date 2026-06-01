import { withTenant, schema, eq, and } from '@leedi/db';

export interface RemoveLeadTagInput {
  tenantId: string;
  leadId: string;
  tagId: string;
}

/**
 * Removes a tag from a lead.
 *
 * The delete runs through withTenant (RLS) and is additionally scoped to
 * id + lead_id + tenant_id as defense-in-depth: even with RLS off it cannot
 * touch a tag belonging to another lead or tenant. No-op if the row does not
 * exist (idempotent), so a double-click does not surface an error.
 */
export async function removeLeadTag(input: RemoveLeadTagInput): Promise<void> {
  await withTenant(input.tenantId, async (tx) => {
    await tx
      .delete(schema.leadTags)
      .where(
        and(
          eq(schema.leadTags.id, input.tagId),
          eq(schema.leadTags.leadId, input.leadId),
          eq(schema.leadTags.tenantId, input.tenantId)
        )
      );
  });
}

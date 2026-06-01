import { withTenant, schema, eq, and, isNull, sql } from '@leedi/db';

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

export interface ResolveConversationWindowInput {
  tenantId: string;
  leadId: string;
  connectionId: string;
  billable?: boolean | undefined;
  /** Injectable clock for deterministic tests. Defaults to `new Date()`. */
  nowFn?: (() => Date) | undefined;
}

export interface ConversationWindowResult {
  id: string;
  startedAt: Date;
  messageCount: number;
  billable: boolean;
}

/**
 * Resolves the active 24h conversation window for a lead, creating a new one
 * when none is open or when the open one has aged past 24h.
 *
 * The 24h freshness check runs in JS (against `nowFn`) rather than in the SELECT
 * WHERE clause on purpose: a stale-but-still-open window must be *closed*
 * (`ended_at = now()`) before a new one is opened, so it has to be selected
 * first. Filtering it out in SQL would leave it open forever.
 *
 * All steps run inside ONE withTenant transaction so RLS scopes every read/write
 * to the caller's tenant and the find→increment / find→close→create paths are
 * atomic.
 *
 * The message_count increment is a single SQL UPDATE
 * (`SET message_count = message_count + 1`) — never a read-modify-write — and
 * the returned count comes from the UPDATE's RETURNING so it is never stale.
 */
export async function resolveConversationWindow(
  input: ResolveConversationWindowInput
): Promise<ConversationWindowResult> {
  const { tenantId, leadId, connectionId } = input;
  const billable = input.billable ?? true;
  const now = input.nowFn?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - WINDOW_DURATION_MS);

  return withTenant(tenantId, async (tx) => {
    const [open] = await tx
      .select({
        id: schema.conversationWindows.id,
        startedAt: schema.conversationWindows.startedAt,
      })
      .from(schema.conversationWindows)
      .where(
        and(
          eq(schema.conversationWindows.leadId, leadId),
          eq(schema.conversationWindows.tenantId, tenantId),
          isNull(schema.conversationWindows.endedAt)
        )
      )
      .orderBy(sql`${schema.conversationWindows.startedAt} DESC`)
      .limit(1);

    // Fresh window (started within the last 24h): atomically bump the count.
    if (open && open.startedAt.getTime() > staleBefore.getTime()) {
      const [updated] = await tx
        .update(schema.conversationWindows)
        .set({ messageCount: sql`${schema.conversationWindows.messageCount} + 1` })
        .where(eq(schema.conversationWindows.id, open.id))
        .returning({
          id: schema.conversationWindows.id,
          startedAt: schema.conversationWindows.startedAt,
          messageCount: schema.conversationWindows.messageCount,
          billable: schema.conversationWindows.billable,
        });

      return {
        id: updated!.id,
        startedAt: updated!.startedAt,
        messageCount: updated!.messageCount,
        billable: updated!.billable,
      };
    }

    // Stale-but-open window: close it before opening a fresh one.
    if (open) {
      await tx
        .update(schema.conversationWindows)
        .set({ endedAt: now })
        .where(eq(schema.conversationWindows.id, open.id));
    }

    // No usable window: open a new one (counts the current message).
    const [created] = await tx
      .insert(schema.conversationWindows)
      .values({
        tenantId,
        leadId,
        connectionId,
        startedAt: now,
        messageCount: 1,
        billable,
      })
      .returning({
        id: schema.conversationWindows.id,
        startedAt: schema.conversationWindows.startedAt,
        messageCount: schema.conversationWindows.messageCount,
        billable: schema.conversationWindows.billable,
      });

    return {
      id: created!.id,
      startedAt: created!.startedAt,
      messageCount: created!.messageCount,
      billable: created!.billable,
    };
  });
}

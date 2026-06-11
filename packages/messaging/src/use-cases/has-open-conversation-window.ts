import { withTenant, schema, eq, and, isNull, sql } from '@leedi/db';

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

export interface HasOpenConversationWindowInput {
  tenantId: string;
  leadId: string;
  /** Injectable clock for deterministic tests. Defaults to `new Date()`. */
  nowFn?: (() => Date) | undefined;
}

/**
 * Read-only check: returns true when the lead already has a *fresh* (<24h) open
 * conversation window.
 *
 * Used to decide whether an inbound message would CREATE a new window (false) or
 * continue an existing one (true), so usage blocking (Story 16.3 AC#2/AC#7) only
 * stops NEW windows and never interrupts a conversation already in progress.
 *
 * Does NOT create or mutate anything (unlike resolveConversationWindow, which
 * opens a window + inbox assignment as a side effect) — safe to call before the
 * block decision.
 */
export async function hasOpenConversationWindow(
  input: HasOpenConversationWindowInput
): Promise<boolean> {
  const { tenantId, leadId } = input;
  const now = input.nowFn?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - WINDOW_DURATION_MS);

  return withTenant(tenantId, async (tx) => {
    const [open] = await tx
      .select({ startedAt: schema.conversationWindows.startedAt })
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

    return !!open && open.startedAt.getTime() > staleBefore.getTime();
  });
}

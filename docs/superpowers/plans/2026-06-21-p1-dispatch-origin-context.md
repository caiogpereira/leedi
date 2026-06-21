# P1 — Dispatch Origin Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a lead replies to a proactive dispatch (mass send or recovery), the sales agent knows which template/campaign/product originated the contact and converses accordingly — without breaking the prompt cache or organic-conversation behavior.

**Architecture:** Read-only, stateless prompt injection. At inbound-message time, `process-message` looks up the lead's most recent *sent* dispatch target (within a 48h window), resolves its template body + campaign + product, and appends a **second, uncached** block to the Anthropic `system` array. Block 1 (persona/method/product) stays byte-stable and cached cross-lead; block 2 carries the per-lead origin and states product precedence over any general active offer. No DB writes, no schema migration, no thread mutation.

**Tech Stack:** TypeScript, Drizzle ORM (`@leedi/db`), Vitest, Anthropic SDK (`system` param as a multi-block array with `cache_control`).

## Global Constraints

- **No schema migration.** P1 is pure read + prompt injection. (The repo's drizzle migration journal is desynced — avoid touching it.)
- **Code in English; UI/agent-facing copy in PT-BR** (the injected block text is PT-BR — it goes to Claude as Portuguese sales context).
- **Multi-tenant:** every DB read goes through `withTenant(tenantId, …)`; respect existing RLS conventions.
- **Cache discipline:** block 1 of the `system` array MUST stay byte-identical to today (its `cache_control: { type: 'ephemeral' }` breakpoint is at its end). Block 2 is appended *after* the breakpoint and carries NO `cache_control`.
- **Sandbox untouched:** the dispatch lookup runs ONLY in the main inbound path (`processMessage`), never in `loadAgentContext` (sandbox calls that) nor in `runSandboxMessage`.
- **Test discipline:** `getDispatchOrigin`'s query filters must be **mutation-proven** — dropping the status filter, dropping the 48h recency bound, or flipping the sort order must turn a test red. A mock that returns a fixed row regardless of query args is the trap to avoid (see prior fake-green sql-mock regressions in this repo).

---

## File Structure

- **Create** `packages/agent/src/use-cases/get-dispatch-origin.ts` — read-only lookup: lead → most-recent recent sent dispatch target → template/campaign/product. Returns `DispatchOrigin | null`.
- **Create** `packages/agent/src/use-cases/__tests__/get-dispatch-origin.test.ts` — mutation-proving unit tests for the query contract + job/rule path resolution.
- **Create** `packages/agent/src/utils/build-dispatch-context-block.ts` — pure builder: `DispatchOrigin | null` → system-block string (or `''`).
- **Create** `packages/agent/src/utils/__tests__/build-dispatch-context-block.test.ts` — pure-function tests (precedence copy, template body, null → empty).
- **Modify** `packages/agent/src/use-cases/process-message.ts` — call `getDispatchOrigin` in the main path, append block 2 to `system`, update the AC#2 cache comment.
- **Modify** `packages/agent/src/use-cases/__tests__/process-message.test.ts` — prove block 2 is injected when origin exists and absent when it doesn't.

**Interface contract (shared across tasks):**

```ts
// get-dispatch-origin.ts
export interface DispatchOrigin {
  templateNome: string;
  templateBody: string;        // raw componentes.body.text; may contain {{n}} — shown as-is
  campaignNome: string | null; // null for recovery (dispatch_rule) targets
  produtoNome: string | null;  // null when campaign has no produtoId or origin is rule-path
}
export function getDispatchOrigin(
  tenantId: string,
  leadId: string,
  now?: Date,                   // injectable for deterministic recency tests; defaults to new Date()
): Promise<DispatchOrigin | null>;

// build-dispatch-context-block.ts
export const DISPATCH_CONTEXT_MARKERS: { start: string; end: string };
export function buildDispatchContextBlock(origin: DispatchOrigin | null): string;
```

---

## Task 1: `getDispatchOrigin` read-only lookup

**Files:**
- Create: `packages/agent/src/use-cases/get-dispatch-origin.ts`
- Test: `packages/agent/src/use-cases/__tests__/get-dispatch-origin.test.ts`

**Interfaces:**
- Consumes: `@leedi/db` exports `withTenant, schema, eq, and, inArray, gte, desc`.
- Produces: `DispatchOrigin` interface + `getDispatchOrigin(tenantId, leadId, now?)` (signatures above). Task 2 and Task 3 depend on these names.

**Design notes (read before coding):**
- `dispatch_targets` links a lead to EITHER a `dispatch_job_id` (mass send / scheduled — has `campaign_id` + `template_id`) OR a `dispatch_rule_id` (recovery — has `template_id`, no campaign). Resolve template id + campaign id from whichever is set.
- Recency bound: `enviadoEm >= now - 48h`. The agent only runs inside a live 24h WhatsApp window and a dispatch being replied to was sent <24h before that reply, so 48h-from-now covers the real case while a >48h-old dispatch correctly falls outside (that reply opens a fresh, unrelated window) — organic conversations get `null`.
- Status filter: `IN ('enviado','entregue','respondido')` — i.e. a template was actually delivered. (Note: nothing in the codebase currently sets `'respondido'`; it's included for forward-compat — see Deferred findings.)
- Template body comes from `templates.componentes.body.text`. Shown **raw** (no variable substitution): dispatch sends `sendTemplate(…, [])` with no params, so sent mass templates are effectively variable-free; if a `{{n}}` slips through, showing it raw is harmless and avoids inventing param values we don't have.

- [ ] **Step 1: Write the failing tests**

Create `packages/agent/src/use-cases/__tests__/get-dispatch-origin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operator spies live at module scope so tests can assert the exact query contract.
const ops = vi.hoisted(() => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ _op: 'and', args })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ _op: 'inArray', a, b })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _op: 'gte', a, b })),
  desc: vi.fn((a: unknown) => ({ _op: 'desc', a })),
}));

// Per-table canned rows. Each test sets these; the fake tx returns rows by table.
const rows = vi.hoisted(() => ({
  dispatchTargets: [] as unknown[],
  dispatchJobs: [] as unknown[],
  dispatchRules: [] as unknown[],
  templates: [] as unknown[],
  campaigns: [] as unknown[],
  products: [] as unknown[],
}));

function makeFakeTx() {
  let table = '';
  const b: Record<string, (...a: unknown[]) => unknown> = {};
  b.select = () => b;
  b.from = (t: unknown) => {
    table = String((t as { _marker?: string })?._marker ?? '');
    return b;
  };
  b.where = () => b;
  b.orderBy = () => b;
  b.limit = () => (rows as Record<string, unknown[]>)[table] ?? [];
  return b;
}

vi.mock('@leedi/db', () => {
  const tag = (m: string) => ({ _marker: m });
  return {
    withTenant: async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn(makeFakeTx()),
    schema: {
      dispatchTargets: {
        ...tag('dispatchTargets'),
        tenantId: 'dispatchTargets.tenant_id',
        leadId: 'dispatchTargets.lead_id',
        status: 'dispatchTargets.status',
        enviadoEm: 'dispatchTargets.enviado_em',
        dispatchJobId: 'dispatchTargets.dispatch_job_id',
        dispatchRuleId: 'dispatchTargets.dispatch_rule_id',
      },
      dispatchJobs: { ...tag('dispatchJobs'), id: 'dispatchJobs.id', templateId: 'dispatchJobs.template_id', campaignId: 'dispatchJobs.campaign_id' },
      dispatchRules: { ...tag('dispatchRules'), id: 'dispatchRules.id', templateId: 'dispatchRules.template_id' },
      templates: { ...tag('templates'), id: 'templates.id', nome: 'templates.nome', componentes: 'templates.componentes' },
      campaigns: { ...tag('campaigns'), id: 'campaigns.id', nome: 'campaigns.nome', produtoId: 'campaigns.produto_id' },
      products: { ...tag('products'), id: 'products.id', nome: 'products.nome' },
    },
    eq: ops.eq,
    and: ops.and,
    inArray: ops.inArray,
    gte: ops.gte,
    desc: ops.desc,
  };
});

const TENANT = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';

function resetRows() {
  rows.dispatchTargets = [];
  rows.dispatchJobs = [];
  rows.dispatchRules = [];
  rows.templates = [];
  rows.campaigns = [];
  rows.products = [];
}

describe('getDispatchOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRows();
  });

  it('returns null when the lead has no qualifying dispatch target', async () => {
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toBeNull();
  });

  it('filters targets to delivered statuses (enviado/entregue/respondido)', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.inArray).toHaveBeenCalledWith(
      'dispatchTargets.status',
      ['enviado', 'entregue', 'respondido'],
    );
  });

  it('bounds the lookup to the last 48h relative to the injected now', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const now = new Date('2026-06-21T12:00:00.000Z');
    const expectedCutoff = new Date('2026-06-19T12:00:00.000Z'); // now - 48h
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD, now);
    const gteCall = ops.gte.mock.calls.find((c) => c[0] === 'dispatchTargets.enviado_em');
    expect(gteCall).toBeDefined();
    expect((gteCall![1] as Date).toISOString()).toBe(expectedCutoff.toISOString());
  });

  it('orders by enviadoEm DESC and takes the most recent (limit 1)', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.desc).toHaveBeenCalledWith('dispatchTargets.enviado_em');
  });

  it('scopes by tenant and lead', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.eq).toHaveBeenCalledWith('dispatchTargets.lead_id', LEAD);
    expect(ops.eq).toHaveBeenCalledWith('dispatchTargets.tenant_id', TENANT);
  });

  it('resolves campaign + product via the job path', async () => {
    rows.dispatchTargets = [{ dispatchJobId: 'job-1', dispatchRuleId: null }];
    rows.dispatchJobs = [{ templateId: 'tpl-1', campaignId: 'camp-1' }];
    rows.templates = [{ nome: 'Abertura Carrinho', componentes: { body: { text: 'Vagas abertas! {{1}}' } } }];
    rows.campaigns = [{ nome: 'Lançamento Junho', produtoId: 'prod-1' }];
    rows.products = [{ nome: 'Curso Alpha' }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toEqual({
      templateNome: 'Abertura Carrinho',
      templateBody: 'Vagas abertas! {{1}}',
      campaignNome: 'Lançamento Junho',
      produtoNome: 'Curso Alpha',
    });
  });

  it('resolves template-only context via the recovery (rule) path', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: 'rule-1' }];
    rows.dispatchRules = [{ templateId: 'tpl-2' }];
    rows.templates = [{ nome: 'Carrinho Abandonado', componentes: { body: { text: 'Esqueceu algo?' } } }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toEqual({
      templateNome: 'Carrinho Abandonado',
      templateBody: 'Esqueceu algo?',
      campaignNome: null,
      produtoNome: null,
    });
  });

  it('returns null when the resolved template no longer exists', async () => {
    rows.dispatchTargets = [{ dispatchJobId: 'job-1', dispatchRuleId: null }];
    rows.dispatchJobs = [{ templateId: 'tpl-x', campaignId: null }];
    rows.templates = []; // template deleted
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @leedi/agent test get-dispatch-origin`
Expected: FAIL — `Cannot find module '../get-dispatch-origin.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/agent/src/use-cases/get-dispatch-origin.ts`:

```ts
import { withTenant, schema, eq, and, inArray, gte, desc } from '@leedi/db';

/** Lookback window: a dispatch a lead is replying to was sent < this ago. */
const DISPATCH_ORIGIN_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/** A template was actually delivered (vs pendente/falhou/excluido). */
const DELIVERED_STATUSES = ['enviado', 'entregue', 'respondido'] as const;

export interface DispatchOrigin {
  templateNome: string;
  /** Raw componentes.body.text; may contain {{n}} placeholders — shown as-is. */
  templateBody: string;
  /** null for recovery (dispatch_rule) targets, which have no campaign. */
  campaignNome: string | null;
  /** null when the campaign has no produtoId or the origin is rule-path. */
  produtoNome: string | null;
}

/**
 * Resolves what proactive dispatch (if any) the lead is currently replying to, so
 * the agent's system prompt can carry that origin as context.
 *
 * Read-only. Picks the lead's most recent DELIVERED dispatch target within the last
 * 48h, then resolves its template (+ campaign + product for job-path targets, or
 * template-only for recovery rule-path targets). Returns null for organic
 * conversations (no recent dispatch) — leaving their behavior unchanged.
 *
 * `now` is injectable so the 48h recency bound is deterministically testable.
 */
export async function getDispatchOrigin(
  tenantId: string,
  leadId: string,
  now: Date = new Date(),
): Promise<DispatchOrigin | null> {
  const cutoff = new Date(now.getTime() - DISPATCH_ORIGIN_LOOKBACK_MS);

  return withTenant(tenantId, async (tx) => {
    const [target] = await tx
      .select({
        dispatchJobId: schema.dispatchTargets.dispatchJobId,
        dispatchRuleId: schema.dispatchTargets.dispatchRuleId,
      })
      .from(schema.dispatchTargets)
      .where(
        and(
          eq(schema.dispatchTargets.tenantId, tenantId),
          eq(schema.dispatchTargets.leadId, leadId),
          inArray(schema.dispatchTargets.status, [...DELIVERED_STATUSES]),
          gte(schema.dispatchTargets.enviadoEm, cutoff),
        ),
      )
      .orderBy(desc(schema.dispatchTargets.enviadoEm))
      .limit(1);

    if (!target) return null;

    // Resolve template + campaign from whichever origin the target carries.
    let templateId: string | null = null;
    let campaignId: string | null = null;

    if (target.dispatchJobId) {
      const [job] = await tx
        .select({
          templateId: schema.dispatchJobs.templateId,
          campaignId: schema.dispatchJobs.campaignId,
        })
        .from(schema.dispatchJobs)
        .where(eq(schema.dispatchJobs.id, target.dispatchJobId))
        .limit(1);
      templateId = job?.templateId ?? null;
      campaignId = job?.campaignId ?? null;
    } else if (target.dispatchRuleId) {
      const [rule] = await tx
        .select({ templateId: schema.dispatchRules.templateId })
        .from(schema.dispatchRules)
        .where(eq(schema.dispatchRules.id, target.dispatchRuleId))
        .limit(1);
      templateId = rule?.templateId ?? null;
    }

    if (!templateId) return null;

    const [template] = await tx
      .select({ nome: schema.templates.nome, componentes: schema.templates.componentes })
      .from(schema.templates)
      .where(eq(schema.templates.id, templateId))
      .limit(1);
    if (!template) return null;

    let campaignNome: string | null = null;
    let produtoNome: string | null = null;

    if (campaignId) {
      const [campaign] = await tx
        .select({ nome: schema.campaigns.nome, produtoId: schema.campaigns.produtoId })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, campaignId))
        .limit(1);
      campaignNome = campaign?.nome ?? null;

      if (campaign?.produtoId) {
        const [product] = await tx
          .select({ nome: schema.products.nome })
          .from(schema.products)
          .where(eq(schema.products.id, campaign.produtoId))
          .limit(1);
        produtoNome = product?.nome ?? null;
      }
    }

    return {
      templateNome: template.nome,
      templateBody: template.componentes?.body?.text ?? '',
      campaignNome,
      produtoNome,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @leedi/agent test get-dispatch-origin`
Expected: PASS (8 tests).

- [ ] **Step 5: Mutation check (do not skip)**

Temporarily delete the `inArray(...)` line, re-run — the "filters targets to delivered statuses" test MUST fail. Restore it. Temporarily delete the `gte(...)` line — "bounds the lookup to the last 48h" MUST fail. Restore. Change `desc(` to `asc(` (import `asc` from `@leedi/db`) — "orders by enviadoEm DESC" MUST fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/use-cases/get-dispatch-origin.ts packages/agent/src/use-cases/__tests__/get-dispatch-origin.test.ts
git commit -m "feat(agent): getDispatchOrigin — resolve the dispatch a lead is replying to (P1-5)"
```

---

## Task 2: `buildDispatchContextBlock` pure builder

**Files:**
- Create: `packages/agent/src/utils/build-dispatch-context-block.ts`
- Test: `packages/agent/src/utils/__tests__/build-dispatch-context-block.test.ts`

**Interfaces:**
- Consumes: `DispatchOrigin` type from `../use-cases/get-dispatch-origin.js` (Task 1).
- Produces: `DISPATCH_CONTEXT_MARKERS` + `buildDispatchContextBlock(origin)` → string. Task 3 appends the returned string as `system` block 2 when non-empty.

**Design notes:**
- Returns `''` when `origin` is null → caller appends nothing.
- When a product is known, the block states **precedence** over any general active offer named in block 1 — this is the half of the AC that changes behavior. Without it, block 1 ("Produto/oferta ativa: Z") and block 2 ("contacted about Y") would name two offers with no tiebreaker.
- The template body is wrapped so the agent can read the literal message the lead received.

- [ ] **Step 1: Write the failing tests**

Create `packages/agent/src/utils/__tests__/build-dispatch-context-block.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildDispatchContextBlock,
  DISPATCH_CONTEXT_MARKERS,
} from '../build-dispatch-context-block.js';

describe('buildDispatchContextBlock', () => {
  it('returns an empty string for null origin (organic conversation)', () => {
    expect(buildDispatchContextBlock(null)).toBe('');
  });

  it('wraps the block in stable markers', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'T',
      templateBody: 'oi',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out.startsWith(DISPATCH_CONTEXT_MARKERS.start)).toBe(true);
    expect(out.endsWith(DISPATCH_CONTEXT_MARKERS.end)).toBe(true);
  });

  it('states product precedence over the general active offer when a product is known', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Abertura',
      templateBody: 'Vagas abertas!',
      campaignNome: 'Lançamento Junho',
      produtoNome: 'Curso Alpha',
    });
    expect(out).toContain('Curso Alpha');
    expect(out).toContain('Lançamento Junho');
    expect(out.toLowerCase()).toContain('priorize'); // precedence instruction present
  });

  it('includes the literal template body the lead received', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Abertura',
      templateBody: 'Vagas abertas! Garanta a sua.',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out).toContain('Vagas abertas! Garanta a sua.');
  });

  it('omits product precedence wording when no product is known (rule path)', () => {
    const out = buildDispatchContextBlock({
      templateNome: 'Carrinho Abandonado',
      templateBody: 'Esqueceu algo?',
      campaignNome: null,
      produtoNome: null,
    });
    expect(out.toLowerCase()).not.toContain('priorize');
    expect(out).toContain('Esqueceu algo?');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @leedi/agent test build-dispatch-context-block`
Expected: FAIL — `Cannot find module '../build-dispatch-context-block.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/agent/src/utils/build-dispatch-context-block.ts`:

```ts
import type { DispatchOrigin } from '../use-cases/get-dispatch-origin.js';

/** Stable wrapper markers (consistent with build-system-prompt's block markers). */
export const DISPATCH_CONTEXT_MARKERS = {
  start: '[DISPATCH_ORIGIN_BLOCK]',
  end: '[/DISPATCH_ORIGIN_BLOCK]',
} as const;

/**
 * Builds the per-lead "dispatch origin" system block (PT-BR), appended AFTER the
 * cached prompt prefix. Returns '' for organic conversations (null origin) so the
 * caller appends nothing.
 *
 * When a product is known, the block asserts precedence over any general active
 * offer named in the cached PRODUCT_BLOCK — otherwise the agent would see two
 * offers with no tiebreaker.
 */
export function buildDispatchContextBlock(origin: DispatchOrigin | null): string {
  if (!origin) return '';

  const lines: string[] = [
    'Este lead chegou respondendo a um disparo (mensagem proativa) que enviamos.',
  ];

  if (origin.campaignNome) {
    lines.push(`Campanha de origem: ${origin.campaignNome}.`);
  }

  if (origin.produtoNome) {
    lines.push(
      `O lead foi contatado especificamente sobre a oferta "${origin.produtoNome}". ` +
        'Priorize esta oferta sobre qualquer oferta ativa geral mencionada acima.',
    );
  }

  if (origin.templateBody.trim()) {
    lines.push('', 'Mensagem que enviamos ao lead:', `"""${origin.templateBody.trim()}"""`);
  }

  lines.push(
    '',
    'Use este contexto para entender ao que o lead está respondendo e conduza a conversa de acordo.',
  );

  return `${DISPATCH_CONTEXT_MARKERS.start}\n${lines.join('\n')}\n${DISPATCH_CONTEXT_MARKERS.end}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @leedi/agent test build-dispatch-context-block`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/utils/build-dispatch-context-block.ts packages/agent/src/utils/__tests__/build-dispatch-context-block.test.ts
git commit -m "feat(agent): buildDispatchContextBlock — per-lead dispatch origin prompt block (P1-5)"
```

---

## Task 3: Inject the dispatch context block into `process-message`

**Files:**
- Modify: `packages/agent/src/use-cases/process-message.ts`
- Modify: `packages/agent/src/use-cases/__tests__/process-message.test.ts`

**Interfaces:**
- Consumes: `getDispatchOrigin` (Task 1), `buildDispatchContextBlock` (Task 2).
- Produces: a `system` array that is `[block1(cached)]` for organic conversations and `[block1(cached), block2(uncached)]` when the lead is replying to a recent dispatch.

**Design notes:**
- Inject in the MAIN path only (`processMessage`), right after `systemPromptText` is built and before `system` is assembled. `runSandboxMessage` is untouched.
- Block 2 carries NO `cache_control` — so block 1's cache hit is preserved regardless of what follows it.

- [ ] **Step 1: Add the failing test cases**

In `packages/agent/src/use-cases/__tests__/process-message.test.ts`, add a mock for the new module near the other `vi.mock` calls (top of file, after the `@leedi/agent-memory` mock):

```ts
// Default to null (organic) at the source so the file-wide hoisted mock never leaks
// a non-null impl into other tests — vi.clearAllMocks() clears calls, NOT impls, and
// this removes any dependence on test execution order.
const dispatchOriginMock = vi.hoisted(() => ({
  getDispatchOrigin: vi.fn().mockResolvedValue(null),
}));
vi.mock('../get-dispatch-origin.js', () => ({
  getDispatchOrigin: dispatchOriginMock.getDispatchOrigin,
}));
```

Then add the `describe` block below at the end of the file. It reuses the file's existing module-scope helpers — `baseInput` (a plain object), `assistantTextResponse(text)`, and `makeRedis()` — and reads the `system` argument off the captured `create` spy. (`processMessage` is already imported at the top of the file; the `await import` inside the happy-path tests is not used — call `processMessage` directly.)

```ts
describe('processMessage — dispatch origin injection', () => {
  // The top-level beforeEach already resets dbState + mem mocks. Nested beforeEach
  // runs after it, so default the dispatch-origin lookup to null (organic) here.
  beforeEach(() => {
    dispatchOriginMock.getDispatchOrigin.mockResolvedValue(null);
  });

  function makeDeps(create: ReturnType<typeof vi.fn>): ProcessMessageDeps {
    return {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'meta-1' }) }),
      sleep: async () => {},
    };
  }

  it('injects a second uncached system block when the lead replies to a dispatch', async () => {
    dispatchOriginMock.getDispatchOrigin.mockResolvedValue({
      templateNome: 'Abertura',
      templateBody: 'Vagas abertas!',
      campaignNome: 'Lançamento Junho',
      produtoNome: 'Curso Alpha',
    });
    const create = vi.fn(async () => assistantTextResponse('oi!'));
    await processMessage(baseInput, makeDeps(create));

    const system = create.mock.calls[0]![0].system as Array<Record<string, unknown>>;
    expect(system).toHaveLength(2);
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[1]!.cache_control).toBeUndefined(); // block 2 is uncached
    expect(system[1]!.text).toContain('Curso Alpha');
  });

  it('passes a single cached system block for organic conversations (no dispatch)', async () => {
    dispatchOriginMock.getDispatchOrigin.mockResolvedValue(null);
    const create = vi.fn(async () => assistantTextResponse('oi!'));
    await processMessage(baseInput, makeDeps(create));

    const system = create.mock.calls[0]![0].system as Array<Record<string, unknown>>;
    expect(system).toHaveLength(1);
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
  });
});
```

> Implementer note: the explicit `vi.mock('../get-dispatch-origin.js', …)` is required — without it `getDispatchOrigin` would run against the file's `@leedi/db` table mock, which has no `dispatchTargets`/`dispatchJobs`/etc. entries and would throw on `schema.dispatchTargets.tenantId`. Mocking the module keeps these tests (and the pre-existing happy-path tests) off the dispatch tables entirely.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @leedi/agent test process-message`
Expected: FAIL — `system` has length 1 (or `getDispatchOrigin` undefined) because the injection isn't wired yet.

- [ ] **Step 3: Wire the injection**

In `packages/agent/src/use-cases/process-message.ts`:

(a) Add imports near the other local imports (after the `build-system-prompt` import block):

```ts
import { getDispatchOrigin } from './get-dispatch-origin.js';
import { buildDispatchContextBlock } from '../utils/build-dispatch-context-block.js';
```

(b) Replace the existing `system` assembly. Find:

```ts
    // AC#2: the ENTIRE system prompt is per-message-stable (derived from
    // config/method/product). One cache breakpoint on the single stable block.
    // The variable user message goes in `messages`, never in `system`.
    const system = [
      { type: 'text' as const, text: systemPromptText, cache_control: { type: 'ephemeral' as const } },
    ];
```

Replace with:

```ts
    // AC#2: block 1 (persona/method/product) is per-message-stable and cached —
    // one cache breakpoint at its end. Block 2 (P1-5) carries the per-lead dispatch
    // origin: it varies per lead and is INTENTIONALLY uncached. Appending an
    // uncached block AFTER the breakpoint does not affect block 1's cache hit.
    // The variable user message stays in `messages`, never in `system`.
    const dispatchOrigin = await getDispatchOrigin(tenantId, leadId);
    const dispatchBlock = buildDispatchContextBlock(dispatchOrigin);
    const system = [
      { type: 'text' as const, text: systemPromptText, cache_control: { type: 'ephemeral' as const } },
      ...(dispatchBlock
        ? [{ type: 'text' as const, text: dispatchBlock }]
        : []),
    ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @leedi/agent test process-message`
Expected: PASS — both new tests plus all pre-existing process-message tests.

- [ ] **Step 5: Run the full agent suite + typecheck**

Run: `pnpm --filter @leedi/agent test && pnpm --filter @leedi/agent typecheck`
Expected: all green, 0 type errors. (If `typecheck` is not a per-package script, run the repo's root typecheck.)

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/use-cases/process-message.ts packages/agent/src/use-cases/__tests__/process-message.test.ts
git commit -m "feat(agent): inject dispatch-origin context block into the sales prompt (P1-5)"
```

---

## Acceptance Criteria (refined from spec P1-5)

- When a lead replies within 48h of a delivered dispatch, the agent's `system` array includes a second block naming the originating template (its body), campaign, and product, with explicit precedence for that product over the general active offer. ✅ Tasks 1–3
- Conversations with no recent dispatch are unchanged: a single cached `system` block, no extra DB-driven prompt content. ✅ Task 3 (null origin → `''` → not appended)
- Block 1 remains byte-stable and cached cross-lead; block 2 is uncached. ✅ Task 3
- Recovery (dispatch_rule) origins surface template context even without a campaign/product. ✅ Tasks 1–2
- No schema migration; sandbox/playground path untouched. ✅ Global constraints

## Deferred findings (NOT P1 scope — record, don't implement)

- **Dead `respondido` enum.** Nothing in the codebase sets `dispatch_targets.status = 'respondido'`, yet `apps/api/src/jobs/dispatch-recovery-target.ts:37` filters it out when selecting recovery targets. A lead who replied to a dispatch stays `enviado`, so they can be re-targeted for recovery. Closing the loop (mark target `respondido` on inbound reply) is a separate, latent fix — out of P1's read-only scope.
- **Placeholder active product (`process-message.ts` ~line 729).** `loadAgentContext` still selects "first active `principal`" as the cached product block regardless of campaign. P1 resolves the contradiction at the prompt level (block 2 precedence) rather than fixing the placeholder selection (which is cached cross-lead and shared with the sandbox path). A real campaign-scoped product selection in block 1 is a larger change tied to P0-3 follow-up.
- **Exact origin match via WhatsApp reply context (precision lever, not built).** `dispatch_targets.wamid` is already stored, and WhatsApp inbound replies carry `context.id` = the quoted message's wamid. Extracting `context` in `webhook-meta.ts` and matching it to a target's `wamid` would give an *exact* origin (sidestepping the 48h-most-recent heuristic's wrong-campaign edge case when a lead is in two campaigns and replies to the older one). The webhook doesn't read `context` today and most users type rather than quote-reply, so it's not worth the complexity now — recorded as a strictly-more-precise future refinement.
- **PL item (live behavioral verification).** The automated tests mock `anthropic.messages.create`, so they prove block 2 is assembled and passed — NOT that the agent actually references the originating product/campaign when a lead replies (the real AC). Per this repo's "mocked tests are blind" pattern (cf. PL-16 smoke-e2e), add a pre-launch check: reply to a real dispatch and confirm the agent references the originating product/campaign in its response.

## Self-Review

- **Spec coverage:** P1-5's two halves — (1) "agent knows which template/campaign/product originated the conversation" → Tasks 1+2+3; (2) "converses accordingly / organic unchanged" → precedence copy (Task 2) + null-origin no-op (Task 3). Recovery path covered. No migration (spec is read-only correction). ✅
- **Placeholder scan:** every step has concrete code/commands; no TBD/TODO in deliverables. ✅
- **Type consistency:** `DispatchOrigin` fields (`templateNome`, `templateBody`, `campaignNome`, `produtoNome`) are identical across Tasks 1, 2, 3; `getDispatchOrigin(tenantId, leadId, now?)` and `buildDispatchContextBlock(origin)` signatures match every call site. ✅

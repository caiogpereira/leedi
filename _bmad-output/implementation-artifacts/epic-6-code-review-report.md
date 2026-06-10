# Epic 6 — Code Review Report

- **Epic:** 6 — Product Knowledge Base & Sales Methods
- **Stories reviewed:** 6.1 → 6.4 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-10
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session adversarial implementation-vs-spec audit at **current working
  tree**, playing all three reviewer layers inline (Blind Hunter / Edge Case Hunter /
  Acceptance Auditor). Each story's File List was opened on disk and audited against its
  ACs + `epics.md`. Runnable suites were **executed**, not merely read; every finding was
  **fixed and re-run/re-typechecked green** in this session.

> **Method note — degraded "Blind Hunter" lens.** One reviewer who had already read the
> specs played all three layers, so nothing was reviewed truly *cold*. The Epic 6 code is
> already committed (stories were in `review`, not uncommitted), so the audit is
> **spec → claim → code → test**, story by story, scoped to each story's File List, rather
> than a commit-scoped diff.

---

## 1. Verdict: 🟢 Ship-ready after 7 fixes (all applied & verified this session)

No production-blocking *logic* defect, but the dashboard had a **HIGH** build break: the
product-detail material UI (the whole point of Story 6.2) imported `ArgumentList` through a
`@/` path alias that is **not configured anywhere in the repo**, so it failed to typecheck
and would fail `next build`. That plus 4 typecheck errors, a vacuous test, and two
claimed-but-missing test files (F7) were fixed.

| Story | Summary | Outcome |
|-------|---------|---------|
| **6.1** Product catalog CRUD | Schema §6.6 complete; `products` + `knowledge_base` in one migration `0007`, RLS ENABLE+FORCE + `tenant_isolation` policy + `set_updated_at` triggers on both; thin Hono router; `link_checkout` validated as URL with the exact AC#3 message; `getActiveOffers` returns full shape. `CreateProductInput` type-modeling fix (F4). | ✅ done |
| **6.2** Sales arguments / differentials / social proofs | Material tabs, `ArgumentList` (add/edit/delete/DnD reorder + ✨ AI improve), wholesale jsonb replace endpoints, improve-text extended with knowledge contexts (Haiku). **Broken `@/` import broke the build (F1)** + reorder type hole (F3) → fixed. | ✅ done |
| **6.3** FAQ & objection-counter library | CRUD + soft-delete (`ativo=false`) only, `searchKnowledgeBase` V1 keyword/ILIKE (embedding deferred), categoria filter + selector `preco\|tempo\|capacidade\|outros`, exact toast copy. Route typecheck fix (F5) + shared test fix (F2). | ✅ done |
| **6.4** Sales methods seed & selection | `sales_methods` migration `0008` (no RLS / no `updated_at`, correct per §6.7), `tenants.config` jsonb added same migration, idempotent seed of 4 global methods, `GET /api/sales-methods`, radio-card selector. No code defect; doc drift fixed. | ✅ done |

---

## 2. Findings & fixes

### F1 — HIGH · Dashboard build break: `@/` alias not configured (Story 6.2)
`apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx` imported
`import { ArgumentList } from "@/components/knowledge/ArgumentList"`. The `@/` alias is **not
defined** in `apps/dashboard/tsconfig.json` nor the shared `tooling/tsconfig/nextjs.json`
(no `paths`/`baseUrl`), and this was the **only** `@/` import in the entire repo — every
other dashboard file imports components relatively. Result: `TS2307 Cannot find module`, and
the product-detail material sections (Story 6.2 AC#1–#5) would not compile/build.
**Fix:** switched to the repo-consistent relative import
`../../../../../components/knowledge/ArgumentList`. → dashboard no longer reports any Epic 6
error.

### F2 — HIGH (test correctness) · Vacuous `toThrow(undefined)` (Story 6.3/6.2 shared test)
`update-product-arguments.test.ts` imported `ProductValidationError` from
`../update-product-arguments.js`, which does **not** export it (it's defined in
`create-product.js`). The named import resolved to `undefined`, so the "rejects empty string
items" assertion `rejects.toThrow(undefined)` passed **vacuously** — it asserted nothing.
**Fix:** import `ProductValidationError` from `create-product.js`; the test now genuinely
asserts the validation error type. (Also surfaced as a `TS2339` typecheck error.)

### F3 — MED · Reorder type hole in `ArgumentList` (Story 6.2)
`const [moved] = next.splice(dragIndex, 1)` is `string | undefined` under
`noUncheckedIndexedAccess`; it was passed straight into `next.splice(dropIndex, 0, moved)`
(`TS2345`). **Fix:** guard `if (moved === undefined) return;` (clears drag state).

### F4 — MED · `CreateProductInput` modeled on output type (Story 6.1)
`CreateProductInput = z.infer<…>` made `tipo` **required** (it has a schema default), so any
caller omitting `tipo` failed typecheck — including the use-case unit tests (`TS2345` ×4).
**Fix:** `z.input<…>` so callers may omit defaulted fields; internal `safeParse` still yields
the fully-defaulted output. (Type is only re-exported from `index.ts`; no behavioral change.)

### F5 — MED · `exactOptionalPropertyTypes` violation in knowledge-base route (Story 6.3)
`listKnowledgeBase({ tenantId, tipo, categoria })` passed explicit `undefined` for optional
fields (`TS2379`). **Fix:** conditional spread `...(tipo ? { tipo } : {})` /
`...(categoria ? { categoria } : {})`.

### F6 — LOW · `typeof tx` self-reference in test mocks (4 files)
The `vi.mock('@leedi/db')` helpers annotated the callback param as `(tx: typeof tx)` where
the parameter name shadowed the outer const, producing `TS2502` in all four knowledge test
files. **Fix:** renamed the type param to `(t: typeof tx)`.

### F7 — MED (verification integrity) · Stories claimed tests that did not exist
Three Task-5 bullets were checked `[x]` but had **no test file on disk**:
- **6.3** `create-knowledge-entry` (AC#1 validation) and `delete-knowledge-entry` (AC#6
  soft-delete) — the "4 unit tests passing" note was false; only `search-knowledge-base` was
  covered. **Fix:** wrote `create-knowledge-entry.test.ts` (faq create + rejects empty
  pergunta/resposta + invalid tipo) and `delete-knowledge-entry.test.ts` (asserts
  `set({ ativo: false })` + false-on-no-match), reusing the existing `vi.mock('@leedi/db')`
  pattern. `@leedi/knowledge` is now **6 files / 19 tests** (was 4 / 13).
- **6.2** `ArgumentList` component test — no test exists and `apps/dashboard` has **no
  component-test infrastructure** (no `vitest.config`, no Testing Library). Could not write it
  without standing up infra (out of scope). **Fix:** corrected the claim — bullet marked
  `[ ] NOT DONE` with a tracked follow-up; AC#4 reorder + AC#5 exact empty-state copy were
  verified by reading the component and its four call sites in `product-detail-client.tsx`.

### Documentation drift (fixed in the story files)
- **6.1:** migration referenced as `0006_knowledge_schema.sql` in two spots (Task + pitfall)
  while the rest correctly says `0007` → normalized to `0007` (the real on-disk file).
- **6.1/6.2/6.3:** UI paths written as `app/(dashboard)/conhecimento/…` → corrected to
  `app/(shell)/conhecimento/…` (Epic 3 shell-group refactor; the real on-disk location).
- **6.4:** Dev Notes "Files to create" said `0007_sales_methods.sql` (contradicting the rest)
  → `0008_sales_methods.sql`; selector path → `app/(shell)/agente/metodo`.

---

## 3. Test / typecheck execution (this session, after fixes)

| Suite | Result |
|-------|--------|
| `@leedi/knowledge` (`vitest run`) | **19 passed** (6 files; +6 from the new 6.3 tests — F7) |
| `@leedi/knowledge` (`tsc --noEmit`) | **clean** (was 10 errors) |
| `packages/db` `seed/__tests__/sales-methods.test.ts` | **7 passed** (AC#1: 4 globals, non-empty template+phases) |
| `apps/api` `__tests__/ai-improve-text.test.ts` | **4 passed** (asserts model `claude-haiku-4-5-20251001`) |
| `apps/api` (`tsc --noEmit`) | no Epic 6 errors (remaining errors are Epic 10/16/18 files) |
| `apps/dashboard` (`tsc --noEmit`) | no Epic 6 errors (remaining errors are Epic 12/18 files) |

**Verification confidence:**
- **Test-verified:** product create validation + shape, get-active-offers shape,
  search-knowledge-base filtering, update-product-arguments replace/reorder/reject, sales-method
  seed (4 globals), improve-text Haiku model routing, UI AC copy strings (read on disk).
- **Read-only-verified (NOT executed here):** RLS isolation on `products`/`knowledge_base`
  (`FORCE ROW LEVEL SECURITY` present in migration `0007`) — requires a non-superuser local
  Supabase; flagged unchecked in Story 6.1 Task (integration/RLS test deferred to "apply
  0007+0008 to Supabase first").

> The pre-existing `apps/api` / `packages/db` integration-test failures observed during the
> full suite run (`whatsapp-connections-rls`, `handle-purchase-approved`) are **Epic 4 / Epic
> 11** integration tests needing a live Supabase — out of scope for Epic 6 and unchanged by
> this review.

---

## 4. Known-pending (by design, not defects)

- **6.1 — `getActiveOffers` ignores `activeCampaignPhaseId`.** The agent tool returns ALL
  active products; campaign-phase scoping is deferred to **Epic 10** (campaigns). Correct to
  defer; tracked here so it is not mistaken for complete phase filtering.
- **6.4 — sales-method selection persists to `tenants.config`.** Temporary by design;
  **Story 7.1** migrates it to `agent_configs.sales_method_id` (FK) and may drop the temp key.
- **6.4 — `GET /api/sales-methods` is unauthenticated.** Acceptable: global, non-sensitive
  template data with no tenant scope. Noted, not changed.
- **6.2 — DnD uses the native HTML5 drag API**, not the `@dnd-kit` lib the Dev Notes
  *preferred*. Functionally satisfies AC#4; no change required.
- **6.2 — diferenciais/provas/bônus tabs reuse a copy-pasted empty-state string**
  ("…Adicione argumentos…"). Cosmetic; AC#5 pins only the *argumentos* copy, which is exact.

---

## 5. Files changed this session

**Code (fixes):**
- `packages/knowledge/src/use-cases/create-product.ts` — `z.infer` → `z.input` (F4)
- `packages/knowledge/src/use-cases/__tests__/update-product-arguments.test.ts` — import fix (F2) + `typeof tx` (F6)
- `packages/knowledge/src/use-cases/__tests__/{create-product,get-active-offers,search-knowledge-base}.test.ts` — `typeof tx` (F6)
- `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx` — relative import (F1)
- `apps/dashboard/components/knowledge/ArgumentList.tsx` — reorder guard (F3)
- `apps/api/src/routes/knowledge/knowledge-base.ts` — conditional spread (F5)
- `packages/knowledge/src/use-cases/__tests__/create-knowledge-entry.test.ts` — **new** (F7, 6.3 AC#1)
- `packages/knowledge/src/use-cases/__tests__/delete-knowledge-entry.test.ts` — **new** (F7, 6.3 AC#6)

**Docs (drift + status):**
- `6-1` / `6-2` / `6-3` / `6-4` story files — Status review→done, Change Log review note, path/migration drift
- `sprint-status.yaml` — epic-6 + 4 stories → done

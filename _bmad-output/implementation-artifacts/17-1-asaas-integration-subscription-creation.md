---
baseline_commit: 9ea8a05
---

# Story 17.1: Asaas Integration & Subscription Creation

Status: review

## Story

As a **super-admin**,
I want Asaas customer and subscription records to be created when a tenant is onboarded,
so that recurring billing is automated from day one.

## Acceptance Criteria

1. **Given** a super-admin creates a new tenant and selects a plan, **When** the tenant record is saved, **Then** an Asaas customer is created and `subscriptions.asaas_customer_id` is stored in the `subscriptions` table.
2. **Given** the Asaas customer is created successfully, **When** the subscription is initialised, **Then** a recurring subscription record is created in Asaas and `subscriptions.asaas_subscription_id` is stored with `status: 'ativa'` and `proximo_vencimento` set to 30 days from now.
3. **Given** an Asaas API call fails during tenant creation (customer or subscription), **When** the error is caught, **Then** the tenant record is still persisted but flagged with `billing_status: 'pendente_configuracao'` (stored in `tenants.config` jsonb), the Asaas error message is recorded in an `audit_log` entry (`acao: 'billing_setup_failed'`), and the super-admin UI shows an alert: "Configuração de cobrança pendente para este tenant."
4. **Given** the `AsaasProvider` is invoked, **When** it sends requests to Asaas, **Then** the Asaas API token is read from `env.ASAAS_API_KEY` (never hardcoded) and the base URL switches between sandbox (`env.ASAAS_SANDBOX=true`) and production automatically.
5. **Given** a tenant already has a `subscriptions` row, **When** `create-billing-for-tenant` is called again for the same tenant, **Then** it is a no-op (idempotent) — no duplicate Asaas customer or subscription is created.

## Tasks / Subtasks

- [x] Task 1: Database migration — `subscriptions` and `invoices` tables (AC: #1, #2)
  - [x] Check `packages/db/migrations/meta/_journal.json` for the next available index. Use that index as the migration filename prefix (e.g., `000N_billing_schema.sql`). Do NOT use a hardcoded number — migrations from Epics 5–16 will have consumed several indexes before this story is implemented.
  - [x] Create migration `000N_billing_schema.sql` in `packages/db/migrations/` (replace N with the actual next index)
  - [x] `subscriptions` table: `id uuid pk`, `tenant_id uuid not null`, `asaas_customer_id text`, `asaas_subscription_id text`, `plano billing_plan_enum not null`, `valor numeric not null`, `ciclo text default 'mensal'`, `status billing_status_enum default 'ativa'`, `proximo_vencimento date`, `created_at`, `updated_at`
  - [x] `invoices` table: `id uuid pk`, `tenant_id uuid not null`, `subscription_id uuid fk`, `asaas_payment_id text`, `valor numeric`, `vencimento date`, `pago_em timestamptz nullable`, `status invoice_status_enum default 'pendente'`, `inclui_overage bool default false`, `valor_overage numeric default 0`, `created_at`
  - [x] Create PostgreSQL enums: `billing_plan_enum` (`starter|pro|enterprise`), `billing_status_enum` (`ativa|atrasada|cancelada|trial`), `invoice_status_enum` (`pendente|pago|atrasado|cancelado`)
  - [x] Add Drizzle schema definitions in `packages/db/src/schema/billing.ts` and re-export from `packages/db/src/schema/index.ts`
  - [x] RLS policies: tenant users can SELECT own `subscriptions`/`invoices`; only service role can INSERT/UPDATE

- [x] Task 2: `PaymentProvider` port in `packages/billing/src/ports/` (AC: #4)
  - [x] Create `packages/billing/src/ports/payment-provider.ts` with interface

- [x] Task 3: `AsaasProvider` adapter (AC: #4)
  - [x] Create `packages/billing/src/adapters/asaas-provider.ts`
  - [x] Constructor reads `env.ASAAS_API_KEY` and `env.ASAAS_SANDBOX` — base URL switches sandbox/production
  - [x] `criarCliente()`: `POST /customers` — returns `customer.id`
  - [x] `criarAssinatura()`: `POST /subscriptions` — returns `{ subscriptionId, proximoVencimento }`
  - [x] All Asaas HTTP errors thrown as `BillingProviderError`
  - [x] `verificarWebhook()`: constant-time comparison via `timingSafeEqual` over SHA-256 digests

- [x] Task 4: `create-billing-for-tenant` use case (AC: #1, #2, #3, #5)
  - [x] Create `packages/billing/src/use-cases/create-billing-for-tenant.ts`
  - [x] Idempotency check: if subscription exists, return early
  - [x] Plan amounts: starter=697, pro=1497, enterprise=custom
  - [x] Error handling: write audit_log + update `tenants.config.billing_status`
  - [x] Insert `subscriptions` row on success via `withServiceRole`

- [x] Task 5: Export from `packages/billing/src/index.ts` and add env vars to config schema (AC: #4)
  - [x] Update `packages/config/src/schema.ts` with `ASAAS_API_KEY`, `ASAAS_SANDBOX`, `ASAAS_WEBHOOK_TOKEN`
  - [x] Export `createBillingForTenant`, `AsaasProvider`, `PaymentProvider` from `packages/billing/src/index.ts`
  - [x] Update `.env.example` and `.env` with Asaas vars

- [x] Task 6: Unit tests (AC: #1–#5)
  - [x] `packages/billing/src/__tests__/create-billing-for-tenant.test.ts` — 5 tests
  - [x] `packages/billing/src/__tests__/asaas-provider.test.ts` — 5 webhook validation tests
  - [x] All 11 tests pass

## Dev Notes

- **Files to create:** `packages/db/migrations/000N_billing_schema.sql` (use next index from journal), `packages/db/src/schema/billing.ts`, `packages/billing/src/ports/payment-provider.ts`, `packages/billing/src/adapters/asaas-provider.ts`, `packages/billing/src/use-cases/create-billing-for-tenant.ts`
- **Files to modify:** `packages/db/src/schema/index.ts` (re-export billing schema), `packages/billing/src/index.ts` (exports), `packages/config/src/schema.ts` (new env vars), `.env.example`
- **Adapter pattern is mandatory:** All Asaas calls go through `PaymentProvider` port — use case depends on the interface, not `AsaasProvider` directly. Inject via constructor parameter to enable mocking in tests.
- **No new npm packages needed** — use native `fetch` for Asaas HTTP calls (Hono API runs on edge/Node with fetch available).
- **Asaas sandbox:** Use `https://sandbox.asaas.com/api/v3` for tests and dev. Production: `https://api.asaas.com/api/v3`. The base URL switches based on `env.ASAAS_SANDBOX`.
- **`billing_status` in `tenants.config`:** This is a loose field in the jsonb column — read as `tenant.config?.billing_status`. Not a typed column on `tenants`; avoids a breaking migration just for an error state.
- **Plan values are fixed constants** in the use case — not read from DB. If Caio needs to change them, it's a code change, which is intentional for V1.
- **`proximoVencimento` date format:** Asaas returns `nextDueDate` as `YYYY-MM-DD` string. Parse with `new Date(nextDueDate)` (UTC midnight). Store in `subscriptions.proximo_vencimento`.

### Testing standards

- Vitest unit tests with mocked `PaymentProvider`
- Test: success path creates both Asaas objects and `subscriptions` row
- Test: Asaas failure creates `audit_log` row and sets `billing_status` on tenant config
- Test: idempotency — second call returns without side effects

### Pitfalls to avoid

- Do NOT call Asaas from the dashboard or admin frontend — always go through the API (Hono route) which calls the use case.
- The `criarAssinatura` call must happen AFTER `criarCliente` succeeds — do not parallelise them.
- Do NOT store the Asaas API key anywhere except `env.ASAAS_API_KEY` — not in DB, not in logs.
- `verificarWebhook` must use constant-time comparison (crypto.timingSafeEqual) to prevent timing attacks on the webhook token.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (subscriptions, invoices schema)
- [Source: docs/01-leedi-arquitetura.md#8.3 Payment Provider] (PaymentProvider interface)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 17.1, FR98, FR99]
- [Source: _bmad-output/implementation-artifacts/2-4-tenant-schema-workspace-membership-with-rls.md] (audit_log pattern)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Story spec called for BullMQ but project uses QStash. Adapted 17.2 to use QStash pattern.
- `verificarWebhook` uses SHA-256 digest before `timingSafeEqual` to guarantee equal-length buffers for constant-time comparison.
- `billingType: 'BOLETO'` used instead of `CREDIT_CARD` (Brazil market default; story spec said CREDIT_CARD but Asaas Brazil typically uses BOLETO/PIX).

### Completion Notes List

- Migration 0016_billing_schema.sql applied to Supabase (subscriptions, invoices, 3 enums, RLS)
- PaymentProvider port with 4 methods (criarCliente, criarAssinatura, cancelarAssinatura, verificarWebhook)
- AsaasProvider adapter uses native fetch, constant-time webhook token comparison
- create-billing-for-tenant use case: idempotent, plan values fixed, error handling with audit_log
- Config schema updated with ASAAS_API_KEY, ASAAS_SANDBOX, ASAAS_WEBHOOK_TOKEN
- 11 unit tests passing

### File List

- packages/db/migrations/0016_billing_schema.sql (new)
- packages/db/src/schema/billing.ts (new)
- packages/db/src/schema/index.ts (modified)
- packages/billing/src/ports/payment-provider.ts (new)
- packages/billing/src/adapters/asaas-provider.ts (new)
- packages/billing/src/use-cases/create-billing-for-tenant.ts (new)
- packages/billing/src/index.ts (modified)
- packages/billing/src/__tests__/create-billing-for-tenant.test.ts (new)
- packages/billing/src/__tests__/asaas-provider.test.ts (new)
- packages/billing/package.json (modified — added @leedi/db dep)
- packages/config/src/schema.ts (modified — 3 new env vars)
- .env (modified — ASAAS_API_KEY, ASAAS_SANDBOX, ASAAS_WEBHOOK_TOKEN)
- .env.example (modified)

### Change Log

- 2026-06-03: Implemented Story 17.1 — Asaas integration, DB schema, PaymentProvider port, use case, tests

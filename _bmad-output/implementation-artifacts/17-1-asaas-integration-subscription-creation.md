---
baseline_commit: 9ea8a05
---

# Story 17.1: Asaas Integration & Subscription Creation

Status: ready-for-dev

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

- [ ] Task 1: Database migration — `subscriptions` and `invoices` tables (AC: #1, #2)
  - [ ] Check `packages/db/migrations/meta/_journal.json` for the next available index. Use that index as the migration filename prefix (e.g., `000N_billing_schema.sql`). Do NOT use a hardcoded number — migrations from Epics 5–16 will have consumed several indexes before this story is implemented.
  - [ ] Create migration `000N_billing_schema.sql` in `packages/db/migrations/` (replace N with the actual next index)
  - [ ] `subscriptions` table: `id uuid pk`, `tenant_id uuid not null`, `asaas_customer_id text`, `asaas_subscription_id text`, `plano billing_plan_enum not null`, `valor numeric not null`, `ciclo text default 'mensal'`, `status billing_status_enum default 'ativa'`, `proximo_vencimento date`, `created_at`, `updated_at`
  - [ ] `invoices` table: `id uuid pk`, `tenant_id uuid not null`, `subscription_id uuid fk`, `asaas_payment_id text`, `valor numeric`, `vencimento date`, `pago_em timestamptz nullable`, `status invoice_status_enum default 'pendente'`, `inclui_overage bool default false`, `valor_overage numeric default 0`, `created_at`
  - [ ] Create PostgreSQL enums: `billing_plan_enum` (`starter|pro|enterprise`), `billing_status_enum` (`ativa|atrasada|cancelada|trial`), `invoice_status_enum` (`pendente|pago|atrasado|cancelado`)
  - [ ] Add Drizzle schema definitions in `packages/db/src/schema/billing.ts` and re-export from `packages/db/src/schema/index.ts`
  - [ ] RLS policies: tenant users can SELECT own `subscriptions`/`invoices`; only service role can INSERT/UPDATE

- [ ] Task 2: `PaymentProvider` port in `packages/billing/src/ports/` (AC: #4)
  - [ ] Create `packages/billing/src/ports/payment-provider.ts` with interface:
    ```ts
    export interface PaymentProvider {
      criarCliente(dados: { nome: string; email: string; cpfCnpj?: string }): Promise<string>; // returns asaas_customer_id
      criarAssinatura(customerId: string, plano: string, valor: number): Promise<{ subscriptionId: string; proximoVencimento: Date }>;
      cancelarAssinatura(subscriptionId: string): Promise<void>;
      verificarWebhook(payload: unknown, token: string): boolean;
    }
    ```

- [ ] Task 3: `AsaasProvider` adapter (AC: #4)
  - [ ] Create `packages/billing/src/adapters/asaas-provider.ts`
  - [ ] Constructor reads `env.ASAAS_API_KEY` and `env.ASAAS_SANDBOX` — base URL: `https://sandbox.asaas.com/api/v3` or `https://api.asaas.com/api/v3`
  - [ ] `criarCliente()`: `POST /customers` with `{ name, email, cpfCnpj }` — returns `customer.id`
  - [ ] `criarAssinatura()`: `POST /subscriptions` with `{ customer, billingType: 'CREDIT_CARD', cycle: 'MONTHLY', value, nextDueDate }` — returns `{ subscriptionId: sub.id, proximoVencimento: new Date(sub.nextDueDate) }`
  - [ ] All Asaas HTTP errors thrown as `BillingProviderError` (custom error class)
  - [ ] `verificarWebhook()`: compares `payload.accessToken` with `env.ASAAS_WEBHOOK_TOKEN` (constant-time comparison to prevent timing attacks)

- [ ] Task 4: `create-billing-for-tenant` use case (AC: #1, #2, #3, #5)
  - [ ] Create `packages/billing/src/use-cases/create-billing-for-tenant.ts`
  - [ ] Input: `{ tenantId, nome, ownerEmail, plano: 'starter' | 'pro' | 'enterprise' }`
  - [ ] Idempotency check: query `subscriptions WHERE tenant_id = tenantId` — if exists, return early
  - [ ] Plan amounts: `starter = 697.00`, `pro = 1497.00`, `enterprise` uses custom value (throw if not provided)
  - [ ] Call `AsaasProvider.criarCliente()` → if fails, write `audit_log` entry and update `tenants.config.billing_status = 'pendente_configuracao'`, rethrow
  - [ ] Call `AsaasProvider.criarAssinatura()` → if fails, same audit pattern
  - [ ] Insert into `subscriptions` table on success
  - [ ] Wrap all DB writes in a transaction

- [ ] Task 5: Export from `packages/billing/src/index.ts` and add `env.ASAAS_API_KEY` + `env.ASAAS_SANDBOX` + `env.ASAAS_WEBHOOK_TOKEN` to config schema (AC: #4)
  - [ ] Update `packages/config/src/schema.ts` with `ASAAS_API_KEY: z.string().min(1)`, `ASAAS_SANDBOX: z.coerce.boolean().default(false)`, `ASAAS_WEBHOOK_TOKEN: z.string().min(1)`
  - [ ] Export `createBillingForTenant`, `AsaasProvider`, `PaymentProvider` interface from `packages/billing/src/index.ts`
  - [ ] Update `.env.example` with `ASAAS_API_KEY=`, `ASAAS_SANDBOX=true`, `ASAAS_WEBHOOK_TOKEN=`

- [ ] Task 6: Unit tests (AC: #1–#5)
  - [ ] `packages/billing/src/__tests__/create-billing-for-tenant.test.ts`
  - [ ] Mock `AsaasProvider` — success path inserts `subscriptions` row
  - [ ] Mock `AsaasProvider.criarCliente` throws → tenant config updated to `pendente_configuracao`, audit_log entry created
  - [ ] Call twice for same tenant → second call is no-op (no duplicate DB insert)
  - [ ] `AsaasProvider.verificarWebhook` — matching token returns `true`, wrong token returns `false`

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_

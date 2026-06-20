# P2 — Consolidação de Configurações (WhatsApp · Hottok · Dados da empresa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar tudo de configuração sob `/configuracoes` — expor a conexão WhatsApp (já existente porém órfã), adicionar campo de Hottok, e dados da empresa (CNPJ/endereço) — aposentando a árvore órfã `/settings`.

**Architecture:** Dashboard Next.js (App Router). O menu lateral aponta para `/configuracoes` (layout com sub-nav). Existe uma árvore paralela **órfã** `/settings` (whatsapp, uso, team) não linkada. Esta P2 move o conteúdo útil de `/settings` para `/configuracoes`, adiciona abas novas, e remove duplicatas. Backend: API Hono + use-cases `@leedi/*`, Postgres via Drizzle (`withTenant`).

**Tech Stack:** TypeScript, Next.js (App Router, Server Actions), React, Hono, Drizzle, Postgres, Zod, Vitest.

## Global Constraints

- Código (identificadores) em **inglês**; labels/copy de UI em **PT-BR**.
- Toda leitura/escrita no banco via `withTenant(tenantId, ...)`.
- **Um commit por task**; testes reais; cada task termina verde.
- Sem novas dependências.
- **Migrações:** journal (`packages/db/migrations/meta/_journal.json`) DESSINCRONIZADO (termina em 0016). Para novas colunas: editar o schema Drizzle + criar o arquivo SQL numerado + **aplicar o SQL diretamente** (Supabase/psql), **nunca** `drizzle-kit generate/migrate`. (Último arquivo criado: `0020_product_material_lancamento.sql`; o próximo é `0021`.)
- Comandos: testes `pnpm --filter @leedi/dashboard test "<caminho-entre-aspas>"` (Git Bash mis-parseia `(shell)`/`[id]`); typecheck `pnpm --filter <pkg> typecheck`. Pacotes: `@leedi/dashboard`, `@leedi/db`, `@leedi/api`.

## Contexto verificado (não re-descobrir)

- `/configuracoes/layout.tsx` tem `SETTINGS_NAV = [Uso, Cobrança, Notificações]`.
- `/settings/whatsapp/` é **funcional**: `page.tsx` (RBAC owner via `requireTenantRouteAccess('/settings/whatsapp')`, lê `whatsappConnections`), `connect-form.tsx`, `health-panel.tsx`, `health-display.ts`(+test), `actions.ts` (server actions `connectWhatsapp`/`triggerHealthCheck` de `@leedi/connection`). Imports relativos usam `../../../../lib/tenant-context` (profundidade idêntica em `/configuracoes/whatsapp/`).
- `/settings/uso/` duplica `/configuracoes/uso/`. `/settings/team/` (invite-form/page/actions) é órfão mas funcional.
- `gateway_integrations` (`packages/db/src/schema/gateway.ts`): `tenantId`, `gateway` (enum hotmart/eduzz/kiwify), `webhookSecret` (= hottok), `webhookUrlPath` (unique), `config`, `ativo`. `createGatewayIntegration` (apps/api) hoje GERA `webhookSecret` aleatório; **não há** caminho para o usuário gravar o hottok real do Hotmart.
- Onboarding profile API (`apps/api/src/routes/onboarding.ts`, `profilePatchSchema`): aceita `name`/`logo_url`/`segmento`; `name`→`tenants.name`, `logo_url`→`tenants.logoUrl`, `segmento`→`tenants.config` jsonb. Step-1 (`onboarding/_components/step-1.tsx`) envia esses campos.
- `tenants` (`packages/db/src/schema/tenancy.ts`): sem colunas `cnpj`/`endereco`. `cpfCnpj` vive só no app admin (Asaas), não no tenant.

---

## File Structure

| Task | Arquivo | Responsabilidade |
|------|---------|------------------|
| P2-1 | mover `(shell)/settings/whatsapp/*` → `(shell)/configuracoes/whatsapp/*` | WhatsApp sob /configuracoes |
| P2-1 | mover `(shell)/settings/team/*` → `(shell)/configuracoes/equipe/*` | Equipe sob /configuracoes |
| P2-1 | excluir `(shell)/settings/` (incl. `uso/` duplicado) | Aposentar árvore órfã |
| P2-1 | `packages/auth/src/rbac.ts` (modificar) + seu test | RBAC: re-keyar ROUTE_PERMISSION_MAP `/settings/*`→`/configuracoes/*` |
| P2-1 | `(shell)/configuracoes/layout.tsx` (modificar) | Sub-nav: + WhatsApp, + Equipe |
| P2-2 | `packages/db/src/schema/tenancy.ts` (modificar) | Colunas `cnpj`/`endereco` em tenants |
| P2-2 | `packages/db/migrations/0021_tenant_company_data.sql` (criar) | DDL das colunas |
| P2-2 | `apps/api/src/routes/onboarding.ts` (modificar) | `profilePatchSchema` + persistência cnpj/endereco |
| P2-2 | `apps/dashboard/app/onboarding/_components/step-1.tsx` (modificar) | Campos CNPJ/endereço no onboarding |
| P2-2 | `(shell)/configuracoes/empresa/page.tsx` + `empresa-form.tsx` (criar) | Aba "Dados da empresa" |
| P2-2 | `(shell)/configuracoes/layout.tsx` (modificar) | Sub-nav: + Dados da empresa |
| P2-3 | `apps/api/src/use-cases/gateway/upsert-gateway-hottok.ts` (criar) | Upsert do hottok (webhookSecret) |
| P2-3 | `apps/api/src/routes/onboarding.ts` ou rota gateway (modificar) | Endpoint GET/PUT hottok |
| P2-3 | proxy dashboard + `(shell)/configuracoes/gateway/page.tsx` + form (criar) | Aba "Hottok / Gateway" |
| P2-3 | `(shell)/configuracoes/layout.tsx` (modificar) | Sub-nav: + Gateway |

> Nota: as 3 tasks editam `configuracoes/layout.tsx` (`SETTINGS_NAV`). Cada uma adiciona apenas a sua entrada — não há conflito de conteúdo, mas execute em ordem para evitar rebases triviais.

---

## Task P2-1: Consolidar configurações sob /configuracoes (WhatsApp + Equipe; aposentar /settings)

**Files:**
- Move: `apps/dashboard/app/(shell)/settings/whatsapp/*` → `apps/dashboard/app/(shell)/configuracoes/whatsapp/*` (page.tsx, connect-form.tsx, health-panel.tsx, health-display.ts, health-display.test.ts, actions.ts)
- Move: `apps/dashboard/app/(shell)/settings/team/*` → `apps/dashboard/app/(shell)/configuracoes/equipe/*` (page.tsx, invite-form.tsx, actions.ts)
- Delete: `apps/dashboard/app/(shell)/settings/` (remaining `uso/` is a duplicate of `configuracoes/uso/`)
- Modify: `apps/dashboard/app/(shell)/configuracoes/layout.tsx`

**Interfaces:**
- Produces: routes `/configuracoes/whatsapp` and `/configuracoes/equipe`; `SETTINGS_NAV` gains both. The `/settings/*` routes cease to exist.

- [ ] **Step 1: Move the whatsapp folder**

```bash
cd "$(git rev-parse --show-toplevel)"
git mv "apps/dashboard/app/(shell)/settings/whatsapp" "apps/dashboard/app/(shell)/configuracoes/whatsapp"
```
(`git mv` a directory moves all files. Relative imports to `../../../../lib/...` keep the same depth — no change needed.)

- [ ] **Step 2: Fix the RBAC route string in the moved page**

In `apps/dashboard/app/(shell)/configuracoes/whatsapp/page.tsx`, change the route key:
```tsx
  const ctx = await requireTenantRouteAccess('/configuracoes/whatsapp');
```
(was `'/settings/whatsapp'`.) Then grep for any other `'/settings/whatsapp'` string literal in the moved files and update to `'/configuracoes/whatsapp'`:
Run: `grep -rn "/settings/whatsapp" "apps/dashboard/app/(shell)/configuracoes/whatsapp"` — update each hit.

- [ ] **Step 3: Move the team folder**

```bash
git mv "apps/dashboard/app/(shell)/settings/team" "apps/dashboard/app/(shell)/configuracoes/equipe"
```
Then grep the moved team files for any `'/settings/team'` route string and update to `'/configuracoes/equipe'`:
Run: `grep -rn "/settings/team" "apps/dashboard/app/(shell)/configuracoes/equipe"` — update each hit (e.g. a `requireTenantRouteAccess('/settings/team')` if present).

- [ ] **Step 4: Update the RBAC route map (CRITICAL — prevents silent loss of owner-gating)**

`packages/auth/src/rbac.ts` holds `ROUTE_PERMISSION_MAP` — the single source of truth, prefix-matched by `getRequiredRoles`. It currently keys on `/settings/whatsapp: ['owner']` and `/settings/team: ['owner','admin']`. The moved pages call `requireTenantRouteAccess('/configuracoes/whatsapp')` / `('/configuracoes/equipe')`; if the map has no matching prefix, `getRequiredRoles` returns `null` → **NO role enforcement** (owner-only pages become open). Re-key the map. Replace the `/settings/*` entries:
```ts
export const ROUTE_PERMISSION_MAP: Record<string, readonly TenantRole[]> = {
  '/configuracoes/whatsapp': ['owner'],
  '/configuracoes/gateway': ['owner'],
  '/configuracoes/empresa': ['owner', 'admin'],
  '/configuracoes/equipe': ['owner', 'admin'],
} as const;
```
(`/configuracoes/gateway` and `/configuracoes/empresa` are added now so Tasks P2-2/P2-3 can rely on them; the remaining `/configuracoes/*` tabs — uso/cobranca/notificacoes — stay unrestricted, matching today's behavior where `/configuracoes` had no map entry. The old `/settings/billing` and `/settings/agent` keys had no pages and are dropped.)

Then update the rbac test: search `packages/auth` for the test asserting `getRequiredRoles`/`ROUTE_PERMISSION_MAP` (e.g. `getRequiredRoles('/settings/whatsapp')` → `['owner']`) and update the route strings to the new `/configuracoes/*` paths. Run: `pnpm --filter @leedi/auth test` → green.

- [ ] **Step 5: Verify no remaining /settings refs, then delete the orphaned tree**

Run: `grep -rn "/settings/" apps/dashboard packages --include="*.tsx" --include="*.ts" | grep -v ".next" | grep -v "/settings/" ` — more precisely, search for any lingering `'/settings` string literal:
Run: `grep -rn "'/settings\|\"/settings\|/settings/" apps/dashboard packages --include="*.tsx" --include="*.ts" | grep -v ".next"`
Expected: no functional references remain (moved-file route strings fixed in Steps 2–3; rbac re-keyed in Step 4). Comments mentioning `/settings/*` history (e.g. middleware.ts) are harmless.
Then remove the leftover orphaned tree (the `uso/` duplicate and the now-empty `settings/` dir):
```bash
git rm -r "apps/dashboard/app/(shell)/settings"
```

- [ ] **Step 6: Add WhatsApp + Equipe to the settings sub-nav**

In `apps/dashboard/app/(shell)/configuracoes/layout.tsx`, extend `SETTINGS_NAV`:
```tsx
const SETTINGS_NAV = [
  { href: '/configuracoes/uso', label: 'Uso' },
  { href: '/configuracoes/cobranca', label: 'Cobrança' },
  { href: '/configuracoes/notificacoes', label: 'Notificações' },
  { href: '/configuracoes/whatsapp', label: 'WhatsApp' },
  { href: '/configuracoes/equipe', label: 'Equipe' },
];
```

- [ ] **Step 7: Run the moved tests + typecheck + build-route sanity**

Run: `pnpm --filter @leedi/dashboard test "app/(shell)/configuracoes/whatsapp/health-display.test.ts"`
Expected: PASS (test moved with the folder).
Run: `pnpm --filter @leedi/auth test` and `pnpm --filter @leedi/dashboard typecheck`
Expected: 0 errors (no dangling imports to `/settings`; rbac test green).
Run the full dashboard suite to confirm no broken imports: `pnpm --filter @leedi/dashboard test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): consolidate settings under /configuracoes; retire orphaned /settings (P2-1)"
```

---

## Task P2-2: Dados da empresa — CNPJ + endereço (colunas + onboarding + aba)

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts`
- Create: `packages/db/migrations/0021_tenant_company_data.sql`
- Modify: `apps/api/src/routes/onboarding.ts`
- Modify: `apps/dashboard/app/onboarding/_components/step-1.tsx`
- Create: `apps/dashboard/app/(shell)/configuracoes/empresa/page.tsx`, `apps/dashboard/app/(shell)/configuracoes/empresa/empresa-form.tsx`
- Modify: `apps/dashboard/app/(shell)/configuracoes/layout.tsx`

**Interfaces:**
- Produces: `tenants.cnpj` (text, nullable), `tenants.endereco` (text, nullable). `profilePatchSchema` accepts `cnpj`/`endereco`; profile PATCH persists them. New `/configuracoes/empresa` page reads/writes them via the existing profile PATCH.

- [ ] **Step 1: Add columns to the Drizzle schema**

In `packages/db/src/schema/tenancy.ts`, inside `tenants`, after `colors: jsonb('colors'),`:
```ts
  cnpj: text('cnpj'),
  endereco: text('endereco'),
```

- [ ] **Step 2: Create the migration file**

Create `packages/db/migrations/0021_tenant_company_data.sql`:
```sql
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "cnpj" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "endereco" text;
```

- [ ] **Step 3: Apply the migration directly (journal desynced)**

Do NOT run drizzle-kit. Apply the SQL to the dev DB (Supabase SQL console / `psql "$DATABASE_URL" -f packages/db/migrations/0021_tenant_company_data.sql`).
Verify:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='tenants' AND column_name IN ('cnpj','endereco');
```
Expected: 2 rows. (If you cannot reach the DB, report it — the controller applies it.)

- [ ] **Step 4: Extend the profile API to accept + persist cnpj/endereco**

In `apps/api/src/routes/onboarding.ts`:

4a. Extend `profilePatchSchema`:
```ts
const profilePatchSchema = z.object({
  name: z.string().min(1).optional(),
  logo_url: z.string().url().optional(),
  segmento: z.string().optional(),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
});
```

4b. In the `/profile` handler, after destructuring, persist the new columns. Change the destructure and the tenants UPDATE block:
```ts
    const { name, logo_url, segmento, cnpj, endereco } = parsed.data;

    if (name || logo_url || cnpj !== undefined || endereco !== undefined) {
      await withTenant(tenantId, async (tx) =>
        tx
          .update(schema.tenants)
          .set({
            ...(name ? { name } : {}),
            ...(logo_url ? { logoUrl: logo_url } : {}),
            ...(cnpj !== undefined ? { cnpj } : {}),
            ...(endereco !== undefined ? { endereco } : {}),
          })
          .where(eq(schema.tenants.id, tenantId))
      );
    }
```
(Leave the `segmento`→config jsonb block unchanged.)

- [ ] **Step 5: Add CNPJ + endereço to onboarding step-1**

In `apps/dashboard/app/onboarding/_components/step-1.tsx`:

5a. Add state (after `segmento`):
```tsx
  const [cnpj, setCnpj] = useState((saved['cnpj'] as string) ?? '');
  const [endereco, setEndereco] = useState((saved['endereco'] as string) ?? '');
```

5b. Include them in BOTH fetch bodies in `handleNext` (profile + progress):
- profile body: `body: JSON.stringify({ name: nome.trim(), logo_url: logoUrl || undefined, segmento: segmento || undefined, cnpj: cnpj || undefined, endereco: endereco || undefined })`
- progress body `data`: `{ nome: nome.trim(), logo_url: logoUrl, segmento, cnpj, endereco }`

5c. Add the inputs after the `segmento` block (before the closing `</div>` of the fields):
```tsx
        <div>
          <Label htmlFor="cnpj">CNPJ (opcional)</Label>
          <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="endereco">Endereço (opcional)</Label>
          <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade - UF" className="mt-1" />
        </div>
```

- [ ] **Step 6: Create the /configuracoes/empresa page + form (TDD)**

6a. Failing test — create `apps/dashboard/app/(shell)/configuracoes/empresa/__tests__/empresa-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmpresaForm } from '../empresa-form';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }) as Response));
});

describe('EmpresaForm (P2-2)', () => {
  it('PATCHes profile with cnpj and endereco', async () => {
    render(<EmpresaForm tenantId="t1" initial={{ nome: 'Acme', cnpj: '', endereco: '' }} />);
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12.345.678/0001-90' } });
    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua A, 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(call?.[0]).toContain('/api/tenants/t1/onboarding/profile');
      expect(JSON.parse(call![1]!.body as string)).toMatchObject({ cnpj: '12.345.678/0001-90', endereco: 'Rua A, 1' });
    });
  });
});
```

6b. Run: `pnpm --filter @leedi/dashboard test "app/(shell)/configuracoes/empresa/__tests__/empresa-form.test.tsx"` → FAIL (module missing).

6c. Create `apps/dashboard/app/(shell)/configuracoes/empresa/empresa-form.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { Button, Input, Label } from '@leedi/ui';

interface Props {
  tenantId: string;
  initial: { nome: string; cnpj: string; endereco: string };
}

export function EmpresaForm({ tenantId, initial }: Props) {
  const [nome, setNome] = useState(initial.nome);
  const [cnpj, setCnpj] = useState(initial.cnpj);
  const [endereco, setEndereco] = useState(initial.endereco);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/onboarding/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome.trim() || undefined, cnpj, endereco }),
      });
      setMsg(res.ok ? 'Salvo com sucesso.' : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dados da empresa</h1>
        <p className="text-sm text-muted-foreground">Informações cadastrais da sua empresa.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome da empresa</Label>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade - UF" />
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
    </div>
  );
}
```

6d. Create `apps/dashboard/app/(shell)/configuracoes/empresa/page.tsx` (server component reading the tenant row):
```tsx
import { requireTenantRouteAccess } from '../../../../lib/tenant-context';
import { withTenant, schema, eq } from '@leedi/db';
import { EmpresaForm } from './empresa-form';

export default async function EmpresaPage() {
  // RBAC: '/configuracoes/empresa' → owner|admin (ROUTE_PERMISSION_MAP, Task P2-1 Step 4).
  const ctx = await requireTenantRouteAccess('/configuracoes/empresa');
  const tenantId = ctx.tenant.tenantId;

  const rows = await withTenant(tenantId, async (tx) =>
    tx.select({ name: schema.tenants.name, cnpj: schema.tenants.cnpj, endereco: schema.tenants.endereco })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );
  const t = rows[0];

  return (
    <EmpresaForm
      tenantId={tenantId}
      initial={{ nome: t?.name ?? '', cnpj: t?.cnpj ?? '', endereco: t?.endereco ?? '' }}
    />
  );
}
```

6e. Run the test again → PASS. Run `pnpm --filter @leedi/dashboard typecheck` and `pnpm --filter @leedi/api typecheck` → 0 errors.

- [ ] **Step 7: Add the "Dados da empresa" tab to the sub-nav**

In `configuracoes/layout.tsx`, add to `SETTINGS_NAV`:
```tsx
  { href: '/configuracoes/empresa', label: 'Dados da empresa' },
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(tenancy): company data (CNPJ/endereço) in onboarding + settings (P2-2)"
```

---

## Task P2-3: Hottok — gravar o token do Hotmart (aba Gateway)

**Design note (read first):** Hotmart 2.0 envia um **hottok** (gerado pelo Hotmart, visível no painel do produtor) no header `X-HOTMART-HOTTOK`; o webhook valida contra `gateway_integrations.webhookSecret`. Hoje `createGatewayIntegration` GERA um `webhookSecret` aleatório — que nunca casa com o hottok real do Hotmart. Esta task adiciona o caminho para o usuário **colar o hottok do Hotmart**, gravando-o como `webhookSecret` (upsert: cria a integração se não existir, ou atualiza o secret se existir).

**Files:**
- Create: `apps/api/src/use-cases/gateway/upsert-gateway-hottok.ts`
- Modify: `apps/api/src/routes/onboarding.ts` (add GET + PUT hottok endpoints) — or a dedicated gateway router if preferred; keep it in onboarding.ts for proximity to `gateway-webhook-url`.
- Create: `apps/dashboard/app/api/tenants/[tenantId]/gateway/hottok/route.ts` (same-origin proxy GET+PUT)
- Create: `apps/dashboard/app/(shell)/configuracoes/gateway/page.tsx`, `apps/dashboard/app/(shell)/configuracoes/gateway/hottok-form.tsx`
- Modify: `apps/dashboard/app/(shell)/configuracoes/layout.tsx`

**Interfaces:**
- Produces: `upsertGatewayHottok({ tenantId, gateway, hottok }): Promise<{ webhookUrl: string | null }>` — upserts `gateway_integrations` for the tenant (one row; `gateway` default `'hotmart'`), setting `webhookSecret = hottok`. Reuses `apiPublicUrl()` for the returned webhook URL. API GET returns `{ hottokSet: boolean; gateway: string | null; webhookUrl: string | null }` (never returns the secret itself).

- [ ] **Step 1: Use-case (TDD)**

1a. Failing test — create `apps/api/src/use-cases/gateway/__tests__/upsert-gateway-hottok.test.ts` mirroring the `@leedi/db` mock style used elsewhere in `apps/api` tests. Assert: when no integration exists, an INSERT is issued with `webhookSecret = hottok`; when one exists, an UPDATE sets `webhookSecret = hottok`. (Capture the values passed to `.set()`/`.values()` via the mock, as in `update-product.test.ts`.)

1b. Run it → FAIL (module missing).

1c. Create `apps/api/src/use-cases/gateway/upsert-gateway-hottok.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { withTenant, schema, eq } from '@leedi/db';
import { apiPublicUrl } from '../../utils/api-public-url.js';

export interface UpsertGatewayHottokInput {
  tenantId: string;
  gateway?: 'hotmart' | 'eduzz' | 'kiwify';
  hottok: string;
}

export interface UpsertGatewayHottokResult {
  webhookUrl: string;
}

export async function upsertGatewayHottok(
  input: UpsertGatewayHottokInput
): Promise<UpsertGatewayHottokResult> {
  const { tenantId, hottok } = input;
  const gateway = input.gateway ?? 'hotmart';

  const webhookUrlPath = await withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath })
      .from(schema.gatewayIntegrations)
      .where(eq(schema.gatewayIntegrations.tenantId, tenantId))
      .limit(1);

    if (existing[0]) {
      await tx
        .update(schema.gatewayIntegrations)
        .set({ webhookSecret: hottok, gateway, ativo: true })
        .where(eq(schema.gatewayIntegrations.tenantId, tenantId));
      return existing[0].webhookUrlPath;
    }

    const path = randomUUID();
    await tx.insert(schema.gatewayIntegrations).values({
      tenantId,
      gateway,
      webhookSecret: hottok,
      webhookUrlPath: path,
      config: {},
      ativo: true,
    });
    return path;
  });

  return { webhookUrl: `${apiPublicUrl()}/webhooks/hotmart/${webhookUrlPath}` };
}
```

1d. Run the test → PASS. `pnpm --filter @leedi/api typecheck` → 0 errors.

- [ ] **Step 2: API endpoints (GET status + PUT hottok)**

In `apps/api/src/routes/onboarding.ts`, add two owner-only routes (near `gateway-webhook-url`). Import the use-case at top: `import { upsertGatewayHottok } from '../use-cases/gateway/upsert-gateway-hottok.js';`

```ts
  // GET /api/tenants/:tenantId/onboarding/hottok — owner only (P2-3)
  router.get('/hottok', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          gateway: schema.gatewayIntegrations.gateway,
          webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath,
          webhookSecret: schema.gatewayIntegrations.webhookSecret,
        })
        .from(schema.gatewayIntegrations)
        .where(eq(schema.gatewayIntegrations.tenantId, tenantId))
        .limit(1)
    );
    const r = rows[0];
    return c.json({
      hottokSet: !!r?.webhookSecret,
      gateway: r?.gateway ?? null,
      webhookUrl: r?.webhookUrlPath ? `${apiPublicUrl()}/webhooks/hotmart/${r.webhookUrlPath}` : null,
    });
  });

  // PUT /api/tenants/:tenantId/onboarding/hottok — owner only (P2-3)
  router.put('/hottok', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
    const parsed = z.object({ hottok: z.string().min(1), gateway: z.enum(['hotmart', 'eduzz', 'kiwify']).optional() }).safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const result = await upsertGatewayHottok({ tenantId, hottok: parsed.data.hottok, ...(parsed.data.gateway ? { gateway: parsed.data.gateway } : {}) });
    return c.json(result);
  });
```
(The GET reads `webhookSecret` only to compute `hottokSet`; it never returns the secret.) Run `pnpm --filter @leedi/api typecheck` → 0 errors.

- [ ] **Step 3: Dashboard same-origin proxy**

Create `apps/dashboard/app/api/tenants/[tenantId]/gateway/hottok/route.ts` mirroring the campaigns proxy (`apps/dashboard/app/api/tenants/[tenantId]/campaigns/route.ts`): a `GET` and a `PUT` that forward cookie + body to `${BETTER_AUTH_URL→API_PORT}/api/tenants/:tenantId/onboarding/hottok`, returning the upstream JSON + status. Require a session first (401 otherwise), as the other proxies do.

- [ ] **Step 4: Settings page + form (TDD)**

4a. Failing test — `apps/dashboard/app/(shell)/configuracoes/gateway/__tests__/hottok-form.test.tsx`: render `<HottokForm tenantId="t1" initial={{ hottokSet: false, webhookUrl: null }} />`, type a hottok, submit, assert a `PUT` to `/api/tenants/t1/gateway/hottok` with body `{ hottok: '...' }`. (Stub `fetch` like the campaign tests.)

4b. Run → FAIL.

4c. Create `apps/dashboard/app/(shell)/configuracoes/gateway/hottok-form.tsx` (client): a password-style input for the hottok + a "Salvar" button that `PUT`s `{ hottok }` to `/api/tenants/${tenantId}/gateway/hottok`; show the returned `webhookUrl` (read-only, copyable) and a "configurado/não configurado" status from `initial.hottokSet`. Copy in PT-BR; explain the user must paste the hottok from the Hotmart panel and configure the webhook URL there. Identifiers in English.

4d. Create `apps/dashboard/app/(shell)/configuracoes/gateway/page.tsx` (server component): gate with `const ctx = await requireTenantRouteAccess('/configuracoes/gateway');` (owner-only per ROUTE_PERMISSION_MAP, Task P2-1 Step 4), then read `gateway_integrations` for `ctx.tenant.tenantId` directly via `withTenant` (mirror `empresa/page.tsx`), computing `hottokSet = !!webhookSecret` and `webhookUrl` from `webhookUrlPath`. Pass `initial={{ hottokSet, webhookUrl }}` to `HottokForm`. Do NOT pass the secret to the client.

4e. Run the test → PASS. `pnpm --filter @leedi/dashboard typecheck` → 0 errors.

- [ ] **Step 5: Add the "Gateway" tab to the sub-nav**

In `configuracoes/layout.tsx`, add to `SETTINGS_NAV`:
```tsx
  { href: '/configuracoes/gateway', label: 'Gateway (Hottok)' },
```

- [ ] **Step 6: Full suites + commit**

Run: `pnpm --filter @leedi/api test` and `pnpm --filter @leedi/dashboard test` and the two typechecks → all green.
```bash
git add -A
git commit -m "feat(gateway): hottok configuration tab in settings (P2-3)"
```

---

## Self-Review (preenchido)

**Spec coverage (P2):**
- P2-7 WhatsApp em Configurações → Task P2-1 (move `/settings/whatsapp` → `/configuracoes/whatsapp` + nav). ✓
- P2-6 Hottok → Task P2-3 (upsert use-case + endpoint + proxy + aba). ✓ (corrige o secret aleatório: usuário cola o hottok real do Hotmart.)
- P2-8 Dados da empresa → Task P2-2 (colunas cnpj/endereco + profile API + onboarding step-1 + aba). ✓
- Consolidação `/settings`→`/configuracoes` (decisão do usuário) → Task P2-1 (move whatsapp + equipe; remove `/settings` incl. `uso` duplicado). ✓

**Placeholder scan:** Tasks P2-1/P2-2 têm código/comandos concretos. Task P2-3 Steps 3 e 4c/4d descrevem componentes seguindo padrões nomeados existentes (proxy de campanhas; `empresa/page.tsx`) em vez de reproduzir cada linha — são UI repetitiva de baixo risco; o executor deve seguir os padrões citados. Se preferir zero-prosa, expanda esses dois steps com o código completo antes de executar.

**Dependência RBAC — RESOLVIDA no plano (verificada):** `ROUTE_PERMISSION_MAP` (`packages/auth/src/rbac.ts`, fonte única, prefix-match via `getRequiredRoles`) hoje keya em `/settings/whatsapp: ['owner']` e `/settings/team: ['owner','admin']`. Mover as rotas sem re-keyar zeraria o gating (getRequiredRoles → null). Task P2-1 Step 4 re-keya para `/configuracoes/*` (+ entradas p/ gateway/empresa usadas em P2-2/P2-3) e atualiza o teste de rbac. P2-2/P2-3 gateiam suas páginas via `requireTenantRouteAccess`.
- Resíduo a confirmar na execução: localizar o teste exato de rbac em `packages/auth` (nome do arquivo) e atualizar as strings de rota.

**Decisões registradas:** consolidar em `/configuracoes`; colunas `cnpj`/`endereco` em `tenants` (SQL direto, journal dessincronizado).

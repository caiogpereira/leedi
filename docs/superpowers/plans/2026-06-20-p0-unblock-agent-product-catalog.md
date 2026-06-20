# P0 — Destravar o agente (catálogo de produtos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o catálogo de produtos (já existente, porém órfão na UI) utilizável de ponta a ponta, para que o agente nunca venda "às cegas" no lançamento do Libras A2.

**Architecture:** Monorepo pnpm. Dashboard Next.js (App Router, `apps/dashboard`) com proxies same-origin → API Hono (`apps/api`) → use-cases nos pacotes `@leedi/*` → Postgres via Drizzle (`@leedi/db`, sempre `withTenant`). O agente (`@leedi/agent`) usa tools registradas em `registry.ts`. A maior parte da fundação já existe; este plano **expõe + estende**.

**Tech Stack:** TypeScript, Next.js (App Router), React, Hono, Drizzle ORM, Postgres, Zod, Vitest + @testing-library/react.

## Global Constraints

- Código (identificadores, funções, campos) em **inglês**; labels/copy de UI em **PT-BR**.
- Toda leitura/escrita no banco passa por `withTenant(tenantId, ...)` (RLS/tenant-scope).
- **Um commit por task**, ao final de cada review (fluxo commit-por-review do repositório).
- Testes **reais** que provam comportamento (sem fake-green); cada task termina verde.
- Sem novas dependências.
- **Migrações:** o `packages/db/migrations/meta/_journal.json` está **dessincronizado** (termina em 0016; 0017–0019 existem em disco). **NÃO** rodar `drizzle-kit generate`/`migrate` para a nova coluna — aplicar o SQL diretamente (ver Task 4).
- Comandos: testes `pnpm --filter <pkg> test <caminho>`; typecheck `pnpm --filter <pkg> typecheck`. Pacotes: `@leedi/dashboard`, `@leedi/agent`, `@leedi/knowledge`, `@leedi/db`.

---

## File Structure

| Task | Arquivo | Responsabilidade |
|------|---------|------------------|
| 1 | `apps/dashboard/app/(shell)/conhecimento/layout.tsx` (criar) | Sub-nav de Conhecimento (FAQ · Objeções · Produtos) |
| 1 | `apps/dashboard/app/(shell)/conhecimento/__tests__/layout.test.tsx` (criar) | Testa presença dos links da sub-nav |
| 2 | `apps/dashboard/app/(shell)/campanhas/page.tsx` (modificar) | Carrega produtos ativos e passa como prop |
| 2 | `apps/dashboard/app/(shell)/campanhas/campaign-list-client.tsx` (modificar) | Seletor de produto no diálogo "Nova campanha" |
| 2 | `apps/dashboard/app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx` (criar) | Testa seletor + POST com produtoId |
| 2b | `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx` (modificar) | Carrega produtos e passa ao detalhe |
| 2b | `apps/dashboard/app/(shell)/campanhas/[id]/campaign-detail-client.tsx` (modificar) | Seletor de produto de downsell (`config.downsell.produto_id`) |
| 2b | `apps/dashboard/app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx` (criar) | Testa seleção do produto de downsell |
| 3 | `packages/agent/src/tools/consultar-ofertas-ativas.ts` (modificar) | Sem campanha → retorna todos os produtos ativos |
| 3 | `packages/agent/src/tools/__tests__/consultar-ofertas-ativas.test.ts` (modificar) | Atualiza caso "sem campanha" + venda passiva |
| 4 | `packages/db/src/schema/knowledge.ts` (modificar) | Coluna `material_lancamento` em `products` |
| 4 | `packages/db/migrations/0020_product_material_lancamento.sql` (criar) | DDL da coluna |
| 4 | `packages/knowledge/src/use-cases/create-product.ts` (modificar) | `materialLancamento` em `ProductRow` |
| 4 | `packages/knowledge/src/use-cases/update-product.ts` (modificar) | `materialLancamento` no schema de update |
| 4 | `packages/knowledge/src/use-cases/__tests__/update-product.test.ts` (criar) | Testa persistência do material |
| 4 | `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx` (modificar) | Aba "Material de lançamento" |
| 5 | `packages/knowledge/src/use-cases/get-product-material.ts` (criar) | Lê material de um produto |
| 5 | `packages/knowledge/src/index.ts` (modificar) | Exporta `getProductMaterial` |
| 5 | `packages/agent/src/tools/consultar-material-produto.ts` (criar) | Tool sob demanda |
| 5 | `packages/agent/src/utils/resolve-enabled-tools.ts` (modificar) | Registra tool como always-on |
| 5 | `packages/agent/src/tools/registry.ts` (modificar) | Schema + dispatch da tool |
| 5 | `packages/agent/src/tools/__tests__/consultar-material-produto.test.ts` (criar) | Testa use-case + tool |

---

## Task 1: Expor "Produtos" na navegação de Conhecimento (P0-1)

**Files:**
- Create: `apps/dashboard/app/(shell)/conhecimento/layout.tsx`
- Test: `apps/dashboard/app/(shell)/conhecimento/__tests__/layout.test.tsx`

**Interfaces:**
- Produces: um layout que envolve todas as páginas `conhecimento/*` com sub-nav contendo links para `/conhecimento/faq`, `/conhecimento/objecoes`, `/conhecimento/produtos`.
- Padrão de referência: `apps/dashboard/app/(shell)/configuracoes/layout.tsx` (client component, `usePathname`, `cn`).

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/app/(shell)/conhecimento/__tests__/layout.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConhecimentoLayout from '../layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/conhecimento/faq' }));

describe('ConhecimentoLayout', () => {
  it('renders sub-nav links to FAQ, Objeções and Produtos', () => {
    render(<ConhecimentoLayout><div>conteúdo</div></ConhecimentoLayout>);
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/conhecimento/faq');
    expect(screen.getByRole('link', { name: 'Objeções' })).toHaveAttribute('href', '/conhecimento/objecoes');
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/conhecimento/produtos');
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @leedi/dashboard test app/(shell)/conhecimento/__tests__/layout.test.tsx`
Expected: FAIL — cannot find module `../layout`.

- [ ] **Step 3: Create the layout**

Create `apps/dashboard/app/(shell)/conhecimento/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@leedi/ui';

const CONHECIMENTO_NAV = [
  { href: '/conhecimento/faq', label: 'FAQ' },
  { href: '/conhecimento/objecoes', label: 'Objeções' },
  { href: '/conhecimento/produtos', label: 'Produtos' },
];

export default function ConhecimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      <nav className="hidden w-44 shrink-0 flex-col gap-1 md:flex">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conhecimento
        </p>
        {CONHECIMENTO_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @leedi/dashboard test app/(shell)/conhecimento/__tests__/layout.test.tsx`
Expected: PASS (3 assertions).

- [ ] **Step 5: Manual smoke + typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: 0 erros. (Opcional: subir o dashboard e confirmar que `/conhecimento` mostra a aba Produtos e navega para a lista existente.)

- [ ] **Step 6: Commit**

```bash
git add "apps/dashboard/app/(shell)/conhecimento/layout.tsx" "apps/dashboard/app/(shell)/conhecimento/__tests__/layout.test.tsx"
git commit -m "feat(dashboard): expose Produtos in Conhecimento sub-nav (P0-1)"
```

---

## Task 2: Seletor de produto na criação de campanha (P0-2)

**Files:**
- Modify: `apps/dashboard/app/(shell)/campanhas/page.tsx`
- Modify: `apps/dashboard/app/(shell)/campanhas/campaign-list-client.tsx`
- Test: `apps/dashboard/app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx`

**Interfaces:**
- Consumes: `listProducts({ tenantId, archived })` de `@leedi/knowledge` (já existente, retorna `ProductRow[]`).
- Produces: `CampaignListClient` passa a aceitar a prop `products: ProductOption[]` (`{ id: string; nome: string }`) e inclui `produtoId` no corpo do POST para `/api/tenants/:tenantId/campaigns` (API e proxy já aceitam `produtoId` — `CreateCampaignSchema`).

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignListClient } from '../campaign-list-client';

const PRODUCTS = [
  { id: 'p1', nome: 'Libras A2 Club' },
  { id: 'p2', nome: 'Box de Êxodo' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'new-camp' }) } as Response;
    }
    return { ok: true, json: async () => [] } as Response; // GET list
  }));
  // jsdom não implementa navegação
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
});

describe('CampaignListClient — product selector (P0-2)', () => {
  it('lists products in the create dialog and posts produtoId', async () => {
    render(<CampaignListClient tenantId="t1" products={PRODUCTS} />);

    fireEvent.click(screen.getAllByText('Nova campanha')[0]);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lançamento Junho' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'lancamento' } });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('Criar campanha'));

    await waitFor(() => {
      const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(postCall![1]!.body as string)).toMatchObject({
        nome: 'Lançamento Junho',
        tipo: 'lancamento',
        produtoId: 'p1',
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @leedi/dashboard test app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx`
Expected: FAIL — `CampaignListClient` não aceita `products`; não há campo "Produto".

- [ ] **Step 3: Add the `products` prop + selector to the client**

In `apps/dashboard/app/(shell)/campanhas/campaign-list-client.tsx`:

3a. Add the option type near the top (after the `Campaign` interface):

```tsx
interface ProductOption {
  id: string;
  nome: string;
}
```

3b. Extend `CreateFormState` (the interface around line 65) to carry the product id:

```tsx
interface CreateFormState {
  nome: string;
  tipo: Campaign['tipo'] | '';
  produtoId: string;
  dataInicio: string;
  dataFim: string;
}
```

3c. Change the component signature and initial form state:

```tsx
export function CampaignListClient({ tenantId, products }: { tenantId: string; products: ProductOption[] }) {
```
```tsx
  const [form, setForm] = useState<CreateFormState>({ nome: '', tipo: '', produtoId: '', dataInicio: '', dataFim: '' });
```

3d. Include `produtoId` in the POST body inside `handleCreate` (the `JSON.stringify({...})`):

```tsx
        body: JSON.stringify({
          nome: form.nome,
          tipo: form.tipo,
          produtoId: form.produtoId || undefined,
          dataInicio: form.dataInicio || undefined,
          dataFim: form.dataFim || undefined,
        }),
```

3e. Reset `produtoId` after a successful create (the `setForm({...})` after `setDialogOpen(false)`):

```tsx
      setForm({ nome: '', tipo: '', produtoId: '', dataInicio: '', dataFim: '' });
```

3f. Add the selector in the dialog form, immediately after the "Tipo" `<div className="space-y-1">…</div>` block (before the dates grid):

```tsx
            <div className="space-y-1">
              <Label htmlFor="produto">Produto</Label>
              <select
                id="produto"
                value={form.produtoId}
                onChange={(e) => setForm((f) => ({ ...f, produtoId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sem produto vinculado</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @leedi/dashboard test app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the products prop from the server page**

Replace the body of `apps/dashboard/app/(shell)/campanhas/page.tsx`:

```tsx
import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { listProducts } from '@leedi/knowledge';
import { CampaignListClient } from './campaign-list-client';

export default async function CampanhasPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;
  const products = await listProducts({ tenantId: currentTenant.tenantId, archived: false });

  return (
    <CampaignListClient
      tenantId={currentTenant.tenantId}
      products={products.map((p) => ({ id: p.id, nome: p.nome }))}
    />
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add "apps/dashboard/app/(shell)/campanhas/page.tsx" "apps/dashboard/app/(shell)/campanhas/campaign-list-client.tsx" "apps/dashboard/app/(shell)/campanhas/__tests__/campaign-list-client.test.tsx"
git commit -m "feat(dashboard): product selector in campaign create dialog (P0-2)"
```

---

## Task 2b: Seletor do produto de downsell na campanha (P0-2, fase downsell)

Contexto: o agente já lê `config.downsell.produto_id` na fase de downsell (`consultar-ofertas-ativas.ts`), mas **não há UI** para defini-lo — o `PhaseConfigEditor` (compartilhado pelas 3 fases) edita só urgência/mensagens/transição e **descarta** `produto_id`. Sem isto, uma campanha de lançamento (ex.: Libras A2 Club) oferece o produto principal na fase de downsell, em vez do downsell real (Box de Êxodo).

**Files:**
- Modify: `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx`
- Modify: `apps/dashboard/app/(shell)/campanhas/[id]/campaign-detail-client.tsx`
- Test: `apps/dashboard/app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx`

**Interfaces:**
- Consumes: `listProducts` (`@leedi/knowledge`); GET/PATCH `/api/tenants/:tenantId/campaigns/:id` (já existentes; PATCH aceita `{ config }`).
- Produces: na aba "Downsell", um `<select>` de produto cujo valor é salvo em `config.downsell.produto_id` (preservando urgência/mensagens/transição).

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignDetailClient } from '../campaign-detail-client';

const CAMPAIGN = {
  id: 'c1', nome: 'Lançamento Club', tipo: 'lancamento', fase: 'aquecimento',
  status: 'rascunho', produtoNome: 'Libras A2 Club', config: {},
};
const PRODUCTS = [
  { id: 'p-club', nome: 'Libras A2 Club' },
  { id: 'p-box', nome: 'Box de Êxodo' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return { ok: true, json: async () => ({ ...CAMPAIGN, config: JSON.parse(init.body as string).config }) } as Response;
    }
    return { ok: true, json: async () => CAMPAIGN } as Response; // GET on mount
  }));
});

describe('CampaignDetailClient — downsell product (P0-2b)', () => {
  it('saves config.downsell.produto_id from the downsell tab selector', async () => {
    render(<CampaignDetailClient tenantId="t1" campaignId="c1" products={PRODUCTS} />);

    await screen.findByText('Lançamento Club');
    fireEvent.click(screen.getByRole('button', { name: 'Downsell' }));
    fireEvent.change(await screen.findByLabelText('Produto de downsell'), { target: { value: 'p-box' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar fase/ }));

    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch![1]!.body as string).config.downsell.produto_id).toBe('p-box');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @leedi/dashboard test "app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx"`
Expected: FAIL — `CampaignDetailClient` não aceita `products`; não há campo "Produto de downsell".

- [ ] **Step 3: Add a ProductOption type and thread products through the editor**

Em `apps/dashboard/app/(shell)/campanhas/[id]/campaign-detail-client.tsx`:

3a. Após a interface `CampaignConfig` (linha ~18), adicione:

```tsx
interface ProductOption {
  id: string;
  nome: string;
}
```

3b. Estenda as props do `PhaseConfigEditor` (objeto de parâmetros, após `saving: boolean;`):

```tsx
  products?: ProductOption[];
```

3c. Dentro de `PhaseConfigEditor`, adicione estado do produto (após `const [transicaoData, setTransicaoData] = useState(...)`):

```tsx
  const [produtoId, setProdutoId] = useState((config as { produto_id?: string }).produto_id ?? '');
```

3d. Em `handleSave`, troque o tipo de `cfg` e preserve `produto_id` na fase downsell. Substitua:

```tsx
    const cfg: PhaseConfig = { transicao: { tipo: transicaoTipo } };
```
por:
```tsx
    const cfg: PhaseConfig & { produto_id?: string } = { transicao: { tipo: transicaoTipo } };
```
e, logo antes de `await onSave(phaseKey, cfg);`, adicione:
```tsx
    if (phaseKey === 'downsell' && produtoId) cfg.produto_id = produtoId;
```

3e. Renderize o seletor só na fase downsell. Logo após o bloco `</div>` do campo "Mensagem de urgência" (antes do bloco "Mensagens-chave"), adicione:

```tsx
      {phaseKey === 'downsell' && products && (
        <div className="space-y-1">
          <Label htmlFor="downsell-produto">Produto de downsell</Label>
          <select
            id="downsell-produto"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Usar o produto principal da campanha</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      )}
```

3f. Adicione `products` à assinatura do `CampaignDetailClient`:

```tsx
export function CampaignDetailClient({
  tenantId,
  campaignId,
  products,
}: {
  tenantId: string;
  campaignId: string;
  products: ProductOption[];
}) {
```

3g. Passe `products` ao editor por-fase (a instância em ~linha 314, dentro do ramo não-perpétuo):

```tsx
              <PhaseConfigEditor
                phaseKey={activeTab}
                config={campaign.config[activeTab] ?? {}}
                onSave={handlePhaseConfigSave}
                saving={savingPhase}
                products={products}
              />
```

(O editor do ramo perpétuo NÃO recebe `products` — perpétuo não tem fase de downsell.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @leedi/dashboard test "app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Wire products from the server page**

Replace the body of `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx`:

```tsx
import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { listProducts } from '@leedi/knowledge';
import { CampaignDetailClient } from './campaign-detail-client';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;
  const products = await listProducts({ tenantId: currentTenant.tenantId, archived: false });

  return (
    <CampaignDetailClient
      tenantId={currentTenant.tenantId}
      campaignId={id}
      products={products.map((p) => ({ id: p.id, nome: p.nome }))}
    />
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add "apps/dashboard/app/(shell)/campanhas/[id]/page.tsx" "apps/dashboard/app/(shell)/campanhas/[id]/campaign-detail-client.tsx" "apps/dashboard/app/(shell)/campanhas/[id]/__tests__/campaign-detail-client.test.tsx"
git commit -m "feat(dashboard): downsell product selector on campaign detail (P0-2b)"
```

---

## Task 3: Venda passiva — catálogo completo sem campanha (P0-3)

**Files:**
- Modify: `packages/agent/src/tools/consultar-ofertas-ativas.ts`
- Modify: `packages/agent/src/tools/__tests__/consultar-ofertas-ativas.test.ts`

**Interfaces:**
- A assinatura pública de `consultarOfertasAtivas(ctx)` e o tipo `OfertasAtivasResult` (`{ produtos: EffectiveProduto[]; campanha: ActiveCampaignContext | null }`) permanecem inalterados.
- Mudança de comportamento: quando **não há campanha** (e sem `ctx.campaignId`), retorna **todos os produtos ativos** mapeados para `EffectiveProduto`, com `campanha: null` (venda passiva). Com campanha, comportamento atual preservado.

- [ ] **Step 1: Update the test mock to support an unbounded products query**

Em `consultar-ofertas-ativas.test.ts`, substitua a fábrica `makeTx` dentro de `vi.mock('@leedi/db', …)` para que `where()` seja **awaitable** (retorna todas as linhas) **e** exponha `.limit()` (retorna fatia):

```ts
  const makeTx = () => ({
    select: () => ({
      from(table: { __name: string }) {
        const rows = () =>
          table.__name === 'campaigns' ? mockCampaigns
          : table.__name === 'products' ? mockProducts
          : [];
        return {
          where(cond: unknown) {
            void cond;
            const all = rows();
            const p = Promise.resolve(all);
            return Object.assign(p, {
              limit: (_n: number) => Promise.resolve(all.slice(0, _n)),
            });
          },
        };
      },
    }),
  });
```

- [ ] **Step 2: Update the "no campaign" test + add the passive test**

Substitua o teste `AC#3` por uma versão de venda passiva e acrescente um caso multi-produto:

```ts
  it('passive sell: returns ALL active products with campanha null when no campaign', async () => {
    mockCampaigns = [];
    mockProducts = [basePrincipalProduct, baseDownsellProduct];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha).toBeNull();
    expect(res.produtos.map((p) => p.id)).toEqual([PRODUCT_ID, DOWNSELL_PRODUCT_ID]);
    expect(res.produtos[0]?.argumentos).toEqual(['arg']);
  });

  it('passive sell: returns empty produtos when there are no active products', async () => {
    mockCampaigns = [];
    mockProducts = [];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.produtos).toEqual([]);
    expect(res.campanha).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @leedi/agent test src/tools/__tests__/consultar-ofertas-ativas.test.ts`
Expected: FAIL — hoje o branch sem campanha retorna `{ produtos: [], campanha: null }`.

- [ ] **Step 4: Extract a mapper and implement the passive branch**

Em `packages/agent/src/tools/consultar-ofertas-ativas.ts`:

4a. Adicione um mapper reutilizável (após a função `getInstrucaoComercial`):

```ts
function toEffectiveProduto(product: Record<string, unknown>): EffectiveProduto {
  return {
    id: product.id as string,
    nome: product.nome as string,
    preco: product.preco as string,
    precoParcelado: product.precoParcelado as string | null,
    parcelas: product.parcelas as number | null,
    linkCheckout: product.linkCheckout as string,
    tipo: product.tipo as string,
    argumentos: (product.argumentos as string[]) ?? [],
    diferenciais: (product.diferenciais as string[]) ?? [],
    provasSociais: (product.provasSociais as string[]) ?? [],
    garantia: product.garantia as string | null,
    bonus: (product.bonus as string[]) ?? [],
    gatewayProductId: product.gatewayProductId as string | null,
  };
}
```

4b. Substitua o branch `if (!campaign) { return { produtos: [], campanha: null }; }` por uma busca do catálogo ativo (venda passiva):

```ts
    if (!campaign) {
      // Venda passiva: sem campanha ativa, o agente enxerga TODO o catálogo
      // ativo e escolhe o produto que atende ao lead percorrendo o funil.
      const activeProducts = await tx
        .select()
        .from(schema.products)
        .where(
          and(
            eq(schema.products.tenantId, ctx.tenantId),
            eq(schema.products.ativo, true)
          )
        );
      return {
        produtos: activeProducts.map((p) => toEffectiveProduto(p as Record<string, unknown>)),
        campanha: null,
      };
    }
```

4c. (Opcional, mesma task) Reaproveite `toEffectiveProduto` no branch com campanha, substituindo o objeto literal `effectiveProduto` por `const effectiveProduto = toEffectiveProduto(product as Record<string, unknown>);`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @leedi/agent test src/tools/__tests__/consultar-ofertas-ativas.test.ts`
Expected: PASS (todos os casos, inclusive os de campanha existentes).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @leedi/agent typecheck`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/tools/consultar-ofertas-ativas.ts packages/agent/src/tools/__tests__/consultar-ofertas-ativas.test.ts
git commit -m "feat(agent): passive selling returns full active catalog when no campaign (P0-3)"
```

---

## Task 4: Coluna de material de lançamento + UI de edição (P0-4a)

**Files:**
- Modify: `packages/db/src/schema/knowledge.ts`
- Create: `packages/db/migrations/0020_product_material_lancamento.sql`
- Modify: `packages/knowledge/src/use-cases/create-product.ts` (apenas o tipo `ProductRow`)
- Modify: `packages/knowledge/src/use-cases/update-product.ts`
- Create: `packages/knowledge/src/use-cases/__tests__/update-product.test.ts`
- Modify: `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx`

**Interfaces:**
- Produces: coluna `products.material_lancamento` (`text`, nullable) ⇄ propriedade Drizzle `materialLancamento`; `ProductRow.materialLancamento: string | null`; `updateProductSchema` aceita `materialLancamento`.
- Consumes (UI): PATCH existente `/api/tenants/:tenantId/knowledge/products/:id` (já roteia para `updateProduct`).

- [ ] **Step 1: Add the column to the Drizzle schema**

Em `packages/db/src/schema/knowledge.ts`, dentro de `products`, após a linha `gatewayProductId: text('gateway_product_id'),`:

```ts
  materialLancamento: text('material_lancamento'),
```

- [ ] **Step 2: Create the migration file**

Create `packages/db/migrations/0020_product_material_lancamento.sql`:

```sql
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "material_lancamento" text;
```

- [ ] **Step 3: Apply the migration directly (journal is desynced)**

NÃO rodar `drizzle-kit generate`/`migrate` (journal dessincronizado — ver Global Constraints). Aplicar o DDL diretamente no banco de desenvolvimento da mesma forma que 0017–0019 foram aplicados (ex.: console SQL do Supabase, ou `psql "$DATABASE_URL" -f packages/db/migrations/0020_product_material_lancamento.sql`).

Verificar:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'material_lancamento';
```
Expected: 1 linha.

- [ ] **Step 4: Add the field to the ProductRow type**

Em `packages/knowledge/src/use-cases/create-product.ts`, na interface `ProductRow`, após `gatewayProductId: string | null;`:

```ts
  materialLancamento: string | null;
```

- [ ] **Step 5: Write the failing update-product test**

Create `packages/knowledge/src/use-cases/__tests__/update-product.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedSet: Record<string, unknown> | null = null;

vi.mock('@leedi/db', () => {
  const makeTx = () => ({
    update: () => ({
      set(values: Record<string, unknown>) {
        capturedSet = values;
        return {
          where() {
            return {
              returning: () =>
                Promise.resolve([{ id: 'p1', tenantId: 't1', materialLancamento: values.materialLancamento ?? null }]),
            };
          },
        };
      },
    }),
  });
  return {
    withTenant: vi.fn((_id: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
    schema: { products: {} },
    eq: vi.fn(() => ({})),
    and: vi.fn((...a: unknown[]) => a),
  };
});

beforeEach(() => { capturedSet = null; });

describe('updateProduct — materialLancamento (P0-4a)', () => {
  it('accepts and persists materialLancamento', async () => {
    const { updateProduct } = await import('../update-product.js');
    const row = await updateProduct({
      tenantId: '00000000-0000-0000-0000-000000000001',
      productId: '00000000-0000-0000-0000-000000000002',
      materialLancamento: 'Script CPL 1: ...\nGatilho de escassez: ...',
    });
    expect(capturedSet).toMatchObject({ materialLancamento: 'Script CPL 1: ...\nGatilho de escassez: ...' });
    expect(row?.materialLancamento).toContain('Script CPL 1');
  });

  it('rejects a non-string materialLancamento', async () => {
    const { updateProduct } = await import('../update-product.js');
    await expect(
      updateProduct({
        tenantId: '00000000-0000-0000-0000-000000000001',
        productId: '00000000-0000-0000-0000-000000000002',
        // @ts-expect-error invalid type on purpose
        materialLancamento: 123,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @leedi/knowledge test src/use-cases/__tests__/update-product.test.ts`
Expected: FAIL — `materialLancamento` não está no schema; não chega ao `.set()`.

- [ ] **Step 7: Add materialLancamento to updateProductSchema**

Em `packages/knowledge/src/use-cases/update-product.ts`, em `updateProductSchema`, após `garantia: z.string().optional().nullable(),`:

```ts
  materialLancamento: z.string().optional().nullable(),
```

(`materialLancamento` já flui para o `.set()` via `...rest` — nenhuma outra mudança no use-case.)

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @leedi/knowledge test src/use-cases/__tests__/update-product.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the "Material de lançamento" tab to the product edit UI**

Em `apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx`:

9a. Estenda o tipo `Tab` e a lista `TABS`:

```tsx
type Tab = "basico" | "argumentos" | "diferenciais" | "provas" | "garantia" | "bonus" | "material";
```
```tsx
  { id: "garantia", label: "Garantia" },
  { id: "bonus", label: "Bônus" },
  { id: "material", label: "Material de lançamento" },
```

9b. Adicione o estado local (junto aos demais `useState` de material):

```tsx
  const [material, setMaterial] = useState(product.materialLancamento ?? "");
```

9c. Adicione a função de salvar (após `saveGarantia`):

```tsx
  async function saveMaterial2() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/knowledge/products/${product.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materialLancamento: material }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao salvar.");
      } else {
        setSuccess("Material salvo com sucesso.");
        setTimeout(() => setSuccess(null), 2000);
      }
    } finally {
      setSaving(false);
    }
  }
```

9d. Adicione o painel da aba (após o bloco `{activeTab === "bonus" && (…)}`):

```tsx
      {/* Material de lançamento tab */}
      {activeTab === "material" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Cole aqui o material de lançamento: scripts de CPL, roteiro do vídeo de vendas,
            gatilhos e contexto da oferta. O agente consulta este material sob demanda.
          </p>
          <textarea
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            rows={16}
            placeholder="Ex: CPL 1 — A grande oportunidade...\nGatilhos: escassez (turma fecha sexta), prova social..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <button
            type="button"
            onClick={saveMaterial2}
            disabled={saving}
            className="self-start inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar material"}
          </button>
        </div>
      )}
```

- [ ] **Step 10: Typecheck both packages**

Run: `pnpm --filter @leedi/knowledge typecheck`
Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: 0 erros. (`product.materialLancamento` resolve porque `ProductRow` ganhou o campo no Step 4.)

- [ ] **Step 11: Commit**

```bash
git add packages/db/src/schema/knowledge.ts packages/db/migrations/0020_product_material_lancamento.sql packages/knowledge/src/use-cases/create-product.ts packages/knowledge/src/use-cases/update-product.ts packages/knowledge/src/use-cases/__tests__/update-product.test.ts "apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx"
git commit -m "feat(knowledge): per-product launch material field + authoring tab (P0-4a)"
```

---

## Task 5: Tool sob demanda para o material de lançamento (P0-4b)

**Files:**
- Create: `packages/knowledge/src/use-cases/get-product-material.ts`
- Modify: `packages/knowledge/src/index.ts`
- Create: `packages/agent/src/tools/consultar-material-produto.ts`
- Modify: `packages/agent/src/utils/resolve-enabled-tools.ts`
- Modify: `packages/agent/src/tools/registry.ts`
- Create: `packages/agent/src/tools/__tests__/consultar-material-produto.test.ts`

**Interfaces:**
- Produces: `getProductMaterial(tenantId: string, productId: string): Promise<{ nome: string; materialLancamento: string | null } | null>`.
- Produces: tool `consultar_material_produto` (always-on), input `{ productId: string }` (required), retorno `{ encontrado: boolean; nome?: string; material?: string }`.
- Consumes: `ToolContext.tenantId`.

- [ ] **Step 1: Write the failing use-case test**

Create `packages/agent/src/tools/__tests__/consultar-material-produto.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows: Array<{ nome: string; materialLancamento: string | null }> = [];

vi.mock('@leedi/db', () => {
  const makeTx = () => ({
    select: () => ({
      from() {
        return { where() { return { limit: () => Promise.resolve(mockRows) }; } };
      },
    }),
  });
  return {
    withTenant: vi.fn((_id: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
    schema: { products: { nome: {}, materialLancamento: {}, id: {}, tenantId: {}, ativo: {} } },
    eq: vi.fn(() => ({})),
    and: vi.fn((...a: unknown[]) => a),
  };
});

beforeEach(() => { mockRows = []; vi.resetModules(); });

describe('consultarMaterialProduto (P0-4b)', () => {
  it('returns the product material when found', async () => {
    mockRows = [{ nome: 'Libras A2 Club', materialLancamento: 'CPL 1: ...' }];
    const { consultarMaterialProduto } = await import('../consultar-material-produto.js');
    const res = await consultarMaterialProduto({ productId: 'p1' }, { tenantId: 't1' });
    expect(res).toEqual({ encontrado: true, nome: 'Libras A2 Club', material: 'CPL 1: ...' });
  });

  it('returns encontrado:false when the product has no material / does not exist', async () => {
    mockRows = [];
    const { consultarMaterialProduto } = await import('../consultar-material-produto.js');
    const res = await consultarMaterialProduto({ productId: 'nope' }, { tenantId: 't1' });
    expect(res).toEqual({ encontrado: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @leedi/agent test src/tools/__tests__/consultar-material-produto.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement the knowledge use-case**

Create `packages/knowledge/src/use-cases/get-product-material.ts`:

```ts
import { withTenant, schema, eq, and } from '@leedi/db';

export interface ProductMaterial {
  nome: string;
  materialLancamento: string | null;
}

/**
 * Returns a product's launch material (CPL/VSL scripts, gatilhos) for on-demand
 * agent consultation, or null when the product doesn't exist / isn't active.
 */
export async function getProductMaterial(
  tenantId: string,
  productId: string
): Promise<ProductMaterial | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ nome: schema.products.nome, materialLancamento: schema.products.materialLancamento })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          eq(schema.products.id, productId),
          eq(schema.products.ativo, true)
        )
      )
      .limit(1);

    return (rows[0] as ProductMaterial) ?? null;
  });
}
```

- [ ] **Step 4: Export it from the knowledge package**

Em `packages/knowledge/src/index.ts`, após a linha `export { getProduct } from './use-cases/get-product.js';`:

```ts
export { getProductMaterial } from './use-cases/get-product-material.js';
export type { ProductMaterial } from './use-cases/get-product-material.js';
```

- [ ] **Step 5: Implement the agent tool**

Create `packages/agent/src/tools/consultar-material-produto.ts`:

```ts
// Tool: consultar_material_produto — on-demand deep product dossier.
//
// Returns the long-form launch material (CPL/VSL scripts, gatilhos, oferta
// context) for a specific product. Kept out of the always-on prompt to control
// token cost; the agent calls it only when it needs deep selling context.
//
// schema-vs-ctx boundary: Claude supplies { productId }. tenantId comes from ctx.

import { getProductMaterial } from '@leedi/knowledge';
import type { ToolContext } from './types.js';

export interface ConsultarMaterialProdutoInput {
  productId: string;
}

export type ConsultarMaterialProdutoResult =
  | { encontrado: true; nome: string; material: string | null }
  | { encontrado: false };

export async function consultarMaterialProduto(
  input: ConsultarMaterialProdutoInput,
  ctx: Pick<ToolContext, 'tenantId'>
): Promise<ConsultarMaterialProdutoResult> {
  const row = await getProductMaterial(ctx.tenantId, input.productId);
  if (!row) return { encontrado: false };
  return { encontrado: true, nome: row.nome, material: row.materialLancamento };
}
```

- [ ] **Step 6: Register the tool as always-on**

Em `packages/agent/src/utils/resolve-enabled-tools.ts`, acrescente ao array `ALWAYS_ON_TOOLS` (após `'marcar_intencao_compra',`):

```ts
  'consultar_material_produto',
```

- [ ] **Step 7: Wire the schema + dispatch in the registry**

Em `packages/agent/src/tools/registry.ts`:

7a. Import (após `import { consultarOfertasAtivas } from './consultar-ofertas-ativas.js';`):

```ts
import { consultarMaterialProduto } from './consultar-material-produto.js';
```

7b. Tool definition em `TOOL_DEFINITIONS`, na seção Always-on (após o bloco `marcar_intencao_compra`):

```ts
  consultar_material_produto: {
    name: 'consultar_material_produto',
    description:
      'Consulta o material de lançamento detalhado de um produto específico (scripts de CPL, roteiro do vídeo de vendas, gatilhos e contexto da oferta). Use quando precisar de contexto aprofundado para vender um produto. Informe o productId obtido em consultar_ofertas_ativas.',
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'ID do produto cujo material de lançamento será consultado.',
        },
      },
      required: ['productId'],
    },
  },
```

7c. Dispatch em `routeToolCall`, junto aos casos always-on (após o `case 'consultar_ofertas_ativas':`):

```ts
    case 'consultar_material_produto':
      return consultarMaterialProduto({ productId: String(input.productId ?? '') }, ctx);
```

- [ ] **Step 8: Run the tool test + the full agent suite**

Run: `pnpm --filter @leedi/agent test src/tools/__tests__/consultar-material-produto.test.ts`
Expected: PASS.

Run: `pnpm --filter @leedi/agent test`
Expected: PASS. (Os testes de `registry`/`resolve-enabled-tools` referenciam `ALWAYS_ON_TOOLS.length` dinamicamente, então acomodam a nova tool. Se algum teste afirmar uma contagem fixa de tools em outro lugar, atualize-o para incluir `consultar_material_produto`.)

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @leedi/knowledge typecheck`
Run: `pnpm --filter @leedi/agent typecheck`
Expected: 0 erros.

- [ ] **Step 10: Commit**

```bash
git add packages/knowledge/src/use-cases/get-product-material.ts packages/knowledge/src/index.ts packages/agent/src/tools/consultar-material-produto.ts packages/agent/src/utils/resolve-enabled-tools.ts packages/agent/src/tools/registry.ts packages/agent/src/tools/__tests__/consultar-material-produto.test.ts
git commit -m "feat(agent): on-demand consultar_material_produto tool (P0-4b)"
```

---

## Self-Review (preenchido)

**Spec coverage (faixa P0):**
- P0-1 (expor Produtos) → Task 1. ✓
- P0-2 (seletor de produto na campanha) → Task 2 (produto principal na criação) + Task 2b (produto de downsell por fase). ✓ (API/proxy já aceitam `produtoId`; PATCH aceita `config`.)
- P0-3 (venda passiva = catálogo completo) → Task 3. ✓
- P0-4 (material de lançamento, consumo sob demanda) → Task 4 (campo + UI) + Task 5 (tool). ✓ (`getProduct` usa `.select()` sem projeção → a nova coluna volta no reload; verificado.)
- P1-5 (contexto do disparo) e P2-6/7/8 (abas de Configurações) → **fora deste plano**; receberão planos próprios após as verificações de plano-fase (caminho disparo→conversa→prompt; home do `cpfCnpj` para CNPJ/endereço).

**Placeholder scan:** sem TBD/TODO; todo passo com código real e comandos com saída esperada.

**Type consistency:** `ProductRow.materialLancamento` (Task 4) é consumido pela UI (Task 4) e o nome de coluna Drizzle `materialLancamento`→`material_lancamento` é usado em `get-product-material.ts` (Task 5). `consultarMaterialProduto` e `getProductMaterial` têm assinaturas consistentes entre Task 5 e seus testes. `EffectiveProduto` (Task 3) reusa o tipo já existente. `ProductOption` (Task 2) é local ao client + page.

**Observações de risco já endereçadas:** journal de migração dessincronizado (aplicar SQL direto); mock de `@leedi/db` ajustado para query sem `.limit()` (Task 3); tool always-on não quebra os testes dinâmicos de contagem.

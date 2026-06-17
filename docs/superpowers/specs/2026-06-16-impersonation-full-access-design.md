# Design — Impersonação com acesso total (unificação da resolução de tenant)

- **Data:** 2026-06-16
- **Branch:** redesign/v2-gemini
- **Origem:** sessão de testes de usabilidade Tier 0 (F-30) + necessidade de negócio ("setup feito-para-você")
- **Relacionado:** commit `6b8b3c0` (F-30 — impersonação platform-wide), PL-10, `_bmad-output/implementation-artifacts/roteiro-testes-usabilidade.md`

## Problema

Um `super_admin` (operador) precisa **assumir um tenant de cliente e configurá-lo por inteiro** — agente, base de conhecimento, conexão WhatsApp, templates — como serviço pago ("configuro e entrego ao cliente"). Depois da entrega, o cliente assume o painel; o operador volta pontualmente para suporte.

Hoje a impersonação inicia (banner aparece, sem 403 — corrigido no F-30) mas **não dá acesso de trabalho**: ao navegar os menus, as páginas de conteúdo mostram "Nenhum workspace encontrado" e as `/settings/*` caem em `/403`.

**Causa raiz:** ~32 páginas do dashboard reimplementam *inline* o bloco de resolução de tenant — `listUserTenants(session.user.id)` + header `x-leedi-tenant-id`. Sob impersonação, `session.user.id` é o super_admin, que **não tem membership em tenant nenhum** → lista vazia → a página não resolve o tenant. O tenant estar saudável é irrelevante: a página pergunta "de quais tenants ESTE usuário é membro?", e não "qual tenant estou impersonando?".

Provado empiricamente (2026-06-16): impersonando "Academia Teste J-02" (tenant pós-F-31 saudável: `active`, `onboarding_completed=true`, workspace + membership owner), `/settings/uso` (que usa o helper compartilhado) **renderiza**, mas a home (resolução inline) mostra "Nenhum workspace".

## Objetivo

Fazer a impersonação dar ao operador acesso de trabalho **total** a todas as páginas do dashboard do tenant impersonado, para configurá-lo ponta-a-ponta e depois entregar ao cliente.

### Fora de escopo (YAGNI)
- **Gatilho de wizard de onboarding** para o operador. Tudo que o wizard faz já está exposto nos menus normais (Agente, Conhecimento, WhatsApp, Templates). O wizard guiado pode ser adicionado depois se houver demanda.
- **Mudança na janela de 1h** da impersonação. Mantida (decisão de segurança "sem renovação silenciosa" da Story 2.8). O trabalho é gravado no banco a cada salvamento, então expirar a sessão **não perde dados** — basta re-assumir.
- **Cobertura de auditoria de server actions diretas.** Lacuna pré-existente (deferred-work); escritas que passam pelos proxies de API continuam auditadas.
- **Página `app/onboarding/page.tsx`** (fora de `(shell)`): é a superfície de handover usada pelo **cliente** (que é membro), onde o caminho de membership funciona normalmente. Não entra no passe.

## Princípio de arquitetura

**Fonte única de verdade** para "qual é o tenant ativo desta request". O helper `getCurrentTenantContext()` (`apps/dashboard/lib/tenant-context.ts`) já é impersonation-aware (corrigido no F-30): quando há um overlay de impersonação válido (cookie presente + dono == sessão + não expirado + super_admin + tenant existe), ele sintetiza um contexto com role `owner`; caso contrário, cai no caminho de membership.

Cada página passa a chamar esse helper em vez de reimplementar a resolução. A lógica de impersonação vive num lugar só; as páginas ficam consistentes e "burras".

## Componentes

### 1. Helper compartilhado — sem mudança
`getCurrentTenantContext()` e `requireTenantRouteAccess()` já existem e estão testados (gates: impersonação válida/expirada/forjada, super_admin, owner sintetizado, fallback de membership). Retorna `{ userId, tenant: UserTenant, role: TenantRole } | null`.

### 2. Páginas `(shell)` com resolução inline — trocar (passe único)
Todas as páginas que hoje fazem:
```ts
const session = await getSession(requestHeaders);
if (!session) return <Sessão expirada>;
const tenants = await listUserTenants(session.user.id);
const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
const currentTenant = tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];
if (!currentTenant) return <Nenhum workspace encontrado>;
// ...usa currentTenant.tenantId
```
passam a fazer:
```ts
const ctx = await getCurrentTenantContext();
if (!ctx) return <Nenhum workspace encontrado>;
// ...usa ctx.tenant.tenantId  (e ctx.role / ctx.tenant.name / .slug onde necessário)
```

Notas:
- O ramo "Sessão expirada" é defensivo — o middleware do dashboard já redireciona não-autenticado para o login antes da página renderizar — então colapsa para o fallback único "Nenhum workspace encontrado". (Comportamento visível só num caso que praticamente não ocorre.)
- Conjunto-alvo: as páginas listadas pelo `grep listUserTenants apps/dashboard/app` **exceto** `layout.tsx` (já trata impersonação separadamente e usa `listUserTenants` só para popular o seletor de tenants — correto manter) e `onboarding/page.tsx` (fora de escopo). A lista exata é enumerada no plano de implementação; estimativa ~32 páginas.

### 3. Server actions com resolução inline — trocar
Server actions que resolvem o tenant inline via `listUserTenants` (atualmente: `apps/dashboard/app/(shell)/settings/whatsapp/actions.ts`) recebem a mesma troca, para que o operador consiga executar a conexão WhatsApp e ações afins sob impersonação. Conjunto exato confirmado no plano. (Escritas pelos proxies de API já são auditadas; a lacuna de auditoria de server actions diretas permanece como item pré-existente.)

### 4. `/settings/*` — sem mudança
Já usam `requireTenantRouteAccess` (impersonation-aware). Renderizam sob impersonação com role `owner`.

## Fluxo (ponta-a-ponta)

1. Operador cria o tenant no admin (`/clientes` → "Criar tenant", convida o owner por e-mail) **ou** o cliente se cadastra (self-serve).
2. Operador clica **"Impersonar"** no `/clientes` → entra no dashboard como o tenant, com acesso total.
3. Operador configura via menus normais: Agente, Conhecimento, WhatsApp, Templates, etc. Cada salvamento grava no banco (auditado na camada de API).
4. Operador **não** completa o onboarding (sem gatilho). Sai do modo suporte.
5. **Handover (sem código novo):** o cliente loga pela 1ª vez → o layout vê `trial` + `onboarding_completed=false` → redireciona para `/onboarding` → wizard com os dados já preenchidos pelo operador → o cliente **revisa e ativa** (`trial → active`).
6. Pós-entrega: o cliente edita qualquer config quando quiser (owner). Exceção combinada: a conexão WhatsApp é tipicamente deixada pronta pelo operador. Suporte pontual do operador = nova impersonação (efêmera, auditada).

## Tratamento de erros / segurança

- Resolução fail-closed: sem contexto resolvível → "Nenhum workspace encontrado" (páginas de conteúdo) ou `/403` (rotas RBAC), como hoje.
- Impersonação continua com TTL de 1h, sem renovação silenciosa, validada server-side a cada render. Re-assumir é um clique.
- Escritas sob impersonação que passam pelos proxies `/api/tenants/*` são auditadas (`requireTenantSession`, fail-closed). Server actions diretas: lacuna pré-existente documentada.

## Testes

1. **Unit (helper):** já cobertos — impersonação válida/expirada/forjada, não-super_admin, owner sintetizado, fallback de membership.
2. **Teste de guarda (novo):** falha se alguma `page.tsx` sob `apps/dashboard/app/(shell)` importar `listUserTenants` diretamente. Impede a regressão do padrão inline (a confusão "uns menus 403, outros 'Nenhum workspace'").
3. **E2E no browser:** impersonar um tenant cross-workspace → percorrer Dashboard, Conversas, Leads, Agente, Playground, Conhecimento, Campanhas, Templates, Disparos, Configurações → cada um renderiza (sem `/403`, sem "Nenhum workspace").
4. **Typecheck** limpo nos pacotes afetados.

## Rollout

Passe único: criar/confirmar o helper (pronto) → trocar todas as páginas + actions alvo → teste de guarda → verificação e2e. Sem migração de dados; mudança puramente na camada de resolução de leitura das páginas.

## Critérios de aceite

- [ ] Toda página `(shell)` resolve o tenant ativo via `getCurrentTenantContext()` / `requireTenantRouteAccess()` (nenhuma `page.tsx` importa `listUserTenants` direto).
- [ ] Impersonando um tenant, todas as seções de menu renderizam (sem `/403`, sem "Nenhum workspace").
- [ ] Operador consegue salvar configuração de agente, conhecimento, WhatsApp e templates sob impersonação.
- [ ] Fluxo não-impersonado (usuário membro normal) inalterado.
- [ ] Teste de guarda + e2e + typecheck verdes.

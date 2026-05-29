# Leedi — Plano de Execução

> **Versão:** 1.0
> **Codinome:** Leedi (provisório)
> **Companion:** `01-leedi-arquitetura.md` e `02-leedi-prd.md`
> **Objetivo:** Construir o Leedi com Claude Code + BMAD, em fases, sem refação, sem o agente se perder no contexto.

---

## 0. Filosofia de execução

A dor do projeto anterior foi acúmulo: cada conversa adicionava SQL, prompt e fluxo sem fronteira, até virar algo impossível de manter. Este plano evita isso com três regras:

1. **Construir por módulo isolado, com "pronto" definido.** Um módulo só é considerado pronto quando passa seus critérios de aceite. Não se avança deixando módulo pela metade.
2. **Dependências antes de dependentes.** A ordem abaixo respeita o grafo de dependências — você nunca constrói algo que precisa de uma base que ainda não existe.
3. **Contexto enxuto por sessão.** Cada sessão do Claude Code foca em UM módulo (ou um par fortemente relacionado). Você não pede "constrói o sistema todo" — você pede "constrói o módulo X conforme o PRD e a arquitetura". Isso mantém o agente preciso.

---

## 1. O que é BMAD e como usaremos

BMAD (Breakthrough Method for Agile AI-Driven Development) organiza a construção em **agentes especializados** que assumem papéis: Analyst, PM, Architect, Scrum Master, Dev, QA. No Claude Code, cada agente tem um foco.

Mapeamento para o Leedi:

| Agente BMAD      | Papel aqui                                  | Insumo                    |
| ---------------- | ------------------------------------------- | ------------------------- |
| **Analyst**      | Entender requisitos, esclarecer             | `02-leedi-prd.md`         |
| **PM**           | Quebrar em épicos e histórias               | PRD → épicos por módulo   |
| **Architect**    | Decisões técnicas, estrutura                | `01-leedi-arquitetura.md` |
| **Scrum Master** | Transformar histórias em tarefas para o Dev | Épicos → stories          |
| **Dev**          | Implementar                                 | Stories + arquitetura     |
| **QA**           | Validar contra critérios de aceite          | Critérios do PRD          |

**Como alimentar:** coloque os três documentos no contexto do projeto (pasta `docs/` do repo). Os agentes BMAD referenciam esses documentos. Você roda o ciclo módulo a módulo.

---

## 2. Setup inicial do projeto (Fase 0 — Fundação)

Antes de qualquer módulo de negócio, a fundação. Esta fase é uma sessão dedicada.

### 2.1 Tarefas da fundação

1. Inicializar monorepo Turborepo + pnpm workspaces (estrutura da seção 4 da arquitetura)
2. Configurar TypeScript strict, ESLint, Prettier compartilhados (`tooling/`)
3. Configurar `packages/config` com schema de env (Zod) e validação no boot
4. Configurar `packages/db` — Drizzle + conexão Supabase + estrutura de migrations
5. Configurar `packages/ui` — shadcn/ui + tokens de cor Leedi (seção 3.2 do PRD) + dark/light
6. Configurar `packages/auth` — Better-Auth base
7. Criar as 3 apps Next.js vazias (`web`, `dashboard`, `admin`) + app `api` (Hono)
8. Configurar Sentry, PostHog, Better Stack (stubs)
9. Setup de ambientes (local com docker-compose ou Supabase branch; env de staging)
10. CI básico (lint + typecheck + build + migrations)

### 2.2 Critério de "pronto" da fundação

- [ ] `pnpm install && pnpm build` passa sem erro
- [ ] As 3 apps sobem localmente
- [ ] `packages/db` conecta no Supabase e roda uma migration de teste
- [ ] Tokens de cor aplicados, dark/light alternando
- [ ] Env validado no boot (falha clara se faltar variável)

### 2.3 Prompt sugerido para o Claude Code (Fase 0)

> "Leia `docs/01-leedi-arquitetura.md` seções 3 e 4. Inicialize o monorepo Turborepo com a estrutura de pastas exata da seção 4. Configure pnpm workspaces, TypeScript strict, ESLint/Prettier compartilhados em `tooling/`, e o `packages/config` com validação de env por Zod conforme seção 9.1. Não implemente nenhum módulo de negócio ainda — só a fundação. Ao final, garanta que `pnpm build` passa e as 3 apps Next.js sobem."

---

## 3. Ordem de construção (grafo de dependências)

A ordem abaixo é otimizada: cada item só depende de itens anteriores. Siga-a.

```
FASE 0  — Fundação (monorepo, db, ui, auth base, apps vazias)
   │
FASE 1  — Tenancy + Auth completo (Módulo 1)
   │       └─ workspaces, tenants, users, memberships, RBAC, RLS
   │
FASE 2  — Connection WhatsApp (Módulo 3)
   │       └─ adapter Meta Cloud, webhook entrada, envio
   │
FASE 3  — Lead + Messaging (Módulos 12 + 11-base)
   │       └─ leads, janelas 24h, mensagens (particionadas), CSV import
   │
FASE 4  — Knowledge + Sales Method (Módulos 5 + 7)
   │       └─ produtos, base conhecimento, 4 métodos (seed)
   │
FASE 5  — Agent + Agent Memory (Módulo 4)  ★ CORE
   │       └─ Agent SDK, tools, memória isolada, roteamento de modelo
   │
FASE 6  — Playground (Módulo 8)
   │       └─ testar agente sem produção
   │
FASE 7  — Campaign (Módulo 6)
   │       └─ campanhas, fases, transição, segmentos
   │
FASE 8  — Gateway Hotmart (Módulo 13)
   │       └─ webhook, normalização, eventos canônicos
   │
FASE 9  — Template Meta (Módulo 9)
   │       └─ builder, submissão, biblioteca, webhook status
   │
FASE 10 — Dispatch (Módulo 10)
   │       └─ disparo manual, regras automáticas, follow-up 24h, throttling
   │
FASE 11 — Inbox completo (Módulo 11)
   │       └─ handoff, resumo IA, atendimento humano
   │
FASE 12 — Dashboard Tenant (Módulo 17)
   │       └─ métricas core
   │
═══ MARCO V0: Libras A2 OPERACIONAL ═══
   │
FASE 13 — Usage (Módulo 15)
   │       └─ medição conversas, overage, alertas
   │
FASE 14 — Billing Asaas (Módulo 14)
   │       └─ assinatura, webhook pagamento, bloqueio
   │
FASE 15 — Notification (Módulo 16)
   │       └─ push web + email Resend
   │
FASE 16 — Onboarding assistido polido (Módulo 2)
   │       └─ wizard 5 passos, checklist Meta
   │
FASE 17 — Super-Admin (Módulo 18)
   │       └─ saúde financeira, clientes, ações
   │
FASE 18 — Polimento V1 (dark/light, responsivo, erros, i18n pt-BR)
   │
═══ MARCO V1: VENDÁVEL ═══
   │
V1.5 — Eduzz/Kiwify, WhatsApp notificação, auto-import, múltiplos números
V2   — RAG, análise pós-conversa, A/B, white-label, calendário
```

### 3.1 Por que esta ordem

- **Tenancy primeiro:** tudo carrega `tenant_id`. Sem isso, nada tem dono.
- **Connection antes de Messaging:** mensagem precisa de um canal por onde chegar.
- **Lead/Messaging antes do Agent:** o agente precisa de leads e janelas para operar.
- **Knowledge/Method antes do Agent:** o agente precisa de munição e método.
- **Agent antes de Playground:** testa-se o que existe.
- **Gateway/Template/Dispatch depois do core:** ampliam o que o agente já faz.
- **Billing/Usage/Admin no fim do V0→V1:** são sobre o seu negócio, não sobre operar o Libras. O Libras pode rodar em V0 sem billing automatizado (você cobra manual nesse primeiro mês).

### 3.2 Atalho para o marco V0 (Libras rodando rápido)

Se a pressão for máxima para o Libras rodar o lançamento atual, o caminho mínimo é **Fases 0→12**. Billing pode ser manual nesse primeiro ciclo. Isso entrega o Libras operando com agente inteligente, disparo e dashboard. As fases 13-18 transformam em produto vendável a terceiros logo em seguida.

---

## 4. Ciclo de trabalho por fase (como rodar cada uma)

Para cada fase, repita este ciclo no Claude Code:

1. **Contextualizar (Analyst/PM):** "Vamos construir a Fase N — Módulo X. Leia a seção do PRD e da arquitetura referentes. Liste os épicos e histórias."
2. **Planejar tarefas (Architect/SM):** "Quebre em tarefas técnicas respeitando a estrutura de `packages/<dominio>` da arquitetura. Defina os ports e adapters necessários."
3. **Implementar (Dev):** "Implemente as tarefas. Siga os princípios da seção 2 da arquitetura: interface pública no index.ts, casos de uso, ports/adapters, sem acoplar outros módulos."
4. **Validar (QA):** "Valide contra os critérios de aceite do Módulo X no PRD. Liste o que passa e o que falta."
5. **Fechar:** corrigir o que falta, rodar typecheck/lint/testes, commit.

### 4.1 Regra de contexto

**Uma fase por sessão sempre que possível.** Se o contexto ficar grande, abra nova sessão e diga: "Continuando o Leedi. Já estão prontas as fases 0 a N. Agora vamos a Fase N+1 — Módulo X. Leia os docs." Não tente carregar a história inteira do projeto em cada sessão — os documentos são a memória, não o histórico de chat.

---

## 5. Definição de "pronto" universal (Definition of Done)

Um módulo está pronto quando:

- [ ] Todos os critérios de aceite do PRD passam
- [ ] Interface pública (`index.ts`) limpa; nada interno vazando
- [ ] Não importa internals de outro módulo (só interfaces públicas)
- [ ] Casos de uso testados (unitário) onde há regra de negócio
- [ ] Adapters de integração externa têm teste de contrato
- [ ] `pnpm typecheck && pnpm lint && pnpm test` passa
- [ ] RLS ativo nas tabelas do módulo (se houver tabela de tenant)
- [ ] Sem segredo em log/resposta/frontend
- [ ] Feature flag do módulo existe (liga/desliga)
- [ ] Strings em pt-BR via i18n (não hardcoded)

---

## 6. Checklist de Setup Meta (serviço da Exponensia)

Este é o procedimento que **você e sua equipe** executam ao integrar um cliente novo, enquanto não for Tech Provider. Justifica o setup pago. Vira documento operacional interno + base para os vídeos do onboarding (Módulo 2).

### 6.1 Pré-requisitos do cliente

- [ ] Conta no Facebook Business Manager (ou criar)
- [ ] Documento da empresa (CNPJ) para verificação
- [ ] Número de telefone dedicado (não pode estar em WhatsApp comum ativo, ou migrar com coexistência)
- [ ] Cartão de crédito internacional (para billing Meta dos disparos)

### 6.2 Passos

1. [ ] Verificar o Business Manager na Meta (documentação da empresa)
2. [ ] Criar/associar conta WhatsApp Business (WABA) dentro da BM
3. [ ] Adicionar e verificar o número de telefone (código por SMS/voz)
4. [ ] Configurar nome de exibição (display name) e aguardar aprovação
5. [ ] Criar System User com permissões de WhatsApp na BM
6. [ ] Gerar token de acesso permanente do System User
7. [ ] Anotar `phone_number_id` e `waba_id`
8. [ ] Configurar webhook apontando para o Leedi + `verify_token`
9. [ ] Inscrever a WABA nos campos de webhook (messages, message_template_status_update, etc.)
10. [ ] No Leedi: colar token + ids no Módulo 3, validar conexão
11. [ ] Submeter primeiros templates (Módulo 9) e aguardar aprovação
12. [ ] Teste ponta a ponta: enviar template → responder → agente conversa

### 6.3 Pós-setup

- [ ] Monitorar quality rating nos primeiros dias
- [ ] Orientar cliente sobre boas práticas (não disparar lista fria, respeitar opt-out)
- [ ] Configurar billing Meta do cliente (cartão na BM)

> Quando virar Tech Provider, passos 1-9 são substituídos pelo Embedded Signup (OAuth) dentro do app.

---

## 7. Estimativas de tempo por fase

As estimativas abaixo assumem:

- **Dev dedicado em TP completo** (não paralelo a outros projetos)
- **Comunicação clara** com PM/Architect a cada milestone
- **Bloqueios externos resolvidos em paralelo** (Meta approval, credenciais)

| Fase              | Épicos      | Funcionalidades principais                                  | Estimativa      | Crítico externo                    |
| ----------------- | ----------- | ----------------------------------------------------------- | --------------- | ---------------------------------- |
| **0**             | (Fundação)  | Monorepo, DB, Auth base, CI/CD, tipos                       | **1 semana**    | Supabase+Vercel ready              |
| **1**             | 1-2-3       | Tenancy, RLS, Auth completo, Design System, WhatsApp schema | **2 semanas**   | Meta app/webhook URL               |
| **2**             | 4           | Webhook ingestion, message normalization, idempotência      | **1 semana**    | Meta quality tier                  |
| **3**             | 5-7         | Agent core, tools, templates, catalog                       | **3 semanas**   | Claude API billing                 |
| **4**             | 6-8         | Campaigns, disparo, follow-up, inbox, analytics             | **2 semanas**   | Asaas sandbox                      |
| **Stabilization** | (não épico) | Testes E2E, otimizações, bugfix                             | **2 semanas**   | N/A                                |
| **MVP Total**     | —           | —                                                           | **~11 semanas** | **Meta + Claude + Asaas paralelo** |

**Notas:**

- Se **Meta approval atrasada**, Fase 1 avança até webhook handlers (sem teste real), retoma na aprovação.
- Se **Asaas sandbox atrasado**, Fase 4 retoma assim que pronto.
- **Seções críticas** (auth RLS, webhook idempotência, agent tools) têm testes isolados que não dependem de externos.

---

## 8. Estratégia de rollback em produção

Uma vez que o Leedi está em produção (clientes reais usando), rolbacks precisam ser **seguros**, **sem perda de dados**, e **comunicados**.

### Cenários e procedimento

| Cenário                                    | Trigger                                 | Ação                                                                   | Rollback               | Data                  |
| ------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------- | ---------------------- | --------------------- |
| **Bug crítico em feature nova**            | Error rate > 10%, Sentry crítico        | Revert último commit + redeploy                                        | Instantâneo (2-5 min)  | Mantido               |
| **Migração DB quebrada**                   | Erro de migration, RLS bloqueando reads | Rodar migration reversa (Drizzle down) + redeploy                      | 5-10 min               | Preservado            |
| **Leak de secrets / segurança**            | Credencial exposta em logs              | 1. Revogar credencial / 2. Redeploy sem secret / 3. Notificar clientes | Imediato + comunicação | Rewind requer audit   |
| **Integração externa falha** (Meta, Asaas) | Adapter quebrado, webhook parser        | Consertar adapter + redeploy; DLQ processa pendências                  | 5-10 min               | Fila preserva eventos |
| **Cascata de deletions errada** (GDPR)     | Soft delete se tornou hard delete       | Restaurar backup (S3 timestamped) + rodar recovery script              | 15-30 min              | Backup pré-falha      |

### Procedimento padrão de rollback

```
1. DETECT: Sentry/PostHog alerta; PagerDuty ativa
2. ASSESS:
   - Quantos clientes afetados?
   - Dados podem ser perdidos?
   - É reversível em < 5 min?
3. DECIDE:
   - Se sim → prosseguir rollback
   - Se não → hotfix paralelo enquanto observa
4. ROLLBACK:
   a. Revert código (git revert HEAD~1)
   b. Run migrations (se aplicável): `npm run db:down` em staging, testar
   c. Deploy reverted version
   d. Monitor: 5 min pós-deploy
5. COMMUNICATE:
   - Slack #ops-alerts
   - Email clientes (se > 1h downtime)
   - Post-mortem dentro de 24h
6. PREVENT:
   - Add test case que teria pego o bug
   - Rodar feature novo em feature flag (5% → 25% → 100%)
```

### Backups and recovery

- **Supabase:** backup automático diário (mantém 7 dias)
- **Antes de deploy** em produção: snapshot manual do estado (script `backup-prod.sh`)
- **Recovery:** S3 com versioning; restore a timestamp específico se cascata de deletions errada
- **Teste recovery:** mensal, em staging, cronometrado

---

## 9. Pipeline CI/CD (detalhes técnicos)

### CI (Continuous Integration) — GitHub Actions

Cada **push para main** (após PR merge) roda:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: pnpm run lint # ESLint + Prettier
      - run: pnpm run type-check # TypeScript strict
      - run: pnpm run test:unit # Vitest
      - run: pnpm run test:integration # Docker containers

  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: npm run db:migrate # Drizzle migrate em staging DB
      - run: npm run db:generate # Regera tipos TS
      - uses: actions/upload-artifact@v3
        with:
          name: db-types
          path: packages/db/src/schema
```

**Bloqueadores:**

- Lint falha → PR não pode mergear
- Type errors → bloqueia
- Testes críticos falham → bloqueia
- Migration falha → bloqueia

### CD (Continuous Deployment) — Vercel + Supabase

Quando **main passa em CI**, Vercel dispara:

```
1. Build:
   - pnpm install
   - pnpm run build:all
   - Generate types from Supabase (via Supabase introspect)

2. Environment:
   - Staging: vars de staging (Supabase staging, Upstash staging)
   - Production: vars secretas (Anthropic key, payment gateway)

3. Deploy:
   a. Staging (automático):
      - Deploy staging apps (web, api, admin, dashboard)
      - Run smoke tests
      - Notificar no Slack #deploy-log

   b. Production (manual approval em Vercel UI):
      - Click "Promote to production"
      - Applications (web, api, admin, dashboard) vão live
      - Supabase migrations rodam (se houver)
      - PostHog marca "new deploy" com versão/timestamp

4. Monitoring (pós-deploy):
   - Sentry: busca por erros novos nos últimos 5 min
   - PostHog: funnel continuity (não caiu em dropoff)
   - Better Stack: latência de API (target < 800ms P95)
```

### Feature Flags (incremental rollout)

Para features maiores, usar feature flag:

```typescript
// packages/config/src/features.ts
const FEATURES = {
  NEW_DISPATCH_UI: {
    enabled: true,
    rollout: 0.05, // 5% de tenants
    excludes: ['tenant-id-bad'], // tenants específicas para excluir
  },
};

// Em código
if (featureEnabled(FEATURES.NEW_DISPATCH_UI, tenantId)) {
  // nova lógica
} else {
  // lógica antiga
}
```

**Progresso típico:**

- Deploy com flag → 5%
- Monitor 24h
- 25% → monitor 24h
- 50% → 24h
- 100% → produção limpa (remover flag)

### Secrets e variáveis

```
# .env.local (desenvolvimento)
DATABASE_URL=postgresql://user:pass@localhost/leedi_dev
UPSTASH_REDIS_URL=redis://local:6379
ANTHROPIC_API_KEY=sk-...

# Vercel environment (via Vercel dashboard)
- Staging: ANTHROPIC_API_KEY (staging quota)
- Production: ANTHROPIC_API_KEY (production quota)
```

**Nunca committar secrets.** Usar Vercel environment variables ou Supabase vault.

---

## 10. Riscos e mitigação

| Risco                             | Impacto               | Mitigação                                                                         |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Aprovação Meta demora             | Bloqueia Libras rodar | Começar setup Meta JÁ, em paralelo à construção das fases 0-4                     |
| Template rejeitado pela Meta      | Não consegue disparar | Usar biblioteca de templates testados; categoria correta (marketing/utility)      |
| Número perde quality / é limitado | Reduz alcance         | Aquecimento gradual; não disparar lista fria; respeitar opt-out                   |
| Custo de IA acima do esperado     | Margem                | Prompt caching obrigatório; roteamento de modelo; monitorar custo/tenant no admin |
| Agente alucina/vende errado       | Confiança             | Playground obrigatório antes de soltar; limites no prompt; testes de cenário      |
| Contexto do Claude Code estoura   | Refação               | Uma fase por sessão; docs como memória; não recarregar histórico                  |
| Acoplamento volta a crescer       | Manutenção            | Definition of Done item "não importa internals"; revisão por módulo               |
| Janela 24h mal contada            | Cobrança errada       | Testar contagem de janela com cenários; alinhar com métrica Meta                  |

---

## 8. Pré-requisitos de contas e credenciais

Antes de começar, garanta acesso a:

- [ ] Supabase (projeto criado, connection string, service key)
- [ ] Upstash Redis (database criado, URL/token)
- [ ] Vercel (conta, projetos para web/dashboard/admin/api)
- [ ] Anthropic API (key, billing configurado)
- [ ] Resend (conta, domínio a verificar)
- [ ] Asaas (conta, sandbox + produção, API key)
- [ ] Meta Business / Developers (app criado para WhatsApp)
- [ ] Sentry, PostHog, Better Stack (projetos)
- [ ] Domínio configurado (DNS para apps + email)
- [ ] GitHub (repo do monorepo, CI)

---

## 9. Primeira ação concreta

Quando você abrir o Claude Code:

1. Crie o repo e adicione os três documentos em `docs/`
2. Instale e inicialize o BMAD
3. Rode a **Fase 0** com o prompt da seção 2.3
4. Valide o critério de pronto da fundação
5. Avance para a **Fase 1 (Tenancy + Auth)**
6. Em paralelo (não-código): inicie o **setup Meta** do Libras A2 (seção 6) — é o caminho crítico externo

A partir daí, siga o grafo da seção 3, uma fase por vez, fechando o Definition of Done de cada uma antes de avançar.

---

## 10. Resumo de decisões travadas (referência rápida)

| Tema               | Decisão                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Nome (codinome)    | Leedi                                                                                                        |
| Tenancy            | Workspace (Exponensia) → Tenants → Users com papel (B+C)                                                     |
| WhatsApp           | Meta Cloud API direto; pronto p/ Tech Provider; sem API não-oficial na V1                                    |
| IA                 | Claude Agent SDK; Sonnet padrão (todos tiers); Haiku p/ tarefas auxiliares; BYOK só enterprise               |
| Custo IA           | Você cobre; prompt caching + roteamento de modelo; custo/tenant no admin                                     |
| Métodos de venda   | SPIN, AIDA, Storytelling, Livre (todos na V1)                                                                |
| Tools do agente    | Toggle por tenant                                                                                            |
| Memória do agente  | Separação lógica (módulo isolado, mesma instância)                                                           |
| Eventos canônicos  | 12 eventos, normalizados por adapter                                                                         |
| Follow-up          | Inteligente na janela 24h + templates por regra fora dela                                                    |
| Templates          | Builder + submissão Meta + biblioteca por ocasião; ilimitados                                                |
| Disparo            | Manual segmentado + regras automáticas + throttling + exclusões                                              |
| Inbox              | Com resumo de handoff gerado pela IA                                                                         |
| Stack              | Node+TS, Hono (a confirmar c/ professor), Next.js, shadcn/ui, Drizzle, Supabase, BullMQ/Upstash, Better-Auth |
| Frontend           | 3 apps (web, dashboard, admin) desde o início                                                                |
| Email              | Resend, domínio próprio, noreply@                                                                            |
| Billing            | Asaas desde V1; bloqueio gradual por inadimplência                                                           |
| Planos             | Starter R$697 / Pro R$1.497 / Enterprise sob consulta                                                        |
| Conversa (métrica) | 1 conversa = 1 janela de 24h billable                                                                        |
| Overage            | R$0,30/conversa, transparente, não interrompe                                                                |
| Notificação        | Push+email V1; WhatsApp V1.5 (número pessoal, templates UTILITY, disclaimer custo)                           |
| Design             | Monocromático + indigo + acento violeta IA; dark/light; espaçoso c/ modo compacto                            |
| ✨ Melhorar com IA | Em todo campo de texto longo (Haiku)                                                                         |
| i18n               | next-intl, pt-BR só, preparado p/ outros                                                                     |
| Setup Meta         | Serviço da Exponensia (justifica setup pago) até virar Tech Provider                                         |
| Suporte            | Email + WhatsApp da agência V1; Intercom V2                                                                  |
| Modularidade       | Inegociável — Definition of Done garante não-acoplamento                                                     |

# Leedi — Documento de Arquitetura Técnica

> **Versão:** 1.0
> **Codinome do produto:** Leedi (provisório — trocável via env var)
> **Empresa:** Exponensia Lab
> **Autor da especificação:** Caio + Claude
> **Data:** Maio 2026
> **Status:** Aprovado para construção

---

## 0. Como usar este documento

Este é o documento-fonte da verdade técnica do Leedi. Toda decisão de stack, padrão de código e estrutura de banco está aqui. Quando você abrir o Claude Code com BMAD, este documento alimenta o agente **architect**. Se durante a construção surgir uma dúvida arquitetural que contradiz este documento, este documento vence — ou o documento é atualizado conscientemente, nunca ignorado em silêncio.

A regra de ouro herdada da dor do projeto anterior: **nada é acoplado sem necessidade, nada cresce sem contrato.** Cada módulo tem fronteira clara. Quebrar a fronteira exige decisão explícita.

---

## 1. Visão técnica em uma frase

Leedi é uma plataforma SaaS multi-tenant, AI-native, que conecta infoprodutores ao WhatsApp oficial da Meta e opera um agente de vendas inteligente (memória, ferramentas, raciocínio) por cima dos eventos de venda dos gateways (Hotmart, Eduzz, Kiwify), com painel de controle por cliente e painel administrativo financeiro para a Exponensia Lab.

---

## 2. Princípios arquiteturais inegociáveis

Estes princípios existem para resolver o problema central que travou o projeto anterior: acoplamento e crescimento descontrolado. Eles não são sugestões.

### 2.1 Modularidade por contrato

Todo módulo expõe uma **interface pública** (o que ele faz) e esconde sua implementação (como ele faz). Outros módulos consomem a interface, nunca os detalhes internos. Trocar a implementação interna de um módulo não pode quebrar quem o consome.

Exemplo concreto: o módulo `whatsapp` expõe `enviarMensagem(conexao, destino, conteudo)`. Quem chama não sabe nem se importa se por baixo é Meta Cloud API, Mega-API, ou um BSP. Amanhã você troca o provider e o resto do sistema não percebe.

### 2.2 Adapter Pattern em toda integração externa

Tudo que fala com o mundo de fora (WhatsApp, gateway de pagamento, gateway de venda, provider de IA, email) é uma **interface no core** com **implementações trocáveis**. Adicionar um provider novo é criar uma classe que implementa a interface. Zero mudança no resto.

Isso é o que torna realista a promessa "adicionar Eduzz amanhã sem quebrar nada".

### 2.3 Domínios isolados (DDD simplificado)

O sistema é dividido em domínios de negócio. Cada domínio é dono das suas entidades, regras e dados. Um domínio nunca lê diretamente as tabelas de outro — ele pede ao outro domínio via interface.

Domínios do Leedi:

- **Tenancy** — workspaces, tenants, usuários, papéis, permissões
- **Identity/Auth** — autenticação, sessão, RBAC
- **Connection** — conexões WhatsApp (Meta, futuros providers)
- **Messaging** — mensagens, janelas de conversa, inbox
- **Agent** — o agente de IA, suas tools, raciocínio
- **Agent Memory** — histórico de threads do agente (módulo isolado, separação lógica)
- **Knowledge** — produtos, argumentos, objeções, FAQ, base de conhecimento
- **Campaign** — campanhas, fases, segmentação, lançamentos
- **Template** — templates Meta, submissão, aprovação, biblioteca
- **Dispatch** — disparador, filas, throttling, agendamento
- **Sales Method** — métodos de venda (SPIN, AIDA, Storytelling, Livre)
- **Gateway** — webhooks de venda, normalização de eventos canônicos
- **Lead** — leads, perfil, jornada, tags, qualificação
- **Billing** — Asaas, assinaturas, faturas, bloqueio por inadimplência
- **Usage** — medição de conversas, overage, limites por plano
- **Notification** — push web, email (Resend), futuro WhatsApp
- **Analytics** — métricas, dashboards, KPIs
- **Admin** — painel super-admin, saúde do SaaS

### 2.4 Feature flags arquiteturais

Cada módulo pode ser ligado/desligado por tenant e por ambiente. Isso permite: lançar incremental, testar com um cliente, oferecer features por tier de plano, e desligar algo problemático em produção sem deploy.

### 2.5 Tudo que escreve no banco passa por um caso de uso

Sem queries soltas espalhadas. A lógica de negócio mora em **casos de uso** (use cases) testáveis. A camada de API é fina — recebe requisição, chama caso de uso, devolve resposta. Isso é o que permite trocar Next.js por outra coisa sem reescrever a regra de negócio.

---

## 3. Stack tecnológica

### 3.1 Tabela-resumo

| Camada            | Tecnologia                         | Justificativa                                                                                 |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Monorepo          | Turborepo + pnpm workspaces        | Módulos isolados, build incremental, cache                                                    |
| Linguagem         | TypeScript (strict)                | Type safety em todo o sistema                                                                 |
| Runtime           | Node.js 22 LTS                     | Estável, ecossistema do Agent SDK                                                             |
| Backend framework | Hono                               | Edge-ready, leve, rápido, Cloudflare Tunnels (a validar c/ professor — Fastify é alternativa) |
| Frontend          | Next.js 15 (App Router)            | SSR, ecossistema, múltiplas apps                                                              |
| UI                | shadcn/ui + Tailwind CSS           | Dark/light pronto, componível, sem lock-in                                                    |
| State servidor    | TanStack Query                     | Cache, sincronização, otimista                                                                |
| Banco             | PostgreSQL (Supabase Cloud)        | RLS nativo, pgvector, você já conhece                                                         |
| ORM               | Drizzle ORM                        | Type-safe, leve, migrations versionadas, SQL transparente                                     |
| Filas             | BullMQ sobre Redis (Upstash)       | Disparos, jobs agendados, throttling                                                          |
| Cache/estado      | Redis (Upstash)                    | Buffer de mensagens, locks, rate limit                                                        |
| Auth              | Better-Auth                        | Multi-tenant, organizações, RBAC, self-hosted, sem custo/usuário                              |
| IA                | Claude Agent SDK (Anthropic)       | Agente com tools, memória, raciocínio                                                         |
| Modelo padrão     | Claude Sonnet (todos os tiers)     | Qualidade de venda; Haiku só para tarefas auxiliares                                          |
| Email             | Resend                             | Transacional, DKIM fácil, React Email                                                         |
| Pagamento         | Asaas                              | PIX/cartão/boleto, recorrência, mercado BR                                                    |
| WhatsApp          | Meta Cloud API (direto)            | Sem BSP intermediário; arquitetura pronta p/ Tech Provider                                    |
| Erros             | Sentry                             | Rastreamento de exceções                                                                      |
| Produto analytics | PostHog                            | Comportamento de uso, funis                                                                   |
| Logs              | Better Stack (ou Axiom)            | Logs estruturados                                                                             |
| i18n              | next-intl                          | pt-BR agora, preparado p/ outros                                                              |
| Hospedagem        | Vercel (apps) + Supabase + Upstash | Managed agora, Hetzner quando justificar                                                      |

### 3.2 Por que Drizzle e não Prisma

Drizzle gera SQL transparente (você vê e entende o que roda), é mais leve, tem migrations versionadas em SQL puro, e funciona bem em edge. Prisma é mais "mágico" e pesado. Para um sistema onde você precisa entender e dar manutenção sozinho, Drizzle é mais honesto — você lê o schema e sabe exatamente o que acontece no banco. Isso ataca diretamente a dor do projeto anterior (não conseguir dar manutenção).

### 3.3 Por que Better-Auth e não Clerk

Clerk cobra por usuário ativo mensal — num modelo onde cada tenant tem 1-5 usuários e você quer escalar tenants, isso vira custo crescente. Better-Auth é self-hosted, suporta organizações (que mapeiam para nossos tenants), RBAC, e não cobra por usuário. Você controla os dados de auth. Único custo é o tempo de configuração inicial, que o Claude Code resolve rápido.

---

## 4. Estrutura do monorepo

```
leedi/
├── apps/
│   ├── web/                  # Landing page + login/signup (Next.js)
│   ├── dashboard/            # Painel do cliente/tenant (Next.js)
│   ├── admin/                # Painel super-admin Exponensia (Next.js)
│   └── api/                  # Backend Hono (webhooks, agente, jobs)
│
├── packages/
│   ├── db/                   # Drizzle schema, migrations, client
│   ├── auth/                 # Better-Auth config, RBAC, sessão
│   ├── ui/                   # Design system (shadcn/ui + tokens Leedi)
│   ├── config/               # Configs compartilhadas (tsconfig, eslint, env schema)
│   │
│   ├── tenancy/              # Domínio: workspaces, tenants, usuários
│   ├── connection/           # Domínio: conexões WhatsApp (adapters)
│   ├── messaging/            # Domínio: mensagens, janelas, inbox
│   ├── agent/                # Domínio: agente IA, orquestração de tools
│   ├── agent-memory/         # Domínio: threads/histórico do agente (isolado)
│   ├── knowledge/            # Domínio: produtos, objeções, FAQ, RAG
│   ├── campaign/             # Domínio: campanhas, fases, segmentos
│   ├── template/             # Domínio: templates Meta
│   ├── dispatch/             # Domínio: disparador, throttling
│   ├── sales-method/         # Domínio: SPIN, AIDA, Storytelling, Livre
│   ├── gateway/              # Domínio: webhooks venda, normalização
│   ├── lead/                 # Domínio: leads, jornada, tags
│   ├── billing/              # Domínio: Asaas, assinaturas, bloqueio
│   ├── usage/                # Domínio: medição de conversas, overage
│   ├── notification/         # Domínio: push, email, WhatsApp (futuro)
│   └── analytics/            # Domínio: métricas, KPIs
│
├── tooling/
│   ├── eslint-config/
│   ├── tsconfig/
│   └── tailwind-config/
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 4.1 Anatomia de um package de domínio

Cada `packages/<dominio>/` segue a mesma estrutura interna, para que qualquer pessoa (ou agente) que entre em qualquer módulo encontre as coisas no mesmo lugar:

```
packages/agent/
├── src/
│   ├── index.ts              # Interface pública (o que o módulo exporta)
│   ├── domain/               # Entidades e regras puras (sem dependência externa)
│   │   ├── entities/
│   │   └── value-objects/
│   ├── use-cases/            # Casos de uso (lógica de aplicação)
│   │   ├── processar-mensagem.ts
│   │   ├── transferir-humano.ts
│   │   └── ...
│   ├── ports/                # Interfaces que o módulo precisa (ex: ProviderIA)
│   ├── adapters/             # Implementações dos ports
│   ├── tools/                # Tools do agente (buscar_historico, etc.)
│   └── config.ts             # Config do módulo
├── package.json
└── tsconfig.json
```

O `index.ts` é a **única porta de entrada**. Ninguém importa de `packages/agent/src/use-cases/...` diretamente — importa de `@leedi/agent`. Isso é o contrato.

---

## 5. Modelo de tenancy (multi-tenant)

### 5.1 Hierarquia (modelo B com camada C, conforme decidido)

```
WORKSPACE (Exponensia Lab — você, super-admin)
│
├── TENANT: Libras A2
│   ├── Usuário: Gesiel (owner)
│   ├── Usuário: Kerima (admin)
│   ├── Usuário: Alison (admin)
│   └── recursos: conexão WhatsApp, agente, produtos, campanhas, leads...
│
├── TENANT: Cliente 2
│   └── ...
│
└── TENANT: Cliente N
    └── ...
```

- **Workspace**: entidade-topo, representa a Exponensia. Só você e sua equipe têm acesso. Enxerga todos os tenants.
- **Tenant**: um cliente infoprodutor. Isolamento total de dados entre tenants.
- **Usuário**: pessoa com login. Pertence a um ou mais tenants com um papel em cada (camada C — estilo Notion/Linear).

### 5.2 Isolamento de dados — RLS

Toda tabela de negócio carrega `tenant_id`. O isolamento é garantido em **duas camadas**:

1. **Row Level Security (RLS) no Postgres** — política que filtra automaticamente por `tenant_id` do contexto da sessão. Mesmo um bug na aplicação não vaza dados entre tenants. Esta é a rede de segurança.
2. **Escopo na aplicação** — todo caso de uso recebe o `tenant_id` do contexto autenticado e filtra. Esta é a primeira linha.

O super-admin tem um papel especial que, em modo "impersonate", assume o `tenant_id` do cliente para dar suporte — com tudo logado em auditoria.

### 5.3 Papéis (RBAC)

Dentro de um tenant:

| Papel        | Permissões                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **Owner**    | Tudo, incluindo billing e gestão de usuários                                                   |
| **Admin**    | Tudo exceto billing                                                                            |
| **Operator** | Operar disparos, ver/responder conversas no inbox, ver dashboard — não altera config do agente |
| **Viewer**   | Somente leitura: dashboard e relatórios                                                        |

No nível do workspace (Exponensia):

| Papel           | Permissões                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Super Admin** | Acessa todos os tenants, impersonate, billing global, bloqueio/liberação, métricas do SaaS |
| **Support**     | Acessa tenants em modo leitura + impersonate limitado (futuro)                             |

---

## 6. Schema do banco de dados

Apresentado por domínio. Tipos em PostgreSQL. Toda tabela de tenant tem `tenant_id uuid not null` + índice + política RLS (omitidos da listagem por brevidade, mas obrigatórios). Todas têm `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`.

### 6.1 Domínio Tenancy

```
workspaces
  id, nome, slug, created_at
  -- Exponensia. Por ora um único registro, mas modelado para multi.

tenants
  id, workspace_id (fk), nome, slug, segmento,
  logo_url, status (enum: trial|ativo|bloqueado|cancelado),
  plano (enum: starter|pro|enterprise),
  config (jsonb: cores customizadas, preferências),
  created_at, updated_at

users
  id, email (unique), nome, avatar_url,
  -- gerenciado em conjunto com Better-Auth
  created_at

memberships
  id, user_id (fk), tenant_id (fk),
  papel (enum: owner|admin|operator|viewer),
  created_at
  -- relação N:N usuário<->tenant com papel (camada C)

workspace_admins
  id, user_id (fk), workspace_id (fk),
  papel (enum: super_admin|support),
  created_at

audit_logs
  id, tenant_id (nullable), workspace_id (nullable), user_id,
  acao (text), entidade (text), entidade_id (uuid),
  detalhes (jsonb), ip, created_at
```

### 6.2 Domínio Connection (WhatsApp)

```
whatsapp_connections
  id, tenant_id, provider (enum: meta_cloud|mega_api|bsp),
  status (enum: pendente|conectado|erro|desconectado),
  -- credenciais criptografadas (nunca em texto puro)
  phone_number_id (text), waba_id (text),
  display_phone (text), verified_name (text),
  access_token_encrypted (text),
  quality_rating (enum: green|yellow|red|unknown),
  messaging_tier (enum: tier_1k|tier_10k|tier_100k|unlimited),
  webhook_verify_token (text),
  meta_config (jsonb), created_at, updated_at
```

> **Nota de segurança:** `access_token_encrypted` é criptografado com chave do ambiente (envelope encryption). O token nunca aparece em log, resposta de API, ou frontend. Detalhado na seção 9.

### 6.3 Domínio Lead

```
leads
  id, tenant_id, telefone (e164), nome, email,
  origem (text: qual campanha/lançamento captou),
  primeira_interacao (timestamptz), ultima_interacao (timestamptz),
  comprou (bool), produto_comprado_id (nullable),
  data_compra (timestamptz nullable),
  temperatura (enum: frio|morno|quente),
  qualificacao (jsonb: dados que o agente mapeou),
  lead_recorrente (bool: já participou de lançamento anterior),
  status (enum: ativo|optout|bloqueado),
  created_at, updated_at
  UNIQUE(tenant_id, telefone)

lead_tags
  id, tenant_id, lead_id (fk), tag (text),
  origem_tag (enum: manual|agente),
  created_at

lead_journey_events
  id, tenant_id, lead_id (fk),
  tipo (text: captado|abordado|respondeu|objecao|interesse|comprou|...),
  detalhes (jsonb), created_at
  -- linha do tempo da jornada do lead (memória de longo prazo do lead)
```

### 6.4 Domínio Messaging

```
conversation_windows
  id, tenant_id, lead_id (fk), connection_id (fk),
  started_at (timestamptz), ended_at (timestamptz nullable),
  message_count (int default 0),
  billable (bool: conta para limite do plano),
  meta_conversation_id (text nullable),
  meta_category (enum: marketing|utility|authentication|service nullable),
  created_at
  -- "1 conversa = 1 janela 24h" (base de cobrança e métrica de plano)

messages
  id, tenant_id, conversation_window_id (fk), lead_id (fk),
  direction (enum: inbound|outbound),          -- English: code convention
  autor (enum: lead|agente|humano|sistema),
  tipo (enum: texto|audio|imagem|documento|template|sticker),
  conteudo (text),
  midia_url (text nullable),
  transcricao (text nullable),   -- áudio transcrito
  meta_message_id (text nullable),
  status (enum: enviado|entregue|lido|falhou nullable),
  metadata (jsonb),
  created_at
  -- PARTICIONADA POR MÊS (created_at)

inbox_assignments
  id, tenant_id, conversation_window_id (fk),
  assigned_to (user_id nullable),
  status (enum: bot|aguardando_humano|em_atendimento|resolvido),
  resumo_handoff (text nullable),  -- resumo da IA para o atendente
  motivo_handoff (text nullable),
  created_at, updated_at
```

### 6.5 Domínio Agent + Agent Memory

```
-- Domínio Agent (configuração)
agent_configs
  id, tenant_id, nome_agente (text), -- ex: "Mari", "Sofia"
  persona (text),                     -- personalidade
  estilo_mensagem (jsonb: tamanho, formalidade, emoji),
  limites (text),                     -- o que não falar
  sales_method_id (fk),               -- método de venda escolhido
  modelo_ia (enum: sonnet|opus|haiku), -- por tier
  tools_habilitadas (jsonb: toggles),
  ativo (bool),
  created_at, updated_at

-- Domínio Agent Memory (ISOLADO — separação lógica)
agent_threads
  id, tenant_id, lead_id, conversation_window_id,
  status (enum: ativo|pausado|encerrado),
  created_at, updated_at
  -- PARTICIONADA POR MÊS

agent_messages
  id, tenant_id, thread_id (fk),
  role (enum: system|user|assistant|tool),
  content (jsonb),  -- formato Agent SDK
  tokens_input (int), tokens_output (int),
  modelo (text), custo_usd (numeric),
  created_at
  -- PARTICIONADA POR MÊS

agent_tool_calls
  id, tenant_id, thread_id (fk), message_id (fk),
  tool_name (text), input (jsonb), output (jsonb),
  duracao_ms (int), erro (text nullable),
  created_at
```

> **Separação lógica:** as três tabelas `agent_*` de memória vivem na mesma instância Supabase mas são acessadas **exclusivamente** pelo módulo `@leedi/agent-memory`. Nenhum outro módulo as toca. Trocar para um banco físico separado no futuro = mudar a connection string do módulo, sem refatorar consumidores.

### 6.6 Domínio Knowledge

```
products
  id, tenant_id, nome, descricao, preco (numeric),
  parcelas (int), preco_parcelado (numeric),
  link_checkout (text), tipo (enum: principal|downsell|upsell|orderbump),
  argumentos (jsonb: array), diferenciais (jsonb: array),
  provas_sociais (jsonb: array), garantia (text), bonus (jsonb: array),
  gateway_product_id (text), -- id na Hotmart/Eduzz/Kiwify
  ativo (bool), created_at, updated_at

knowledge_base
  id, tenant_id, tipo (enum: faq|objecao),
  pergunta_ou_objecao (text), resposta_ou_contorno (text),
  categoria (text), -- preco, tempo, capacidade, etc.
  embedding (vector nullable),  -- pgvector, populado na V2 (RAG)
  ativo (bool), created_at, updated_at
```

### 6.7 Domínio Sales Method

```
sales_methods
  id, nome (enum: spin|aida|storytelling|livre),
  titulo (text), descricao (text),
  system_prompt_template (text),
  phases (jsonb: array ordenado de fases),
  is_global (bool: disponível para todos os tenants),
  tenant_id (nullable: métodos custom futuros),
  created_at
  -- SPIN/AIDA/Storytelling/Livre são is_global=true, pré-populados (seed)
```

### 6.8 Domínio Campaign

```
campaigns
  id, tenant_id, nome, produto_id (fk),
  tipo (enum: lancamento|downsell|perpetuo),
  fase (enum: aquecimento|carrinho_aberto|downsell|encerrada),
  data_inicio (timestamptz), data_fim (timestamptz),
  status (enum: rascunho|ativa|pausada|encerrada),
  config (jsonb: urgência, mensagens-chave, transição),
  created_at, updated_at

segments
  id, tenant_id, nome,
  filtros (jsonb: regras dinâmicas — comprou_x, tag, origem, data...),
  created_at, updated_at
  -- lista dinâmica de leads que casam com os filtros
```

### 6.9 Domínio Template

```
templates
  id, tenant_id, connection_id (fk),
  nome (text), categoria (enum: marketing|utility|authentication),
  idioma (text default 'pt_BR'),
  componentes (jsonb: header/body/footer/buttons),
  variaveis (jsonb: array),
  meta_template_id (text nullable),
  status (enum: rascunho|pendente|aprovado|rejeitado|pausado),
  motivo_rejeicao (text nullable),
  created_at, updated_at

template_library  -- biblioteca de sugestões (B.9)
  id, categoria_ocasiao (text: boas_vindas|carrinho_abandonado|...),
  titulo, descricao, componentes_sugeridos (jsonb),
  is_global (bool), created_at
```

### 6.10 Domínio Dispatch

```
dispatch_jobs
  id, tenant_id, campaign_id (fk nullable),
  template_id (fk nullable), segment_id (fk nullable),
  tipo (enum: template_massa|reengajamento|followup_24h),
  status (enum: agendado|processando|concluido|pausado|erro),
  agendado_para (timestamptz),
  total_alvos (int), enviados (int), falhas (int),
  config_throttle (jsonb: intervalo, horário, tier),
  created_at, updated_at

dispatch_targets
  id, dispatch_job_id (fk), lead_id (fk), tenant_id,
  dispatch_rule_id (fk nullable), -- preenchido para targets gerados por dispatch_rules
  status (enum: pendente|enviado|entregue|respondido|falhou|excluido),
  motivo_exclusao (text nullable), -- ex: já comprou, optout, conversa ativa
  wamid (text nullable),          -- WhatsApp message ID retornado pela Meta; usado p/ correlacionar delivery webhooks
  enviado_em (timestamptz nullable), created_at

dispatch_rules  -- regras automáticas (carrinho, abandono)
  id, tenant_id, nome,
  trigger (enum: carrinho_abandonado|sem_resposta_48h|fim_oferta_24h|...),
  template_id (fk), janela_tempo (jsonb), ativo (bool),
  created_at, updated_at

followups  -- follow-ups dentro da janela 24h (agente decide)
  id, tenant_id, lead_id (fk), conversation_window_id (fk),
  agendado_para (timestamptz), motivo (text),
  conteudo_sugerido (text nullable),
  status (enum: agendado|enviado|cancelado|janela_fechada),
  created_at
```

### 6.11 Domínio Gateway (eventos canônicos)

```
gateway_integrations
  id, tenant_id, gateway (enum: hotmart|eduzz|kiwify),
  webhook_secret (text), webhook_url_path (text),
  config (jsonb), ativo (bool), created_at, updated_at

gateway_events
  id, tenant_id, gateway (text),
  evento_canonico (enum: compra_aprovada|compra_recusada|compra_cancelada|
    compra_reembolsada|chargeback|carrinho_abandonado|assinatura_iniciada|
    assinatura_cancelada|assinatura_atrasada|boleto_gerado|pix_gerado),
  payload_original (jsonb), payload_normalizado (jsonb),
  lead_id (fk nullable), processado (bool),
  created_at
```

### 6.12 Domínio Billing + Usage

```
subscriptions
  id, tenant_id, asaas_customer_id (text), asaas_subscription_id (text),
  plano (enum: starter|pro|enterprise),
  valor (numeric), ciclo (enum: mensal),
  status (enum: ativa|atrasada|cancelada|trial),
  proximo_vencimento (date), created_at, updated_at

invoices
  id, tenant_id, subscription_id (fk),
  asaas_payment_id (text), valor (numeric),
  vencimento (date), pago_em (timestamptz nullable),
  status (enum: pendente|pago|atrasado|cancelado),
  inclui_overage (bool), valor_overage (numeric default 0),
  created_at

usage_counters
  id, tenant_id, periodo (text: 'YYYY-MM'),
  conversas_usadas (int), conversas_limite (int),
  overage_conversas (int), overage_valor (numeric),
  custo_ia_usd (numeric),  -- visível só para super-admin
  updated_at
  UNIQUE(tenant_id, periodo)
```

### 6.13 Domínio Notification

```
notification_preferences
  id, tenant_id, user_id,
  canais (jsonb: push, email, whatsapp),
  whatsapp_pessoal (text nullable),  -- número do responsável (C.3)
  eventos (jsonb: quais eventos notificar),
  created_at, updated_at

notifications
  id, tenant_id, user_id, tipo (text),
  titulo, corpo, canal (enum: push|email|whatsapp),
  status (enum: pendente|enviado|lido|falhou),
  custo (numeric default 0),  -- WhatsApp tem custo (disclaimer C.3)
  created_at
```

---

## 7. Arquitetura do agente de IA

Esta é a alma do produto. O que separa o Leedi de um chatbot.

### 7.1 Princípio: inteligência é arquitetura, não prompt

O agente não é "um prompt grande". É um **loop de raciocínio com ferramentas e memória**. O Claude Agent SDK gerencia o loop: recebe a mensagem, decide se precisa de informação (chama tool), recebe o resultado, decide de novo, e responde quando tem o que precisa.

### 7.2 Fluxo de uma mensagem

```
1. Lead manda mensagem → Webhook Meta → API (Hono)
2. Buffer no Redis (agrupa mensagens rápidas em sequência — debounce ~6s)
3. Caso de uso: processar-mensagem
   a. Resolve tenant pela connection
   b. Carrega/cria conversation_window (controla janela 24h)
   c. Verifica deve_abordar (já comprou? optout? bloqueado?)
   d. Carrega contexto do agente (config, produto ativo, método de venda)
   e. Carrega thread de memória do lead (@leedi/agent-memory)
4. Invoca Agent SDK com:
   - system prompt (persona + método + produto + regras)
   - histórico da thread
   - tools habilitadas (toggles do tenant)
   - nova mensagem do lead
5. Agente raciocina, possivelmente chamando tools:
   - buscar_historico_lead, consultar_ofertas_ativas,
     verificar_elegibilidade, consultar_base_conhecimento,
     agendar_followup, transferir_humano, enviar_link_checkout,
     marcar_intencao_compra, adicionar_tag, solicitar_reengajamento
6. Agente devolve resposta (texto, possivelmente dividido em mensagens)
7. Persiste: agent_messages, messages, atualiza lead/journey
8. Mede uso: incrementa usage_counter se nova janela billable
9. Envia resposta via @leedi/whatsapp → Meta Cloud API
```

### 7.3 As tools (ferramentas) do agente

Cada tool é um caso de uso com contrato claro. O toggle do tenant decide quais entram no contexto.

| Tool                          | O que faz                                                                     | Toggle       |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------ |
| `buscar_historico_lead`       | Recupera jornada completa do lead (compras, lançamentos anteriores, objeções) | sempre on    |
| `consultar_ofertas_ativas`    | Lista campanhas/produtos ativos do tenant                                     | sempre on    |
| `verificar_elegibilidade`     | Pode oferecer produto X para este lead? (downsell/upsell)                     | sempre on    |
| `consultar_base_conhecimento` | Busca FAQ/objeções (keyword V1, RAG V2)                                       | configurável |
| `agendar_followup`            | Marca follow-up dentro da janela 24h                                          | configurável |
| `transferir_humano`           | Pausa agente, gera resumo de handoff, notifica                                | configurável |
| `enviar_link_checkout`        | Envia link de pagamento do produto                                            | sempre on    |
| `marcar_intencao_compra`      | Sinaliza lead quente (dispara automações)                                     | sempre on    |
| `adicionar_tag`               | Auto-tag do lead (B.8)                                                        | configurável |
| `solicitar_reengajamento`     | Agenda template aprovado para reabrir janela                                  | configurável |

### 7.4 Roteamento de modelos (margem)

Nem toda chamada de IA usa Sonnet. Roteamento por tarefa:

| Tarefa                    | Modelo         | Razão                                  |
| ------------------------- | -------------- | -------------------------------------- |
| Conversação de venda      | Sonnet         | Qualidade — é onde o dinheiro acontece |
| Classificação/auto-tag    | Haiku          | Tarefa simples, alto volume            |
| Resumo de handoff         | Haiku          | Tarefa simples                         |
| Melhorar texto (botão ✨) | Haiku          | Tarefa simples, interativa             |
| Análise pós-conversa (V2) | Haiku em batch | 50% desconto batch API                 |

### 7.5 Prompt caching (crítico para custo)

O system prompt (persona + método + produto) é **estável** durante uma campanha. Claude oferece prompt caching que reduz custo de tokens repetidos em até 90%. O módulo `agent` estrutura as chamadas para maximizar cache hit: parte estável (cacheável) separada da parte variável (mensagem nova). Isso é decisão de implementação obrigatória, não opcional.

### 7.6 Inteligência de qualificação (o pedido central do Caio)

O agente identifica e age sobre:

- **Lead recorrente:** `buscar_historico_lead` retorna se já participou de lançamento anterior, o que comprou, objeções passadas. O agente adapta o discurso ("Que bom te ver de novo!").
- **Lead novo:** o agente conduz qualificação via método de venda (SPIN começa por Situação), mapeia dados em `lead.qualificacao`.
- **Funil correto:** `verificar_elegibilidade` + `consultar_ofertas_ativas` definem o que oferecer. Se carrinho fechou, oferece downsell. Se já comprou principal, considera upsell.
- **Objeção:** o agente reconhece, consulta base de conhecimento, contorna com argumento.

---

## 8. Camada de integrações (adapters)

### 8.1 WhatsApp Provider (port)

```
interface WhatsAppProvider {
  enviarTexto(conexao, destino, texto): Promise<MessageResult>
  enviarMidia(conexao, destino, midia): Promise<MessageResult>
  enviarTemplate(conexao, destino, template, variaveis): Promise<MessageResult>
  submeterTemplate(conexao, template): Promise<TemplateSubmitResult>
  consultarTemplate(conexao, metaTemplateId): Promise<TemplateStatus>
  verificarWebhook(payload, signature): boolean
  normalizarEventoEntrada(payload): MensagemNormalizada
}
```

Implementações: `MetaCloudProvider` (V1), `MegaApiProvider` (futuro/fallback), `BspProvider` (futuro).

### 8.2 Gateway Provider (venda)

```
interface GatewayProvider {
  verificarAssinatura(payload, secret): boolean
  normalizarEvento(payload): EventoCanonico
}
```

Implementações: `HotmartAdapter` (V1), `EduzzAdapter` (V1.5), `KiwifyAdapter` (V1.5).

Cada adapter traduz o webhook bruto para o **evento canônico** (seção 6.11). O resto do sistema só conhece eventos canônicos.

### 8.3 Payment Provider

```
interface PaymentProvider {
  criarCliente(dados): Promise<CustomerId>
  criarAssinatura(customerId, plano): Promise<SubscriptionId>
  consultarFatura(paymentId): Promise<InvoiceStatus>
  cancelarAssinatura(subscriptionId): Promise<void>
  verificarWebhook(payload, signature): boolean
}
```

Implementação: `AsaasProvider` (V1). `StripeProvider` (futuro internacional).

### 8.4 AI Provider

```
interface AIProvider {
  conversar(config, historico, tools, mensagem): Promise<AgentResponse>
  completar(prompt, modelo): Promise<string>  // tarefas simples
}
```

Implementação: `ClaudeProvider` (Agent SDK). Abstração permite `OpenAIProvider` futuro sem tocar no domínio `agent`.

### 8.5 Email Provider

```
interface EmailProvider {
  enviar(de, para, template, dados): Promise<void>
}
```

Implementação: `ResendProvider` (V1).

---

## 9. Segurança

### 9.1 Segredos e tokens

- Tokens de WhatsApp, secrets de gateway, chaves Asaas: **criptografados em repouso** (envelope encryption com chave mestra no ambiente — Vercel env / cofre).
- Nunca em logs, nunca em respostas de API, nunca no frontend.
- Variáveis de ambiente validadas por schema (Zod) no boot — app não sobe com config faltando.

### 9.2 RLS como rede de segurança

Conforme 5.2. RLS ligado em todas as tabelas de tenant. Política padrão: nega tudo, libera por `tenant_id` da sessão.

### 9.3 Webhooks

- Meta: validação de assinatura (`X-Hub-Signature-256`).
- Hotmart: validação de hottok / assinatura.
- Asaas: validação de token de webhook.
- Endpoints idempotentes (mesmo evento processado 2x não duplica efeito) — chave de idempotência por `meta_message_id` / `gateway_event id`.

### 9.4 Rate limiting e abuso

- Rate limit por tenant na API (Redis).
- Throttle de disparo respeitando tier Meta.
- Lock distribuído (Redis) para evitar processar a mesma conversa em paralelo.

### 9.5 LGPD

- Dados de leads são dados pessoais. Tenant é controlador, Leedi é operador.
- Opt-out respeitado (lead.status = optout → nunca mais abordado).
- Exclusão de dados sob solicitação (cascata por tenant/lead).
- Termo de uso e política de privacidade (jurídico — fora do escopo de código, mas anotado).

### 9.6 Padrões de integração resiliente (webhook retry + DLQ)

**Webhook Ingestion Pattern:**

- Endpoints `/webhooks/*` são idempotentes (verificação por chave canônica: `meta_message_id`, `gateway_event_id`, `payment_event_id`).
- Cada webhook é enfileirado em Redis com chave `webhook:{provider}:{event_id}` para deduplicação — TTL 24h.
- Consumer assíncrono processa fila (BullMQ) com retry exponencial: **3 tentativas** — 1s → 4s → 16s. Após 3 falhas, o job vai para a DLQ.
- **DLQ (Dead Letter Queue):** após 3 falhas, evento é movido para `{tenantId}:webhook:dlq`. Sentry alerta quando DLQ de um tenant ultrapassar **10 eventos em 1 hora** (`severity:critical`).
- **Replay manual:** super-admin pode re-disparar um job do DLQ pelo painel admin (V1: via BullMQ Job API; V2: botão na UI de admin).
- Falhas registradas com `webhook_error.provider`, `webhook_error.event_id`, `webhook_error.last_error_message` para debug.

**Idempotência por provider:**
- **Hotmart:** `gateway_events` row com `processado: true` — processamento duplo do mesmo `gateway_event_id` é descartado.
- **Meta (mensagens):** `messages.meta_message_id` com constraint UNIQUE — inserção duplicada falha silenciosamente.

**Debounce de mensagens (Meta):** múltiplas mensagens do mesmo lead em 6s são agrupadas antes de acionar o agente. Chave Redis: `buffer:msg:{tenantId}:{leadPhone}`, TTL 30s. Cada mensagem individual é persistida em `messages` antes do debounce — nenhuma mensagem é perdida mesmo que o agente processe em batch.

**Implementação:**

```
- Redis job queue (Bull/RabbitMQ) como fonte única de verdade para processamento.
- Worker isolado em container/função separada (não bloqueia API).
- Monitoramento: número de jobs em fila, taxa de falha, idade dos jobs em DLQ.
```

### 9.7 Retenção e TTL em Redis

Redis é usado para: deduplicação (webhooks), rate limiting, locks distribuídos, cache de templates.

**Política de TTL:**
| Chave | Propósito | TTL |
|---|---|---|
| `webhook:{provider}:{event_id}` | Deduplicação de entrada | 24h |
| `buffer:msg:{tenantId}:{leadPhone}` | Buffer de mensagens (debounce de 6s) | 30s |
| `ratelimit:{tenant_id}:{endpoint}` | Rate limiting por tenant | 60s |
| `lock:agent:{tenantId}:{leadPhone}` | Lock distribuído de conversa (evita processamento paralelo) | 300s (5 min) |
| `template:cache:{template_id}` | Cache de templates aprovados | 24h |
| `session:{session_id}` | Sessão de usuário | 30 dias (renovável) |
| `playground:{tenantId}:{sessionId}` | Sessão do playground (sandbox) | 1800s (30 min) |
| `bullmq:job:*` | Metadados de jobs BullMQ (ex: transição de fase agendada) | 7 dias |

**Eviction policy:** `allkeys-lru` — quando memory limit atingir 80%, evitar chaves menos usadas. Monitorar `redis_memory_used` em observabilidade.

### 9.8 BYOK — Dois conceitos distintos para Enterprise

> **Atenção:** O termo "BYOK" no Leedi cobre dois casos de uso diferentes. Leia ambas as seções para entender qual se aplica a cada contexto de implementação.

#### 9.8.1 BYOK — Chave de Criptografia de Dados (Enterprise)

Clientes Enterprise podem fornecer suas próprias chaves de criptografia para dados sensíveis em repouso (leads, conversas).

**Implementação:**

- Campo `tenant.encryption_key_id` referencia chave armazenada em cofre (AWS KMS, Vault).
- Se `encryption_key_id` != null, todas as mensagens de `lead` e `conversation` são criptografadas com essa chave antes de salvar em DB.
- Decriptografia ocorre on-demand (leitura de conversa carrega chave do cofre, decripta em memória).
- Fallback para chave padrão da plataforma se Enterprise não fornece chave.
- Auditoria: `audit_log` com `action: 'encryption_key_accessed'` em todo acesso.

**Configuração:**

```yaml
# Para Enterprise ativar BYOK de dados
tenant:
  encryption_enabled: true
  encryption_key_id: 'arn:aws:kms:us-east-1:123456:key/abc-def'
  encryption_algorithm: 'AES-256-GCM'
```

#### 9.8.2 BYOK — Chave de IA Anthropic (Enterprise)

Clientes Enterprise podem fornecer sua própria Anthropic API key, consumindo cota da própria conta em vez da cota compartilhada da plataforma.

**Implementação:**

- Campo `agent_configs.byok_key_encrypted` (nullable) — armazenado com envelope encryption (mesma estratégia do `access_token_encrypted` de WhatsApp).
- O AI provider adapter em `@leedi/agent` verifica: se `agent_config.byok_key_encrypted` não é null, descriptografa e usa como header `x-api-key` na chamada ao Anthropic; caso contrário, usa a chave da plataforma (`ANTHROPIC_API_KEY`).
- Custo de IA para tenants com BYOK não é contabilizado no `usage_counters.custo_ia_usd` da plataforma (é custo do próprio cliente).
- Gated ao plano Enterprise.

> **Nota:** a coluna `agent_configs.byok_key_encrypted` não existe na migration atual — será adicionada em epic futuro de Enterprise. Este documento registra o target de implementação.

### 9.9 Audit Log: Retenção e Políticas de Exclusão

Logs de auditoria rastreiam acesso a dados, mudanças de configuração, e operações sensíveis (exclusão de lead, exportação de dados, alteração de chave).

**Tabela `audit_log`:**

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenant(id),
  user_id UUID REFERENCES auth_user(id),
  action TEXT, -- 'create_lead', 'delete_lead', 'export_data', 'encryption_key_accessed'
  resource_type TEXT, -- 'lead', 'conversation', 'dispatch'
  resource_id UUID,
  change_before JSONB, -- estado anterior (para deletions)
  change_after JSONB,  -- estado novo
  reason TEXT, -- 'GDPR_request', 'user_delete', 'maintenance'
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP, -- para LGPD "right to be forgotten"

  CONSTRAINT audit_log_tenant FOREIGN KEY (tenant_id)
);

CREATE INDEX idx_audit_log_tenant_action ON audit_log(tenant_id, action);
CREATE INDEX idx_audit_log_tenant_created ON audit_log(tenant_id, created_at DESC);
```

**Retenção:**

- **Hot storage:** 90 dias no Supabase (tabela `audit_log` — dados de auditoria normais, conformidade padrão).
- **Archival mensal (cron):** No dia 1 de cada mês, um cron job exporta linhas com `created_at < now() - 90 days` para S3-compatible storage (Supabase Storage ou bucket externo), no formato JSONL particionado por `(tenant_id, YYYY-MM)`. Após confirmação do upload, as linhas exportadas são deletadas do hot storage.
- **GDPR/LGPD "direito ao esquecimento":** Se `reason = 'GDPR_request'`, linha é marcada com `expires_at = now() + 30 days`, então deletada após 30 dias (período de contestação legal) independente do cron mensal.
- **Exportação para compliance:** Super-admin pode exportar o audit log de qualquer tenant como CSV (com colunas: `id`, `tenant_id`, `user_id`, `action`, `resource_type`, `resource_id`, `reason`, `ip_address`, `created_at`) para atender solicitações regulatórias. Download disponível no painel admin em "Tenant → Audit Log → Exportar CSV".

**Cascata de Deletions:**

```
1. User requisita "apagar meus dados" (GDPR)
2. Sistema insere audit_log com action='delete_lead', reason='GDPR_request'
3. Leads/conversations do tenant são deletados (hard delete ou soft: is_deleted=true)
4. Audit log de deletions permanece 30 dias, depois expira
5. Log de expiração registrado em 'audit_log_purged' para compliance
```

---

## 10. Observabilidade

- **Sentry:** exceções em apps e API, com contexto de tenant.
- **PostHog:** eventos de produto (onboarding completou, disparo criado, agente configurado) — funis e retenção.
- **Better Stack:** logs estruturados (JSON), buscáveis, com `tenant_id` e `request_id` em tudo.
- **Métricas de negócio:** dashboards internos (custo IA por tenant, conversas, margem) no painel admin.

Todo log carrega: `request_id`, `tenant_id` (quando aplicável), `user_id` (quando aplicável). Rastreabilidade ponta a ponta.

---

## 11. Estratégia de testes

- **Unitário:** casos de uso e regras de domínio (Vitest). Domínio é puro, fácil de testar.
- **Integração:** adapters contra sandboxes (Asaas sandbox, Meta test number).
- **E2E:** fluxos críticos (onboarding, disparo, conversa) — V1.5, não V0.
- **Contrato:** cada port tem teste de contrato que toda implementação deve passar.

V0 prioriza testes de domínio (regras de negócio) e dos adapters críticos (WhatsApp, Gateway). Cobertura ampla vem na estabilização.

---

## 12. Ambientes e deploy

| Ambiente | Uso                 | Infra                                                               |
| -------- | ------------------- | ------------------------------------------------------------------- |
| Local    | Desenvolvimento     | Docker compose (Postgres, Redis local) ou Supabase branch + Upstash |
| Staging  | Testes pré-produção | Vercel preview + Supabase staging                                   |
| Produção | Clientes reais      | Vercel + Supabase + Upstash                                         |

- Migrations versionadas (Drizzle) — aplicadas em CI antes do deploy.
- Webhooks da Meta exigem HTTPS público estável → Vercel resolve; Cloudflare Tunnel é opção para desenvolvimento local com webhook real.
- Feature flags controlam o que está ativo em cada ambiente.

---

## 13. Dívidas conscientes (o que NÃO fazemos agora e por quê)

Registramos aqui para que ninguém "descubra" depois que algo ficou de fora por acidente. Ficou de fora **de propósito**.

| Item                                   | Quando                   | Por quê adiar                                       |
| -------------------------------------- | ------------------------ | --------------------------------------------------- |
| Embedded Signup (Tech Provider)        | Após aprovação Meta      | Depende de processo externo de meses                |
| RAG com embeddings                     | V2                       | V1 usa busca por categoria/keyword; reduz escopo    |
| Conectores ativos (RD, ActiveCampaign) | V1.5/V2                  | Integração de import contínuo, diferente de webhook |
| A/B testing                            | V2                       | Schema pronto, lógica depois                        |
| Resposta em áudio (TTS)                | V2+                      | Luxo, não essencial                                 |
| Agendamento calendário                 | V2                       | Caso de uso de nicho                                |
| Billing internacional (Stripe)         | Quando vender fora do BR | Asaas atende BR                                     |
| White-label total (CNAME)              | V2 enterprise            | Login unificado atende V1                           |
| Separação física do banco de memória   | Quando volume justificar | Separação lógica já isola                           |
| Múltiplos números por tenant           | V1.5/Enterprise          | V1 = 1 número por tenant                            |

### Decisão arquitetural registrada: transcrição de áudio (Story 7.7)

Claude/Anthropic não aceita arquivos de áudio como input — não há endpoint de transcrição na API. A transcrição de mensagens de voz do WhatsApp requer um serviço externo dedicado.

**Serviço adotado:** Groq Whisper (padrão), com adapter pattern para troca sem mudança de código.

| Provider | Preço/min | Notas |
|----------|-----------|-------|
| **Groq Whisper** (default) | ~$0,00033/min | 18× mais barato que OpenAI; excelente qualidade PT-BR |
| OpenAI Whisper | $0,006/min | Fallback disponível via adapter |
| Deepgram | $0,0043/min | Stub disponível via adapter |

**Implementação:** Port `TranscriptionProvider` em `packages/agent/src/ports/transcription-provider.ts`. Provider selecionado via env var `TRANSCRIPTION_PROVIDER` (`'groq'` | `'openai'` | `'deepgram'`, default `'groq'`). Chave: `GROQ_API_KEY` (obrigatória quando `TRANSCRIPTION_PROVIDER=groq`).

**Por que uma nova dependência externa:** Claude não processa áudio nativamente. O WhatsApp Business entrega áudio OGG/OPUS — transcrevemos antes de enviar ao Claude para manter o fluxo de raciocínio do agente íntegro. Esta é a única dependência de IA fora do ecossistema Anthropic no V0/V1.

---

## 14. Glossário

- **Workspace:** entidade-topo (Exponensia). Você.
- **Tenant:** um cliente infoprodutor.
- **Janela de conversa:** período de 24h de troca de mensagens com um lead. Unidade de cobrança e métrica de plano.
- **Evento canônico:** formato interno padronizado de evento de venda, independente do gateway.
- **Adapter:** implementação concreta de uma integração externa por trás de uma interface.
- **Port:** interface que o domínio define e os adapters implementam.
- **Tool:** ferramenta que o agente de IA pode chamar durante o raciocínio.
- **Handoff:** transferência de atendimento do agente para um humano.
- **Tier (Meta):** faixa de volume de mensagens permitido pela Meta (1k, 10k, 100k, ilimitado/dia).
- **Overage:** uso acima do limite do plano, cobrado por excedente.

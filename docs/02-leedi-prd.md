# Leedi — PRD (Product Requirements Document)

> **Versão:** 1.0
> **Codinome:** Leedi (provisório)
> **Empresa:** Exponensia Lab
> **Companion:** ver `01-leedi-arquitetura.md` (técnico) e `03-leedi-execucao.md` (plano)
> **Status:** Aprovado para construção

---

## 0. Como usar este documento

Este PRD descreve **o que** o Leedi faz e **por que**, do ponto de vista do produto e do usuário. O documento de arquitetura cobre o **como** técnico. Ao usar BMAD no Claude Code, este PRD alimenta os agentes **analyst** e **pm**; a arquitetura alimenta o **architect**.

Cada feature está marcada com a fase em que entra: **V0** (Libras A2 rodando), **V1** (vendável), **V1.5** (segundo cliente), **V2** (escala). Critérios de aceite estão ao final de cada módulo.

---

## 1. Visão do produto

### 1.1 O problema

O mercado de infoprodutos mudou com a IA. Lançamentos geram milhares de leads que precisam ser atendidos no WhatsApp em janelas curtas (carrinho aberto de 7 dias). Atendimento humano não escala. As ferramentas líderes (ManyChat, BotConversa) são fluxos visuais rígidos com IA parafusada por cima — não raciocinam, não qualificam, não vendem de verdade.

### 1.2 A solução

Leedi é uma plataforma AI-native onde um **agente de vendas inteligente** atende leads no WhatsApp oficial, qualifica cada um, identifica em que ponto da jornada está, oferece o produto certo (principal, downsell, upsell), contorna objeções com método de venda, e sabe quando chamar um humano — tudo configurável por um painel simples, sem o infoprodutor escrever uma linha de prompt.

### 1.3 A tese

As líderes não vão se reconstruir AI-native — quebraria a base delas. Há uma janela para um produto novo, pensado desde o núcleo para a IA raciocinar, não para executar fluxos fixos.

### 1.4 O que o Leedi NÃO é

Não é checkout (Hotmart/Eduzz/Kiwify fazem isso). Não é CRM completo. Não é ferramenta de fluxo visual drag-and-drop. É a camada de **conversa inteligente + disparo + inteligência de venda** ao redor do evento de compra.

---

## 2. Personas

### 2.1 Caio (Super-Admin / Exponensia)

Dono da plataforma. Vende setup + recorrência. Precisa: criar e configurar tenants, fazer onboarding assistido, ver saúde financeira do SaaS (MRR, inadimplência), dar suporte (impersonate), controlar bloqueio por pagamento.

### 2.2 Gesiel / Kerima / Alison (Owner/Admin do tenant — Libras A2)

Infoprodutores. Não-técnicos. Precisam: configurar o agente em linguagem simples, cadastrar produtos, criar campanhas, disparar templates, ver conversas e métricas, saber quanto estão usando/gastando. Não querem ver complexidade técnica.

### 2.3 Operador (futuro — equipe do tenant)

Atende no inbox quando o agente transfere. Vê resumo da conversa, responde, resolve.

### 2.4 Lead (cliente final do infoprodutor)

Pessoa no WhatsApp. Não usa o Leedi — conversa com o agente. Experiência precisa ser natural, humana, sem parecer robô.

---

## 3. Sistema de design

### 3.1 Identidade

Base **monocromática sóbria** (escala de cinzas neutros), **indigo escuro** como cor primária, **acento violeta** apenas em elementos de IA. Profissional, mas moderno. Referências: Linear, Resend, Cal.com.

### 3.2 Tokens de cor (definidos por nome, não hex direto no código)

```
Neutral:   neutral-50 → neutral-950 (12 tons, cinza neutro sem viés)
Primary:   indigo escuro, 10 tons (hover, active, disabled, etc.)
Accent-AI: violeta — SÓ em badges/indicadores de ação de IA
Semantic:  success (verde sóbrio), warning (âmbar), error (vermelho sóbrio), info
Channel:   verde WhatsApp — SÓ em ícone de canal e botão "conectar número"
```

Modo escuro: base off-black (não #000 puro), indigo ganha luminosidade para legibilidade.

### 3.3 Princípios de UI

- **Densidade:** espaçoso por padrão, com toggle "modo compacto" para usuários avançados.
- **Dark/light:** ambos desde V0, troca no header e respeitando preferência do sistema.
- **Tom:** claro, direto, em português-BR. Sem jargão técnico para o tenant. Mensagens de erro explicam o que fazer.
- **Feedback de IA:** quando a IA está agindo (gerando, melhorando texto, resumindo), indicador visual com acento violeta. O usuário sempre sabe quando é a IA.
- **Componente `<AIAssistedTextarea>`:** todo campo de texto longo (persona, argumentos, objeções, template) tem botão "✨ Melhorar com IA" → modal com original vs sugestão lado a lado → aceitar/editar.

### 3.4 Acessibilidade

Contraste mínimo WCAG AA. Navegação por teclado. Labels em formulários. Componentes shadcn/ui já trazem base acessível.

---

## 4. Aplicações

| App           | Domínio (exemplo)    | Quem usa                       |
| ------------- | -------------------- | ------------------------------ |
| **web**       | `leedi.com.br`       | Público, leads de venda, login |
| **dashboard** | `app.leedi.com.br`   | Tenant (infoprodutor)          |
| **admin**     | `admin.leedi.com.br` | Super-admin (Exponensia)       |

Login unificado (decisão B.15 opção 3): usuário entra em `app`, cai no tenant a que pertence; se em vários, troca via menu. White-label por subdomínio fica V2 enterprise.

---

## 5. Módulos do produto

> Cada módulo abaixo lista: objetivo, funcionalidades por fase, fluxos de UX, critérios de aceite.

---

### MÓDULO 1 — Autenticação e Tenancy

**Objetivo:** Login seguro, multi-tenant, com papéis.

**V0/V1:**

- Signup/login (email + senha) via Better-Auth
- Recuperação de senha (email Resend)
- Sessão persistente, logout
- Pertencimento a tenant(s) com papel (owner/admin/operator/viewer)
- Troca de tenant (se usuário pertence a vários)
- Convite de usuário para o tenant (owner/admin convida por email)
- Super-admin: acesso ao workspace, impersonate de tenant

**Fluxo — convite de usuário:**

1. Owner vai em Configurações → Equipe → Convidar
2. Informa email + papel
3. Sistema envia email com link de convite
4. Convidado aceita, cria senha, entra no tenant com o papel

**Critérios de aceite:**

- [ ] Usuário não acessa dados de tenant que não pertence (testado com RLS)
- [ ] Papéis restringem ações conforme tabela RBAC
- [ ] Super-admin consegue impersonate e tudo fica em audit_log
- [ ] Recuperação de senha funciona via email

---

### MÓDULO 2 — Onboarding (Setup Assistido)

**Objetivo:** Levar um tenant novo de zero a operacional. Na fase pré-Tech-Provider, é assistido pela equipe Exponensia.

**V0/V1 (Setup Assistido):**
Wizard de 5 passos, salvável e retomável:

1. **Dados da empresa** — nome, logo, segmento, cores opcionais
2. **Conectar WhatsApp** — checklist guiado de setup Meta (com vídeos), campo para colar `phone_number_id`, `waba_id`, `access_token`; sistema valida conexão
3. **Conectar gateway** — escolhe Hotmart (V1) → sistema gera URL de webhook → cliente cola na Hotmart → sistema confirma recebimento de evento de teste
4. **Configurar agente** — nome do agente, persona (com botão ✨), método de venda, produtos iniciais
5. **Testar** — playground (Módulo 8) simulando lead

**Fluxo — quem faz o quê (pré-Tech-Provider):**

- Equipe Exponensia executa o setup Meta (cria/verifica BM, número, token) como serviço de setup pago
- Cliente acompanha e valida
- Quando vira Tech Provider: passo 2 vira botão "Conectar com Meta" (Embedded Signup OAuth) → automático → onboarding self-service

**Edge Cases — Onboarding Incompleto:**

1. **Super-admin view de tenants em onboarding:**
   - Tenant com `status=onboarding` (not yet ativo) aparece na lista admin com badge "⚠️ Setup em progresso"
   - Super-admin pode ver qual passo foi alcançado (passo 1-5, último visitado)
   - Super-admin pode forçar ativação (status→ativo) mesmo incompleto, SE necessário para troubleshoot

2. **Abandono de onboarding:**
   - Se > 48 horas sem progresso no wizard (nenhum passo avançado), tenant owner recebe email automático: "Seu setup está incompleto. Continue de onde parou: [link]"
   - Dados parciais (empresa + WhatsApp conectado mas sem agente) são preservados; cliente pode retomar
   - Sessão de onboarding não expira (salvável indefinidamente até conclusão)

3. **Erros de validação em passos:**
   - Erro no passo 2 (WhatsApp): mensagem clara ("Token expirado", "Número inválido", etc) + link para troubleshoot
   - Erro no passo 3 (gateway): retry automático se timeout; se falhar, opção de ignorar e testar depois
   - Se todos os 5 passos passam mas agente está misconfigured (ex: sem método de venda), wizard alerta antes de ativar

4. **Múltiplos números WhatsApp:**
   - Starter/Pro: apenas 1 número. Se cliente tenta adicionar segundo, mostra "Upgrade para plano Enterprise para múltiplos números"
   - Enterprise: podem conectar 3+ números no mesmo onboarding (passo 2 expande para múltiplos inputs)

**Critérios de aceite:**

- [ ] Wizard salva progresso por passo, permite voltar
- [ ] Validação de conexão WhatsApp dá feedback claro (conectado/erro + motivo)
- [ ] Webhook de gateway confirma recebimento de evento de teste
- [ ] Ao concluir, tenant fica status=ativo e agente configurado

---

### MÓDULO 3 — Conexão WhatsApp

**Objetivo:** Gerenciar a conexão do número do tenant com a Meta.

**V0/V1:**

- Provider Meta Cloud API (direto)
- Status da conexão (conectado/erro/desconectado)
- Quality rating (green/yellow/red) visível
- Messaging tier visível (1k/10k/100k/ilimitado por dia)
- Recebimento de mensagens (webhook entrada)
- Envio de mensagens (texto, mídia, template)
- Coexistência (número que já é usado no WhatsApp pessoal/Business app pode conectar)

**V1.5+:**

- Múltiplos providers (Mega-API fallback)
- Múltiplos números por tenant (enterprise)

**Critérios de aceite:**

- [ ] Recebe mensagem do lead e roteia para o agente
- [ ] Envia resposta do agente ao lead
- [ ] Mostra quality rating e tier corretos da Meta
- [ ] Token armazenado criptografado, nunca exposto

---

### MÓDULO 4 — Agente de IA (configuração + operação)

**Objetivo:** O coração. Configurar e operar o agente vendedor inteligente.

**V0/V1 — Configuração (painel):**

- Nome do agente (Mari, Sofia, etc.)
- Persona (campo longo + botão ✨ Melhorar com IA)
- Estilo de mensagem (tamanho, formalidade, uso de emoji)
- Limites (o que não falar)
- Método de venda (SPIN/AIDA/Storytelling/Livre — Módulo 7)
- Toggles de tools (transferência humana, follow-up, base conhecimento, auto-tag, reengajamento)
- Modelo de IA (Sonnet padrão; Opus em enterprise)

**V0/V1 — Operação (automática):**

- Processa mensagens via Agent SDK com tools
- Identifica lead recorrente vs novo
- Qualifica lead (mapeia dados)
- Decide oferta válida (principal/downsell/upsell)
- Contorna objeções
- Decide quando transferir para humano
- Multimodal: entende imagem; transcreve áudio recebido
- Divide respostas em mensagens naturais (sem blocos gigantes)

**V2:**

- RAG completo (embeddings)
- Análise pós-conversa
- A/B de prompts

**Fluxo — lead recorrente:**

1. Lead manda mensagem
2. Agente chama `buscar_historico_lead`
3. Descobre: participou do lançamento de janeiro, não comprou, objeção foi preço
4. Adapta: "Oi Maria! Que bom te ver de novo 💙 Vi que você se interessou pelo A2 Club em janeiro..."

**Critérios de aceite:**

- [ ] Agente responde de forma natural, dividindo mensagens
- [ ] Identifica corretamente quem já comprou (não oferece de novo)
- [ ] Identifica lead recorrente e adapta discurso
- [ ] Aplica o método de venda configurado
- [ ] Contorna pelo menos as 5 objeções principais do Libras A2
- [ ] Transcreve áudio recebido e responde coerentemente
- [ ] Entende imagem recebida
- [ ] Respeita toggles (não usa tool desligada)
- [ ] Prompt caching ativo (custo otimizado)

---

### MÓDULO 5 — Conhecimento (produtos + base)

**Objetivo:** Munição de venda do agente.

**V0/V1 — Produtos:**

- CRUD de produtos: nome, descrição, preço, parcelas, link checkout, tipo (principal/downsell/upsell/orderbump)
- Argumentos de venda (lista, com ✨)
- Diferenciais (lista, com ✨)
- Provas sociais / depoimentos (lista, com ✨)
- Garantia, bônus
- Vínculo com gateway_product_id (para casar com webhook)

**V0/V1 — Base de conhecimento:**

- FAQ (pergunta + resposta, com ✨)
- Objeções + contornos (categoria + objeção + contorno, com ✨)
- Busca por categoria/keyword (V1)

**V2:**

- RAG com embeddings (busca semântica)

**Critérios de aceite:**

- [ ] Produto cadastrado entra no contexto do agente quando relevante
- [ ] Agente usa argumentos/diferenciais reais nas conversas
- [ ] Objeção do lead → agente busca contorno correto
- [ ] Botão ✨ melhora texto e mostra antes/depois

---

### MÓDULO 6 — Campanhas

**Objetivo:** Organizar lançamentos e suas fases.

**V0/V1:**

- CRUD de campanhas: nome, produto, tipo (lançamento/downsell/perpétuo), datas
- Fases: aquecimento, carrinho_aberto, downsell, encerrada
- Config de urgência/mensagens-chave por fase
- Transição de fase (carrinho → downsell) — manual ou agendada
- Ativar/pausar campanha
- Campanha ativa define o que o agente oferece

**Fluxo — transição carrinho → downsell:**

1. Campanha está em carrinho_aberto, produto = A2 Club
2. Chega data_fim ou admin aciona transição
3. Sistema move campanha para fase downsell, produto = Box Êxodo
4. Leads não-compradores entram no contexto de downsell
5. Agente passa a oferecer downsell suavemente

**Critérios de aceite:**

- [ ] Transição de fase muda a oferta do agente
- [ ] Quem comprou na fase anterior não recebe downsell
- [ ] Urgência aplicada conforme dias restantes

---

### MÓDULO 7 — Métodos de Venda

**Objetivo:** Dar método à venda do agente.

**V0/V1 — quatro métodos pré-configurados (seed global):**

- **SPIN Selling** — Situação → Problema → Implicação → Necessidade
- **AIDA** — Atenção → Interesse → Desejo → Ação
- **Storytelling** — Identificação → Conflito → Transformação → Convite
- **Livre** — sem framework, segue só personalidade

Cada método tem `system_prompt_template` bem construído (por Claude) + fases. Cliente escolhe no setup do produto/agente. O sistema mescla método + persona + produto no system prompt do agente.

**Critérios de aceite:**

- [ ] Trocar o método muda o comportamento observável do agente
- [ ] Os 4 métodos têm prompts de qualidade testados
- [ ] Método combina corretamente com persona e produto

---

### MÓDULO 8 — Playground (simulador)

**Objetivo:** Cliente testa o agente antes de soltar para leads reais. **Crítico** — evita soltar agente quebrado em produção.

**V0/V1:**

- Interface de chat dentro do painel
- Cliente conversa como se fosse um lead
- Usa a config atual do agente (persona, método, produto, campanha selecionada)
- Permite simular cenários (lead novo, lead recorrente, com objeção)
- Mostra quando o agente usa tools (transparência)
- Não envia mensagens reais nem conta no uso

**Critérios de aceite:**

- [ ] Conversa reflete fielmente o que aconteceria em produção
- [ ] Mudou config → playground reflete imediatamente
- [ ] Não consome cota nem dispara WhatsApp real
- [ ] Mostra tools chamadas

---

### MÓDULO 9 — Templates Meta

**Objetivo:** Criar, aprovar e gerenciar templates HSM dentro do app.

**V0/V1:**

- Builder de template: header, body, footer, buttons, variáveis ({{1}}, {{2}})
- Categoria (marketing/utility/authentication)
- Submissão à Meta via Graph API
- Status (rascunho/pendente/aprovado/rejeitado) + motivo de rejeição
- Webhook de mudança de status da Meta
- Biblioteca de templates sugeridos por ocasião (B.9): boas-vindas, carrinho abandonado (1h/6h/24h), última chamada, pós-compra, reengajamento, lembrete de evento
- Cliente adiciona da biblioteca, customiza, submete
- Campo de texto com botão ✨

**Critérios de aceite:**

- [ ] Template criado é submetido à Meta e recebe status
- [ ] Status atualiza via webhook (aprovado/rejeitado + motivo)
- [ ] Biblioteca permite adicionar e customizar
- [ ] Variáveis funcionam no disparo

---

### MÓDULO 10 — Disparador

**Objetivo:** Enviar templates de forma inteligente e segura.

**V0/V1 — Disparo manual segmentado:**

- Criar segmento (filtros: comprou_x, não_comprou, tag, origem, data captação)
- Selecionar template aprovado
- Selecionar segmento
- Agendar (horário ótimo 9h-21h local ou customizado)
- Throttling (respeita tier Meta, intervalo entre mensagens)
- Filtros de exclusão automáticos (já comprou, optout, conversa ativa)
- Acompanhamento (enviados, entregues, respondidos, falhas)

**V0/V1 — Disparo automático por regra (B.9):**

- Regras: trigger (carrinho_abandonado, sem_resposta_48h, fim_oferta_24h) + janela + template
- Sistema executa quando trigger acontece
- Agente pode solicitar reengajamento (tool `solicitar_reengajamento`)

**V0/V1 — Follow-up dentro da janela 24h:**

- Agente agenda follow-up (tool `agendar_followup`) dentro da janela aberta
- Sistema envia no horário, sem custo de template (mensagem livre)
- Se janela fechou, cai para reengajamento via template

**V2:**

- Melhor horário por lead (ML)
- A/B de templates

**Critérios de aceite:**

- [ ] Disparo respeita tier e não fura limite Meta
- [ ] Não dispara para quem já comprou / optou por sair / está em conversa ativa
- [ ] Quality rating caindo → pausa disparos e alerta
- [ ] Follow-up na janela 24h envia mensagem livre (sem custo de template)
- [ ] Regras automáticas disparam o template certo no trigger certo

---

### MÓDULO 11 — Inbox (caixa de entrada unificada)

**Objetivo:** Ver e operar conversas; receber handoffs do agente.

**V0/V1:**

- Lista de conversas em tempo real (status: bot, aguardando humano, em atendimento, resolvido)
- Abrir conversa → histórico completo
- **Painel lateral com resumo de handoff da IA** (quem é, o que quer, objeções, temperatura, motivo, sugestão)
- Atendente pode assumir (pausa agente), responder manualmente, devolver ao bot, marcar resolvido
- Filtros (temperatura, status, tag)
- Notificação quando lead pede humano

**Critérios de aceite:**

- [ ] Conversa transferida aparece com resumo da IA no painel lateral
- [ ] Assumir conversa pausa o agente naquele lead
- [ ] Responder manualmente envia ao lead via WhatsApp
- [ ] Devolver ao bot reativa o agente

---

### MÓDULO 12 — Leads

**Objetivo:** Gerenciar a base de leads e sua jornada.

**V0/V1:**

- Lista de leads (filtros: temperatura, origem, status, tag, comprou)
- Detalhe do lead: dados, jornada (timeline), tags, conversas, compras
- Importação via CSV (telefone obrigatório, nome, email)
- Tags manuais + auto-tags do agente
- Opt-out manual e automático

**V1.5/V2:**

- Importação contínua via API (RD Station, ActiveCampaign)

**Critérios de aceite:**

- [ ] Import CSV ignora duplicados por telefone
- [ ] Timeline mostra jornada completa do lead
- [ ] Filtros funcionam e alimentam segmentos
- [ ] Opt-out impede futuras abordagens

---

### MÓDULO 13 — Gateway (integrações de venda)

**Objetivo:** Receber e normalizar eventos de venda.

**V0/V1:**

- Hotmart: webhook receiver + validação + normalização
- Eventos canônicos: compra_aprovada, recusada, cancelada, reembolsada, chargeback, carrinho_abandonado, assinatura_iniciada/cancelada/atrasada, boleto_gerado, pix_gerado
- Compra aprovada → marca lead como comprador (agente para de oferecer)
- Carrinho abandonado / boleto / pix gerado → recuperação ativa
- Cancelamento/reembolso → reverte status

**V1.5:**

- Eduzz, Kiwify (novos adapters, sem tocar no core)

**Critérios de aceite:**

- [ ] Webhook Hotmart valida assinatura e normaliza evento
- [ ] Compra aprovada reflete no lead em tempo real
- [ ] Eventos idempotentes (não duplicam)
- [ ] Adicionar Eduzz = só novo adapter

---

### MÓDULO 14 — Billing (Asaas)

**Objetivo:** Cobrança recorrente e controle de inadimplência.

**V0/V1:**

- Integração Asaas (cliente, assinatura recorrente PIX/cartão/boleto)
- Planos: Starter R$697, Pro R$1.497, Enterprise sob consulta
- Webhook de pagamento → libera/bloqueia tenant
- Bloqueio gradual: atraso >3 dias → bloqueia funcionalidades de envio; >7 dias → bloqueio total (agente off, dados preservados, aviso "regularize pagamento")
- Painel do tenant: plano atual, faturas, status, próximo vencimento

**Critérios de aceite:**

- [ ] Assinatura criada no Asaas no onboarding
- [ ] Pagamento aprovado libera; atraso bloqueia conforme regra
- [ ] Bloqueio preserva dados, só pausa operação
- [ ] Tenant vê faturas e status

---

### MÓDULO 15 — Usage (medição e overage)

**Objetivo:** Medir conversas, controlar limite, cobrar excedente com transparência.

**V0/V1:**

- Contagem de conversas (1 conversa = 1 janela 24h billable) por período
- Painel do tenant: "Usou X de Y conversas (Z%)" + barra + histórico
- Alertas em 80%, 95%, 100%
- Overage: acima do limite, R$0,30/conversa adicional (continua atendendo)
- Configuração: "bloquear ao atingir limite" (default OFF), "notificar a cada R$100 overage" (default ON)
- Custo de IA por tenant (visível só super-admin)

**Critérios de aceite:**

- [ ] Contagem de conversas precisa (janela 24h)
- [ ] Painel mostra uso em tempo real
- [ ] Overage calculado e mostrado transparentemente
- [ ] Alertas disparam nos limiares

---

### MÓDULO 16 — Notificações

**Objetivo:** Avisar o tenant de eventos importantes.

**V0/V1:**

- Push web + email (Resend)
- Eventos: venda aprovada, lead pediu humano, template rejeitado, quality caindo, conta bloqueada, disparo concluído, alerta de uso
- Preferências por usuário (quais eventos, quais canais)
- Emails: noreply@ (transacional), com templates React Email

**V1.5:**

- WhatsApp para eventos críticos (cliente cadastra número pessoal; envia pelo número da empresa; templates UTILITY; disclaimer de custo ~R$0,006/msg)

**Critérios de aceite:**

- [ ] Eventos disparam notificação nos canais escolhidos
- [ ] Preferências respeitadas
- [ ] Emails entregam (DKIM/SPF configurados)

---

### MÓDULO 17 — Dashboard do Tenant

**Objetivo:** Visão de resultado para o infoprodutor.

**V0/V1 — métricas:**

- Conversas iniciadas
- Taxa de resposta
- Conversões (vendas atribuídas)
- Ticket médio
- ROI (receita vs custo)
- Valor total de vendas
- Objeções mais frequentes
- Uso de conversas do plano (link p/ Módulo 15)
- Saúde do número (quality, tier — Módulo 3)
- Status de campanhas ativas

**Critérios de aceite:**

- [ ] Métricas refletem dados reais em tempo (quase) real
- [ ] Objeções agregadas das conversas
- [ ] Conversões cruzam com eventos de gateway

---

### MÓDULO 18 — Painel Super-Admin (Exponensia)

**Objetivo:** Você gerenciar o seu negócio (o SaaS).

**V0/V1 — Saúde financeira:**

- MRR (receita recorrente mensal)
- Receita do mês: recebida vs projetada
- Valores a receber (faturas em aberto + vencimentos)
- Inadimplentes (quem, há quantos dias, valor)
- Churn no período
- Ticket médio
- Overage agregado

**V0/V1 — Clientes:**

- Total de tenants (ativo/bloqueado/trial/cancelado)
- Novos no mês, crescimento líquido
- Lista de tenants com status financeiro

**V0/V1 — Operacional (saúde do produto):**

- Total de conversas (todos os tenants)
- Custo de IA agregado (cruzar com receita → margem real)
- Tenants perto do limite (oportunidade de upsell)
- Tenants com quality caindo (risco de churn)

**V0/V1 — Ações:**

- Criar tenant (onboarding assistido)
- Impersonate (suporte, logado em auditoria)
- Bloquear/liberar manualmente
- Forçar liberação (pagamento alternativo combinado)
- Histórico financeiro por cliente

**Critérios de aceite:**

- [ ] MRR e inadimplência corretos
- [ ] Custo IA por tenant visível → margem calculável
- [ ] Impersonate funciona e fica em audit_log
- [ ] Bloqueio/liberação manual reflete imediatamente

---

## 5.5. Requisitos Não-Funcionais (Performance, Disponibilidade, Throughput)

### Performance Targets

- **Latência de resposta do agente:** < 800ms (P95) entre chegada de mensagem e envio de resposta inicial
- **Latência de webhook:** < 100ms para acuso de recebimento de evento (Meta/Hotmart)
- **Latência de UI:** < 200ms (P95) para renderização de interações (página de lead, campanhas, templates)
- **Throughput de conversas simultâneas:** Mínimo 100 conversas simultâneas por tenant (escala a 1000+ em Opus Enterprise)
- **Throughput de throughput de disparos:** 1.000 mensagens/minuto por tenant (respeita tier Meta)

### Disponibilidade

- **Uptime alvo:** 99.9% (9 horas de downtime permitido/ano)
- **Recovery Time Objective (RTO):** < 15 minutos após falha
- **Recovery Point Objective (RPO):** < 1 minuto (perda de mensagens < 1 min no máximo)
- **Monitora SLA em:** API responses, agent processing, webhook ingestion, dashboard loading

### Monitoramento

- Latências rastreadas via Sentry + Better Stack (P50, P95, P99)
- Alertas automáticos se latência > 2s ou uptime < 99%
- Dashboard SaaS (super-admin) mostra status operacional em tempo real

---

## 5.6. Métricas de Sucesso do Produto (KPIs)

### Para o Tenant (Infoprodutor)

1. **Taxa de conversão de leads em compradores** (meta: > 10% com agente vs 3-5% sem)
2. **ROI de campanha** (receita atribuída / gasto com IA)
3. **Custo médio por conversa** (limite sustentável: IA < 20% do ticket médio)
4. **Tempo médio de resolução por lead** (meta: < 24h de primeira resposta a decisão de compra)
5. **Taxa de satisfação do operador** (handoff resolvido sem volta ao agente > 80%)

### Para a Plataforma (Exponensia)

1. **Churn mensal** (meta: < 5% ao atingir PMF)
2. **Net Revenue Retention** (novos + expansion / churned + shrinkage > 95%)
3. **Custo AI vs Receita** (margem real: receita - custo IA > 60%)
4. **Customer Acquisition Cost vs Lifetime Value** (LTV/CAC > 3x após 6 meses)
5. **Satisfação do cliente** (NPS > 40 para manter churn < 5%)

---

## 5.7. Conformidade Regulatória (LGPD)

### Princípios

Leedi funciona como **processadora de dados** (Data Processor) em relação aos leads. O **tenant é o controlador** (Data Controller) — responsável pela legalidade do uso.

### Obrigações do Leedi

1. **Consentimento prévio:** Leedi não faz contato sem consentimento do lead (gravado ou importado)
2. **Direito ao esquecimento:** Lead marcado como "optado" é excluído de:
   - Disparos futuros (fila + bloqueio)
   - Busca de histórico de conversas (soft delete em até 30 dias)
   - Relatórios agregados (anonimizado)
3. **Retenção de dados:** Conversas mantidas por 1 ano em hot storage, depois movidas para cold/deletion respeitando solicitação do tenant
4. **Auditoria de acesso:** Todos os acessos a leads/conversas aparecem em `audit_log` com user_id, tenant_id, ação, timestamp
5. **Criptografia em trânsito:** HTTPS obrigatório; criptografia em repouso para tokens/secrets
6. **Transparência:** Dashboard mostra ao tenant quantos leads estão "optados" e último acesso

### Responsabilidade do Tenant

- Informar ao lead que será contactado via Leedi
- Manter registro de consentimento (fora do Leedi)
- Configurar adequadamente qual "origem" de lead é consentimento explícito vs presumido (requer declaração em Configurações)
- Responder a solicitações LGPD do lead dentro do prazo legal (Leedi fornece relatório em 5 dias úteis)

---

## 6. Planos e limites (resumo)

| Recurso                 | Starter R$697   | Pro R$1.497       | Enterprise  |
| ----------------------- | --------------- | ----------------- | ----------- |
| Conversas/mês           | 1.000           | 5.000             | Customizado |
| Modelo IA               | Sonnet (enxuto) | Sonnet (completo) | Sonnet/Opus |
| Números WhatsApp        | 1               | 1                 | 3+          |
| Templates               | Ilimitados      | Ilimitados        | Ilimitados  |
| Usuários                | 1               | 5                 | Ilimitados  |
| RAG                     | —               | Quando sair (V2)  | Sim         |
| BYOK opcional           | —               | —                 | Sim         |
| WhatsApp p/ notificação | —               | —                 | Sim         |
| Overage                 | R$0,30/conversa | R$0,30/conversa   | Negociado   |

> Setup (R$15-25k) é negociado na venda, não aparece no app. Inclui setup Meta completo feito pela Exponensia.

---

## 7. Fluxos de UX consolidados (mapa)

1. **Onboarding tenant** → Módulo 2 (5 passos)
2. **Configurar agente** → Módulo 4 + 5 + 7 → testar no Módulo 8
3. **Criar campanha** → Módulo 6
4. **Criar/submeter template** → Módulo 9
5. **Disparar** → Módulo 10 (manual ou regra)
6. **Lead conversa** → Módulo 4 (agente) → Módulo 11 (inbox se handoff)
7. **Venda acontece** → Módulo 13 (gateway) → Módulo 17 (dashboard) + notificação
8. **Cobrança** → Módulo 14 + 15
9. **Você gerencia tudo** → Módulo 18

---

## 8. Priorização final por fase

**V0 (Libras A2 rodando) — núcleo operacional:**
Módulos 1, 3, 4, 5, 6, 7, 8, 13 (Hotmart), 10 (disparo básico + follow-up 24h), 11 (inbox básico), 12 (leads + CSV), 17 (dashboard core). Tenancy multi mas operando 1 tenant real.

**V1 (vendável):**
Completa 2 (onboarding assistido polido), 9 (templates Meta completo), 14 (Asaas), 15 (usage/overage), 16 (push+email), 18 (super-admin financeiro). Polimento geral, dark/light, responsividade.

**V1.5 (segundo cliente):**
Eduzz/Kiwify adapters, WhatsApp para notificação, auto-import RD/AC (início), múltiplos números (início).

**V2 (escala):**
RAG embeddings, análise pós-conversa, A/B testing, white-label enterprise, calendário, separação física de banco se necessário.

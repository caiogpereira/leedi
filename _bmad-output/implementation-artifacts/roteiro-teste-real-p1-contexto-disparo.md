# Roteiro — Teste real do P1 (Contexto do Disparo)

> **Objetivo.** Provar ao vivo que, quando um lead responde a um disparo, o agente recebe
> o contexto de origem (template + campanha + produto) e conversa de acordo. Isto fecha o
> **item PL** do P1: os testes automatizados provam que o bloco é *montado e enviado* ao
> Claude — **não** que o agente de fato o usa numa conversa real.
>
> **Branch:** `redesign/v2-gemini` · **Feature:** P1-5 (`getDispatchOrigin` →
> `buildDispatchContextBlock` → injeção em `process-message.ts`).
> **Plano:** `docs/superpowers/plans/2026-06-21-p1-dispatch-origin-context.md`.

---

## 0. Pré-requisitos de infra (o bloqueio atual)

1. **Business Manager (Meta) verificada** → sem isso não dá para **aprovar template**, e
   sem template aprovado não há disparo. **Este é o gargalo.**
2. **Número WhatsApp conectado** ao tenant (onboarding ou Configurações → WhatsApp).
3. **Túnel cloudflared ativo** apontando para a API + webhook configurado no Meta App
   (runbook PL-14: cloudflared/Meta/QStash). Ative o túnel **na hora do teste**.
4. **QStash + Redis (Upstash)** com tokens válidos no `.env` (debounce de inbound + chain
   de batches de disparo dependem deles).
5. **`API_PUBLIC_URL`** apontando para o origin público da API (PL-14a) — os callbacks de
   QStash (`process-batch`, `agent-flush`) resolvem por ele.

> Checklist rápido antes de começar: número conectado ✔, template **aprovado** ✔, túnel
> no ar ✔, webhook do Meta apontando pro túnel ✔.

---

## 1. Setup de dados (já destravado pelo P0 — não precisa de BM)

Pode ser feito **antes** da BM ficar pronta, pela própria dashboard:

1. **Criar um produto** — Conhecimento → **Produtos** → Novo. Preencha `nome`, `preço`,
   `link de checkout`. (Opcional: aba "Material de lançamento" do P0-4.)
   - *Por que importa:* o bloco do P1 mostra o `produtoNome` da campanha. Sem produto
     vinculado, o bloco sai sem a linha de precedência de produto (ainda funciona, mas o
     teste fica mais fraco).
2. **Criar uma campanha vinculada ao produto** — Disparos/Campanhas → Nova campanha →
   selecione o **produto principal** (seletor do P0-2). Isso grava `campaign.produtoId`.
   Deixe a campanha **ativa**.
3. **Criar + submeter um template** (Meta Templates) — categoria `marketing`/`utility`,
   um corpo simples e **sem variáveis** (o disparo envia `sendTemplate(..., [])`, sem
   params). Ex. de corpo: *"Oi! As inscrições do {{nome do produto}} abriram. Quer saber
   como funciona?"* — escreva o nome do produto **literalmente** no texto (não use `{{1}}`).
   - **Submeta e aguarde aprovação da Meta** ← depende da BM verificada.

---

## 2. Execução do teste (com BM pronta + túnel no ar)

1. **Criar o disparo (dispatch job)** — Disparos → Novo disparo: escolha o **template
   aprovado**, vincule à **campanha** criada (assim `dispatch_jobs.campaign_id` aponta
   pra campanha que tem `produtoId`), e segmente para **um lead de teste** (seu próprio
   número, ou um número que você controla).
2. **Disparar.** O `process-dispatch-batch` envia o template e grava o `wamid` +
   `status='enviado'` + `enviadoEm=now()` em `dispatch_targets`.
   - Confirme no DB que o target ficou `enviado`:
     ```sql
     select id, status, enviado_em, dispatch_job_id, lead_id
     from dispatch_targets
     where lead_id = '<LEAD_ID>'
     order by enviado_em desc limit 1;
     ```
3. **No celular do lead, responda ao disparo no mesmo dia** (qualquer coisa **dentro de
   48h** do envio — é a janela do `getDispatchOrigin`). Ex.: *"quanto custa?"* ou
   *"como funciona?"*.
   - O webhook cria/reusa a janela de conversa, o agente roda, e (P1) injeta o bloco de
     origem no system prompt.

---

## 3. Verificação

### 3a. Verificação primária (comportamental — fecha o item PL)
A resposta do agente deve demonstrar que ele **sabe a que o lead está respondendo**:
referencia o **produto/oferta da campanha** (não um produto genérico qualquer), e segue
o fio do disparo. Faça uma pergunta que só faça sentido no contexto da oferta de origem
(ex.: *"é sobre aquilo que vocês me mandaram?"*) e veja se ele conecta.

### 3b. Verificação direta do lookup (sem depender da Meta)
Confirme que `getDispatchOrigin` resolve o que esperamos, rodando contra o DB de dev.
Use o runner `tsx` do pacote (ver `project_j23_push_session` → `apps/api/.bin`), ou um
script pontual:

```ts
// scripts/check-dispatch-origin.ts  (rodar com o tsx do repo)
import { getDispatchOrigin } from '@leedi/agent';
const o = await getDispatchOrigin('<TENANT_ID>', '<LEAD_ID>');
console.log(JSON.stringify(o, null, 2));
// esperado: { templateNome, templateBody, campaignNome, produtoNome }  (não-nulo)
```

### 3c. (Opcional) Ver o bloco exato injetado no prompt
O bloco **não é persistido** (vai só no array `system` da chamada Anthropic). Para
inspecioná-lo numa corrida real, adicione **temporariamente** um log em
`packages/agent/src/use-cases/process-message.ts`, logo após montar `dispatchBlock`:

```ts
const dispatchBlock = buildDispatchContextBlock(dispatchOrigin);
if (dispatchBlock) console.warn('[P1-debug] dispatch block:\n', dispatchBlock); // REMOVER depois
```

Confirme que o log mostra `[DISPATCH_ORIGIN_BLOCK]` com a campanha, a linha
*"Priorize esta oferta…"* e o corpo do template. **Remova o log** antes de commitar.

---

## 4. Casos de borda a checar (rápidos)

- **Conversa orgânica (sem disparo):** mande uma mensagem de um lead que **nunca** recebeu
  disparo (ou cujo disparo tem >48h) → o agente deve responder **sem** o bloco de origem
  (comportamento inalterado). `getDispatchOrigin` retorna `null`.
- **Disparo de recuperação (regra/Hotmart):** se houver um `dispatch_target` por
  `dispatch_rule_id` (carrinho abandonado etc.), o bloco sai **só com o template**
  (sem campanha/produto) — esperado.
- **Resiliência:** uma falha de DB no lookup **não derruba** a resposta (try/catch →
  `null` + `console.warn`); a conversa continua sem o bloco. (Difícil de forçar ao vivo;
  já coberto por teste unitário.)

---

## 5. Pós-teste

- Remover qualquer log de debug temporário (3c).
- ⚠️ Se usou um número/conta real de gateway (Hotmart), lembrar de limpar webhooks de
  teste (ver `project_tier3_hotmart_session`).
- Registrar o resultado no tracker de pré-launch (marcar o item PL do P1 como verificado
  ao vivo, com data/commit).

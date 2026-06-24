# Verificação Pós-Produção — checklist de deploy & smoke

> **Propósito.** Lista curada do que precisa ser **configurado no deploy** e
> **verificado depois de subir para produção** (domínio real + Vercel/host da API
> + Asaas em modo produção). Complementa o `pendencias-pre-launch.md` (que cobre o
> que fechar *antes* de ter clientes); este cobre os passos de **deploy e a
> verificação ao vivo** que só dá para fazer com a app publicada.
>
> **Por que existe.** Vários itens foram implementados e verificados **localmente /
> no sandbox**, mas dependem de ações de ambiente (env, registro de cron, troca de
> sandbox→prod, registro de webhooks) que só acontecem no deploy. Sem este checklist
> esses passos passam despercebidos e a feature sobe **dormente** (pior que um bug:
> falha silenciosa).
>
> **Legenda**
> - **D0 — Bloqueia o funcionamento.** Sem isso a feature não roda em prod.
> - **D1 — Verificar ao vivo.** Código pronto + testado; confirmar 1x no ambiente real.
> - **D2 — Decisão/insumo de ops** pendente.
>
> Criado: 2026-06-24 (sessão Caio + Claude). Última atualização: 2026-06-24.

---

## A. Configuração de ambiente (D0)

- [ ] **`API_PUBLIC_URL`** definido no ambiente da **API Hono** em produção = a URL
  pública e alcançável da API (a que QStash/Meta/Hotmart/Asaas vão chamar). É
  `optional` no schema (`packages/config/src/schema.ts`), mas **obrigatório de fato**
  para os crons e callbacks externos.
- [ ] **`QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`**
  presentes no ambiente da API em prod (o `verifyQStash` valida a assinatura).
- [ ] **`ASAAS_API_KEY` de produção** + **`ASAAS_SANDBOX=false`** (hoje os testes
  rodaram no sandbox).
- [ ] Demais secrets reais de prod (ver PL-2 em `pendencias-pre-launch.md`).

## B. Hospedagem da API Hono (D2 — decisão de ops em aberto)

- [ ] **Definir onde `apps/api` (Hono, :3003 local) será hospedada.** A Vercel
  hospeda os apps Next (dashboard/admin/web); a API Hono é um serviço à parte. Os
  crons do QStash e os webhooks batem **na API**, não no domínio do dashboard.
  Opções: Vercel (serverless function), Railway, Fly, etc. **Caio decide na hora do
  deploy.** O `API_PUBLIC_URL` e os agendamentos do QStash apontam para essa URL.

## C. QStash — crons agendados (D0)

> Os 3 crons recorrentes ficam **dormentes** até serem registrados no QStash. Script
> idempotente pronto: `scripts/register-qstash-schedules.ts` (commit `c4cf27e`).

- [ ] Rodar **uma vez por ambiente** (ou no pipeline de deploy), com a URL pública da API:
  ```
  API_PUBLIC_URL=https://<api-de-prod> \
    pnpm --filter @leedi/api exec tsx ../../scripts/register-qstash-schedules.ts
  ```
  (Tem `--dry-run` para conferir o plano antes; recusa URL `localhost`; reconcilia
  por destino — cria/recria/pula/poda. Re-rodar é seguro.)
- Crons registrados:
  - [ ] `*/15 * * * *` → `/api/internal/whatsapp/health-check-all` (saúde do número)
  - [ ] `0 12 * * *` → `/api/internal/billing/daily-check` (bloqueio por inadimplência, 09h BRT)
  - [ ] `0 13 * * *` → `/api/internal/billing/charge-overage` (cobrança de excedente, 10h BRT)
- [ ] **Depois do 1º registro contra a URL estável de prod, deploys futuros não
  exigem nada** (os agendamentos vivem na conta do QStash). Só re-rodar se a
  URL/rotas mudarem.
- ⚠️ **Não registrar contra túnel cloudflare/dev:** efêmero (QStash bate em URL morta
  quando cai) e dev/prod compartilham o mesmo Supabase → billing rodaria 2x.

## D. Asaas — pagamentos em produção (D0 + D1)

- [ ] **D0:** trocar sandbox→prod (`ASAAS_SANDBOX=false` + chave de prod).
- [ ] **D0:** registrar o **webhook do Asaas** no painel da conta de **produção**
  apontando para `https://<api-de-prod>/api/webhooks/asaas`, com o token que a API
  espera (header `asaas-access-token`; ver `process-billing-event.ts`).
- [ ] **D1:** confirmar que o ciclo de pagamento funciona ponta-a-ponta com um
  pagamento real (boleto criado → webhook `PAYMENT_RECEIVED` → tenant `active`).
- [ ] **D1:** confirmar **multa 10% + juros 2%/mês** aparecendo num boleto vencido
  real (o Asaas aplica no vencimento; `LATE_FEES` em `asaas-provider.ts`, commit `58fb464`).

## E. Smoke-verify das features desta sessão (D1)

> Tudo abaixo foi verificado **localmente/sandbox**; reconfirmar no build publicado.

- [ ] **Overage automático** (commits `bd744ae` + `58fb464`): no 1º mês com excedente
  real, confirmar que o cron gera o boleto avulso (R$0,65/conversa), cria a fatura e
  marca `usage_counters.overage_cobrado_em`. Conferir o piso: < R$5 **acumula** para o
  mês seguinte (carry-forward), não é perdoado. *(Verificado live no sandbox:
  boleto real + idempotência + carry-forward.)*
- [ ] **Mudar plano** (commit `0fe15af`): trocar plano de um cliente pela UID do admin
  → confirmar valor da assinatura atualizado no Asaas de prod. *(Validado no sandbox.)*
- [ ] **Detalhe do cliente + custo/margem por cliente** (commit `af52cb0`):
  `/clientes/[id]` renderiza plano/uso/custo/margem/faturas; coluna "Margem (mês)" na lista.
- [ ] **Redirect super-admin pós-login** (commit `af52cb0`): super-admin em `:3001`
  (ou domínio do dashboard) é redirecionado para o painel admin (`ADMIN_URL`).
- [ ] **Template detail 405** (commit `a709fa2`): abrir um template em `/templates/[id]`
  renderiza (não "Template não encontrado").
- [ ] Garantir que a **migration `0025`** (`usage_counters.overage_cobrado_em`) está
  aplicada no banco de prod. *(Já aplicada no Supabase compartilhado atual; reaplicar
  se prod tiver banco separado — é aditiva/nullable, segura.)*

## F. Webhooks de provedores externos (D0)

- [ ] **Meta (WhatsApp Cloud API):** registrar o webhook de prod apontando para a API
  pública (estava bloqueado por verificação da BM — ver PL-9/PL-18 no pré-launch).
- [ ] **Hotmart:** apontar o webhook (hottok no header `X-HOTMART-HOTTOK`) para a API
  de prod. ⚠️ Caio precisa **remover o webhook da conta REAL Hotmart** usado em teste
  (ver memória Tier-3).
- [ ] (Asaas já coberto na seção D.)

## G. Notas de modelo de cobrança (contexto, não-bloqueante)

- Hoje: **pós-pago** no 1º ciclo (1º boleto vence 30 dias após assinatura), ciclo
  mensal **ancorado na data de assinatura** (não dia fixo). Excedente R$0,65/conversa.
- **Decisão registrada (Caio):** manter assim no início para não criar fricção de
  entrada; **migrar para pré-pago** depois de um certo número de clientes (mudança
  pequena: `criarAssinatura` com `nextDueDate = hoje`). Dia fixo de cobrança (05/15/25)
  fica para depois (exigiria pró-rata do 1º período).
- Detalhe técnico completo na memória `project_admin_client_detail_billing`.

# Design — Exposição do catálogo de produtos, vínculo com campanhas, contexto de disparo e abas de Configurações

**Data:** 2026-06-20
**Branch:** `redesign/v2-gemini`
**Status:** Aprovado para plano de implementação

## Contexto e descoberta principal

Achados de uso em produção apontaram cinco lacunas. A investigação do código mostrou que **a maior parte da fundação já existe** (entregue na Epic 6 — `feat(knowledge): epic 6 — product catalog, knowledge base, sales methods`), mas **não está alcançável/exposta na interface**. O trabalho é, em grande parte, **expor + estender**, não construir do zero.

### Mapa real (evidências)

| # | Pedido | Estado no código | Gap verdadeiro |
|---|--------|------------------|----------------|
| 4 | Cadastro de produtos | **Existe e é rico**: `packages/knowledge` + páginas `apps/dashboard/app/(shell)/conhecimento/produtos/{page,novo,[id]}`. Produto tem tipo (principal/downsell/upsell/orderbump), preço, parcelas, link checkout + abas editáveis de Argumentos, Diferenciais, Provas sociais, Garantia, Bônus (com assistente de IA via `ArgumentList`/`aiContext`). Agente consulta via `consultar_ofertas_ativas`. | Páginas **órfãs** (nada na nav aponta; `/conhecimento` → redirect `/faq`). Conhecimento é bullet-list, **sem campo de texto longo** (CPL/VSL/gatilhos). FAQ/objeções são **globais do tenant**. ERP/Bling **não existe**. |
| 5 | Vincular produto à campanha | Schema **já tem** `campaign.produtoId`; lista/detalhe mostram "Produto"; agente é campaign-aware (override de downsell por fase em `consultar-ofertas-ativas.ts`). | Form de **criação** de campanha (`campaign-list-client.tsx`, `CreateFormState`) só pede nome/tipo/datas — **falta seletor de produto**. |
| 1 | Hottok em Configurações | Storage existe: `packages/db/src/schema/gateway.ts` → `webhookSecret` (= hottok do Hotmart). | **Sem aba/UI** em Configurações. |
| 2 | WhatsApp em Configurações | Conexão existe (onboarding + widget "Saúde do número"). | **Sem aba** dedicada em Configurações. |
| 3 | Dados da empresa (CNPJ/endereço) | **Não há** colunas `cnpj`/`endereco` no schema de tenant. | Genuinamente **novo** (colunas + UI). |

Configurações hoje (`configuracoes/layout.tsx`) tem 3 abas: **Uso, Cobrança, Notificações**.

### Achados adicionais da investigação

- **Venda passiva (sem campanha):** `process-message.ts:727` injeta no prompt **apenas o primeiro produto `principal`** (comentário: *"placeholder selection; campaign scoping lands in a later epic"*). A tool `consultar_ofertas_ativas` retorna **vazio** quando não há campanha ativa. Logo, sem campanha o agente **não enxerga o catálogo completo** — não consegue investigar o funil e oferecer o produto adequado.
- **Contexto do disparo:** o pacote `dispatch` **não persiste o template enviado como mensagem na conversa** (grep vazio para message/thread/template em `packages/dispatch/src`). Indício forte de que o agente não recebe o template na resposta do lead. Escopo final após investigação dedicada (item P1).
- **Knowledge base** (`packages/db/src/schema/knowledge.ts`): `knowledge_base` só tem `tipo` faq/objecao, **sem `product_id`**; embeddings/pgvector deferidos.

## Decisões de escopo (confirmadas com o usuário)

1. **#4 profundidade:** manter bullets + **adicionar campo de texto longo** ("Material de lançamento / scripts") por produto. Sem base de conhecimento por-produto agora.
2. **ERP/Bling:** **Fase 2** (adiado). Cadastro manual cobre o primeiro cliente.
3. **Produtos por campanha:** **um principal + downsell por fase** (usa schema atual). Múltiplos produtos (N:N) → Fase 2.
4. **Contexto do disparo:** investigar `disparo → conversa → prompt` e propor a **correção mínima**.
5. **Venda passiva:** **fallback na tool existente** — quando não há campanha, `consultar_ofertas_ativas` retorna **todos os produtos ativos** (sem contexto de campanha).

## Plano priorizado (cada item = incremento próprio: implementar → revisar → testar → commit)

### 🔴 P0 — Destravar o agente (o gargalo real, baixo esforço)

**P0-1 — Expor "Produtos" na navegação.**
Criar sub-navegação na seção Conhecimento (FAQ · Objeções · Produtos), análoga ao `configuracoes/layout.tsx`. Ajustar o redirect de `/conhecimento` se necessário. As páginas de produto já existem e funcionam.
*ACs:* item "Produtos" visível e navegável a partir de Conhecimento; lista, criação e edição acessíveis sem digitar URL; nav ativa destaca a aba corrente.

**P0-2 — Seletor de produto na criação de campanha.**
Adicionar, no diálogo "Nova campanha" (`campaign-list-client.tsx`), um seletor do produto principal (lista de produtos ativos) e, quando aplicável, do produto de downsell. Gravar em `campaign.produtoId` (e config de downsell por fase, já suportada). Sem migração de schema.
*ACs:* criar campanha permite escolher produto principal; campanha de downsell permite escolher produto de downsell; produto escolhido aparece na lista/detalhe; agente passa a recebê-lo via `consultar_ofertas_ativas`.

**P0-3 — Venda passiva = catálogo completo.**
Quando não há campanha ativa (e sem `campaignId` de playground), `consultar_ofertas_ativas` retorna **todos os produtos ativos** do tenant (reaproveitar a lógica de `get-active-offers.ts`), com `campanha: null` e uma `instrucao_comercial` de venda passiva (investigar o funil, oferecer o produto que atende ao lead). Avaliar alinhar/remover o "placeholder principal" de `process-message.ts:727` para evitar contexto conflitante.
*ACs:* sem campanha, a tool retorna o catálogo ativo completo; com campanha, comportamento atual preservado (produto efetivo + contexto); testes cobrindo ambos os caminhos; nenhum erro em estado vazio (sem produtos).

**P0-4 — Campo de material de lançamento (texto longo) por produto.**
Nova coluna (ex.: `material_lancamento text`) em `products` (migração) + nova aba na página de edição do produto.

**Fork de design (decisão do usuário) — como o agente consome o material:**
- **Sempre no contexto:** injetar o material no system prompt / `EffectiveProduto` sempre. Simples, mas material longo (milhares de palavras) × vários produtos = custo/latência/orçamento de contexto altos (mesmo risco da "venda passiva sempre completa").
- **Sob demanda (recomendado):** o material fica acessível via uma tool (ex.: o agente "abre o dossiê do produto" quando precisa de scripts/gatilhos), seguindo o padrão `consultar_*` existente. Controla custo e pré-encaminha a base de conhecimento por-produto da Fase 2.

*ACs:* usuário cola CPL/VSL/gatilhos e salva; conteúdo persiste e volta na edição; agente acessa o material conforme a estratégia escolhida; campo opcional (vazio não quebra nada).

### 🟠 P1 — Contexto do disparo

**P1-5 — Persistir origem do disparo e injetar no contexto do agente.**
Investigar a fundo `disparo → conversa → prompt`. Correção mínima provável: registrar o template enviado como mensagem outbound no thread (para entrar em `getThreadHistory`) e/ou anotar no lead/thread qual template+campanha+produto originou o contato, injetando isso no system prompt.
*ACs (a refinar após investigação):* quando o lead responde a um disparo, o agente sabe qual template/campanha/produto originou a conversa e conversa de acordo; comportamento de conversas sem disparo inalterado.

### 🟡 P2 — Completar Configurações

**P2-6 — Aba Hottok em Configurações.**
Nova aba "Integrações"/"Gateway" que lê e grava `gateway.webhookSecret` (hottok) do tenant. Reutilizar endpoints existentes onde houver.
*ACs:* usuário vê e edita o Hottok; valor persiste em `webhookSecret`; mascarar/segurança adequada do segredo.

**P2-7 — Aba WhatsApp em Configurações.**
Nova aba que reaproveita a UI de conexão/"Saúde do número" hoje só disponível no onboarding e no widget da dashboard. Configurações relacionadas ao WhatsApp passam a viver aqui.
*ACs:* usuário conecta/gerencia o número por Configurações; paridade funcional com o fluxo existente; sem duplicar lógica de conexão.

**P2-8 — Dados da empresa (CNPJ + endereço).**
Colunas novas (ex.: `cnpj`, `endereco`) no schema de tenant (migração), com UI no **onboarding** e em **Configurações**. Verificar interação com `cpfCnpj` já coletado para Asaas (não duplicar fonte de verdade).
*ACs:* CNPJ e endereço editáveis no onboarding e em Configurações; persistem; reaproveitados onde já se coleta dado fiscal (ex.: Asaas) sem conflito.

### ⚪ Fase 2 (adiado, confirmado)

Integração ERP/Bling (OAuth, sync de catálogo, mapeamento de campos) · múltiplos produtos por campanha (N:N) · FAQ/objeções escopadas por produto (`product_id` em `knowledge_base`) · busca semântica/embeddings (pgvector).

## Princípios transversais

- **Reuso primeiro:** estender o que existe (schema, use-cases, tools, componentes como `ArgumentList`) antes de criar novo.
- **Multi-tenant:** toda leitura/escrita via `withTenant`; respeitar convenções de RLS do repo.
- **Idioma:** código em inglês; UI/labels em PT-BR.
- **Disciplina:** um commit por incremento ao fim de cada review (fluxo commit-por-review).
- **Testes reais:** cada incremento com teste que prova o comportamento (evitar fake-green; mutation-check onde fizer sentido).

## Fora de escopo

Redesenho visual (já tratado em `design-spec-v2.md`); qualquer item da Fase 2; alterações no fluxo de billing/Asaas além de reaproveitar `cpfCnpj`.

# Redesign V2 (Gemini) — Feedback Round 1 (Caio)

> **Status:** branch `redesign/v2-gemini` implementada (16 tasks, ver `2026-06-12-redesign-v2-gemini.md`).
> Caio revisou localmente em 2026-06-12. **Nota: 6/10.** Não aprovado — precisa de ajustes.
> **NÃO mexer em código até a próxima sessão (≥ 15/06)** — limite de uso semanal em 99%.
> Caio dará novas instruções na próxima sessão; este doc é só o registro do que ele apontou.

## Avaliação geral

Ficou "um pouco melhor" que o shadcn padrão, mas **divergiu demais do mockup do Gemii**
(`dash-Gemini.png` / `dash-gemini-2.png`). O resultado não ficou "legal". Direção visual
ainda não bate com a referência aprovada.

## Pontos concretos a corrigir (próxima rodada)

### 1. Textura de circuito ficou "quadradinha" e feia
- A textura de conectores que implementamos (SVG data-uri em `--texture-circuit` no
  `globals.css`, aplicada via `.app-texture` no `<main>`) tem linhas retas/ortogonais
  ("quadradinhas") que **não** lembram os conectores do mockup do Gemini.
- Ficou muito diferente da referência e não agradou. Repensar a textura: traços/curvas
  mais orgânicos OU remover e buscar outra forma de "riqueza de fundo" fiel ao Gemini.
- Arquivos envolvidos: `packages/ui/src/styles/globals.css` (`--texture-circuit` em `:root`
  e `.dark`, utilitário `.app-texture`); aplicada em `apps/dashboard/app/(shell)/layout.tsx`
  e `apps/admin/app/(shell)/layout.tsx`.

### 2. Fonte parece "Times New Roman" (serif) — RUIM para app
- As fontes renderizadas parecem serifadas / tipo Times New Roman — ruim para aplicação.
- O mockup do Gemini usa uma fonte boa (sans-serif moderna). Queremos ela (ou equivalente).
- **Hipótese técnica a investigar (NÃO confirmada ainda):** o spec dizia que o projeto usa
  Geist/Inter via `--font-sans` (mapeado em `tooling/tailwind-config/index.js`:
  `fontFamily.sans = ['var(--font-sans)', 'system-ui', 'sans-serif']`). Se está caindo em
  serifa, provavelmente `--font-sans` **não está sendo injetado** (font não carregada /
  `next/font` não aplicado no `<body>` / variável CSS ausente), e o fallback está indo para
  serif em vez de `system-ui`. Verificar onde `--font-sans`/`--font-mono` são definidos
  (layout raiz das apps, `next/font`) e por que não aplicam. NÃO toquei nisso nesta rodada
  (redesign foi "só estilo"; a fonte é provavelmente bug pré-existente ou de setup, não algo
  que o redesign introduziu — confirmar comparando com `main`).
- Decidir a fonte alvo na próxima sessão (ex.: Inter/Geist/uma sans próxima da do Gemini) e
  garantir que carrega de fato.

## O que está OK / não mexer sem motivo
- Arquitetura de tokens (extend-not-replace), contraste WCAG (`contrast.test.ts` verde),
  primitivos Card/Badge/Avatar/EmptyState, e a estrutura geral dos shells funcionaram.
  O problema é de **acabamento visual** (textura + tipografia + fidelidade ao mockup),
  não de arquitetura.

## Próximos passos (aguardando instruções de Caio na próxima sessão)
1. Caio vai dar novas instruções/direção mais específica.
2. Provável escopo: refazer/remover a textura; corrigir a tipografia (carregar a fonte certa);
   aproximar mais do mockup do Gemini onde divergiu.
3. Reabrir comparação lado-a-lado com `dash-Gemini.png` / `dash-gemini-2.png`.

*Registrado em 2026-06-12 por solicitação de Caio. Nenhuma alteração de código feita nesta sessão de feedback.*

# Leedi — Design Spec V2

> **Objetivo:** Elevar o visual do app do padrão shadcn "feio e simples" atual para a
> identidade premium AI-native proposta pelo Gemini (dashboard tenant + painel admin),
> **sem trocar a arquitetura de design system existente** — enriquecendo-a.
>
> **Fonte de referência visual:** Imagens `dash-Gemini.png` (dashboard tenant) e
> `dash-gemini-2.png` (painel admin), geradas pelo Gemini e aprovadas por Caio.
>
> **Princípio-mestre:** Entregamos o *look* do Gemini. A preservação da arquitetura de
> tokens é o *meio seguro* para chegar nesse look — não um motivo para fazer menos.
>
> **Como usar:** Passe este documento ao Claude Code com a instrução da seção
> "Prompt de implementação" ao final. O agente deve ler este doc por completo antes de
> tocar qualquer arquivo de UI.

---

## 0. Decisões que guiam este spec (lidas antes de tudo)

Estas decisões foram tomadas com Caio e **restringem** o que a implementação pode fazer:

| Decisão | Valor escolhido | Implicação |
|---|---|---|
| **Fidelidade de cor** | Direcional + acessível | Reproduzimos o *look* do Gemini, mas a paleta é calibrada para passar no teste WCAG AA. Onde um tom do Gemini reprova contraste, ajustamos o **token** (nunca o teste). |
| **Escopo de apps** | `@leedi/ui` + `dashboard` + `admin` | `web` (login/cadastro/landing) herda a base do `@leedi/ui` automaticamente — sem layout próprio nesta rodada. `api` não tem UI. |
| **Estilo vs estrutura** | Só o **estilo** | Aplicamos a estética às telas, navegação e conteúdo **reais**. Não mudamos rotas, IA, nav, nem inventamos conceitos do mockup (ex.: "Workspaces"). |
| **Busca global no header** | Visual agora, funcional depois | O campo de busca entra como elemento visual (faz parte do look). A busca funcional é feature de produto futura, fora deste spec. |
| **Elementos decorativos** | Só a **textura de circuito** | A estrela de 4 pontas dos mockups é a marca-d'água do **próprio Gemini** — **não** é elemento de design e **não** deve ser replicada. |

---

## 1. Arquitetura de tokens — ESTENDER, não substituir

> ⚠️ **A regra mais importante deste doc.** O design system atual usa **tokens semânticos
> shadcn em HSL** (`--primary: 244 84% 55%` consumidos via `hsl(var(--primary))`),
> dark mode pela classe `.dark` (next-themes), config compartilhado em
> `tooling/tailwind-config/index.js`. **Todo componente e app já depende disso.**
> Trocar por tokens hex / `[data-theme]` quebraria a aplicação inteira. **Não faça isso.**

A nova identidade é adicionada em **dois níveis**, sem conflito:

### Nível A — Recalibrar os tokens semânticos existentes

Mantemos os nomes e o formato HSL. Só ajustamos os **valores** para puxar o clima do
Gemini (fundos mais profundos e levemente azulados, em vez do cinza-neutro atual).
**Cada valor abaixo é uma proposta; o valor final é o que passar no `contrast.test.ts`.**

`packages/ui/src/styles/globals.css` — bloco `.dark` (alvo, sujeito a calibração WCAG):

```css
.dark {
  /* Base mais profunda e azulada (Gemini #0D1117 / #111827), ainda off-black */
  --background: 222 30% 7%;     /* ~#0d1117 — fundo do app */
  --foreground: 213 27% 94%;    /* ~#f1f5f9 — texto primário (NÃO branco puro) */

  --card: 222 25% 11%;          /* ~#161e2e — superfície elevada */
  --card-foreground: 213 27% 94%;
  --popover: 222 25% 11%;
  --popover-foreground: 213 27% 94%;

  /* Primary indigo — manter faixa que já passa 5:1+ no escuro */
  --primary: 236 96% 72%;       /* mantido — verificado WCAG */
  --primary-foreground: 222 30% 7%;

  --secondary: 222 20% 16%;
  --secondary-foreground: 213 27% 94%;

  --muted: 222 20% 16%;
  --muted-foreground: 215 18% 65%;   /* ~#94a3b8 — calibrar p/ 4.5:1 no background */

  --accent: 222 20% 16%;
  --accent-foreground: 213 27% 94%;

  --accent-ai: 262 100% 75%;    /* violeta IA — mantido */

  --destructive: 0 84% 60%;     /* mantido — verificado */
  --destructive-foreground: 0 0% 100%;

  --success: 142 71% 55%;
  --warning: 38 92% 60%;
  --info: 217 91% 70%;

  --border: 222 18% 18%;
  --input: 222 18% 18%;
  --ring: 236 96% 72%;
}
```

O bloco `:root` (light) recebe a inversão cuidadosa equivalente — mantendo os valores
light atuais como base, sem regressão de contraste. **Light não é afterthought, mas
dark é o primário.**

### Nível B — Adicionar a camada de "riqueza visual"

Tokens **novos** que o shadcn não tem e o look do Gemini exige. Adicionados em `globals.css`
(em `.dark` e `:root`) e expostos como utilitários no tailwind-config. **Não substituem
nada — só dão vocabulário novo.**

```css
.dark {
  /* ... tokens semânticos acima ... */

  /* Camadas de superfície empilhadas (profundidade — cards sobre cards) */
  --surface-1: 222 25% 11%;     /* = card; superfície base */
  --surface-2: 222 24% 14%;     /* card sobre card, hover de linha */
  --surface-3: 222 22% 17%;     /* terceiro nível, raro */

  /* Glassmorphism (vidro fosco — só em destaques) */
  --glass-bg: 222 25% 11% / 0.7;
  --glass-border: 0 0% 100% / 0.10;

  /* Glow (halo) */
  --glow-primary: 236 96% 72% / 0.30;   /* item ativo, CTA */
  --glow-ai: 262 100% 75% / 0.25;       /* elementos de IA */

  /* Sidebar — ligeiramente mais escura que o app */
  --sidebar: 222 32% 6%;
}
```

Valores correspondentes no `:root` (light) com as mesmas chaves.

### Mapeamento no tailwind-config

`tooling/tailwind-config/index.js` ganha os novos tokens como utilitários (seguindo o
padrão `hsl(var(--token))` já usado no arquivo):

```js
colors: {
  // ... mantém tudo que já existe ...
  surface: {
    1: 'hsl(var(--surface-1))',
    2: 'hsl(var(--surface-2))',
    3: 'hsl(var(--surface-3))',
  },
  sidebar: 'hsl(var(--sidebar))',
},
boxShadow: {
  // ... mantém ...
  'glow':    '0 0 20px hsl(var(--glow-primary))',
  'glow-ai': '0 0 20px hsl(var(--glow-ai))',
},
backgroundImage: {
  'gradient-metric': 'linear-gradient(135deg, hsl(var(--surface-1)) 0%, hsl(var(--surface-2)) 100%)',
  'gradient-active': 'linear-gradient(135deg, hsl(var(--primary) / 0.20) 0%, hsl(var(--primary) / 0.05) 100%)',
  'gradient-cta':    'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)',
},
```

### Utilitários de glass e textura

Em `globals.css`, como classes utilitárias (não tokens):

```css
@layer utilities {
  .glass {
    background: hsl(var(--glass-bg));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--glass-border));
  }
  .glass-subtle {
    background: hsl(0 0% 100% / 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid hsl(0 0% 100% / 0.06);
  }
}
```

### Textura de circuito (fundo do app)

SVG inline em baixíssima opacidade, aplicado no container de conteúdo do app
(`<main>` ou um wrapper). **~3-4% de opacidade — quase imperceptível.**

```css
.app-texture {
  background-image: var(--texture-circuit); /* SVG data-uri de circuito, gerado no código */
  background-repeat: repeat;
  /* a opacidade vive no próprio SVG (stroke com alpha ~0.04), não no elemento,
     para não esmaecer o conteúdo por cima */
}
```

> Light mode usa a mesma textura com opacidade ainda menor (~2%).

---

## 2. Tipografia

Mantém a família já no projeto (Geist/Inter). A escala atual do Tailwind é suficiente;
o spec só padroniza o **uso**:

| Uso | Classe | Peso |
|---|---|---|
| Métrica hero (cards admin) | `text-3xl` / `text-4xl` | `font-bold` |
| Título de página | `text-2xl` | `font-bold` |
| Título de card | `text-xl` | `font-semibold` |
| Corpo de UI / tabelas | `text-sm` | `font-normal` / `font-medium` |
| Label de métrica / badge | `text-xs` uppercase tracking-wide | `font-medium` |

Mono (`Geist Mono`) para IDs, tokens e valores monetários quando fizer sentido.

---

## 3. Efeitos visuais — onde aplicar (e onde NÃO)

| Efeito | Onde SIM | Onde NÃO |
|---|---|---|
| **Glass** (`.glass`) | Item ativo da sidebar, modais, cards de destaque | Em todo card; em listas longas |
| **Glow** (`shadow-glow`) | Item ativo da sidebar, hover de CTA | Elementos não-interativos |
| **Glow-AI** (`shadow-glow-ai`) | Badge IA, playground, AIAssistedTextarea | Qualquer coisa que não seja IA |
| **Gradiente** (`gradient-metric`) | Cards de métrica do admin | Fundo do app inteiro (deve recuar) |
| **Textura circuito** | Fundo do `<main>` em ~3-4% | Sobre conteúdo; em cards |

---

## 4. Componentes — o que CRIAR vs RESTILIZAR

### 4.1 Criar (não existem hoje) — em `packages/ui/src/components/ui/`

**`Card`** — superfície base com variantes (via `class-variance-authority`, como o `Button`):
- `default`: `bg-card border border-border rounded-lg shadow-sm`
- `metric`: `bg-gradient-metric border border-border rounded-lg shadow-md` (cards admin)
- `glass`: aplica `.glass` + `rounded-xl`
- Substitui os `div` montados na mão (ex.: `MetricCard` passa a usar `<Card variant="metric">`).
- Exportar `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`.

**`Badge`** — status pills (CVA):
- `ativo`: `bg-success/12 text-success border-success/20`
- `trial`: `bg-info/12 text-info border-info/20`
- `bloqueado`: `bg-destructive/12 text-destructive border-destructive/20`
- `ai`: `bg-accent-ai/12 text-accent-ai border-accent-ai/20`
- Base: `rounded-full px-2.5 py-0.5 text-xs font-medium border`.

**`Avatar`** — círculo com iniciais:
- Props: `name`, `size?` (sm/md/lg), `online?`.
- Cor de fundo gerada por **hash determinístico do nome** (paleta de tons da marca).
- `online` → ponto verde 8px no canto inferior direito.

> Não criar `Sidebar`/`Header` como primitivos compartilhados — eles são específicos de
> cada app e vivem nas próprias apps (ver 4.2). Criar primitivo só do que é reutilizável.

### 4.2 Restilizar (existem — só muda a pele, API e lógica intactas)

| Arquivo | O que muda |
|---|---|
| `packages/ui/.../ui/button.tsx` | Variante `primary` ganha `bg-gradient-cta` + `shadow-glow` sutil + hover `-translate-y-px`. Adicionar variante `impersonate` (violeta-suave: `bg-primary/10 text-primary-300 border-primary/25`). **Não remover variantes existentes.** |
| `packages/ui/.../ui/input.tsx` | Foco com `ring-primary/15` + `border-primary`. Cosmético. |
| `apps/dashboard/components/shell/Sidebar.tsx` | Item ativo: de `bg-primary` chapado → `glass` + `bg-gradient-active` + `border-primary/40` + `shadow-glow`. Hover: `glass-subtle`. Fundo da aside: `bg-sidebar`. Logo "Leedi" com ícone. **Os 11 `NAV_ITEMS` e a lógica de `isActive` não mudam.** |
| `apps/dashboard/components/shell/Header.tsx` | Adicionar **avatar + nome** à esquerda e **campo de busca (visual)** ao centro. Manter `TenantSwitcher` + `ThemeToggle`. Fundo `bg-gradient-header` + `backdrop-blur`. |
| `apps/dashboard/app/(shell)/components/metric-card.tsx` | Passa a usar `<Card variant="metric">`; label uppercase tracking; valor `text-3xl`. API de props intacta. |
| `apps/admin/components/shell/AdminSidebar.tsx` | Itens em **cards arredondados** (padding maior, `rounded-2xl`), badge **ADMIN** no logo. |
| `apps/admin/components/shell/AdminHeader.tsx` | Avatar + nome + cargo + busca (visual) + toggle. |
| Telas admin (`clientes`, `financeiro`, `operacional`) | Cards de métrica com gradiente; linhas de tenant com `<Avatar>` + `<Badge>` + botões `Assumir Identidade` (`impersonate`) / `Bloquear` (`danger`). Só classes/primitivos — sem tocar em `actions.ts`, dados ou lógica. |

> **Caminhos confirmados no código** (o spec antigo errava todos): shell do dashboard em
> `apps/dashboard/components/shell/`; shell do admin em `apps/admin/app/components/shell/`;
> layout em `apps/*/app/(shell)/layout.tsx`. Os componentes de shell vivem em
> `apps/<app>/components/shell/` (fora do diretório `app/`). Não há
> `packages/ui/tailwind.config.ts` nem `apps/*/src/components/layout/`.

### 4.3 Empty states (ex.: imagem 1 — "Sem Workspaces Conectados")

> ⚠️ Aplicar o **estilo** do empty state às telas vazias **reais** do app (ex.: "nenhuma
> conversa ainda", "nenhum lead"). **Não** criar o conceito "Workspaces" do mockup.

Padrão:
- Ícone contextual (lucide) em `text-muted-foreground`, com badge "zero" sobreposto.
- Título `text-xl font-semibold`; subtítulo `text-sm text-muted-foreground` centrado, `max-w-xs`.
- CTA `<Button variant="primary">` centralizado.
- **Sem estrela decorativa.**

---

## 5. Layout das apps (estrutura real)

### 5.1 Dashboard — `apps/dashboard/app/(shell)/layout.tsx`

```
┌─────────────────────────────────────────────────┐
│ SIDEBAR (lista)    │ HEADER (avatar+busca+toggle) │
│ bg-sidebar         │ ───────────────────────────  │
│ [L] Leedi          │                              │
│ ● Dashboard ←glow  │ <main> + textura circuito    │
│   Conversas        │ p-6                          │
│   Leads            │                              │
│   Agente           │ [conteúdo real da rota]      │
│   Playground       │                              │
│   Conhecimento     │                              │
│   Campanhas        │                              │
│   Templates        │                              │
│   Disparos         │                              │
│   Relatórios       │                              │
│   Configurações    │                              │
└─────────────────────────────────────────────────┘
```

### 5.2 Admin — `apps/admin/app/(shell)/layout.tsx`

```
┌─────────────────────────────────────────────────┐
│ SIDEBAR (cards)    │ HEADER (avatar+nome+busca)   │
│ [Leedi · ADMIN]    │ ───────────────────────────  │
│ ┌──────────────┐   │ Gestão de Clientes           │
│ │ 🔲 Visão     │   │ [cards métrica c/ gradiente] │
│ ├──────────────┤   │ ───────────────────────────  │
│ │ 👥 Clientes ←│   │ [linhas tenant:              │
│ ├──────────────┤   │  avatar+badge+ações]         │
│ │ $ Financeiro │   │                              │
│ ├──────────────┤   │                              │
│ │ ⚡ Operacional│   │                              │
│ ├──────────────┤   │                              │
│ │ ⚙ Config     │   │                              │
│ └──────────────┘   │                              │
└─────────────────────────────────────────────────┘
```

**Diferença Admin vs Dashboard:** sidebar em cards (não lista); badge ADMIN; header com
cargo; densidade ligeiramente maior. Mesma paleta e mesmos tokens.

---

## 6. Acessibilidade — portões inegociáveis

- **`packages/ui/src/__tests__/contrast.test.ts` continua VERDE.** Ele é a fonte da
  verdade de contraste (Story 3.4 AC#2). Ao recalibrar qualquer token, atualizar os hex
  espelhados nesse teste **para os novos valores** e garantir que os limiares (4.5:1
  texto normal, 3:1 texto grande) passam. Se um tom do Gemini reprova → ajustar o token.
- **Texto nunca branco puro** (`#FFFFFF`) para corpo — usar `--foreground`.
- **Foco visível** preservado (`focus-visible:ring`) em todos os interativos.
- **`aria-current`, skip-link e roles** existentes no shell **não podem ser removidos**.

---

## 7. O que NÃO fazer (anti-patterns)

- ❌ Trocar tokens HSL semânticos por hex / mudar `.dark` para `[data-theme]`.
- ❌ Criar `packages/ui/tailwind.config.ts` (a config é compartilhada em `tooling/`).
- ❌ Replicar a **estrela de 4 pontas** (é a marca-d'água do Gemini).
- ❌ Criar o conceito "Workspaces" ou renomear/reorganizar a navegação.
- ❌ Implementar busca funcional (só o campo visual nesta rodada).
- ❌ Glass/gradiente/glow em tudo — só nos destaques da seção 3.
- ❌ Alterar props de componentes, rotas, `actions.ts`, queries ou lógica de negócio.
- ❌ Afrouxar/desabilitar o teste de contraste para "encaixar" uma cor.
- ❌ Verde WhatsApp fora do canal; violeta IA fora de elementos de IA.

---

## 8. Prompt de implementação (cole no Claude Code)

```
Leia COMPLETAMENTE docs/design-spec-v2.md, incluindo as seções 0 (decisões) e 7
(anti-patterns). Este é um redesign SÓ VISUAL: não altere rotas, navegação, props de
componente, actions, queries nem lógica de negócio.

Ordem de implementação:

1. packages/ui/src/styles/globals.css
   — Recalibrar os tokens semânticos HSL de `.dark` e `:root` conforme seção 1 Nível A
     (NÃO trocar o formato HSL nem o mecanismo .dark).
   — Adicionar os tokens novos da camada de riqueza (seção 1 Nível B).
   — Adicionar utilitários .glass / .glass-subtle e a textura de circuito (SVG data-uri ~3-4%).

2. tooling/tailwind-config/index.js
   — Mapear os tokens novos (surface, sidebar, boxShadow glow/glow-ai, backgroundImage
     gradientes) conforme seção 1. Manter tudo que já existe.

3. packages/ui/src/components/ui/
   — Criar Card, Badge, Avatar (seção 4.1) e exportá-los em src/index.ts.
   — Restilizar button.tsx (variante primary + nova variante impersonate) e input.tsx.
   — NÃO mudar props/API existentes.

4. apps/dashboard — restilizar (seção 4.2/5.1):
   components/shell/Sidebar.tsx, components/shell/Header.tsx,
   app/(shell)/components/metric-card.tsx, e empty states (seção 4.3).

5. apps/admin — restilizar (seção 4.2/5.2):
   components/shell/AdminSidebar.tsx, components/shell/AdminHeader.tsx,
   cards de métrica e linhas de tenant nas telas clientes/financeiro/operacional.

6. Verificação (TODOS devem passar):
   — pnpm --filter @leedi/ui test   (inclui contrast.test.ts — atualizar os hex
     espelhados para os novos valores de token e garantir que passa)
   — pnpm typecheck
   — pnpm build

Não invente tokens fora dos definidos aqui. Não toque em arquivos fora dos listados.
```

---

*Documento reescrito em: 2026-06-12, alinhado ao código real do monorepo.*
*Referências visuais: dash-Gemini.png (dashboard) + dash-gemini-2.png (admin).*
*Decisões de escopo aprovadas por: Caio (Exponensia Lab).*

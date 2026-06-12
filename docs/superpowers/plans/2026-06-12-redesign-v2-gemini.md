# Redesign V2 (Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the Leedi dashboard + admin UI to the premium "Gemini" look — deeper bluish surfaces, glass/glow/gradient accents, richer primitives — **without changing routes, navigation, component APIs, server actions, queries, or business logic.** Style only.

**Architecture:** Extend the existing shadcn HSL-token design system (never replace it). Two layers: (A) recalibrate the existing semantic tokens in `globals.css`; (B) add new "richness" tokens (surfaces, glass, glow, gradients) wired through the shared `tooling/tailwind-config/index.js`. Then add three new primitives (`Card`, `Badge`, `Avatar`) plus one `EmptyState`, restyle `Button`/`Input`, and restyle the dashboard + admin shells and metric cards. The `contrast.test.ts` WCAG gate stays the source of truth — tokens are calibrated to pass it, never the reverse.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS (class dark mode, HSL CSS vars), `class-variance-authority` (CVA), Vitest + React Testing Library, `wcag-contrast`, pnpm workspaces (Turborepo).

**Branch:** `redesign/v2-gemini` (already created).

**Source of truth spec:** `docs/design-spec-v2.md` — read its sections 0 (decisions) and 7 (anti-patterns) before starting. This plan operationalizes that spec.

---

## Pre-flight: read these before touching code

1. `docs/design-spec-v2.md` — full document, especially §0 (decisions), §1 (token strategy), §3 (where effects go / don't), §7 (anti-patterns).
2. This plan's "Concrete values reference" appendix (bottom) — all final HSL/hex numbers, already verified against WCAG.

**Hard constraints (from spec §7) — violating any of these fails the task:**
- ❌ Do NOT change the HSL token format or the `.dark` class mechanism (no hex tokens, no `[data-theme]`).
- ❌ Do NOT create `packages/ui/tailwind.config.ts` — the config is shared in `tooling/tailwind-config/index.js`.
- ❌ Do NOT replicate the Gemini 4-point star (it's Gemini's watermark).
- ❌ Do NOT invent "Workspaces" or rename/reorder navigation.
- ❌ Do NOT implement functional search (visual field only).
- ❌ Do NOT alter component props/APIs, routes, `actions.ts`, queries, or business logic.
- ❌ Do NOT loosen/disable the contrast test to fit a color — adjust the token instead.

---

## File Structure (what each task touches)

**Layer A/B — tokens & config**
- Modify: `packages/ui/src/styles/globals.css` — recalibrate `.dark` semantic tokens, keep `:root` light semantics, add Level-B tokens to both, add `.glass`/`.glass-subtle`/`.app-texture` utilities + circuit texture.
- Modify: `tooling/tailwind-config/index.js` — add `surface`, `sidebar` colors; `boxShadow` glow/glow-ai; `backgroundImage` gradients.
- Modify: `packages/ui/src/__tests__/contrast.test.ts` — mirror the new dark hexes; update the `#0a0a0f` assertion.

**Primitives — `packages/ui/src/components/ui/`**
- Create: `card.tsx`, `badge.tsx`, `avatar.tsx`
- Create: `packages/ui/src/components/ui/empty-state.tsx`
- Create tests: `packages/ui/src/components/ui/__tests__/card.test.tsx`, `badge.test.tsx`, `avatar.test.tsx`
- Modify: `packages/ui/src/components/ui/button.tsx`, `input.tsx`
- Modify: `packages/ui/src/index.ts` — export new primitives.

**Dashboard shell — `apps/dashboard/`**
- Modify: `components/shell/Sidebar.tsx`, `components/shell/Sidebar.test.tsx` (mock update), `components/shell/Header.tsx`
- Modify: `app/(shell)/components/metric-card.tsx`
- Modify: `app/(shell)/layout.tsx` (app-texture on `<main>`)
- Modify: `app/(shell)/conversas/components/conversas-client.tsx` (EmptyState reference application)

**Admin shell — `apps/admin/`**
- Modify: `components/shell/AdminSidebar.tsx`, `components/shell/AdminSidebar.test.tsx` (mock update), `components/shell/AdminHeader.tsx`
- Modify: `app/(shell)/layout.tsx` (app-texture on `<main>`)
- Modify: `app/(shell)/clientes/ClientesClient.tsx`, `app/(shell)/clientes/ClientesClient.test.tsx` (mock update)

---

## A note on testing discipline (read once)

Most of this work is **cosmetic** — there is no honest failing unit test for "the active sidebar item gets a glow." Do NOT manufacture vacuous tests (this repo's review history is full of fake-green tests; don't add more). The real gates for cosmetic changes are:

1. **Existing regression tests stay green** (`Sidebar.test.tsx`, `AdminSidebar.test.tsx`, `ClientesClient.test.tsx`, `contrast.test.ts`).
2. **`pnpm typecheck`** clean.
3. **`pnpm build`** clean.
4. **Visual review** by the human after merge.

Genuine TDD is applied to exactly **one** thing: `Avatar`'s deterministic name→color hash (real logic, real assertions). `Card`/`Badge`/`EmptyState`/`Avatar`-render get a lightweight render-smoke test only.

---

## Task 1: Recalibrate semantic tokens + add richness layer (globals.css) and keep the contrast gate green

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/src/__tests__/contrast.test.ts`

All numeric values are taken from the verified appendix at the bottom of this plan (every dark hex was checked ≥ its WCAG threshold before being written here).

- [ ] **Step 1: Update `contrast.test.ts` DARK mirror first (the gate moves with the tokens)**

Replace the `DARK` object (lines 30-40) and the pure-black assertion (lines 111-114) in `packages/ui/src/__tests__/contrast.test.ts`:

```ts
// ─── Dark theme token values ─────────────────────────────────────────────────
const DARK = {
  background: '#0c1017',       // hsl(222 30% 7%) — deeper bluish off-black (Gemini)
  foreground: '#eceff4',       // hsl(213 27% 94%) — NOT pure white
  primary: '#737cfc',          // hsl(236 96% 72%) — indigo, 5.46:1 on bg
  primaryFg: '#0c1017',
  muted: '#1f2533',            // hsl(222 20% 16%)
  mutedFg: '#96a3b6',          // hsl(215 18% 65%) — 7.45:1 on bg
  destructive: '#ef4343',      // hsl(0 84% 60%) — 5.04:1 on bg
  success: '#3bde77',          // hsl(142 71% 55%) — large text
  accentAi: '#ae80ff',         // hsl(262 100% 75%) — violet AI, large text
};
```

And update the final assertion block (was asserting `#0a0a0f`):

```ts
  it('dark background is NOT pure black #000000', () => {
    expect(DARK.background.toLowerCase()).not.toBe('#000000');
    expect(DARK.background.toLowerCase()).toBe('#0c1017');
  });
```

> Leave the `LIGHT` object unchanged — light semantics are not recalibrated in this round (spec §1: "Light não é afterthought, mas dark é o primário"; we keep the verified light base).

- [ ] **Step 2: Run the contrast test to confirm the appendix hexes clear the thresholds**

The contrast test uses its **own hardcoded `DARK` constants** and never reads `globals.css`. So this run only proves the appendix hexes pass WCAG — it does NOT prove the HSL you write into `globals.css` (Step 3) equals those hexes. That cross-check is Step 3a.

Run: `pnpm --filter @leedi/ui test -- contrast`
Expected: PASS (all dark ratios clear 4.5/3.0 — verified in appendix). If any fails, STOP and recalibrate that token in the appendix before continuing.

- [ ] **Step 3: Recalibrate the `.dark` semantic block in `globals.css`**

Replace the `.dark { ... }` block (lines 46-80) with:

```css
  .dark {
    /* Base — deeper, bluish off-black (Gemini #0D1117 family), NOT pure black */
    --background: 222 30% 7%;      /* #0c1017 */
    --foreground: 213 27% 94%;     /* #eceff4 — NOT pure white */
    --card: 222 25% 11%;           /* #151923 — elevated surface */
    --card-foreground: 213 27% 94%;
    --popover: 222 25% 11%;
    --popover-foreground: 213 27% 94%;

    /* Primary indigo — verified 5.46:1 on the new background */
    --primary: 236 96% 72%;        /* #737cfc */
    --primary-foreground: 222 30% 7%;

    --secondary: 222 20% 16%;      /* #1f2533 */
    --secondary-foreground: 213 27% 94%;

    --muted: 222 20% 16%;
    --muted-foreground: 215 18% 65%;  /* #96a3b6 — 7.45:1 on bg */

    --accent: 222 20% 16%;
    --accent-foreground: 213 27% 94%;

    --accent-ai: 262 100% 75%;     /* #ae80ff */

    --destructive: 0 84% 60%;      /* #ef4343 — 5.04:1 on bg */
    --destructive-foreground: 0 0% 100%;

    --success: 142 71% 55%;
    --warning: 38 92% 60%;
    --info: 217 91% 70%;

    --border: 222 18% 18%;
    --input: 222 18% 18%;
    --ring: 236 96% 72%;

    /* ── Level B: richness layer (new tokens, no shadcn equivalent) ── */
    --surface-1: 222 25% 11%;      /* = card; base surface */
    --surface-2: 222 24% 14%;      /* card-on-card, row hover */
    --surface-3: 222 22% 17%;      /* rare third level */

    --glass-bg: 222 25% 11% / 0.7;
    --glass-border: 0 0% 100% / 0.10;

    --glow-primary: 236 96% 72% / 0.30;
    --glow-ai: 262 100% 75% / 0.25;

    --sidebar: 222 32% 6%;         /* slightly darker than app */

    /* Circuit texture — white strokes at ~4% alpha baked into the SVG */
    --texture-circuit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.04' stroke-width='1'%3E%3Cpath d='M0 30h21m18 0h21M30 0v21m0 18v21'/%3E%3Ccircle cx='30' cy='30' r='3'/%3E%3Ccircle cx='0' cy='30' r='1.5'/%3E%3Ccircle cx='60' cy='30' r='1.5'/%3E%3Ccircle cx='30' cy='0' r='1.5'/%3E%3Ccircle cx='30' cy='60' r='1.5'/%3E%3C/g%3E%3C/svg%3E");
  }
```

- [ ] **Step 3a: Cross-check that the `.dark` HSL values equal the appendix hexes (closes the gap that Step 2's test can't see)**

The contrast test asserts hexes; `globals.css` defines HSL. A transcription slip in either place would go uncaught by the test alone. Run this to confirm each HSL you just wrote converts to the hex the test expects:

```bash
node -e '
function h(H,S,L){S/=100;L/=100;const k=n=>(n+H/30)%12,a=S*Math.min(L,1-L),f=n=>L-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)),t=x=>Math.round(255*x).toString(16).padStart(2,"0");return "#"+t(f(0))+t(f(8))+t(f(4));}
const want={background:[[222,30,7],"#0c1017"],foreground:[[213,27,94],"#eceff4"],primary:[[236,96,72],"#737cfc"],mutedFg:[[215,18,65],"#96a3b6"],destructive:[[0,84,60],"#ef4343"],success:[[142,71,55],"#3bde77"],accentAi:[[262,100,75],"#ae80ff"]};
let ok=true;for(const k in want){const[[H,S,L],hex]=want[k];const got=h(H,S,L);const m=got===hex;if(!m)ok=false;console.log((m?"OK  ":"BAD "),k,got,"expected",hex);}
process.exit(ok?0:1);'
```
Expected: every line `OK`, exit 0. If any `BAD`, your `.dark` HSL and the test hex disagree — fix whichever is wrong before moving on.

- [ ] **Step 4: Add the Level-B tokens to the `:root` (light) block**

Inside the existing `:root { ... }` block, immediately before the closing `}` (after `--radius: 0.5rem;` at line 43), add — do NOT change any existing light semantic value:

```css
    /* ── Level B: richness layer (light values) ── */
    --surface-1: 0 0% 100%;        /* = card */
    --surface-2: 240 5% 98%;
    --surface-3: 240 5% 96%;

    --glass-bg: 0 0% 100% / 0.7;
    --glass-border: 240 6% 90% / 0.8;

    --glow-primary: 244 84% 55% / 0.18;
    --glow-ai: 262 100% 66% / 0.18;

    --sidebar: 240 6% 98%;

    /* Circuit texture — black strokes at ~2.5% alpha for light mode */
    --texture-circuit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23000000' stroke-opacity='0.025' stroke-width='1'%3E%3Cpath d='M0 30h21m18 0h21M30 0v21m0 18v21'/%3E%3Ccircle cx='30' cy='30' r='3'/%3E%3Ccircle cx='0' cy='30' r='1.5'/%3E%3Ccircle cx='60' cy='30' r='1.5'/%3E%3Ccircle cx='30' cy='0' r='1.5'/%3E%3Ccircle cx='30' cy='60' r='1.5'/%3E%3C/g%3E%3C/svg%3E");
```

- [ ] **Step 5: Add glass + texture utilities at the end of `globals.css`**

Append after the final `@layer base { ... }` block:

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
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid hsl(0 0% 100% / 0.06);
  }
  .app-texture {
    background-image: var(--texture-circuit);
    background-repeat: repeat;
  }
}
```

- [ ] **Step 6: Run the full `@leedi/ui` test suite — contrast must stay green**

Run: `pnpm --filter @leedi/ui test`
Expected: PASS (contrast.test.ts green with the new dark hexes).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/styles/globals.css packages/ui/src/__tests__/contrast.test.ts
git commit -m "feat(ui): recalibrate dark tokens to Gemini palette + add richness layer (surfaces/glass/glow/texture)"
```

---

## Task 2: Wire the new tokens into the shared Tailwind config

**Files:**
- Modify: `tooling/tailwind-config/index.js`

- [ ] **Step 1: Add `surface` and `sidebar` to `colors`**

In `theme.extend.colors`, after the `ring: 'hsl(var(--ring))',` line (line 109), add:

```js
        surface: {
          1: 'hsl(var(--surface-1))',
          2: 'hsl(var(--surface-2))',
          3: 'hsl(var(--surface-3))',
        },
        sidebar: 'hsl(var(--sidebar))',
```

- [ ] **Step 2: Add `boxShadow` and `backgroundImage` to `theme.extend`**

After the `fontFamily` block (closing at line 119), inside `theme.extend`, add:

```js
      boxShadow: {
        glow: '0 0 20px hsl(var(--glow-primary))',
        'glow-ai': '0 0 20px hsl(var(--glow-ai))',
      },
      backgroundImage: {
        'gradient-metric':
          'linear-gradient(135deg, hsl(var(--surface-1)) 0%, hsl(var(--surface-2)) 100%)',
        'gradient-active':
          'linear-gradient(135deg, hsl(var(--primary) / 0.20) 0%, hsl(var(--primary) / 0.05) 100%)',
        'gradient-cta':
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)',
        'gradient-header':
          'linear-gradient(180deg, hsl(var(--surface-1)) 0%, hsl(var(--background)) 100%)',
      },
```

- [ ] **Step 3: Validate the config NOW with an app build (don't defer config errors to Task 16)**

A typo in a gradient/glow/surface string here won't surface in unit tests — only Tailwind's build resolves these utilities. Catch it immediately instead of ~13 tasks later:

Run: `pnpm --filter @leedi/dashboard build`
Expected: success. A failure here means a malformed `colors`/`boxShadow`/`backgroundImage` entry — fix the config before committing. (This build also picks up the Task 1 token/utility changes, so it doubles as an early smoke of the whole token layer.)

- [ ] **Step 4: Commit**

```bash
git add tooling/tailwind-config/index.js
git commit -m "feat(tailwind): expose surface/sidebar colors, glow shadows, gradient backgrounds"
```

---

## Task 3: Create the `Card` primitive

**Files:**
- Create: `packages/ui/src/components/ui/card.tsx`
- Create: `packages/ui/src/components/ui/__tests__/card.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write a render-smoke test (no vacuous assertions — checks variant class + composition)**

Create `packages/ui/src/components/ui/__tests__/card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../card';

describe('Card', () => {
  it('renders composed children', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Foot')).toBeTruthy();
  });

  it('applies the metric variant gradient class', () => {
    render(<Card variant="metric" data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-gradient-metric');
  });

  it('applies the default variant by default', () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-card');
  });
});
```

- [ ] **Step 2: Run the test — verify it FAILS (module not found)**

Run: `pnpm --filter @leedi/ui test -- card`
Expected: FAIL with "Failed to resolve import '../card'".

- [ ] **Step 3: Implement `card.tsx`**

Create `packages/ui/src/components/ui/card.tsx`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const cardVariants = cva('rounded-lg border text-card-foreground', {
  variants: {
    variant: {
      default: 'bg-card border-border shadow-sm',
      metric: 'bg-gradient-metric border-border shadow-md',
      glass: 'glass rounded-xl',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, className }))} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-xl font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardContent, CardFooter, cardVariants };
```

- [ ] **Step 4: Export from `index.ts`**

Add after the `Input` exports (line 4) in `packages/ui/src/index.ts`:

```ts
export {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  cardVariants,
} from './components/ui/card.js';
export type { CardProps } from './components/ui/card.js';
```

- [ ] **Step 5: Run the test — verify it PASSES**

Run: `pnpm --filter @leedi/ui test -- card`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/ui/card.tsx packages/ui/src/components/ui/__tests__/card.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Card primitive (default/metric/glass variants)"
```

---

## Task 4: Create the `Badge` primitive (intent-based variants)

**Design decision (reconciles spec §4.1 with real status vocabulary):** The spec lists `ativo/trial/bloqueado/ai`, but the codebase uses English tenant statuses (`active/trial/blocked/cancelled`) and invoice statuses (`pago/pendente/atrasado/cancelado`). Instead of one variant per status, `Badge` exposes **semantic intent** variants; call sites map status → intent. This covers every state without a brittle variant explosion.

Intent variants: `success | info | warning | danger | neutral | ai`.

**Files:**
- Create: `packages/ui/src/components/ui/badge.tsx`
- Create: `packages/ui/src/components/ui/__tests__/badge.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the render-smoke test**

Create `packages/ui/src/components/ui/__tests__/badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../badge';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>Ativo</Badge>);
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('applies the danger intent classes', () => {
    render(<Badge variant="danger" data-testid="b">Bloqueado</Badge>);
    expect(screen.getByTestId('b').className).toContain('text-destructive');
  });

  it('applies the ai intent classes', () => {
    render(<Badge variant="ai" data-testid="b">IA</Badge>);
    expect(screen.getByTestId('b').className).toContain('accent-ai');
  });

  it('defaults to the neutral intent', () => {
    render(<Badge data-testid="b">x</Badge>);
    expect(screen.getByTestId('b').className).toContain('text-muted-foreground');
  });
});
```

- [ ] **Step 2: Run — verify FAIL (module not found)**

Run: `pnpm --filter @leedi/ui test -- badge`
Expected: FAIL with "Failed to resolve import '../badge'".

- [ ] **Step 3: Implement `badge.tsx`**

Create `packages/ui/src/components/ui/badge.tsx`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-success/12 text-success border-success/20',
        info: 'bg-info/12 text-info border-info/20',
        warning: 'bg-warning/12 text-warning border-warning/20',
        danger: 'bg-destructive/12 text-destructive border-destructive/20',
        ai: 'bg-accent-ai/12 text-accent-ai border-accent-ai/20',
        neutral: 'bg-muted text-muted-foreground border-border',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
```

> Note: `bg-success/12` etc. rely on the `success/info/warning` colors already mapped in the Tailwind config (they are). `accent-ai` is also already mapped.

- [ ] **Step 4: Export from `index.ts`**

Add after the Card exports in `packages/ui/src/index.ts`:

```ts
export { Badge, badgeVariants } from './components/ui/badge.js';
export type { BadgeProps } from './components/ui/badge.js';
```

- [ ] **Step 5: Run — verify PASS**

Run: `pnpm --filter @leedi/ui test -- badge`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/ui/badge.tsx packages/ui/src/components/ui/__tests__/badge.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Badge primitive (intent variants: success/info/warning/danger/ai/neutral)"
```

---

## Task 5: Create the `Avatar` primitive (real TDD — deterministic hash)

This is the one component with genuine logic: the background color must be a **deterministic** function of `name` (same name → same color, every render, every process). TDD it.

**Files:**
- Create: `packages/ui/src/components/ui/avatar.tsx`
- Create: `packages/ui/src/components/ui/__tests__/avatar.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test (real assertions on hash + initials + online dot)**

Create `packages/ui/src/components/ui/__tests__/avatar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, avatarColorIndex, initialsFromName } from '../avatar';

describe('initialsFromName', () => {
  it('takes first letters of first and last word, uppercased', () => {
    expect(initialsFromName('Caio Pereira')).toBe('CP');
  });
  it('handles a single word', () => {
    expect(initialsFromName('Acme')).toBe('AC');
  });
  it('handles empty/whitespace by returning "?"', () => {
    expect(initialsFromName('   ')).toBe('?');
  });
});

describe('avatarColorIndex', () => {
  it('is deterministic for the same name', () => {
    expect(avatarColorIndex('Acme', 6)).toBe(avatarColorIndex('Acme', 6));
  });
  it('stays within palette bounds', () => {
    for (const n of ['a', 'Beta Corp', 'Zzz', '李', 'Acme']) {
      const i = avatarColorIndex(n, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });
  it('distributes different names (not all identical)', () => {
    const idxs = ['Acme', 'Beta', 'Gamma', 'Delta', 'Echo'].map((n) => avatarColorIndex(n, 6));
    expect(new Set(idxs).size).toBeGreaterThan(1);
  });
});

describe('Avatar', () => {
  it('renders initials', () => {
    render(<Avatar name="Caio Pereira" />);
    expect(screen.getByText('CP')).toBeTruthy();
  });
  it('exposes an accessible label', () => {
    render(<Avatar name="Acme" />);
    expect(screen.getByLabelText('Acme')).toBeTruthy();
  });
  it('shows the online dot only when online', () => {
    const { rerender } = render(<Avatar name="Acme" />);
    expect(screen.queryByTestId('avatar-online')).toBeNull();
    rerender(<Avatar name="Acme" online />);
    expect(screen.getByTestId('avatar-online')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — verify FAIL (module not found)**

Run: `pnpm --filter @leedi/ui test -- avatar`
Expected: FAIL with "Failed to resolve import '../avatar'".

- [ ] **Step 3: Implement `avatar.tsx`**

Create `packages/ui/src/components/ui/avatar.tsx`:

```tsx
import * as React from 'react';
import { cn } from '../../lib/utils.js';

// Brand-tinted palette (Tailwind classes mapped in tooling/tailwind-config).
const AVATAR_COLORS = [
  'bg-primary/15 text-primary-300',
  'bg-accent-ai/15 text-accent-ai-300',
  'bg-info/15 text-info',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-secondary text-secondary-foreground',
] as const;

export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

// Deterministic non-negative hash → palette index (FNV-1a style).
export function avatarColorIndex(name: string, paletteSize: number): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % paletteSize;
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  online?: boolean;
  className?: string;
}

export function Avatar({ name, size = 'md', online = false, className }: AvatarProps) {
  const initials = initialsFromName(name);
  const color = AVATAR_COLORS[avatarColorIndex(name, AVATAR_COLORS.length)]!;
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        aria-label={name}
        role="img"
        className={cn(
          'inline-flex items-center justify-center rounded-full font-medium',
          SIZE_CLASSES[size],
          color,
        )}
      >
        {initials}
      </span>
      {online && (
        <span
          data-testid="avatar-online"
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-background"
        />
      )}
    </span>
  );
}
```

> `text-primary-300` / `text-accent-ai-300` reference the numbered ramps already defined in the Tailwind config (`primary.300`, `accent-ai.300`). Verified present.

- [ ] **Step 4: Export from `index.ts`**

Add after the Badge exports in `packages/ui/src/index.ts`:

```ts
export { Avatar, initialsFromName, avatarColorIndex } from './components/ui/avatar.js';
export type { AvatarProps } from './components/ui/avatar.js';
```

- [ ] **Step 5: Run — verify PASS (all hash/initials/render assertions)**

Run: `pnpm --filter @leedi/ui test -- avatar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/ui/avatar.tsx packages/ui/src/components/ui/__tests__/avatar.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Avatar primitive (deterministic name->color hash, initials, online dot)"
```

---

## Task 6: Create the `EmptyState` primitive (spec §4.3 pattern, reusable)

**Files:**
- Create: `packages/ui/src/components/ui/empty-state.tsx`
- Create: `packages/ui/src/components/ui/__tests__/empty-state.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the render-smoke test**

Create `packages/ui/src/components/ui/__tests__/empty-state.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../empty-state';

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Nenhuma conversa ainda"
        description="As conversas aparecerão aqui."
        action={<button type="button">Começar</button>}
      />,
    );
    expect(screen.getByText('Nenhuma conversa ainda')).toBeTruthy();
    expect(screen.getByText('As conversas aparecerão aqui.')).toBeTruthy();
    expect(screen.getByText('Começar')).toBeTruthy();
  });

  it('renders without an action', () => {
    render(<EmptyState title="Vazio" description="Nada aqui." />);
    expect(screen.getByText('Vazio')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm --filter @leedi/ui test -- empty-state`
Expected: FAIL with "Failed to resolve import '../empty-state'".

- [ ] **Step 3: Implement `empty-state.tsx`**

Create `packages/ui/src/components/ui/empty-state.tsx`. The icon slot is optional; a "zero" badge overlay is rendered when an icon is provided. **No decorative star.**

```tsx
import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="relative mb-4 text-muted-foreground">
          {icon}
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          >
            0
          </span>
        </div>
      )}
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Export from `index.ts`**

Add after the Avatar exports:

```ts
export { EmptyState } from './components/ui/empty-state.js';
export type { EmptyStateProps } from './components/ui/empty-state.js';
```

- [ ] **Step 5: Run — verify PASS**

Run: `pnpm --filter @leedi/ui test -- empty-state`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/ui/empty-state.tsx packages/ui/src/components/ui/__tests__/empty-state.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add EmptyState primitive (spec section 4.3 pattern, no decorative star)"
```

---

## Task 7: Restyle `Button` and `Input` (skin only, no API change)

**Files:**
- Modify: `packages/ui/src/components/ui/button.tsx`
- Modify: `packages/ui/src/components/ui/input.tsx`

- [ ] **Step 1: Restyle `button.tsx` — enrich `default`/`primary` and add `impersonate` variant**

In `packages/ui/src/components/ui/button.tsx`, replace the `variant` block (lines 10-18) with — **keep every existing variant name; only enrich `default` and add `impersonate`:**

```tsx
      variant: {
        default:
          'bg-gradient-cta text-primary-foreground shadow-glow hover:-translate-y-px hover:shadow-glow',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        impersonate:
          'bg-primary/10 text-primary-300 border border-primary/25 hover:bg-primary/15',
      },
```

> Also add `transition-all` to the base string so the `-translate-y-px` animates. Change the base CVA string's `transition-colors` (line 7) to `transition-all`. Nothing else in the base changes.

- [ ] **Step 2: Restyle `input.tsx` — focus ring tint (cosmetic)**

In `packages/ui/src/components/ui/input.tsx`, in the className (line 11), change the focus segment from:

`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

to:

`focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:ring-offset-2`

- [ ] **Step 3: Run the `@leedi/ui` suite (no behavior change expected)**

Run: `pnpm --filter @leedi/ui test`
Expected: PASS.

- [ ] **Step 4: Typecheck the package**

Run: `pnpm --filter @leedi/ui typecheck`
Expected: clean (the new `impersonate` variant is additive; `ButtonProps` already derives from `buttonVariants`).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ui/button.tsx packages/ui/src/components/ui/input.tsx
git commit -m "feat(ui): enrich Button primary (gradient+glow+lift) + add impersonate variant; tint Input focus"
```

---

## Task 8: Restyle the dashboard Sidebar

**Files:**
- Modify: `apps/dashboard/components/shell/Sidebar.tsx`
- Modify: `apps/dashboard/components/shell/Sidebar.test.tsx` (only if a new lucide icon is imported)

Constraints: the 11 `NAV_ITEMS` and the `isActive` logic do **not** change. `aria-current`, the `nav` landmark name "Navegação principal", and exactly 11 links must remain (asserted by `Sidebar.test.tsx`).

- [ ] **Step 1: Add a logo header + restyle the active/hover states + sidebar background**

In `apps/dashboard/components/shell/Sidebar.tsx`:

1. Add `Sparkles` to the lucide import list (line 7-20) — a small brand glyph for the logo.
2. In `NavItemLink`, replace the `isActive ? ... : ...` ternary (lines 56-58) with:

```tsx
        isActive
          ? 'glass bg-gradient-active border border-primary/40 text-foreground shadow-glow'
          : 'text-muted-foreground hover:glass-subtle hover:text-foreground'
```

3. Change the `<aside>` background class (line 84) from `border-r bg-background` to `border-r bg-sidebar`.
4. Add a logo block as the first child inside `<aside>`, immediately before the mobile-close `<div>` (line 91). It must not be a `<Link>`/anchor (the test asserts exactly 11 links):

```tsx
        {/* Brand */}
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-cta shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="hidden text-base font-bold text-foreground lg:block">Leedi</span>
        </div>
```

- [ ] **Step 2: Update the lucide mock in `Sidebar.test.tsx` to include `Sparkles`**

In `apps/dashboard/components/shell/Sidebar.test.tsx`, inside the `vi.mock('lucide-react', ...)` return object (lines 32-45), add:

```tsx
    Sparkles: Icon,
```

- [ ] **Step 3: Run the dashboard Sidebar test — all 4 assertions stay green (landmark, aria-current, exact match, 11 links)**

Run: `pnpm --filter @leedi/dashboard test -- Sidebar`
Expected: PASS (4 tests). If "renders all 11 nav items" fails, you accidentally added an anchor — the logo must be a `<span>`/`<div>`, not a link.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/shell/Sidebar.tsx apps/dashboard/components/shell/Sidebar.test.tsx
git commit -m "feat(dashboard): restyle Sidebar (glass+glow active item, bg-sidebar, brand logo)"
```

---

## Task 9: Restyle the dashboard Header (avatar + visual search)

**Files:**
- Modify: `apps/dashboard/components/shell/Header.tsx`

Constraints: `TenantSwitcher` and `ThemeToggle` stay. The search field is **visual only** (no handler, no state). No prop changes to `HeaderProps`.

- [ ] **Step 1: Add icons + a visual search input + restyle the header background**

In `apps/dashboard/components/shell/Header.tsx`:

1. Add `Search` to the lucide import (line 5): `import { Menu, Sun, Moon, Search } from 'lucide-react';`
2. Change the `<header>` className (line 52) from `border-b bg-background` to `border-b bg-gradient-header backdrop-blur`.
3. Insert a visual search field in the center. Replace the title `<span>` line (line 68) region so the left group keeps the hamburger + title, then add a centered search between the two groups. Concretely, change the return's outer structure to a three-zone flex:

Replace lines 52-75 (`<header>...</header>`) with:

```tsx
    <header className="flex h-14 items-center gap-4 border-b bg-gradient-header px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        {/* Hamburger — visible only on mobile */}
        <button
          type="button"
          onClick={open}
          aria-label="Abrir menu de navegação"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'transition-colors'
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="hidden text-sm font-bold text-foreground lg:block">{t('title')}</span>
      </div>

      {/* Visual search (non-functional this round — spec §0) */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          disabled
          aria-hidden="true"
          tabIndex={-1}
          placeholder="Buscar…"
          className="glass-subtle h-9 w-full rounded-md pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <TenantSwitcher tenants={tenants} currentTenantId={currentTenantId} />
        <ThemeToggle />
      </div>
    </header>
```

> The search is `disabled` + `aria-hidden` + `tabIndex={-1}` so it is unambiguously decorative and not exposed to assistive tech or keyboard until the real feature ships.

- [ ] **Step 2: Typecheck the dashboard**

Run: `pnpm --filter @leedi/dashboard typecheck`
Expected: clean.

- [ ] **Step 3: Run any header-adjacent tests + the dashboard suite to confirm no regression**

Run: `pnpm --filter @leedi/dashboard test`
Expected: PASS (Sidebar tests + others unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/shell/Header.tsx
git commit -m "feat(dashboard): restyle Header (gradient+blur, brand, visual search field)"
```

---

## Task 10: Restyle the dashboard MetricCard + apply app texture to `<main>`

**Files:**
- Modify: `apps/dashboard/app/(shell)/components/metric-card.tsx`
- Modify: `apps/dashboard/app/(shell)/layout.tsx`

Constraints: `MetricCardProps` (label/value/subtext/tooltip) is unchanged.

- [ ] **Step 1: Rebuild `metric-card.tsx` on top of `<Card variant="metric">`**

Replace the body of `apps/dashboard/app/(shell)/components/metric-card.tsx` (keep the `'use client'` and props interface) with:

```tsx
'use client';

import { Card } from '@leedi/ui';

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  tooltip?: string;
}

export function MetricCard({ label, value, subtext, tooltip }: MetricCardProps) {
  return (
    <Card variant="metric" className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {tooltip && (
          <div className="group relative">
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded-full border text-xs text-muted-foreground hover:bg-accent"
              aria-label="Mais informações"
            >
              ?
            </button>
            <div className="absolute right-0 top-5 z-10 hidden w-56 rounded border bg-popover p-2 text-xs text-popover-foreground shadow-md group-hover:block">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Add `app-texture` to the dashboard `<main>`**

In `apps/dashboard/app/(shell)/layout.tsx`, change the `<main>` className (line 125) from:

`className="flex-1 overflow-auto p-6"`

to:

`className="app-texture flex-1 overflow-auto p-6"`

- [ ] **Step 3: Typecheck + dashboard tests**

Run: `pnpm --filter @leedi/dashboard typecheck && pnpm --filter @leedi/dashboard test`
Expected: clean + PASS. (If a `metric-card` test exists under `app/(shell)/components/__tests__`, confirm it still passes; the props are identical.)

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/(shell)/components/metric-card.tsx apps/dashboard/app/(shell)/layout.tsx
git commit -m "feat(dashboard): MetricCard uses Card variant=metric (uppercase label, text-3xl); app texture on main"
```

---

## Task 11: Apply the EmptyState pattern to one real screen (reference implementation)

**Files:**
- Modify: `apps/dashboard/app/(shell)/conversas/components/conversas-client.tsx`

This is the **reference** application of `EmptyState` (spec §4.3). Other empty states across the app adopt it incrementally as a mechanical follow-up — out of scope for this plan to avoid 20+ file churn in a style-only pass.

- [ ] **Step 1: Read the file and locate its current empty state**

Run: `grep -n "Nenhuma\|nenhum\|empty\|vazia\|MessageSquare" "apps/dashboard/app/(shell)/conversas/components/conversas-client.tsx"`
Identify the JSX block that renders when the conversation list is empty. (If the file has no plain-text empty state, STOP and pick the nearest list screen that does — `apps/dashboard/app/(shell)/leads` — and apply there instead, documenting the swap in the commit message.)

- [ ] **Step 2: Replace the ad-hoc empty block with `<EmptyState>`**

Add `EmptyState` to the existing `@leedi/ui` import, and `MessageSquare` to the existing lucide import if not present. Replace the empty block with:

```tsx
<EmptyState
  icon={<MessageSquare className="h-10 w-10" aria-hidden="true" />}
  title="Nenhuma conversa ainda"
  description="Quando seus contatos enviarem mensagens, elas aparecerão aqui."
/>
```

> Keep the surrounding conditional/render logic exactly as it was — only the inner empty markup changes. Do not add a CTA that triggers behavior the screen doesn't already have.

- [ ] **Step 3: Typecheck + the conversas test (if any) + dashboard suite**

Run: `pnpm --filter @leedi/dashboard typecheck && pnpm --filter @leedi/dashboard test`
Expected: clean + PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/dashboard/app/(shell)/conversas/components/conversas-client.tsx"
git commit -m "feat(dashboard): adopt EmptyState primitive on conversas empty view (spec 4.3 reference)"
```

---

## Task 12: Restyle the admin Sidebar (card-style nav + ADMIN badge)

**Files:**
- Modify: `apps/admin/components/shell/AdminSidebar.tsx`
- Modify: `apps/admin/components/shell/AdminSidebar.test.tsx` (only if a new lucide icon is imported)

Constraints: the 5 `ADMIN_NAV_ITEMS`, `isActive` logic, the landmark name "Navegação administrativa", exactly 5 links, and "no tenant switcher" must all remain (asserted by `AdminSidebar.test.tsx`).

- [ ] **Step 1: Restyle nav items as rounded cards + add the brand/ADMIN block + bg-sidebar**

In `apps/admin/components/shell/AdminSidebar.tsx`:

1. Add `ShieldCheck` to the lucide import (line 7).
2. In `AdminNavLink`, replace the base + active/hover classes (lines 35-41). Admin uses **card-style** items (more padding, `rounded-2xl`):

```tsx
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'glass bg-gradient-active border border-primary/40 text-foreground shadow-glow'
          : 'text-muted-foreground hover:glass-subtle hover:text-foreground'
      )}
```

3. Change the `<aside>` background (line 65) from `border-r bg-background` to `border-r bg-sidebar`.
4. Add a brand/ADMIN block as the first child of `<aside>`, before the mobile-close `<div>` (line 72). Must not be a link:

```tsx
        {/* Brand + ADMIN badge */}
        <div className="flex h-14 items-center gap-2 px-4">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="hidden text-base font-bold text-foreground lg:block">Leedi</span>
          <span className="hidden rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-primary lg:inline">
            ADMIN
          </span>
        </div>
```

- [ ] **Step 2: Update the lucide mock in `AdminSidebar.test.tsx` to include `ShieldCheck`**

In `apps/admin/components/shell/AdminSidebar.test.tsx`, inside the `vi.mock('lucide-react', ...)` return (lines 27-34), add:

```tsx
    ShieldCheck: Icon,
```

- [ ] **Step 3: Run the admin Sidebar test — 4 assertions stay green (landmark, 5 links, aria-current, no tenant switcher)**

Run: `pnpm --filter @leedi/admin test -- AdminSidebar`
Expected: PASS (4 tests). If "renders exactly 5 admin nav items" fails, the brand block was rendered as a link — make it a `<div>`/`<span>`.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/shell/AdminSidebar.tsx apps/admin/components/shell/AdminSidebar.test.tsx
git commit -m "feat(admin): restyle AdminSidebar (card-style nav, glass+glow active, ADMIN badge, bg-sidebar)"
```

---

## Task 13: Restyle the admin Header (avatar + role + visual search)

**Files:**
- Modify: `apps/admin/components/shell/AdminHeader.tsx`

The current admin header uses a chapado `bg-primary`. Move it onto the shared token surface with an avatar, a role label, and a visual search — consistent with the dashboard header but denser (spec §5.2).

- [ ] **Step 1: Restyle `AdminHeader.tsx`**

In `apps/admin/components/shell/AdminHeader.tsx`:

1. Add `Search` to the lucide import (line 5) and `Avatar` to a new `@leedi/ui` import: `import { cn, Avatar } from '@leedi/ui';`
2. Change the `<header>` (line 49) from `border-b bg-primary px-4` to `border-b bg-gradient-header px-4 backdrop-blur`.
3. The existing ADMIN badge block uses `text-primary-foreground` (white-on-indigo). Since the header is no longer solid indigo, switch those to token colors. Replace the brand block (lines 66-73) with:

```tsx
        {/* Admin indicator — color + text badge (never color alone, WCAG) */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-sm font-bold text-foreground">Leedi</span>
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-primary">
            ADMIN
          </span>
        </div>
```

4. The `ThemeToggle` inside this file uses `text-primary-foreground/80 hover:bg-primary-700` (tuned for the old indigo header). Update its className (lines 29-31) to token-based, matching the dashboard toggle:

```tsx
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
```

   and the mobile hamburger (lines 58-59) similarly from `text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground` to:

```tsx
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
```

5. Add a visual search + an admin avatar+role on the right. Insert the search after the left brand group and add the avatar before `ThemeToggle`. Replace the right-side group (lines 76-78) with:

```tsx
      {/* Visual search (non-functional — spec §0) */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          disabled
          aria-hidden="true"
          tabIndex={-1}
          placeholder="Buscar…"
          className="glass-subtle h-9 w-full rounded-md pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <Avatar name="Admin" size="sm" />
          <div className="leading-tight">
            <p className="text-sm font-medium text-foreground">Admin</p>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
```

> Note: there is no real user object passed to `AdminHeader` (it takes no props). The avatar/name are a static "Admin / Super Admin" placeholder consistent with the layout's `super_admin` guard — do NOT add props or fetch a user (that would change the component contract). If a follow-up wires the real admin identity, it threads props then.

- [ ] **Step 2: Typecheck the admin app**

Run: `pnpm --filter @leedi/admin typecheck`
Expected: clean.

- [ ] **Step 3: Run the admin suite**

Run: `pnpm --filter @leedi/admin test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/shell/AdminHeader.tsx
git commit -m "feat(admin): restyle AdminHeader (token surface, gradient+blur, avatar+role, visual search)"
```

---

## Task 14: Restyle the admin Clientes screen (Avatar + Badge in rows) + texture on `<main>`

**Files:**
- Modify: `apps/admin/app/(shell)/clientes/ClientesClient.tsx`
- Modify: `apps/admin/app/(shell)/clientes/ClientesClient.test.tsx` (mock updates — required)
- Modify: `apps/admin/app/(shell)/layout.tsx` (app-texture)

Constraints (from `ClientesClient.test.tsx`): the text `actions.block` / `actions.unblock` must still render once each; client-side name filter must still work; the billing-pending title must still render. The test **mocks `@leedi/ui` and `lucide-react` with fixed lists** — adding `Avatar`/`Badge`/new icons to the component requires adding them to those mocks or the render throws.

- [ ] **Step 1: Update the test mocks FIRST (so the suite can import the new component)**

In `apps/admin/app/(shell)/clientes/ClientesClient.test.tsx`:

1. Add to the `@leedi/ui` mock object (after `DialogDescription`, line 47):

```tsx
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Avatar: ({ name }: { name: string }) => <span aria-label={name} />,
```

2. The lucide mock (line 28-31) currently exports `AlertTriangle, CheckCircle2, Plus, Search`. No new lucide icons are added in Step 2, so leave it — but if you introduce one, add it here.

- [ ] **Step 2: Restyle the tenant rows — name cell gets an Avatar; status cell uses Badge; map status → Badge intent**

In `apps/admin/app/(shell)/clientes/ClientesClient.tsx`:

1. Add `Badge` and `Avatar` to the `@leedi/ui` import (lines 6-16).
2. Replace the `STATUS_STYLES` and `INVOICE_STATUS_STYLES` maps (lines 27-39) with status→intent maps:

```tsx
import type { BadgeProps } from '@leedi/ui';

const STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  trial: 'info',
  active: 'success',
  blocked: 'danger',
  cancelled: 'neutral',
};

const INVOICE_STATUS_INTENT: Record<string, NonNullable<BadgeProps['variant']>> = {
  pago: 'success',
  pendente: 'warning',
  atrasado: 'danger',
  cancelado: 'neutral',
};
```

> Put the `import type { BadgeProps }` with the other imports at the top, not inline.

3. In the name cell `<button>` (lines 121-135), wrap the name with an Avatar:

```tsx
                    <button
                      type="button"
                      onClick={() => setHistoryTarget(tenant)}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Avatar name={tenant.name} size="sm" />
                      {tenant.name}
                      {tenant.billingStatus === 'pendente_configuracao' ? (
                        <span title={t('billingPending')} className="inline-flex">
                          <AlertTriangle
                            className="h-4 w-4 text-amber-500"
                            aria-label={t('billingPending')}
                          />
                        </span>
                      ) : null}
                    </button>
```

4. Replace the status `<span>` (lines 138-146) with a `Badge`:

```tsx
                  <td className="py-3 pr-4">
                    <Badge variant={STATUS_INTENT[tenant.status] ?? 'neutral'}>
                      {t(`status.${tenant.status}` as Parameters<typeof t>[0])}
                    </Badge>
                  </td>
```

5. Replace the invoice status `<span>` in `HistoryDialog` (lines 469-475) with a `Badge`:

```tsx
                    <td className="py-3 pr-4">
                      <Badge variant={INVOICE_STATUS_INTENT[inv.status] ?? 'neutral'}>
                        {inv.status}
                      </Badge>
                    </td>
```

6. Restyle the row hover to use the surface token — change `hover:bg-muted/40` (line 119) to `hover:bg-surface-2`.

> Leave the inline `block`/`unblock` row buttons as they are (they already carry `actions.block`/`actions.unblock` text the test asserts). Restyling them to the `impersonate`/`destructive` Button is optional polish — if done, it must keep the literal text and you must verify the test. For this task, leave them to keep the change focused and the test green.

- [ ] **Step 3: Add `app-texture` to the admin `<main>`**

In `apps/admin/app/(shell)/layout.tsx`, change the `<main>` className (line 44) from:

`className="flex-1 overflow-auto p-6"`

to:

`className="app-texture flex-1 overflow-auto p-6"`

- [ ] **Step 4: Run the Clientes test — 3 assertions stay green (filter, block/unblock counts, billing-pending)**

Run: `pnpm --filter @leedi/admin test -- ClientesClient`
Expected: PASS (3 tests). If a render error mentions `Badge`/`Avatar` undefined, the mock update in Step 1 was missed.

- [ ] **Step 5: Typecheck the admin app**

Run: `pnpm --filter @leedi/admin typecheck`
Expected: clean. (`BadgeProps['variant']` resolves through the new export from Task 4.)

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(shell)/clientes/ClientesClient.tsx" "apps/admin/app/(shell)/clientes/ClientesClient.test.tsx" "apps/admin/app/(shell)/layout.tsx"
git commit -m "feat(admin): Clientes rows use Avatar + Badge (status->intent); app texture on main"
```

---

## Task 15: Restyle the admin Financeiro + Operacional metric cards

**Files:**
- Modify: `apps/admin/app/(shell)/financeiro/page.tsx`
- Modify: `apps/admin/app/(shell)/operacional/page.tsx`

These screens render metric/summary cards as hand-built `div`s. Promote the metric tiles to `<Card variant="metric">` with uppercase labels and `text-3xl` values, mirroring the dashboard MetricCard. **Do not touch data fetching, server logic, or `presentation.ts`.**

- [ ] **Step 1: Read both pages and identify the metric tiles**

Run: `grep -n "rounded-lg border\|bg-card\|text-2xl\|text-3xl" "apps/admin/app/(shell)/financeiro/page.tsx" "apps/admin/app/(shell)/operacional/page.tsx"`
Identify each hand-built metric `div` (a bordered card showing a label + a big number).

- [ ] **Step 2: For each metric tile, swap the wrapper to `<Card variant="metric">` and normalize typography**

Add `import { Card } from '@leedi/ui';` (or extend an existing `@leedi/ui` import) at the top of each page. For each metric tile, change the outer `<div className="rounded-lg border bg-card p-5 ...">` to `<Card variant="metric" className="p-5 ...">` (drop the now-redundant `rounded-lg border bg-card`), make the label `text-xs font-medium uppercase tracking-wide text-muted-foreground`, and the value `text-3xl font-bold tracking-tight`. Close with `</Card>`.

> Concrete example transform (apply the same shape to each tile found in Step 1):
>
> Before:
> ```tsx
> <div className="rounded-lg border bg-card p-5 shadow-sm">
>   <p className="text-sm text-muted-foreground">{label}</p>
>   <p className="mt-2 text-2xl font-bold">{value}</p>
> </div>
> ```
> After:
> ```tsx
> <Card variant="metric" className="p-5">
>   <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
>   <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
> </Card>
> ```

> If these pages are Server Components and `Card` is a client component, importing it is still fine (a client component may be rendered from a server component). Do not add `'use client'` to the page.

- [ ] **Step 3: Typecheck + admin tests (operacional has `presentation.test.ts` — pure logic, must stay green and untouched)**

Run: `pnpm --filter @leedi/admin typecheck && pnpm --filter @leedi/admin test`
Expected: clean + PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(shell)/financeiro/page.tsx" "apps/admin/app/(shell)/operacional/page.tsx"
git commit -m "feat(admin): Financeiro/Operacional metric tiles use Card variant=metric (uppercase label, text-3xl)"
```

---

## Task 16: Final verification gate (spec §8 step 6)

**Files:** none (verification only).

- [ ] **Step 1: `@leedi/ui` unit tests — includes the contrast gate**

Run: `pnpm --filter @leedi/ui test`
Expected: PASS, including `contrast.test.ts` (all light + dark ratios clear thresholds; dark background asserted `#0c1017`).

- [ ] **Step 2: App test suites (the cosmetic-change safety net)**

Run: `pnpm --filter @leedi/dashboard test && pnpm --filter @leedi/admin test`
Expected: PASS — `Sidebar.test.tsx` (11 links, aria-current), `AdminSidebar.test.tsx` (5 links, no tenant switcher), `ClientesClient.test.tsx` (filter, block/unblock, billing-pending) all green.

- [ ] **Step 3: Repo-wide typecheck**

Run: `pnpm typecheck`
Expected: clean. (If pre-existing failures unrelated to this work surface — see memory `project_epic15_code_review` re: PL-9 — confirm they are unchanged from `main`, do NOT fix them here, and note them in the final report.)

- [ ] **Step 4: Repo-wide build**

Run: `pnpm build`
Expected: success — this is where the Tailwind config (Task 2) is truly validated end-to-end (gradient/glow/surface utilities resolve, no unknown-class purge issues).

- [ ] **Step 5: Visual smoke (human checkpoint)**

Hand off to Caio to run the dashboard + admin locally and eyeball: dark mode is the deep bluish Gemini base (not the old neutral gray); sidebar active item glows; metric cards have the subtle gradient; admin rows show avatars + status badges; the header search field is visible but inert; the circuit texture is barely perceptible. **No 4-point star anywhere.**

- [ ] **Step 6: Final commit (if any verification-driven tweaks were made)**

```bash
git add -A
git commit -m "chore(redesign): final verification pass — contrast/typecheck/build green"
```

---

## Self-review — spec coverage map

| Spec section | Covered by |
|---|---|
| §1 Level A (recalibrate dark semantics) | Task 1 |
| §1 Level A (`:root` light unchanged base) | Task 1 (light semantics preserved; new tokens added) |
| §1 Level B (surfaces/glass/glow/sidebar) | Task 1 (globals) + Task 2 (config) |
| §1 tailwind-config mapping | Task 2 |
| §1 glass utilities + circuit texture | Task 1 (Steps 5) + applied in Tasks 10/14 |
| §2 typography (uppercase label, text-3xl, titles) | Tasks 10, 15 (metrics); Card primitive (Task 3) |
| §3 effects placement (glass/glow/gradient where) | Tasks 8, 12 (active items), 10, 15 (metric gradient), 9, 13 (header) |
| §4.1 Card | Task 3 |
| §4.1 Badge | Task 4 |
| §4.1 Avatar | Task 5 |
| §4.2 button.tsx (primary + impersonate) | Task 7 |
| §4.2 input.tsx | Task 7 |
| §4.2 dashboard Sidebar | Task 8 |
| §4.2 dashboard Header | Task 9 |
| §4.2 metric-card | Task 10 |
| §4.2 AdminSidebar | Task 12 |
| §4.2 AdminHeader | Task 13 |
| §4.2 admin screens (rows: avatar/badge/actions) | Task 14 (clientes) + Task 15 (financeiro/operacional metrics) |
| §4.3 empty states (pattern) | Task 6 (primitive) + Task 11 (reference application) |
| §5.1/§5.2 layouts | Tasks 8-15 (no structural change; skin only) |
| §6 accessibility (contrast gate, focus, aria-current) | Task 1 (contrast) + Tasks 8/12 (aria-current preserved) + Task 16 |
| §7 anti-patterns | Enforced throughout; restated in Pre-flight |
| §8 verification | Task 16 |

**Known deliberate deviations from a literal reading of the spec (documented, not gaps):**
- `Badge` uses semantic **intent** variants instead of the spec's four named statuses — reconciles the spec's `ativo/trial/bloqueado/ai` with the real English status vocabulary (`active/trial/blocked/cancelled`, `pago/pendente/atrasado/cancelado`). Decided per advisor review.
- Empty-state rollout is **one reference screen** (Task 11) + a reusable primitive, not all ~25 screens — keeps a style-only pass low-risk. Broader rollout is a noted follow-up.
- `AdminHeader` avatar/role is a static "Admin / Super Admin" placeholder (the component takes no props and wiring a real identity would change its contract).
- The Clientes row **Bloquear** button (spec §4.2 calls for `danger`) is left as the existing inline styled button rather than swapped to a `Button variant` — deliberately, to protect the `ClientesClient.test.tsx` assertions on the `actions.block`/`actions.unblock` text. Promoting it is safe optional polish (keep the literal text, re-run the test) and noted as a follow-up.

---

## Concrete values reference (verified)

Dark palette — every hex below was computed from its HSL and checked against its WCAG threshold on the new background `#0c1017` (script run during planning):

| Token | HSL | Hex | Contrast vs bg | Threshold | Pass |
|---|---|---|---|---|---|
| background | `222 30% 7%` | `#0c1017` | — | — | (not pure black ✓) |
| foreground | `213 27% 94%` | `#eceff4` | 16.53:1 | 4.5 | ✓ |
| primary | `236 96% 72%` | `#737cfc` | 5.46:1 | 4.5 | ✓ |
| primary-fg on primary | `222 30% 7%` | `#0c1017` | 5.46:1 | 4.5 | ✓ |
| muted-foreground | `215 18% 65%` | `#96a3b6` | 7.45:1 | 4.5 | ✓ |
| destructive | `0 84% 60%` | `#ef4343` | 5.04:1 | 4.5 | ✓ |
| success (large) | `142 71% 55%` | `#3bde77` | 10.80:1 | 3.0 | ✓ |
| accent-ai (large) | `262 100% 75%` | `#ae80ff` | 6.65:1 | 3.0 | ✓ |

Light palette: existing `:root` semantic values are **unchanged** (already verified in the current `contrast.test.ts` LIGHT block). Only the Level-B tokens get new light values (Task 1 Step 4), which are decorative (surfaces/glass/glow) and not subject to text-contrast thresholds.

---

*Plan written 2026-06-12 for branch `redesign/v2-gemini`, grounded in the real monorepo paths and tests. Source spec: `docs/design-spec-v2.md`.*

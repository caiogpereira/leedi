import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NAV_ITEMS } from './Sidebar';

// Every sidebar nav link must resolve to a real route — a `page.tsx` under
// `app/(shell)`. Section-root links (e.g. `/agente`, `/conhecimento`,
// `/configuracoes`) only have sub-pages, so they need a redirecting `page.tsx`
// at the root, else clicking the menu item 404s (the F-23 `/relatorios` /
// dead-section-link class). This guard fails the moment a nav href has no route.
const here = dirname(fileURLToPath(import.meta.url));
const SHELL_DIR = join(here, '..', '..', 'app', '(shell)');

function pageFileFor(href: string): string {
  const segments = href.split('/').filter(Boolean); // '/' -> [], '/agente' -> ['agente']
  return join(SHELL_DIR, ...segments, 'page.tsx');
}

describe('Sidebar nav routes', () => {
  it('every nav item href resolves to a (shell) page.tsx', () => {
    const dead = NAV_ITEMS.filter((item) => !existsSync(pageFileFor(item.href))).map(
      (item) => item.href
    );
    expect(dead).toEqual([]);
  });
});

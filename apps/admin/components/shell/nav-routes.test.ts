import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ADMIN_NAV_ITEMS } from './AdminSidebar';

// Every admin sidebar link must resolve to a real route — a `page.tsx` under
// `app/(shell)`. This guards the dead-section-link class (the dashboard hit it
// with /relatorios and /agente|/conhecimento|/configuracoes; the admin hit it
// with /configuracoes). Fails the moment a nav href has no route.
const here = dirname(fileURLToPath(import.meta.url));
const SHELL_DIR = join(here, '..', '..', 'app', '(shell)');

function pageFileFor(href: string): string {
  const segments = href.split('/').filter(Boolean); // '/' -> [], '/clientes' -> ['clientes']
  return join(SHELL_DIR, ...segments, 'page.tsx');
}

describe('AdminSidebar nav routes', () => {
  it('every admin nav item href resolves to a (shell) page.tsx', () => {
    const dead = ADMIN_NAV_ITEMS.filter((item) => !existsSync(pageFileFor(item.href))).map(
      (item) => item.href
    );
    expect(dead).toEqual([]);
  });
});

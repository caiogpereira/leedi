import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHELL_DIR = join(here, '..', '..', 'app', '(shell)');
const ALLOWED = new Set(['layout.tsx']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !ALLOWED.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('(shell) tenant resolution', () => {
  it('no (shell) file (except layout.tsx) imports listUserTenants', () => {
    const offenders = walk(SHELL_DIR).filter((f) =>
      readFileSync(f, 'utf8').includes('listUserTenants')
    );
    expect(offenders.map((f) => f.replace(SHELL_DIR, '(shell)'))).toEqual([]);
  });
});

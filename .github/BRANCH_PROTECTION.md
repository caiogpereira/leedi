# Branch Protection Configuration

To complete Story 1.8 AC #1/#2 ("PR is blocked"), configure these required status checks on `main` in GitHub repo settings:

1. Go to **Settings → Branches → main → Branch protection rules**
2. Enable **Require status checks to pass before merging**
3. Add the following required checks:
   - `Lint`
   - `Typecheck`
   - `Build`
   - `Migration Check`
4. Enable **Require branches to be up to date before merging**

## Deploy Pipeline (NOT PR CI)

Real migrations are applied by the deploy pipeline — not PR CI:

```bash
pnpm --filter @leedi/db migrate:run
```

This runs `src/migrate.ts` against the target DB before new code is activated.
PR CI uses `drizzle-kit check` (offline, no DB connection) to validate migration consistency.

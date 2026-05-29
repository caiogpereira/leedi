# @leedi/config

Environment variable validation package. Validates all env vars at boot using Zod — the app exits immediately if any required variable is missing or malformed.

## How to add a new env var

1. Add the variable to `src/schema.ts` with the appropriate Zod type.
2. Update `.env.example` at the repo root with a placeholder value and comment.
3. The `env` export from `src/index.ts` will automatically include the new field with full TypeScript inference.

## Usage

```ts
import { env } from '@leedi/config';

// env is fully typed and frozen
console.log(env.DATABASE_URL);
```

Never read `process.env` directly outside this package — an ESLint rule enforces this.

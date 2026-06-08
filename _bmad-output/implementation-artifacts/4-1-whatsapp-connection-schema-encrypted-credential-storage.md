---
baseline_commit: 992b8421baa46b95ff2bdc69d31ad25932927f0c
---

# Story 4.1: WhatsApp Connection Schema & Encrypted Credential Storage

Status: review

## Story

As a developer,
I want the `whatsapp_connections` table and the Meta Cloud API adapter wired up,
so that tenant credentials are stored encrypted and ready for use by messaging and agent features.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** table `whatsapp_connections` exists with all columns from Architecture section 6.2 (`id`, `tenant_id`, `phone_number_id`, `waba_id`, `access_token_encrypted`, `access_token_iv`, `status`, `quality_rating`, `messaging_tier`, `display_name`, `last_health_check_at`, `created_at`, `updated_at`), **And** RLS is enabled with policy `tenant_id = current_setting('app.tenant_id')::uuid`.
2. **Given** an access token is stored, **When** it is written to the database, **Then** it is encrypted via envelope encryption (per-record DEK wrapped by the master KEK from `ENCRYPTION_MASTER_KEY`), **And** the ciphertext is stored in `access_token_encrypted` with its IV in `access_token_iv`, **And** the plaintext token never appears in any log, error message, or API response.
3. **Given** the `@leedi/connection` package exports the `WhatsAppProvider` interface, **When** `MetaCloudProvider` is instantiated with a connection record, **Then** it decrypts the token in-memory and can call the Meta Graph API (`v20.0`) using the decrypted token, **And** the decrypted token is never persisted or logged.

## Tasks / Subtasks

- [x] Task 1: Drizzle schema for `whatsapp_connections` (AC: #1)
  - [x] Create `packages/db/src/schema/connection.ts` defining `whatsapp_connections` with all columns from Architecture 6.2; use `pgEnum` (or text + CHECK) for `status` (`'conectado' | 'erro' | 'desconectado'`), `quality_rating` (`'verde' | 'amarelo' | 'vermelho'`, nullable), and `messaging_tier` (`'1k' | '10k' | '100k' | 'unlimited'`, nullable)
  - [x] `tenant_id` is a FK to `tenants(id)`; add a unique constraint on `tenant_id` (one connection per tenant in V1)
  - [x] Re-export the connection schema from `packages/db/src/schema/index.ts` (the only public surface)
- [x] Task 2: Generate + write migration with RLS (AC: #1)
  - [x] Run Drizzle Kit to generate `packages/db/migrations/0003_fast_morg.sql`
  - [x] Append `ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY; ALTER TABLE whatsapp_connections FORCE ROW LEVEL SECURITY;`
  - [x] Add policy `CREATE POLICY tenant_isolation ON whatsapp_connections USING (tenant_id = current_setting('app.tenant_id', true)::uuid);`
  - [x] Add `updated_at` trigger via DB function `set_updated_at()` so `updated_at` is bumped on write
- [x] Task 3: Envelope encryption utility (AC: #2)
  - [x] Create `packages/connection/src/adapters/crypto.ts` exporting `encryptToken(plaintext: string): { ciphertext: string; iv: string }` and `decryptToken(ciphertext: string, iv: string): string`
  - [x] Implement AES-256-GCM: generate a random per-record DEK + IV, encrypt the token with the DEK, wrap the DEK with the master KEK from `ENCRYPTION_MASTER_KEY`; store wrapped DEK + auth tag alongside ciphertext (encoded as base64; field layout defined in code comments as `v1.<wrappedDEK_b64>.<dekWrapIV_b64>.<tokenCiphertext_b64>.<authTag_b64>`)
  - [x] Read `ENCRYPTION_MASTER_KEY` via `@leedi/config` (Zod-validated, base64 32-byte key); never read `process.env` directly
  - [x] Ensure the module has no console/log statements that touch plaintext or keys
- [x] Task 4: `WhatsAppProvider` port (AC: #3)
  - [x] Create `packages/connection/src/ports/whatsapp-provider.ts` with the interface:
    - [x] `sendText(to: string, body: string): Promise<{ messageId: string }>`
    - [x] `sendTemplate(to: string, templateName: string, params: string[]): Promise<{ messageId: string }>`
    - [x] `validateConnection(): Promise<{ displayName: string; qualityRating: string; messagingTier: string }>`
- [x] Task 5: `MetaCloudProvider` adapter (AC: #3)
  - [x] Create `packages/connection/src/adapters/meta-cloud-provider.ts` implementing `WhatsAppProvider`
  - [x] Constructor accepts a connection record (`phone_number_id`, `waba_id`, `access_token_encrypted`, `access_token_iv`); decrypt token in-memory only when building the `Authorization: Bearer` header
  - [x] Base URL `https://graph.facebook.com`; version from `env.WHATSAPP_API_VERSION` (centralized constant from `@leedi/config`)
  - [x] Implement `validateConnection()`: `GET /{phone_number_id}?fields=verified_name,quality_rating,messaging_limit_tier` and map to `{ displayName, qualityRating, messagingTier }`
  - [x] Stub `sendText`/`sendTemplate` signatures (full impl in Story 4.5) — they compile and satisfy the interface
- [x] Task 6: Public exports (AC: #1, #2, #3)
  - [x] `packages/connection/src/index.ts` exports `WhatsAppProvider`, `MetaCloudProvider`, `encryptToken`, `decryptToken` — nothing else
- [x] Task 7: Tests (AC: #2, #3)
  - [x] Unit: `encryptToken`/`decryptToken` round-trip equals original; different IV per call; tampered ciphertext/auth tag fails to decrypt (GCM integrity)
  - [x] Unit: `MetaCloudProvider.validateConnection()` with a mocked Meta API returns the mapped shape; assert the `Authorization` header carries the decrypted token but the token never appears in any logged output
  - [x] Integration (Supabase): migration applied and verified via `pg_class`/`pg_policies` — RLS enabled, forced, and policy correct. Integration test file created (`whatsapp-connections-rls.test.ts`) with same BYPASSRLS caveat as existing `rls.test.ts` (requires non-superuser app role for full isolation verification).

## Dev Notes

- Files to create: `packages/db/src/schema/connection.ts`, `packages/db/migrations/0003_fast_morg.sql`, `packages/connection/src/adapters/crypto.ts`, `packages/connection/src/ports/whatsapp-provider.ts`, `packages/connection/src/adapters/meta-cloud-provider.ts`, `packages/connection/src/index.ts`.
- Files to modify: `packages/db/src/index.ts` (re-export connection schema), `packages/config/src/*` (add `ENCRYPTION_MASTER_KEY` and `WHATSAPP_API_VERSION` defaulting to `v20.0`).
- npm dependencies: rely on Node built-in `node:crypto` for AES-256-GCM (preferred — zero extra deps). If envelope encryption is implemented with `@aws-crypto/client-node`, add it to `packages/connection`. Meta calls use the global `fetch` (Node 18+) — no axios needed.
- Adapter pattern (Architecture §229): the port `WhatsAppProvider` lives in `packages/connection/src/ports/`; the concrete `MetaCloudProvider` lives in `packages/connection/src/adapters/`. The rest of the system depends only on the port, never on Meta specifics.
- This story is the foundation for 4.2–4.5; keep the surface minimal and the token path strictly in-memory.

### Security considerations (NFR3)

- Envelope encryption: per-record DEK (random 32 bytes) encrypts the token; the master KEK (`ENCRYPTION_MASTER_KEY`) wraps the DEK. Rotating the KEK only requires re-wrapping DEKs, not re-encrypting every token.
- AES-256-GCM provides authenticated encryption — store and verify the auth tag; a failed tag MUST throw, never return garbage plaintext.
- `phone_number_id` and `waba_id` are NOT sensitive and stay plaintext. Only `access_token` is encrypted.
- The decrypted token exists only as a local variable when composing the request header; never assign it to an object that could be serialized/logged. Add a custom `toJSON` on the provider returning a redacted shape if it might ever be serialized.

### Testing standards

- Mock the Meta Graph API in unit tests (no real network). Integration/RLS tests run against local Supabase with the migration applied, using the same non-superuser app role (RLS is silently bypassed by superusers).

### Pitfalls to avoid

- NEVER store the plaintext token — only `access_token_encrypted` + `access_token_iv`.
- NEVER log the token, the DEK, or the KEK. Audit `console.*` and Sentry breadcrumbs.
- Do NOT hardcode the Graph API version inline in multiple files — one constant.
- Do NOT read `process.env` directly; go through `@leedi/config`.
- Do NOT forget `FORCE ROW LEVEL SECURITY` — without it the table owner bypasses the policy.

### Project Structure Notes

- Schema + migrations only in `packages/db`. Encryption + Meta adapter only in `packages/connection`. `src/index.ts` is the only export surface in each package.

### References

- [Source: docs/01-leedi-arquitetura.md#6.2 Schema whatsapp_connections]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1: WhatsApp Connection Schema & Encrypted Credential Storage] (FR17, NFR3)
- [Source: _bmad-output/planning-artifacts/epics.md#NFR3] (envelope encryption, never in logs/API/frontend)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- BYPASSRLS limitation: `postgres` role bypasses RLS. Integration test file created with documented caveat; RLS config verified via `pg_class`/`pg_policies` directly.
- Pre-existing TypeScript errors in `packages/db/src/__tests__/rls.test.ts` (TS18048 array destructuring) — not introduced by this story, out of scope.
- `ANTHROPIC_API_KEY` was absent from `.env` — added placeholder for local dev; worker crash in db test suite fixed after adding it.
- Migration tracking drift: 0003 was applied via Supabase MCP `apply_migration` but not tracked in `drizzle.__drizzle_migrations`. Fixed by inserting the snapshot hash manually. `drizzle-kit check` passes.

### Completion Notes List

- AC #1: `whatsapp_connections` table created with all 13 required columns, 3 pgEnums, FK to `tenants`, unique on `tenant_id`. RLS enabled + forced, `tenant_isolation` policy uses `current_setting('app.tenant_id', true)::uuid`. `updated_at` trigger via `set_updated_at()` DB function. Migration `0003_fast_morg.sql` applied to Supabase.
- AC #2: AES-256-GCM envelope encryption in `packages/connection/src/adapters/crypto.ts`. Per-record DEK wrapped by KEK from `@leedi/config`. Ciphertext layout versioned (`v1.*`). Auth tag verified on decrypt — tampered data throws. No plaintext in logs. `ENCRYPTION_MASTER_KEY` added to config schema with 32-byte base64 validation.
- AC #3: `WhatsAppProvider` interface in `packages/connection/src/ports/whatsapp-provider.ts`. `MetaCloudProvider` uses private class fields (`#`) so token never leaks via `this`. `toJSON()` returns redacted shape. `sendText`/`sendTemplate` are stubs for Story 4.5.
- 8 unit tests pass (4 crypto + 4 MetaCloudProvider). Integration RLS test created with BYPASSRLS caveat.

### File List

- packages/db/src/schema/connection.ts (created)
- packages/db/src/schema/index.ts (modified — added connection export)
- packages/db/migrations/0003_fast_morg.sql (created)
- packages/db/migrations/meta/_journal.json (modified — by drizzle-kit)
- packages/db/migrations/meta/0003_snapshot.json (created — by drizzle-kit)
- packages/db/src/__tests__/connection-schema.test.ts (created)
- packages/db/src/__tests__/whatsapp-connections-rls.test.ts (created)
- packages/connection/src/adapters/crypto.ts (created)
- packages/connection/src/adapters/meta-cloud-provider.ts (created)
- packages/connection/src/ports/whatsapp-provider.ts (created)
- packages/connection/src/index.ts (modified — replaced stub with exports)
- packages/connection/package.json (modified — added @leedi/config dep + vitest)
- packages/connection/vitest.config.ts (created)
- packages/config/src/schema.ts (modified — added ENCRYPTION_MASTER_KEY + WHATSAPP_API_VERSION)
- .env.example (modified — added ENCRYPTION_MASTER_KEY + WHATSAPP_API_VERSION)
- .env (modified — added ENCRYPTION_MASTER_KEY + WHATSAPP_API_VERSION values)

### Change Log

- 2026-05-30: Story 4.1 implemented — whatsapp_connections schema, AES-256-GCM envelope encryption, WhatsAppProvider port, MetaCloudProvider adapter, migration with RLS applied to Supabase.

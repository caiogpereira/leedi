# Story 4.1: WhatsApp Connection Schema & Encrypted Credential Storage

Status: ready-for-dev

## Story

As a developer,
I want the `whatsapp_connections` table and the Meta Cloud API adapter wired up,
so that tenant credentials are stored encrypted and ready for use by messaging and agent features.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** table `whatsapp_connections` exists with all columns from Architecture section 6.2 (`id`, `tenant_id`, `phone_number_id`, `waba_id`, `access_token_encrypted`, `access_token_iv`, `status`, `quality_rating`, `messaging_tier`, `display_name`, `last_health_check_at`, `created_at`, `updated_at`), **And** RLS is enabled with policy `tenant_id = current_setting('app.tenant_id')::uuid`.
2. **Given** an access token is stored, **When** it is written to the database, **Then** it is encrypted via envelope encryption (per-record DEK wrapped by the master KEK from `ENCRYPTION_MASTER_KEY`), **And** the ciphertext is stored in `access_token_encrypted` with its IV in `access_token_iv`, **And** the plaintext token never appears in any log, error message, or API response.
3. **Given** the `@leedi/connection` package exports the `WhatsAppProvider` interface, **When** `MetaCloudProvider` is instantiated with a connection record, **Then** it decrypts the token in-memory and can call the Meta Graph API (`v20.0`) using the decrypted token, **And** the decrypted token is never persisted or logged.

## Tasks / Subtasks

- [ ] Task 1: Drizzle schema for `whatsapp_connections` (AC: #1)
  - [ ] Create `packages/db/src/schema/connection.ts` defining `whatsapp_connections` with all columns from Architecture 6.2; use `pgEnum` (or text + CHECK) for `status` (`'conectado' | 'erro' | 'desconectado'`), `quality_rating` (`'verde' | 'amarelo' | 'vermelho'`, nullable), and `messaging_tier` (`'1k' | '10k' | '100k' | 'unlimited'`, nullable)
  - [ ] `tenant_id` is a FK to `tenants(id)`; add a unique constraint on `tenant_id` (one connection per tenant in V1)
  - [ ] Re-export the connection schema from `packages/db/src/index.ts` (the only public surface)
- [ ] Task 2: Generate + write migration with RLS (AC: #1)
  - [ ] Run Drizzle Kit to generate `packages/db/migrations/0001_whatsapp_connections.sql`
  - [ ] Append `ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY; ALTER TABLE whatsapp_connections FORCE ROW LEVEL SECURITY;`
  - [ ] Add policy `CREATE POLICY tenant_isolation ON whatsapp_connections USING (tenant_id = current_setting('app.tenant_id')::uuid);`
  - [ ] Add `updated_at` trigger (or handle in app layer) so `updated_at` is bumped on write
- [ ] Task 3: Envelope encryption utility (AC: #2)
  - [ ] Create `packages/connection/src/adapters/crypto.ts` exporting `encryptToken(plaintext: string): { ciphertext: string; iv: string }` and `decryptToken(ciphertext: string, iv: string): string`
  - [ ] Implement AES-256-GCM: generate a random per-record DEK + IV, encrypt the token with the DEK, wrap the DEK with the master KEK from `ENCRYPTION_MASTER_KEY`; store wrapped DEK + auth tag alongside ciphertext (encode as base64; define the field layout explicitly in code comments)
  - [ ] Read `ENCRYPTION_MASTER_KEY` via `@leedi/config` (Zod-validated, base64 32-byte key); never read `process.env` directly
  - [ ] Ensure the module has no console/log statements that touch plaintext or keys
- [ ] Task 4: `WhatsAppProvider` port (AC: #3)
  - [ ] Create `packages/connection/src/ports/whatsapp-provider.ts` with the interface:
    - [ ] `sendText(to: string, body: string): Promise<{ messageId: string }>`
    - [ ] `sendTemplate(to: string, templateName: string, params: string[]): Promise<{ messageId: string }>`
    - [ ] `validateConnection(): Promise<{ displayName: string; qualityRating: string; messagingTier: string }>`
- [ ] Task 5: `MetaCloudProvider` adapter (AC: #3)
  - [ ] Create `packages/connection/src/adapters/meta-cloud-provider.ts` implementing `WhatsAppProvider`
  - [ ] Constructor accepts a connection record (`phone_number_id`, `waba_id`, `access_token_encrypted`, `access_token_iv`); decrypt token in-memory only when building the `Authorization: Bearer` header
  - [ ] Base URL `https://graph.facebook.com/v20.0/`; centralize the version in one constant
  - [ ] Implement `validateConnection()`: `GET /{phone_number_id}?fields=verified_name,quality_rating,messaging_limit_tier` and map to `{ displayName, qualityRating, messagingTier }`
  - [ ] Stub `sendText`/`sendTemplate` signatures here (full impl in Story 4.5) — they must compile and satisfy the interface
- [ ] Task 6: Public exports (AC: #1, #2, #3)
  - [ ] `packages/connection/src/index.ts` exports `WhatsAppProvider`, `MetaCloudProvider`, `encryptToken`, `decryptToken` — nothing else
- [ ] Task 7: Tests (AC: #2, #3)
  - [ ] Unit: `encryptToken`/`decryptToken` round-trip equals original; different IV per call; tampered ciphertext/auth tag fails to decrypt (GCM integrity)
  - [ ] Unit: `MetaCloudProvider.validateConnection()` with a mocked Meta API returns the mapped shape; assert the `Authorization` header carries the decrypted token but the token never appears in any logged output
  - [ ] Integration (local Supabase): apply migration; insert a connection under `app.tenant_id = A`; confirm RLS hides it under `app.tenant_id = B`

## Dev Notes

- Files to create: `packages/db/src/schema/connection.ts`, `packages/db/migrations/0001_whatsapp_connections.sql`, `packages/connection/src/adapters/crypto.ts`, `packages/connection/src/ports/whatsapp-provider.ts`, `packages/connection/src/adapters/meta-cloud-provider.ts`, `packages/connection/src/index.ts`.
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

### Completion Notes List

### File List

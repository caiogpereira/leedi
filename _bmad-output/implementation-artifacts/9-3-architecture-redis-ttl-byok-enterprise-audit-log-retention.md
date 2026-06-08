---
baseline_commit: 992b842
---

# Story 9.3: Architecture — Redis TTL, BYOK Enterprise & Audit Log Retention

Status: review

## Story

As a developer,
I want the Architecture document to specify Redis key TTL policies, the BYOK enterprise flow, and the audit log retention policy,
so that infrastructure costs stay bounded and enterprise customers have a clear BYOK target.

## Acceptance Criteria

1. **Given** the updated Architecture Redis section in `docs/01-leedi-arquitetura.md`, **When** read, **Then** it specifies TTL for each key type: (a) message buffer / debounce: 30s, (b) distributed lock (`agent_lock:{tenantId}:{leadPhone}`): 300s (5 min), (c) rate-limit windows: 60s, (d) BullMQ job metadata: 7 days (BullMQ default; explicitly called out), (e) playground session: 1,800s (30 min).
2. **Given** the updated Architecture — a new "Enterprise — BYOK (Bring Your Own Key)" section, **When** read, **Then** it describes: (a) the tenant provides their own Anthropic API key via the tenant settings panel, (b) it is stored encrypted (same envelope encryption as WhatsApp tokens), (c) the AI provider adapter in `@leedi/agent` checks for `agent_config.byok_key` and uses it as an override if present, (d) this feature is gated to the Enterprise plan.
3. **Given** the updated Architecture Audit Log section, **When** read, **Then** it specifies: (a) hot storage: 90 days in Supabase (`audit_logs` table), (b) cold archival procedure: export to S3-compatible storage (Supabase Storage or external) on a monthly cron, (c) deletion schedule: archive after 90 days, delete hot rows after archival, (d) super-admin can export audit log for a tenant as CSV for compliance requests.
4. **Given** the updated document, **When** the Redis section is read, **Then** there is a note on the playground session key pattern: `playground:{tenantId}:{sessionId}` with a 30-min TTL (matching Story 8.1 dev notes).

## Tasks / Subtasks

- [x] Task 1: Update or create Redis TTL policy section in Architecture (AC: #1, #4)
  - [x] Locate the Redis / Upstash section in `docs/01-leedi-arquitetura.md`
  - [x] Add a "Política de TTL de Chaves Redis" subsection (or add to existing section)
  - [x] List all key types with their TTL values per AC #1 and AC #4
  - [x] Confirm the values match what is documented in Stories 7.2 (lock TTL), 4.4 (debounce TTL), 8.1 (playground TTL)
- [x] Task 2: Add BYOK Enterprise section (AC: #2)
  - [x] Create a new subsection in `docs/01-leedi-arquitetura.md` — suggest placing after the AI/Agent section (§7 or §8)
  - [x] Title: "Enterprise — BYOK (Bring Your Own Key)"
  - [x] Content per AC #2: storage (encrypted), adapter override logic, plan gate
  - [x] Add a note that `agent_configs` table needs a `byok_key_encrypted` nullable column (null = use platform key) — this column does NOT need to be added now (future epic), but is documented as the target schema
- [x] Task 3: Add Audit Log retention policy (AC: #3)
  - [x] Locate the `audit_logs` table definition in `docs/01-leedi-arquitetura.md`
  - [x] Add a "Retenção do Audit Log" block after the table definition
  - [x] Content per AC #3: 90-day hot, monthly cron archival to cold storage, deletion after archival, CSV export for compliance

## Dev Notes

- Documentation story. No code, no migrations.
- Files to modify: `docs/01-leedi-arquitetura.md` only.
- The BYOK column (`byok_key_encrypted`) is documented as a future target — do NOT create a migration in this story.
- Redis TTL values must match the implementation notes in Stories 4.4, 7.2, and 8.1 exactly; if there is a conflict, document the discrepancy in the story's Completion Notes and flag for resolution.

### Testing standards

- Manual verification: read the updated sections and confirm each AC item is covered.

### Pitfalls to avoid

- Do NOT add BYOK UI to this story — documentation only.
- Do NOT create a migration for `byok_key_encrypted` — document only.
- Do NOT change existing Redis configuration decisions — only add TTL policy documentation.

### References

- [Source: docs/01-leedi-arquitetura.md#3 Stack tecnológica (Redis section)]
- [Source: docs/01-leedi-arquitetura.md#6.1 Tenancy schema (audit_logs)]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.3]
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (lock TTL = 5 min / 300s)
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (debounce = 6s, not 30s — debounce timer is 6s; the Redis buffer key TTL is 30s)
- [Source: _bmad-output/implementation-artifacts/8-1-playground-chat-interface.md] (playground session TTL = 30 min)
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-29.md] (gap items A3, A4, A5)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- §9.7 (Redis TTL table) already satisfied all AC #1 and AC #4 sub-clauses: debounce 30s, lock 300s, rate-limit 60s, BullMQ 7 days, playground 1800s, key `playground:{tenantId}:{sessionId}` — verified, no changes needed.
- §9.8 (BYOK) already fully satisfied AC #2: both sections 9.8.1 (data encryption) and 9.8.2 (AI key) present, covering encrypted storage, adapter override logic, plan gate, and byok_key_encrypted schema note — verified, no changes needed.
- §9.9 (Audit Log) had AC #3(b) gap: "monthly cron" was described as a pre-deletion backup, not a scheduled process. Added explicit monthly cron procedure with JSONL partitioning and S3 upload. Also added AC #3(d) CSV export for super-admin compliance — added download mechanism in admin panel.

### File List

- docs/01-leedi-arquitetura.md

### Change Log

- Updated §9.9 retention to explicitly specify monthly cron archival procedure (day 1 of each month, JSONL to S3) (2026-06-02)
- Added CSV export capability for super-admin audit log compliance requests (2026-06-02)

---
baseline_commit: 9ea8a05
---

# Story 9.1: PRD — NFRs, Success Metrics & LGPD Requirements

Status: review

## Story

As a product manager and developer,
I want the PRD to contain explicit, measurable NFRs (latency, uptime, throughput), product success KPIs, and a complete LGPD compliance section,
so that implementation decisions are grounded in measurable targets and legal obligations.

## Acceptance Criteria

1. **Given** the updated `docs/02-leedi-prd.md` section 5.5 (Requisitos Não-Funcionais), **When** a developer reads it, **Then** it explicitly states: (a) agent response latency target as P95 < 800ms measured from message receipt to first segment sent, (b) platform availability SLA as 99.9% uptime, (c) maximum concurrent dispatch throughput of 1,000 messages/minute per tenant (respecting Meta tier), and (d) RTO < 15 min and RPO < 1 min.
2. **Given** section 5.6 (Métricas de Sucesso do Produto), **When** a developer reads it, **Then** it includes at minimum: (a) time-to-first-sale target for a new tenant using the wizard (< 72h from account creation to first agent-assisted sale), (b) sustainable AI cost ceiling per conversation (< 20% of average ticket), and (c) minimum conversion rate improvement target (> 10% with agent vs 3–5% without).
3. **Given** section 5.7 (Conformidade Regulatória — LGPD), **When** a developer reads it, **Then** it explicitly defines: (a) Leedi's role as Data Processor and tenant as Data Controller, (b) opt-out implementation requirement (all flows), (c) data retention limit for conversation logs (1 year hot storage then archive/delete), and (d) data subject rights procedure (how a tenant honors a deletion request via the platform).
4. **Given** section 5.7, **When** looking for a gap that existed at project kickoff, **Then** the section now includes a note on the **right to data portability** — tenants must be able to export their lead data in a structured format (CSV) for compliance — even if the export feature ships in a later epic.
5. **Given** any existing content in sections 5.5, 5.6, or 5.7 that conflicts with the above, **When** updated, **Then** the conflicting content is reconciled (no contradictions between sections).

## Tasks / Subtasks

- [x] Task 1: Review current state of sections 5.5, 5.6, 5.7 in `docs/02-leedi-prd.md` against the ACs
  - [x] Read the full text of sections 5.5, 5.6, and 5.7
  - [x] Mark each AC item as already-present or missing
  - [x] Do NOT rewrite sections wholesale — only add missing items, correct conflicts
- [x] Task 2: Update section 5.5 — NFR gaps (AC: #1)
  - [x] Confirm latency target "P95 < 800ms from message receipt to first segment sent" is explicit (not just "< 800ms")
  - [x] Confirm 99.9% uptime SLA is stated
  - [x] Confirm 1,000 msg/min throughput is stated
  - [x] Confirm RTO < 15min and RPO < 1min are stated
  - [x] Add any missing items; do not remove existing content that is consistent
- [x] Task 3: Update section 5.6 — Success Metrics gaps (AC: #2)
  - [x] Confirm time-to-first-sale target for new tenant is stated (suggest: < 72h from account creation)
  - [x] Confirm AI cost ceiling per conversation is stated (< 20% of average ticket)
  - [x] Confirm conversion rate improvement target is stated (> 10% vs 3–5% baseline)
  - [x] Add any missing items
- [x] Task 4: Update section 5.7 — LGPD gaps (AC: #3, #4)
  - [x] Confirm Leedi = Data Processor, tenant = Data Controller is explicitly stated
  - [x] Confirm opt-out requirement covers all contact flows (dispatch, agent, follow-up)
  - [x] Confirm data retention limit for conversations (1 year hot, then archive/delete)
  - [x] Confirm data subject rights procedure: how does a tenant honor a lead deletion request using the platform?
  - [x] Add portability note: tenant must be able to export lead data as CSV (even if feature ships later)
  - [x] Add any missing items
- [x] Task 5: Cross-check for conflicts (AC: #5)
  - [x] Scan sections 5.5, 5.6, 5.7 for any contradictions introduced by the edits
  - [x] Confirm no duplicate definitions between sections

## Dev Notes

- This is a documentation story. No code, no migrations, no packages.
- Files to modify: `docs/02-leedi-prd.md` (sections 5.5, 5.6, 5.7 only).
- Do NOT change the story numbering, module numbering, or any section outside 5.5–5.7.
- Editing style: keep the existing Portuguese-BR voice and bullet-point style of the PRD. New items should match the existing format.
- "Verification" for this story = opening the file and confirming each AC item is present by reading the section text — no automated test is possible.

### Testing standards

- Manual verification: read sections 5.5, 5.6, and 5.7 after edits and confirm each AC point is explicitly covered.
- Peer review: another team member reads the updated sections and confirms no new contradictions.

### Pitfalls to avoid

- Do NOT rewrite entire sections — the PRD is an approved document; only add or correct.
- Do NOT introduce technical jargon that contradicts the existing plain-language style of the PRD.
- Do NOT change the MÓDULO numbering or move content between sections.

### References

- [Source: docs/02-leedi-prd.md#5.5 Requisitos Não-Funcionais]
- [Source: docs/02-leedi-prd.md#5.6 Métricas de Sucesso do Produto]
- [Source: docs/02-leedi-prd.md#5.7 Conformidade Regulatória (LGPD)]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.1]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-29.md] (gap items P1, P2, P3)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- §5.5 already satisfied all AC #1 sub-clauses (P95 latency, uptime, throughput, RTO/RPO) — verified, no changes needed.
- §5.6 was missing AC #2(a): added KPI #6 "Tempo para primeira venda de um tenant novo (< 72h desde criação da conta)".
- §5.7 AC #3(b) gap: expanded opt-out list to explicitly cover ALL contact flows (agent, follow-up, reengagement, dispatch). AC #3(c) and (d) already present (retention + data subject rights under tenant responsibilities). Enhanced with explicit "Direitos do Titular" table showing the platform mechanism for each LGPD right. AC #4 portability note added with explicit CSV export reference (LGPD Art. 18, VI).
- No conflicts found in cross-check.

### File List

- docs/02-leedi-prd.md

### Change Log

- Added KPI #6 (time-to-first-sale < 72h) to §5.6 (2026-06-02)
- Expanded §5.7 opt-out to cover all flows: agent, follow-up, reengagement, dispatch (2026-06-02)
- Added "Direitos do Titular" table with platform mechanism for each LGPD right (2026-06-02)
- Added portability note (LGPD Art. 18 VI) and CSV export reference in §5.7 (2026-06-02)

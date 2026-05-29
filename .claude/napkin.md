# Napkin Runbook

## Curation Rules

- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)

1. **[2026-05-28] Backend framework is Hono (confirmed)**
   Do instead: Use Hono for `apps/api`. Do not switch to Fastify. Edge-ready, Vercel-compatible.

2. **[2026-05-28] Validate docs before generating epics/stories**
   Do instead: Always run validation pass (PRD + Architecture + Execution) before invoking `bmad-create-epics-and-stories`. Check cross-document coherence, NFRs, and open decisions.

## Architecture Guardrails

1. **[2026-05-28] Never import domain internals — only public interface**
   Do instead: All inter-domain imports must go through `@leedi/<domain>` (the `index.ts` barrel). Never import from `packages/<domain>/src/use-cases/...` directly.

2. **[2026-05-28] Every tenant table needs RLS**
   Do instead: Every table with `tenant_id` must have a RLS policy. Add to Definition of Done checklist on every module.

3. **[2026-05-28] Access tokens/secrets are always encrypted at rest**
   Do instead: `access_token_encrypted` and gateway secrets use envelope encryption. Never store plaintext. Never log or expose in API responses.

4. **[2026-05-28] Prompt caching is mandatory, not optional**
   Do instead: Structure agent calls so the stable system prompt (persona + method + product) is the cacheable prefix. Variable content (new message) always comes last.

## User Directives

1. **[2026-05-28] Chat always in Portuguese-BR**
   Do instead: All conversational replies to Caio in pt-BR. Switch to English only for documentation files, code comments, and docstrings.

2. **[2026-05-28] Documentation always in English**
   Do instead: README, ADRs, inline code comments, and spec files written in English even when chat is in pt-BR.

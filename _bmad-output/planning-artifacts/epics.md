---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - docs/02-leedi-prd.md
  - docs/01-leedi-arquitetura.md
  - docs/03-leedi-execucao.md
---

# Leedi - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Leedi, decomposing the requirements from the PRD, Architecture, and Execution Plan into implementable stories.

## Requirements Inventory

### Functional Requirements

<!-- Module 1 â€” Auth & Tenancy -->

FR1: User can sign up and log in with email + password via Better-Auth
FR2: User can recover password via email (Resend)
FR3: Sessions persist across browser refreshes; user can log out
FR4: A user belongs to one or more tenants, each with a role (owner/admin/operator/viewer)
FR5: A user belonging to multiple tenants can switch between them via a menu
FR6: Owner or admin can invite a user to the tenant by email with a specified role
FR7: Invited user receives email link, accepts, creates password, and enters tenant with assigned role
FR8: Super-admin can access the workspace and impersonate any tenant (logged in audit)
FR9: RBAC restricts actions per role as defined in the permissions table

<!-- Module 2 â€” Onboarding -->

FR10: New tenant setup wizard with 5 steps, saveable and resumable at any step
FR11: Step 1 â€” Company name, logo, segment, optional custom colors
FR12: Step 2 â€” Guided WhatsApp setup with checklist + videos; fields for phone_number_id, waba_id, access_token; system validates connection
FR13: Step 3 â€” Gateway connection: choose Hotmart, system generates webhook URL, client pastes in Hotmart, system confirms reception of test event
FR14: Step 4 â€” Agent configuration: name, persona (with âœ¨), sales method, initial products
FR15: Step 5 â€” Playground test (Module 8) simulating a lead
FR16: On wizard completion, tenant status becomes "active" and agent is configured

<!-- Module 3 â€” WhatsApp Connection -->

FR17: Connect tenant number to Meta Cloud API (direct, no BSP)
FR18: Display connection status (connected/error/disconnected) in dashboard
FR19: Display quality rating (green/yellow/red) from Meta
FR20: Display messaging tier (1k/10k/100k/unlimited/day)
FR21: Receive inbound messages via Meta webhook and route to agent
FR22: Send outbound messages (text, media, template) via Meta Cloud API
FR23: WhatsApp number already in use on personal/Business app can connect (coexistence)

<!-- Module 4 â€” AI Agent -->

FR24: Configure agent name (e.g., Mari, Sofia)
FR25: Configure agent persona with AI improvement button (âœ¨)
FR26: Configure message style (length, formality, emoji usage)
FR27: Configure conversation limits (what not to say)
FR28: Select sales method (SPIN/AIDA/Storytelling/Free)
FR29: Toggle agent tools per tenant (human transfer, follow-up, knowledge base, auto-tag, re-engagement)
FR30: Select AI model per plan (Sonnet default, Opus for enterprise)
FR31: Agent processes inbound messages via Claude Agent SDK with tools
FR32: Agent identifies returning vs new leads and adapts approach accordingly
FR33: Agent qualifies leads by mapping data during conversation
FR34: Agent decides correct offer (main/downsell/upsell) based on lead eligibility and active campaign
FR35: Agent handles objections by consulting knowledge base
FR36: Agent decides when to transfer to human
FR37: Agent understands images received from lead
FR38: Agent transcribes audio received from lead and responds coherently
FR39: Agent splits long responses into multiple natural messages
FR40: Prompt caching applied â€” stable system prompt (persona + method + product) is cacheable prefix

<!-- Module 5 â€” Knowledge -->

FR41: CRUD for products: name, description, price, installments, checkout link, type (main/downsell/upsell/orderbump)
FR42: Sales arguments list per product with AI improvement button
FR43: Differentials, social proofs, guarantee, bonuses per product with AI improvement
FR44: Gateway product ID binding (to match with webhook events)
FR45: FAQ management: question + answer with AI improvement button
FR46: Objection + counter management by category with AI improvement button
FR47: Knowledge base text search by category/keyword (V1)

<!-- Module 6 â€” Campaigns -->

FR48: Campaign CRUD: name, product, type (launch/downsell/evergreen), dates
FR49: Phase management per campaign: warmup, open_cart, downsell, closed
FR50: Urgency and key-message configuration per phase
FR51: Phase transition (cartâ†’downsell): manual trigger or scheduled by date
FR52: Campaign activate/pause; active campaign defines what agent offers

<!-- Module 7 â€” Sales Methods -->

FR53: 4 pre-configured global sales methods: SPIN, AIDA, Storytelling, Free
FR54: Each method has a quality system_prompt_template and ordered phases array
FR55: Agent system prompt merges selected method + persona + active product

<!-- Module 8 â€” Playground -->

FR56: In-dashboard chat interface for tenant to test agent as if they were a lead
FR57: Playground uses current agent config (persona, method, product, selected campaign)
FR58: Playground allows simulating scenarios: new lead, returning lead, lead with objection
FR59: Playground shows tool calls made by agent (transparency)
FR60: Playground sends no real WhatsApp messages and does not count usage

<!-- Module 9 â€” Meta Templates -->

FR61: Template builder: header, body, footer, buttons, variables ({{1}}, {{2}})
FR62: Template category selection: marketing/utility/authentication
FR63: Template submission to Meta via Graph API
FR64: Template status tracking: draft/pending/approved/rejected with rejection reason
FR65: Template status updates via Meta webhook (approve/reject)
FR66: Suggested template library by occasion (welcome, abandoned-cart-1h/6h/24h, last-call, post-purchase, re-engagement, event-reminder)
FR67: User can add from library, customize, and submit
FR68: AI improvement button on all template text fields

<!-- Module 10 â€” Dispatcher -->

FR69: Create dispatch with segment filters (bought_x, did_not_buy, tag, origin, capture_date)
FR70: Select approved template and target segment for dispatch
FR71: Schedule dispatch (optimal 9h-21h local time or custom)
FR72: Throttling respects Meta messaging tier (rate interval between messages)
FR73: Automatic exclusion filters: already bought, opted out, has active conversation
FR74: Dispatch tracking: sent, delivered, responded, failed
FR75: Automatic dispatch rules: trigger (abandoned_cart, no_response_48h, offer_end_24h) + time window + template
FR76: Agent can trigger re-engagement (tool: solicitar_reengajamento)
FR77: Agent can schedule follow-up within open 24h window (tool: agendar_followup) â€” free message, no template cost
FR78: If 24h window closed, re-engagement falls back to approved template

<!-- Module 11 â€” Inbox -->

FR79: Real-time conversation list showing status: bot, awaiting_human, in_progress, resolved
FR80: Open conversation shows full message history
FR81: AI handoff summary panel: who lead is, what they want, objections, temperature, reason for transfer, suggested response
FR82: Agent pauses when human takes over conversation
FR83: Human response sent to lead via WhatsApp
FR84: "Return to bot" reactivates agent for that lead
FR85: Filter conversations by temperature, status, tag
FR86: Notification triggered when lead requests human

<!-- Module 12 â€” Leads -->

FR87: Lead list with filters: temperature, origin, status, tag, purchased
FR88: Lead detail page: data, journey timeline, tags, conversations, purchases
FR89: CSV import: phone (required), name, email; duplicates by phone ignored
FR90: Manual tags and auto-tags added by agent
FR91: Manual and automatic opt-out; opted-out leads never contacted again

<!-- Module 13 â€” Gateway -->

FR92: Hotmart webhook receiver with signature validation and event normalization
FR93: Process canonical events: purchase_approved, purchase_refused, purchase_cancelled, purchase_refunded, chargeback, cart_abandoned, subscription_started, subscription_cancelled, subscription_delayed, boleto_generated, pix_generated
FR94: Purchase approved â†’ mark lead as buyer; agent stops offering product
FR95: Cart abandoned / boleto / pix generated â†’ activate recovery flow
FR96: Cancellation/refund â†’ revert lead purchase status
FR97: All gateway events are idempotent (processed twice = no duplicate effect)

<!-- Module 14 â€” Billing -->

FR98: Asaas integration: create customer and recurring subscription (PIX/card/boleto)
FR99: Plans: Starter R$697/mo, Pro R$1,497/mo, Enterprise (custom)
FR100: Asaas payment webhook â†’ unlock or lock tenant access
FR101: Gradual lockdown: >3 days overdue â†’ block sending features; >7 days â†’ full block (agent off, data preserved, "regularize payment" notice)
FR102: Tenant billing panel: current plan, invoices, status, next due date

<!-- Module 15 â€” Usage -->

FR103: Count conversations per period (1 conversation = 1 billable 24h window)
FR104: Usage panel: "Used X of Y conversations (Z%)" + bar + history
FR105: Alerts at 80%, 95%, and 100% of plan limit
FR106: Overage at R$0.30/additional conversation; service continues uninterrupted
FR107: Configurable: "block at limit" (default OFF), "notify each R$100 overage" (default ON)
FR108: AI cost per tenant visible only to super-admin

<!-- Module 16 â€” Notifications -->

FR109: Web push + email notifications via Resend
FR110: Notification events: sale_approved, lead_requested_human, template_rejected, quality_dropping, account_blocked, dispatch_completed, usage_alert
FR111: Per-user notification preferences: which events, which channels (push/email)
FR112: Transactional emails with React Email templates from noreply@

<!-- Module 17 â€” Tenant Dashboard -->

FR113: Conversations started metric
FR114: Response rate metric
FR115: Conversions (sales attributed to agent) metric
FR116: Average ticket metric
FR117: ROI (revenue vs estimated AI cost) metric
FR118: Total sales value metric
FR119: Most frequent objections aggregated from conversations
FR120: Plan conversation usage widget (links to Module 15)
FR121: Number health widget (quality rating + tier from Module 3)
FR122: Active campaigns status overview

<!-- Module 18 â€” Super-Admin -->

FR123: MRR display (monthly recurring revenue)
FR124: Month revenue: received vs projected
FR125: Receivables: open invoices with due dates
FR126: Delinquents: tenant name, days overdue, value
FR127: Churn metric for period
FR128: Tenant list with statuses (active/blocked/trial/cancelled) and financial status
FR129: New tenants count and net growth for period
FR130: Aggregate total conversations across all tenants
FR131: Aggregate AI cost crossed with revenue to show real margin
FR132: Tenants near usage limit (upsell opportunity flag)
FR133: Tenants with quality rating dropping (churn risk flag)
FR134: Create tenant (assisted onboarding)
FR135: Impersonate tenant (logged in audit_log)
FR136: Manual block/unblock tenant
FR137: Force-release tenant (for alternative payment arranged outside Asaas)
FR138: Financial history per tenant

### NonFunctional Requirements

NFR1: Multi-tenant data isolation enforced via PostgreSQL RLS â€” even with application bug, data must not leak between tenants
NFR2: RBAC strictly enforces role permissions: owner/admin/operator/viewer in tenant; super_admin/support in workspace
NFR3: WhatsApp access tokens, gateway secrets, and Asaas keys encrypted at rest using envelope encryption; never appear in logs, API responses, or frontend
NFR4: All webhook endpoints are idempotent â€” processing the same event twice produces no duplicate effect
NFR5: Dispatch throttling must respect Meta messaging tier limits at all times
NFR6: When quality rating drops, dispatch pauses automatically and tenant is alerted
NFR7: Prompt caching must be active for all agent sales conversations (up to 90% cost reduction on stable system prompt)
NFR8: All API endpoints rate-limited per tenant (Redis)
NFR9: Distributed lock (Redis) prevents the same conversation being processed in parallel
NFR10: LGPD compliance: opt-out leads never contacted; data deletion on request; tenant is controller, Leedi is processor
NFR11: WCAG AA minimum contrast across all UI components
NFR12: Full keyboard navigation support
NFR13: All form fields have accessible labels (shadcn/ui base)
NFR14: Dark/light theme available from V0; respects system preference
NFR15: UI in plain Portuguese-BR, no technical jargon for tenant users; error messages explain what to do
NFR16: Environment variables validated with Zod at application boot â€” app does not start with missing config
NFR17: Structured logs carry request_id, tenant_id, and user_id in every entry
NFR18: Application exceptions tracked with Sentry with tenant context
NFR19: Deployment migrations (Drizzle) applied before new code goes live; rollback to previous version must not break existing schema

### Additional Requirements

- **Monorepo structure**: Turborepo + pnpm workspaces exactly as defined in Architecture section 4. Every domain is a `packages/<domain>` package with `src/index.ts` as the only public export boundary.
- **TypeScript strict mode** throughout all packages and apps. No `any` unless explicitly justified.
- **Domain isolation contract**: No package imports internal paths from another package (only `@leedi/<domain>` imports). Verified by lint rules.
- **Use-case layer mandatory**: Every DB write goes through a use case in `src/use-cases/`. No raw queries in route handlers.
- **Feature flags**: Every module has a feature flag (per-tenant and per-environment) to enable gradual rollout and emergency disable.
- **Hono** is the confirmed backend framework for `apps/api` (edge-ready, Vercel-compatible). Decision finalized 2026-05-28.
- **Better-Auth** for authentication (self-hosted, no per-user cost, supports organizations/multi-tenant, RBAC).
- **Drizzle ORM**: type-safe, SQL-transparent migrations. Schema lives in `packages/db`.
- **BullMQ over Upstash Redis**: dispatch jobs, follow-ups, scheduled jobs, retry with DLQ strategy.
- **Message and agent_threads/agent_messages tables partitioned by month** (Postgres range partitioning).
- **Agent memory isolation**: `agent_threads`, `agent_messages`, `agent_tool_calls` tables accessed ONLY through `@leedi/agent-memory`. No other module touches them.
- **Model routing**: Sonnet for sales conversations; Haiku for classification, tagging, summarization, and âœ¨ AI text improvement; Opus only in Enterprise plan.
- **Adapter pattern** for all external integrations (WhatsApp, Gateway, Payment, AI, Email) â€” port interface in domain, concrete adapter in `adapters/` folder.
- **Sales methods seeded globally**: SPIN, AIDA, Storytelling, Free are `is_global=true` seed data.
- **React Email + Resend** for transactional emails.
- **PostHog** for product analytics (onboarding funnels, feature usage).
- **Sentry** for exception tracking.
- **Better Stack or Axiom** for structured logs.
- **i18n with next-intl**: all UI strings via i18n, not hardcoded â€” pt-BR only now, prepared for others.
- **Supabase Cloud** for PostgreSQL (RLS native, pgvector extension for V2 RAG).
- **Upstash Redis** for BullMQ, rate limiting, distributed locks, message buffer.
- **Vercel** for hosting all Next.js apps and Hono API.
- **Meta webhook validation**: X-Hub-Signature-256 on every inbound webhook.
- **Hotmart webhook validation**: signature/hottok on every inbound webhook.
- **Asaas webhook validation**: token on every inbound webhook.
- **Message buffer on Redis**: debounce of ~6 seconds to aggregate rapid sequential messages from same lead before invoking agent.

### UX Design Requirements

UX-DR1: Design token system with named tokens (not hex values in code): neutral-50â†’950 (12 neutral gray tones), indigo primary (10 tones with hover/active/disabled states), accent-AI violet (ONLY on AI action badges/indicators), semantic colors (success/warning/error/info), WhatsApp green ONLY on channel icon and "connect number" button
UX-DR2: Dark/light theme support from V0 launch â€” toggle in app header + system preference detection. Dark mode base is off-black (not #000 pure), indigo gains luminosity for legibility
UX-DR3: AIAssistedTextarea component: every long text field (persona, arguments, objections, template body) has "âœ¨ Melhorar com IA" button â†’ modal with original vs AI suggestion side-by-side â†’ user accepts or edits
UX-DR4: AI action visual indicator using violet accent â€” whenever AI is actively generating (improving text, summarizing handoff, classifying) a visible indicator shows. User always knows when AI is acting.
UX-DR5: Spacious layout by default with "compact mode" toggle for power users
UX-DR6: All error messages explain what the user should DO next â€” not just what went wrong
UX-DR7: WCAG AA contrast minimum on all color combinations in both light and dark themes
UX-DR8: Complete keyboard navigation for all interactive elements
UX-DR9: UI copy in plain Portuguese-BR for tenant-facing apps (dashboard); no technical jargon; admin panel may use more technical language

### FR Coverage Map

FR1: Epic 2 - User signup/login via Better-Auth
FR2: Epic 2 - Password recovery via email
FR3: Epic 2 - Persistent sessions + logout
FR4: Epic 2 - User belongs to tenant(s) with roles
FR5: Epic 2 - Tenant switching for multi-tenant users
FR6: Epic 2 - Owner/admin invites user by email with role
FR7: Epic 2 - Invited user accepts, creates password, enters tenant
FR8: Epic 2 - Super-admin workspace access + impersonation
FR9: Epic 2 - RBAC enforces role permissions
FR10: Epic 19 - Onboarding wizard 5-step saveable/resumable
FR11: Epic 19 - Step 1: company data
FR12: Epic 19 - Step 2: WhatsApp connection setup with validation
FR13: Epic 19 - Step 3: Hotmart gateway connection + test event
FR14: Epic 19 - Step 4: agent configuration in wizard
FR15: Epic 19 - Step 5: playground test
FR16: Epic 19 - Wizard completion sets tenant active
FR17: Epic 4 - Meta Cloud API connection (direct)
FR18: Epic 4 - Connection status display
FR19: Epic 4 - Quality rating display
FR20: Epic 4 - Messaging tier display
FR21: Epic 4 - Inbound webhook message reception
FR22: Epic 4 - Outbound message sending
FR23: Epic 4 - Coexistence with existing WhatsApp account
FR24: Epic 7 - Agent name configuration
FR25: Epic 7 - Agent persona with AI improvement
FR26: Epic 7 - Message style configuration
FR27: Epic 7 - Conversation limits configuration
FR28: Epic 7 - Sales method selection
FR29: Epic 7 - Tool toggles per tenant
FR30: Epic 7 - AI model selection per plan
FR31: Epic 7 - Agent processes messages via Agent SDK + tools
FR32: Epic 7 - Returning vs new lead identification
FR33: Epic 7 - Lead qualification mapping
FR34: Epic 7 - Correct offer decision (main/downsell/upsell)
FR35: Epic 7 - Objection handling via knowledge base
FR36: Epic 7 - Human transfer decision
FR37: Epic 7 - Image understanding
FR38: Epic 7 - Audio transcription and response
FR39: Epic 7 - Natural message splitting
FR40: Epic 7 - Prompt caching for stable system prompt
FR41: Epic 6 - Product CRUD
FR42: Epic 6 - Sales arguments with AI improvement
FR43: Epic 6 - Differentials, social proofs, guarantee, bonuses
FR44: Epic 6 - Gateway product ID binding
FR45: Epic 6 - FAQ management with AI improvement
FR46: Epic 6 - Objection + counter management
FR47: Epic 6 - Knowledge base text search by category/keyword
FR48: Epic 10 - Campaign CRUD
FR49: Epic 10 - Phase management (warmup/open_cart/downsell/closed)
FR50: Epic 10 - Urgency and key-message config per phase
FR51: Epic 10 - Phase transition manual or scheduled
FR52: Epic 10 - Campaign activate/pause
FR53: Epic 6 - 4 pre-configured global sales methods
FR54: Epic 6 - Each method has system_prompt_template + phases
FR55: Epic 6 - Agent system prompt merges method + persona + product
FR56: Epic 8 - In-dashboard chat for testing agent
FR57: Epic 8 - Playground uses current agent config
FR58: Epic 8 - Simulate new lead, returning lead, lead with objection
FR59: Epic 8 - Shows tool calls (transparency)
FR60: Epic 8 - No real messages, no usage counting
FR61: Epic 12 - Template builder (header/body/footer/buttons/variables)
FR62: Epic 12 - Template category selection
FR63: Epic 12 - Template submission to Meta via Graph API
FR64: Epic 12 - Template status tracking + rejection reason
FR65: Epic 12 - Status updates via Meta webhook
FR66: Epic 12 - Suggested template library by occasion
FR67: Epic 12 - Add from library, customize, submit
FR68: Epic 12 - AI improvement button on template text fields
FR69: Epic 13 - Segmented manual dispatch with filters
FR70: Epic 13 - Select template and segment for dispatch
FR71: Epic 13 - Schedule dispatch (optimal or custom hours)
FR72: Epic 13 - Throttling respects Meta messaging tier
FR73: Epic 13 - Automatic exclusion filters
FR74: Epic 13 - Dispatch tracking (sent/delivered/responded/failed)
FR75: Epic 13 - Automatic dispatch rules by trigger
FR76: Epic 13 - Agent-triggered re-engagement tool
FR77: Epic 13 - 24h window follow-up (free message)
FR78: Epic 13 - Fallback to template when 24h window closed
FR79: Epic 14 - Real-time conversation list with status
FR80: Epic 14 - Full conversation history view
FR81: Epic 14 - AI handoff summary panel
FR82: Epic 14 - Agent pauses on human takeover
FR83: Epic 14 - Manual response via WhatsApp
FR84: Epic 14 - Return to bot reactivates agent
FR85: Epic 14 - Filter conversations by temperature/status/tag
FR86: Epic 14 - Notification when lead requests human
FR87: Epic 5 - Lead list with filters
FR88: Epic 5 - Lead detail: data + journey timeline + tags + purchases
FR89: Epic 5 - CSV import (phone required, deduplication)
FR90: Epic 5 - Manual and auto-tags
FR91: Epic 5 - Opt-out management
FR92: Epic 11 - Hotmart webhook receiver + validation + normalization
FR93: Epic 11 - Canonical events processing (12 event types)
FR94: Epic 11 - Purchase approved marks lead as buyer
FR95: Epic 11 - Abandoned cart / boleto / pix recovery activation
FR96: Epic 11 - Cancellation/refund reverts lead status
FR97: Epic 11 - Idempotent event processing
FR98: Epic 17 - Asaas integration (customer + recurring subscription)
FR99: Epic 17 - Plans: Starter R$697 / Pro R$1,497 / Enterprise
FR100: Epic 17 - Payment webhook â†’ tenant unlock/lock
FR101: Epic 17 - Gradual lockdown (3 days â†’ block sending; 7 days â†’ full block)
FR102: Epic 17 - Tenant billing panel
FR103: Epic 16 - Conversation count (1 conversation = 1 billable 24h window)
FR104: Epic 16 - Usage panel with bar + history
FR105: Epic 16 - Alerts at 80%, 95%, 100% of limit
FR106: Epic 16 - Overage at R$0.30/conversation, service uninterrupted
FR107: Epic 16 - Configurable block-at-limit and overage notification
FR108: Epic 16 - AI cost per tenant visible to super-admin only
FR109: Epic 18 - Web push + email notifications via Resend
FR110: Epic 18 - 8 notification event types
FR111: Epic 18 - Per-user notification preferences (events + channels)
FR112: Epic 18 - Transactional emails with React Email templates
FR113: Epic 15 - Conversations started metric
FR114: Epic 15 - Response rate metric
FR115: Epic 15 - Conversions (attributed sales)
FR116: Epic 15 - Average ticket metric
FR117: Epic 15 - ROI metric
FR118: Epic 15 - Total sales value metric
FR119: Epic 15 - Most frequent objections aggregated
FR120: Epic 15 - Plan conversation usage widget
FR121: Epic 15 - Number health widget (quality + tier)
FR122: Epic 15 - Active campaigns status overview
FR123: Epic 20 - MRR display
FR124: Epic 20 - Month revenue (received vs projected)
FR125: Epic 20 - Receivables (open invoices + due dates)
FR126: Epic 20 - Delinquents (tenant, days overdue, value)
FR127: Epic 20 - Churn metric
FR128: Epic 20 - Tenant list with statuses + financial status
FR129: Epic 20 - New tenants count + net growth
FR130: Epic 20 - Aggregate conversations across all tenants
FR131: Epic 20 - Aggregate AI cost vs revenue (real margin)
FR132: Epic 20 - Tenants near usage limit (upsell flag)
FR133: Epic 20 - Tenants with quality dropping (churn risk flag)
FR134: Epic 20 - Create tenant action
FR135: Epic 20 - Impersonate tenant (logged in audit)
FR136: Epic 20 - Manual block/unblock tenant
FR137: Epic 20 - Force-release tenant
FR138: Epic 20 - Financial history per tenant

NFR1: Epic 2 - RLS multi-tenant isolation
NFR2: Epic 2 - RBAC role enforcement
NFR3: Epic 4 - Encrypted storage for access tokens and secrets
NFR4: Epic 11 - Idempotent webhook processing
NFR5: Epic 13 - Dispatch throttling respects Meta tier
NFR6: Epic 13 - Quality rating drop pauses dispatches + alerts
NFR7: Epic 7 - Prompt caching mandatory for agent conversations
NFR8: Epic 7 - API rate limiting per tenant (Redis)
NFR9: Epic 7 - Distributed lock prevents parallel conversation processing
NFR10: Epic 5 - LGPD: opt-out respected, data deletion, controller/processor distinction
NFR11: Epic 3 - WCAG AA contrast on all components
NFR12: Epic 3 - Full keyboard navigation
NFR13: Epic 3 - Accessible form field labels
NFR14: Epic 3 - Dark/light theme from V0
NFR15: Epic 3 - Plain Portuguese-BR UI, actionable error messages
NFR16: Epic 1 - Env vars validated with Zod at boot
NFR17: Epic 1 - Structured logs with request_id + tenant_id + user_id
NFR18: Epic 1 - Sentry exception tracking with tenant context
NFR19: Epic 1 - Drizzle migrations applied before deploy

UX-DR1: Epic 3 - Design token system with named tokens
UX-DR2: Epic 3 - Dark/light theme with system preference detection
UX-DR3: Epic 3 - AIAssistedTextarea component
UX-DR4: Epic 3 - AI action visual indicator (violet accent)
UX-DR5: Epic 3 - Spacious layout with compact mode toggle
UX-DR6: Epic 3 - Actionable error messages
UX-DR7: Epic 3 - WCAG AA contrast in both themes
UX-DR8: Epic 3 - Complete keyboard navigation
UX-DR9: Epic 3 - Portuguese-BR UI copy, no jargon

P1 (NFRs gaps): Epic 9 - Add explicit availability/latency/throughput targets to PRD
P2 (Success metrics): Epic 9 - Add product KPIs to PRD
P3 (LGPD in PRD): Epic 9 - Move LGPD requirements to PRD
P4 (Onboarding edge): Epic 9 - Clarify partial onboarding handling in super-admin
A2 (Retry/DLQ): Epic 9 - Document webhook retry + DLQ strategy in Architecture
A3 (Redis TTL): Epic 9 - Document Redis key TTL/retention policy in Architecture
A4 (BYOK): Epic 9 - Add BYOK enterprise section to Architecture
A5 (Audit retention): Epic 9 - Add audit_log retention policy to Architecture
E1 (Time estimates): Epic 9 - Add time estimates per phase to Execution Plan
E2 (Rollback): Epic 9 - Add production rollback strategy to Execution Plan
E3 (CI/CD detail): Epic 9 - Detail CI/CD pipeline in Execution Plan

## Epic List

### Epic 1: Project Foundation & Developer Infrastructure

The complete monorepo scaffolding â€” all packages, apps, CI, environment validation, and local dev environment â€” is running and ready for business feature development. No business logic yet; every subsequent epic builds on this foundation.
**FRs cobertos:** NFR16, NFR17, NFR18, NFR19 + all Additional Architecture Requirements (monorepo, TypeScript strict, Drizzle, packages/db, packages/ui, packages/auth stub, packages/config, apps/web + dashboard + admin + api, Sentry/PostHog/BetterStack stubs, CI lint+typecheck+build+migrations)

### Epic 2: Multi-Tenant Identity & Access

Users can register, log in, belong to one or more tenants with distinct roles, invite teammates by email, and the Exponensia super-admin can access and impersonate any tenant for support â€” with all actions logged.
**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, NFR1, NFR2

### Epic 3: Design System & UI Shell

All three apps have a consistent, accessible shell (navigation, layout, dark/light theme) and the reusable AIAssistedTextarea component is available across all long-text fields.
**FRs cobertos:** UX-DR1â€“UX-DR9, NFR11, NFR12, NFR13, NFR14, NFR15

### Epic 4: WhatsApp Channel Connection

Tenant can connect their official WhatsApp Business number to Leedi, verify the connection, and see real-time status, quality rating, and messaging tier from Meta.
**FRs cobertos:** FR17, FR18, FR19, FR20, FR21, FR22, FR23, NFR3

### Epic 5: Lead Management & Conversation Tracking

Tenant can import leads via CSV, view each lead's profile and full journey timeline, apply tags, manage opt-outs, and every inbound WhatsApp exchange is recorded as a timestamped conversation window.
**FRs cobertos:** FR87, FR88, FR89, FR90, FR91, NFR10

### Epic 6: Product Knowledge Base & Sales Methods

Tenant can configure their complete product catalog with arguments and social proofs, build their FAQ and objection-handling library, and select a sales methodology â€” giving the agent full commercial ammunition.
**FRs cobertos:** FR41, FR42, FR43, FR44, FR45, FR46, FR47, FR53, FR54, FR55

### Epic 7: Intelligent Sales Agent

The AI agent is fully operational: it receives WhatsApp messages, qualifies leads, identifies returning contacts, makes correct offers, handles objections, transfers to humans when needed, and processes audio and images â€” all with prompt caching and distributed concurrency control.
**FRs cobertos:** FR24â€“FR40, NFR7, NFR8, NFR9

### Epic 8: Agent Playground

Tenant can safely test the complete agent experience â€” including returning-lead scenarios and objection handling â€” before releasing it to real leads, with full tool-call transparency.
**FRs cobertos:** FR56, FR57, FR58, FR59, FR60

### Epic 9: Documentation Quality Corrections

The development and product team have accurate, complete, and unambiguous reference documentation â€” covering NFRs (availability/latency/throughput targets), product success metrics, LGPD as a product requirement, webhook retry/DLQ strategy, Redis TTL policy, BYOK architecture, audit log retention, time estimates, rollback strategy, and CI/CD pipeline detail â€” before building the more complex downstream epics.
**Itens cobertos:** P1, P2, P3, P4, A2, A3, A4, A5, E1, E2, E3

### Epic 10: Campaign Management

Tenant can create and manage launch campaigns with configurable phases, control what the agent offers at each phase, and trigger phase transitions (cart â†’ downsell) manually or on a scheduled date.
**FRs cobertos:** FR48, FR49, FR50, FR51, FR52

### Epic 11: Hotmart Gateway Integration

Sales events from Hotmart automatically update lead purchase status in real time, stop the agent from re-offering to buyers, and trigger abandoned-cart / boleto / pix recovery flows â€” all idempotently.
**FRs cobertos:** FR92, FR93, FR94, FR95, FR96, FR97, NFR4

### Epic 12: Meta Template Management

Tenant can build, submit to Meta, and track approval of WhatsApp message templates from within the platform, using a curated library of occasion-specific suggestions and AI-assisted text improvement.
**FRs cobertos:** FR61, FR62, FR63, FR64, FR65, FR66, FR67, FR68

### Epic 13: Smart Message Dispatch

Tenant can blast approved templates to filtered lead segments, schedule dispatches at safe hours, set automatic trigger-based rules, and the agent can schedule free follow-ups within the 24h window â€” all with throttling that respects Meta tier limits.
**FRs cobertos:** FR69â€“FR78, NFR5, NFR6

### Epic 14: Human Inbox & Handoff

Operators can monitor all conversations in real time, receive AI-generated handoff summaries, take over from the agent, respond to leads via WhatsApp, and return control to the bot â€” keeping humans in the loop without breaking the conversation flow.
**FRs cobertos:** FR79â€“FR86

### Epic 15: Tenant Analytics Dashboard

Tenant can see real-time sales performance (conversions, ticket, ROI), conversation health, most frequent objections, number quality rating, and campaign status â€” all in a single operational dashboard.
**FRs cobertos:** FR113â€“FR122

### Epic 16: Usage Metering & Overage

Tenant can monitor conversation consumption against their plan limit, receive proactive alerts at 80%/95%/100%, and see transparent overage charges â€” without any service interruption.
**FRs cobertos:** FR103â€“FR108

### Epic 17: Billing & Subscription Management

Tenants are subscribed to a plan via Asaas and are automatically locked or unlocked based on payment status, with a gradual lockdown policy that preserves all data and a clear "regularize payment" interface.
**FRs cobertos:** FR98â€“FR102

### Epic 18: Notifications

Tenant users and operators receive timely push and email alerts for all critical business events, with per-user preferences controlling which events arrive on which channel.
**FRs cobertos:** FR109â€“FR112

### Epic 19: Assisted Onboarding Wizard

New tenants can complete a guided 5-step wizard that takes them from a blank account to a fully connected, configured, and tested agent â€” without needing any technical knowledge or external help.
**FRs cobertos:** FR10â€“FR16

### Epic 20: Super-Admin Financial & Operational Dashboard

The Exponensia team can monitor SaaS health (MRR, churn, delinquencies, real AI margin), manage the full tenant lifecycle (create, impersonate, block, force-release), and identify upsell and churn-risk signals across all tenants.
**FRs cobertos:** FR123â€“FR138

---

## Epic 1: Project Foundation & Developer Infrastructure

The complete monorepo scaffolding â€” all packages, apps, CI, environment validation, and local dev environment â€” is running and ready for business feature development. No business logic yet; every subsequent epic builds on this foundation.

### Story 1.1: Initialize Turborepo Monorepo with pnpm Workspaces

As a **developer**,
I want a Turborepo monorepo with pnpm workspaces initialized with the exact folder structure from the Architecture document,
So that every subsequent epic can be built in a properly isolated package without ad-hoc folder creation.

**Acceptance Criteria:**

**Given** an empty git repository
**When** a developer runs `pnpm install`
**Then** all workspace packages resolve without errors
**And** the folder tree matches Architecture section 4: `apps/web`, `apps/dashboard`, `apps/admin`, `apps/api`, all `packages/` domain folders, `tooling/`

**Given** `turbo.json` is configured
**When** a developer runs `pnpm build`
**Then** Turborepo builds only packages affected by changes (incremental cache works)
**And** the build passes with zero errors on a clean checkout

### Story 1.2: Configure Shared Tooling (TypeScript Strict, ESLint, Prettier)

As a **developer**,
I want TypeScript strict mode, ESLint, and Prettier configured in `tooling/` and inherited by every package and app,
So that type safety and code style are enforced consistently across the entire codebase from day one.

**Acceptance Criteria:**

**Given** TypeScript is configured with `strict: true` in `tooling/tsconfig/`
**When** any package has a type error
**Then** `pnpm typecheck` fails with a clear error pointing to the offending file and line

**Given** ESLint is configured in `tooling/eslint-config/`
**When** a developer imports from `packages/agent/src/use-cases/process-message.ts` directly
**Then** ESLint reports an error: cross-domain internal import forbidden
**And** `pnpm lint` exits with code 1

**Given** Prettier is configured
**When** a developer runs `pnpm format`
**Then** all files are formatted consistently and `pnpm lint` passes afterwards

### Story 1.3: Set Up Environment Config Package with Zod Validation

As a **developer**,
I want a `packages/config` package that defines and validates all environment variables with Zod at boot,
So that the app never starts with a missing or malformed env var.

**Acceptance Criteria:**

**Given** a required env var (e.g., `DATABASE_URL`) is missing from `.env`
**When** any app starts
**Then** the process exits immediately with a clear error message listing which variable is missing
**And** no app routes or handlers are registered before validation passes

**Given** all required env vars are present
**When** an app starts
**Then** the app boots successfully and the parsed config object is fully typed

**Given** `packages/config` exports the validated config schema
**When** any domain package imports config values
**Then** it imports from `@leedi/config`, not from `process.env` directly

### Story 1.4: Set Up Database Package (Drizzle ORM + Supabase)

As a **developer**,
I want `packages/db` with Drizzle ORM wired to Supabase with a working migration runner,
So that any domain package can define its schema and run migrations without database boilerplate.

**Acceptance Criteria:**

**Given** Supabase connection string is present in env
**When** a developer runs `pnpm --filter @leedi/db migrate`
**Then** all pending migrations are applied to the Supabase database

**Given** `packages/db` exports a typed `db` client
**When** any domain package runs a query
**Then** it imports `db` from `@leedi/db` and TypeScript infers column types from the schema

**Given** a new migration file is added
**When** `pnpm migrate` runs in CI before deploy
**Then** the migration applies successfully before new code is active

### Story 1.5: Set Up Shared UI Package (shadcn/ui + Leedi Design Tokens)

As a **tenant operator**,
I want every app to use Leedi design tokens (indigo primary, violet AI accent, neutral grays) with dark/light theme support,
So that the platform looks consistent from the very first screen.

**Acceptance Criteria:**

**Given** `packages/ui` exports Tailwind config with Leedi design tokens
**When** any app imports the config from `@leedi/ui`
**Then** CSS classes `bg-primary`, `text-accent-ai`, `bg-neutral-50` resolve to correct Leedi brand colors

**Given** shadcn/ui components are installed in `packages/ui`
**When** a developer uses `<Button>`, `<Input>`, or `<Dialog>` from `@leedi/ui`
**Then** components render with Leedi tokens and pass WCAG AA contrast in both themes

**Given** dark mode is toggled
**When** the app re-renders
**Then** all components switch themes without page reload
**And** dark mode base is off-black (not pure `#000`)

### Story 1.6: Create Application Shells (web, dashboard, admin, api)

As a **developer**,
I want all four apps scaffolded with a working health route and shared packages wired,
So that each app compiles, serves locally, and confirms monorepo wiring end-to-end.

**Acceptance Criteria:**

**Given** all apps are scaffolded
**When** a developer runs `pnpm dev`
**Then** `apps/web` serves on 3000, `apps/dashboard` on 3001, `apps/admin` on 3002, `apps/api` (Hono) on 3003

**Given** `apps/api` is a Hono app
**When** a GET request is made to `/health`
**Then** it responds `200 OK` with `{ status: "ok", env: "development" }`

### Story 1.7: Configure Observability Stubs (Sentry, PostHog, Better Stack)

As a **developer**,
I want Sentry, PostHog, and Better Stack initialized in all apps with structured logging,
So that from the first production deploy, errors and logs are captured with full tenant context.

**Acceptance Criteria:**

**Given** Sentry DSN is configured in env
**When** an unhandled exception occurs in any app
**Then** the error is captured in Sentry with `tenant_id` and `request_id` in context

**Given** Better Stack token is configured
**When** any app logs a structured message
**Then** the log entry appears in Better Stack with `request_id`, `tenant_id`, and `user_id` as structured fields

### Story 1.8: Set Up CI Pipeline (Lint + Typecheck + Build + Migrations)

As a **developer**,
I want a CI pipeline that runs lint, typecheck, build, and migration dry-run on every pull request,
So that broken code and bad migrations are caught before merging to main.

**Acceptance Criteria:**

**Given** a PR is opened with a TypeScript error
**When** CI runs
**Then** the `typecheck` job fails and the PR is blocked

**Given** a PR is opened with valid code
**When** CI runs all jobs (lint â†’ typecheck â†’ build â†’ migration check)
**Then** all jobs pass and the PR is unblocked

---

## Epic 2: Multi-Tenant Identity & Access

Users can register, log in, belong to one or more tenants with distinct roles, invite teammates by email, and the Exponensia super-admin can access and impersonate any tenant â€” with all actions logged.

### Story 2.1: User Registration & Email Verification

As a **new user**,
I want to register with my email and password,
So that I can access the Leedi platform.

**Acceptance Criteria:**

**Given** a user submits a valid email and password on the registration form
**When** the form is submitted
**Then** a new user account is created via Better-Auth and a verification email is sent via Resend
**And** the user sees a confirmation screen instructing them to check their email

**Given** a user clicks the verification link in the email
**When** the link is valid and not expired
**Then** the user's email is marked as verified and they are redirected to the dashboard login

**Given** a user attempts to register with an already-registered email
**When** the form is submitted
**Then** an error message is shown: "Este e-mail ja esta cadastrado. Faca login ou recupere sua senha."

### Story 2.2: User Login & Persistent Session

As a **registered user**,
I want to log in with email and password and stay logged in across browser sessions,
So that I don't need to re-authenticate every time I open the platform.

**Acceptance Criteria:**

**Given** a user enters valid credentials on the login page
**When** they submit the login form
**Then** a session is created and they are redirected to their tenant's dashboard
**And** the session persists after closing and reopening the browser

**Given** a logged-in user clicks "Sair"
**When** the logout action is triggered
**Then** the session is destroyed on the server and the user is redirected to the login page
**And** the browser cannot reuse the old session token

**Given** a user enters incorrect credentials
**When** they submit the login form
**Then** a generic error is shown: "E-mail ou senha incorretos" (no field-specific disclosure)

### Story 2.3: Password Recovery via Email

As a **user who forgot their password**,
I want to receive a password reset link by email,
So that I can regain access to my account.

**Acceptance Criteria:**

**Given** a user submits their email on the forgot password page
**When** the email matches a registered account
**Then** a password reset email is sent via Resend with a time-limited link (60 minutes)
**And** a success message is shown regardless of whether the email exists (prevents enumeration)

**Given** a user clicks a valid non-expired reset link and submits a new password
**When** the password is updated
**Then** all existing sessions are invalidated and they are redirected to login with a success message

**Given** a user clicks an expired reset link
**When** they visit the URL
**Then** an error page shows: "Este link expirou. Solicite um novo link de recuperacao."

### Story 2.4: Tenant Schema, Workspace & Membership with RLS

As a **developer**,
I want the multi-tenant database schema (workspaces, tenants, users, memberships) implemented with RLS policies,
So that every future feature has tenant isolation guaranteed at the database level.

**Acceptance Criteria:**

**Given** the DB migration runs
**When** the schema is applied
**Then** tables `workspaces`, `tenants`, `users`, `memberships`, `workspace_admins`, `audit_logs` exist with correct columns per Architecture section 6.1

**Given** a user session has `tenant_id = X`
**When** any query runs with RLS active
**Then** only rows with `tenant_id = X` are returned regardless of explicit filters
**And** a query requesting `tenant_id = Y` (different tenant) returns zero rows

### Story 2.5: Role-Based Access Control (RBAC)

As a **tenant owner**,
I want roles (owner, admin, operator, viewer) enforced throughout the application,
So that team members only access what their role permits.

**Acceptance Criteria:**

**Given** a user with `operator` role
**When** they attempt to access the Agent Configuration page
**Then** they receive a 403 with message: "Voce nao tem permissao para acessar esta area"

**Given** a user with `viewer` role
**When** they visit the dashboard
**Then** they can see metrics but all create/edit/delete buttons are absent or disabled

**Given** a user with `admin` role
**When** they attempt to access the Billing page
**Then** they receive a 403 (billing is owner-only)

### Story 2.6: Team Member Invitation Flow

As a **tenant owner or admin**,
I want to invite teammates by email with a specific role,
So that my team can access the platform with appropriate permissions.

**Acceptance Criteria:**

**Given** an owner navigates to Settings -> Team -> Convidar
**When** they enter a valid email, select a role, and submit
**Then** an invitation email is sent via Resend with a 72-hour link
**And** the invitation is listed as "Pendente" in the team table

**Given** an invited user clicks the link and completes password setup
**When** the link is valid
**Then** they are added to the tenant with the assigned role and redirected to the dashboard

**Given** an owner tries to invite the same email that has a pending invitation
**When** the form is submitted
**Then** an error shows: "Ja existe um convite pendente para este e-mail"

### Story 2.7: Multi-Tenant Switching

As a **user belonging to multiple tenants**,
I want to switch between my tenants from the app header,
So that I can manage each client's setup without logging out.

**Acceptance Criteria:**

**Given** a user belongs to two or more tenants
**When** they click the tenant switcher in the dashboard header
**Then** a dropdown lists all their tenants with their role in each

**Given** a user selects a different tenant
**When** the switch is confirmed
**Then** the session context updates to the selected tenant and the page re-renders with that tenant's data only

### Story 2.8: Super-Admin Workspace & Tenant Impersonation

As a **super-admin (Exponensia)**,
I want to view all tenants in the workspace and impersonate any tenant to provide support,
So that I can troubleshoot issues without asking tenants to share credentials.

**Acceptance Criteria:**

**Given** a super-admin logs in and accesses `admin.leedi.com.br`
**When** they click "Impersonar" on a tenant and confirm
**Then** their session context switches to that tenant's context
**And** a visible banner shows: "Voce esta em modo de suporte para [Tenant Name]. Suas acoes estao sendo registradas."
**And** an `audit_log` entry is created: `acao: "impersonate_start"`

**Given** a super-admin performs any write action while impersonating
**When** the action runs
**Then** each action is recorded in `audit_logs` with the super-admin's `user_id` and target `tenant_id`

**Given** a super-admin clicks "Sair do modo suporte"
**When** they exit impersonation
**Then** their session returns to the workspace admin context and `acao: "impersonate_end"` is logged

---

## Epic 3: Design System & UI Shell

All three apps have a consistent, accessible shell (navigation, layout, dark/light theme) and the reusable AIAssistedTextarea component is available across all long-text fields.

### Story 3.1: Dashboard Navigation Shell & Layout

As a **tenant operator**,
I want a consistent app shell with sidebar navigation, header with tenant switcher, and dark/light toggle,
So that I can navigate between all sections of the platform efficiently.

**Acceptance Criteria:**

**Given** a tenant user is logged in to `apps/dashboard`
**When** they view any page
**Then** a persistent sidebar shows: Dashboard, Conversas, Leads, Agente, Conhecimento, Campanhas, Templates, Disparos, Relatorios, Configuracoes

**Given** the user clicks the dark/light toggle in the header
**When** the toggle fires
**Then** the theme switches immediately without page reload and the preference is persisted to localStorage

**Given** a new user visits with system dark mode active
**When** the page loads
**Then** dark theme is applied automatically (no flash of light theme)

### Story 3.2: Admin Shell & Navigation

As a **super-admin**,
I want a separate app shell for `apps/admin` with workspace-level navigation,
So that I can manage the SaaS business separately from the tenant dashboard.

**Acceptance Criteria:**

**Given** a super-admin is logged in to `apps/admin`
**When** they view any page
**Then** a persistent sidebar shows: Visao Geral, Clientes, Financeiro, Operacional, Configuracoes
**And** a header banner visually distinguishes the admin interface from the tenant dashboard

### Story 3.3: AIAssistedTextarea Component

As a **tenant operator**,
I want every long-text field (persona, arguments, objections, template body) to have a "Melhorar com IA" button,
So that I can get AI-generated suggestions to improve my text without leaving the form.

**Acceptance Criteria:**

**Given** a tenant operator is editing a long-text field
**When** they click the AI improvement button
**Then** a modal opens showing original text on the left and AI-generated suggestion on the right
**And** an animated violet accent indicator shows the AI is generating

**Given** the AI suggestion is shown
**When** the user clicks "Aceitar"
**Then** the field is updated with the suggestion and the modal closes

**Given** the user clicks "Editar antes de aceitar"
**When** the modal is in suggestion state
**Then** the suggestion becomes editable inline before being applied

**Given** the AI improvement API fails
**When** the modal is open
**Then** an error message shows with a retry button

**Given** the AI is generating and the user presses Escape
**When** the modal closes
**Then** the original text is preserved unchanged

### Story 3.4: Accessibility Foundations & WCAG AA Compliance

As a **user with accessibility needs**,
I want the platform to meet WCAG AA standards with keyboard navigation and proper contrast,
So that I can use the platform regardless of my input method.

**Acceptance Criteria:**

**Given** any interactive element (buttons, inputs, links, dropdowns) in the dashboard
**When** a user navigates using only the keyboard
**Then** every interactive element is reachable and operable
**And** the focused element has a visible focus ring

**Given** any text and background color combination in the design system
**When** checked against WCAG AA requirements (4.5:1 normal text, 3:1 large text)
**Then** all combinations pass in both light and dark themes

**Given** any form field in the dashboard
**When** rendered in the DOM
**Then** every input has an associated label or aria-label
**And** error messages are linked to the field via aria-describedby

---

## Epic 4: WhatsApp Channel Connection

Tenant can connect their official WhatsApp Business number to Leedi, verify the connection, and see real-time status, quality rating, and messaging tier from Meta.

### Story 4.1: WhatsApp Connection Schema & Encrypted Credential Storage

As a **developer**,
I want the `whatsapp_connections` table and the Meta Cloud API adapter wired up,
So that tenant credentials are stored encrypted and ready for use by messaging and agent features.

**Acceptance Criteria:**

**Given** the DB migration runs
**When** the schema is applied
**Then** table `whatsapp_connections` exists with all columns from Architecture section 6.2

**Given** an access token is stored
**When** it is written to the database
**Then** it is encrypted via envelope encryption and the plaintext never appears in any log

**Given** the `@leedi/connection` package exports `WhatsAppProvider` interface
**When** `MetaCloudProvider` is instantiated with a connection record
**Then** it can call Meta Graph API using the decrypted token

### Story 4.2: Connect WhatsApp Number (Tenant Configuration)

As a **tenant owner**,
I want to enter my Meta credentials and validate the connection,
So that my WhatsApp Business number is linked to Leedi and ready to receive messages.

**Acceptance Criteria:**

**Given** a tenant owner navigates to Settings -> WhatsApp -> Conectar numero
**When** they enter `phone_number_id`, `waba_id`, `access_token` and click "Validar conexao"
**Then** the system calls Meta API to verify credentials
**And** on success, the connection is saved encrypted with `status: conectado`
**And** the UI shows a green badge with the verified phone number and display name

**Given** the tenant enters invalid credentials
**When** "Validar conexao" is clicked
**Then** an error shows: "Credenciais invalidas. Verifique o phone_number_id, waba_id e o token de acesso."
**And** no connection record is saved

### Story 4.3: Connection Health Display (Status, Quality, Tier)

As a **tenant operator**,
I want to see my WhatsApp connection health at a glance,
So that I know immediately if something is wrong with my channel.

**Acceptance Criteria:**

**Given** a tenant has a connected WhatsApp number
**When** they view the WhatsApp settings page
**Then** they see: connection status badge, quality rating badge (Verde/Amarelo/Vermelho), and messaging tier

**Given** a connection error occurs (token expired)
**When** the tenant views WhatsApp settings
**Then** the status shows "Erro" in red with an explanation and steps to fix it

### Story 4.4: Inbound Webhook Message Reception & Routing

As a **developer**,
I want the Meta webhook to receive inbound messages, validate signatures, buffer rapid sequences, and route to the agent processor,
So that every lead message triggers the agent reliably without duplication.

**Acceptance Criteria:**

**Given** Meta sends a webhook POST to `/webhook/meta` with valid `X-Hub-Signature-256`
**When** received
**Then** the message is acknowledged with `200 OK` immediately
**And** pushed to a Redis buffer for the lead (debounce key: `tenant_id:phone_number`)

**Given** Meta sends a webhook with invalid signature
**When** received
**Then** it responds `403 Forbidden` and discards without processing

**Given** two messages arrive from the same lead within 6 seconds
**When** the debounce timer fires
**Then** both messages are delivered together as one batch to the agent use case

**Given** the same `meta_message_id` is received twice
**When** the second arrives
**Then** it is deduplicated and not processed again

### Story 4.5: Outbound Message Sending via Meta Cloud API

As a **developer**,
I want the `@leedi/connection` package to send text, media, and template messages via Meta Cloud API,
So that the agent and dispatcher can deliver messages to leads.

**Acceptance Criteria:**

**Given** the agent calls `connection.enviarTexto(conexao, destino, texto)`
**When** Meta API returns `200 OK`
**Then** the message ID is saved to `messages` with `status: enviado`

**Given** Meta returns a rate-limit error (429) during sending
**When** the send is retried with exponential backoff (max 3 attempts)
**Then** the message is either sent successfully or marked `status: falhou` with the error logged

---

## Epic 5: Lead Management & Conversation Tracking

Tenant can import leads via CSV, view each lead's profile and full journey timeline, apply tags, manage opt-outs, and every inbound WhatsApp exchange is recorded as a conversation window.

### Story 5.1: Lead Database Schema & List View

As a **tenant operator**,
I want to see a filterable list of all leads in my account,
So that I can quickly find and assess specific leads.

**Acceptance Criteria:**

**Given** the DB migration runs
**When** the schema is applied
**Then** tables `leads`, `lead_tags`, `lead_journey_events` exist with all columns from Architecture section 6.3

**Given** a tenant operator navigates to Leads
**When** the page loads
**Then** a paginated table shows all leads with: name, phone, temperature badge, status, last interaction date, purchased indicator

**Given** the operator filters by `temperatura: quente`
**When** the filter is applied
**Then** only hot leads are shown and the filter is reflected in the URL

### Story 5.2: Lead Detail Page & Journey Timeline

As a **tenant operator**,
I want to open a lead's detail page and see their complete journey,
So that I can understand the lead's history before contacting them.

**Acceptance Criteria:**

**Given** an operator clicks on a lead
**When** the detail page opens
**Then** they see: full name, phone, email, origin, temperature, status, tags, purchase history

**Given** the lead has journey events
**When** the timeline section is viewed
**Then** all events are shown in reverse-chronological order with timestamps

### Story 5.3: CSV Lead Import

As a **tenant operator**,
I want to import leads from a CSV file,
So that I can seed my lead base from an external list.

**Acceptance Criteria:**

**Given** an operator uploads a CSV with columns: `telefone` (required), `nome`, `email`
**When** the import is processed
**Then** new leads are created for valid rows
**And** rows with a phone already in the database are skipped
**And** an import summary shows: "X leads importados, Y duplicados ignorados, Z erros"

**Given** a CSV row has a malformed phone number
**When** the import is processed
**Then** that row is listed in errors with reason: "Telefone invalido"
**And** valid rows are still imported

### Story 5.4: Lead Tags & Opt-Out Management

As a **tenant operator**,
I want to manually tag leads and process opt-out requests,
So that I can organize my lead base and comply with LGPD immediately.

**Acceptance Criteria:**

**Given** an operator adds a tag to a lead and saves
**When** the tag is created
**Then** it appears with `origem_tag: manual` and the lead immediately matches segment filters with that tag

**Given** a lead is marked as opted out
**When** the status is set to `optout`
**Then** the lead is excluded from all future dispatch targets automatically

### Story 5.5: Conversation Window Tracking (24h Billing Unit)

As a **developer**,
I want conversation windows to be created and managed correctly as the 24h billing unit,
So that usage metering has accurate data and the agent has proper conversation context.

**Acceptance Criteria:**

**Given** a lead sends a message and no open window exists
**When** the message is received
**Then** a new `conversation_window` is created with `started_at: now()` and `billable: true`

**Given** a lead sends a message within 24 hours of their last message
**When** the message is received
**Then** the existing open window is reused and `message_count` is incremented

**Given** a lead sends a message more than 24 hours after their last message
**When** the message is received
**Then** the previous window is closed and a new billable window is opened

**Given** messages are stored in the `messages` table
**When** large volumes accumulate
**Then** the table is partitioned by month (`created_at`) per Architecture spec

---

## Epic 6: Product Knowledge Base & Sales Methods

Tenant can configure their complete product catalog with arguments and social proofs, build their FAQ and objection-handling library, and select a sales methodology.

### Story 6.1: Product Catalog CRUD

As a **tenant owner or admin**,
I want to create and manage products with full commercial details,
So that the agent knows exactly what to sell, at what price, and how to send the checkout link.

**Acceptance Criteria:**

**Given** a tenant admin navigates to Conhecimento -> Produtos -> Novo produto
**When** they fill in name, description, price, installments, checkout link, type (principal/downsell/upsell/orderbump) and save
**Then** the product is created and appears in the product list

**Given** a product is created
**When** the agent uses `consultar_ofertas_ativas`
**Then** the product data (name, price, checkout link, type) is returned in the tool result

**Given** a tenant tries to save a product without a checkout link
**When** the form is submitted
**Then** validation error: "O link de checkout e obrigatorio para que o agente possa enviar ao lead"

### Story 6.2: Sales Arguments, Differentials & Social Proofs

As a **tenant operator**,
I want to add sales arguments, differentials, social proofs, guarantee info, and bonuses per product,
So that the agent has rich, persuasive commercial material to draw from during conversations.

**Acceptance Criteria:**

**Given** an operator clicks the AI improvement button on a sales argument
**When** accepted
**Then** the argument text is updated with the AI suggestion

**Given** multiple arguments are saved for a product
**When** the agent calls `consultar_ofertas_ativas`
**Then** the tool result includes all arguments, differentials, and social proofs

### Story 6.3: FAQ & Objection-Counter Library

As a **tenant operator**,
I want to build a library of FAQs and objection-counter pairs,
So that the agent responds consistently to common questions and handles predictable objections effectively.

**Acceptance Criteria:**

**Given** an operator adds an objection: category "preco" + objection "E muito caro" + counter text
**When** a lead says "achei caro" during a conversation
**Then** the agent calls `consultar_base_conhecimento` and uses the matching counter in its response

**Given** an operator clicks the AI improvement button on an objection counter and accepts
**When** saved
**Then** the counter text is updated and a toast shows: "Contorno atualizado com sucesso"

### Story 6.4: Sales Methods Seed & Selection

As a **tenant owner or admin**,
I want to choose a sales methodology (SPIN, AIDA, Storytelling, Free) for my agent,
So that the agent follows a structured approach to qualify and convert leads.

**Acceptance Criteria:**

**Given** the DB seed runs
**When** `sales_methods` is queried
**Then** four records exist: SPIN, AIDA, Storytelling, Livre â€” all `is_global: true` with non-empty `system_prompt_template` and `phases`

**Given** a tenant admin selects "SPIN Selling" in Agent Settings and saves
**When** the selection is saved
**Then** `agent_config.sales_method_id` is updated to the SPIN method ID

**Given** two playground sessions with the same lead â€” one SPIN, one Storytelling
**When** compared
**Then** the opening approach is observably different

---

## Epic 7: Intelligent Sales Agent

The AI agent is fully operational: receives WhatsApp messages, qualifies leads, identifies returning contacts, makes correct offers, handles objections, transfers to humans, and processes audio and images.

### Story 7.1: Agent Configuration Panel

As a **tenant owner or admin**,
I want a panel to configure all aspects of the agent (name, persona, style, limits, method, tools, model),
So that I can control the agent's behavior without writing code.

**Acceptance Criteria:**

**Given** a tenant admin navigates to Agente -> Configuracoes
**When** the page loads
**Then** all fields are shown: nome do agente, persona (with AI button), estilo de mensagem, limites, metodo de venda, toggles de tools, modelo de IA

**Given** the admin updates the agent name and saves
**When** the agent next responds to a lead
**Then** it uses the new name

**Given** the admin disables the "transferencia humana" toggle
**When** the agent encounters a situation it would normally transfer
**Then** it handles the conversation without calling `transferir_humano`

### Story 7.2: Agent Core Processing Loop

As a **lead contacting the business via WhatsApp**,
I want the AI agent to respond to my messages naturally and intelligently,
So that I receive helpful, personalized responses.

**Acceptance Criteria:**

**Given** a lead sends a message and the agent is active
**When** processed by the agent use case
**Then** Claude Agent SDK is called with: system prompt (persona + method + product), conversation history, available tools, and the new message
**And** a response is sent via WhatsApp

**Given** the stable system prompt is identical across messages in the same campaign
**When** the agent processes a message
**Then** the stable portion uses the prompt cache prefix per Architecture section 7.5

**Given** two messages arrive simultaneously for the same lead
**When** the second tries to start processing
**Then** a Redis distributed lock prevents parallel execution

**Given** the agent generates a long response
**When** the response is delivered
**Then** it is split into 2-4 natural message segments with short delays between them

### Story 7.3: Lead Context Tools (History, Offers, Eligibility)

As a **lead**,
I want the agent to know who I am, what I've done before, and what's relevant to offer me,
So that conversations feel personalized and not repetitive.

**Acceptance Criteria:**

**Given** a lead who participated in a previous launch contacts the business
**When** the agent calls `buscar_historico_lead`
**Then** the tool returns their previous launch, purchase history, and recorded objections
**And** the agent's opening references the prior interaction

**Given** a lead who already purchased the main product contacts the business
**When** the agent calls `verificar_elegibilidade` for that product
**Then** the tool returns `eligible: false, reason: "already_purchased"`
**And** the agent does not offer the product again

**Given** the active campaign is in `downsell` phase
**When** the agent calls `consultar_ofertas_ativas`
**Then** only the downsell product is returned

### Story 7.4: Sales & Conversion Tools (Checkout, Intent, Tagging)

As a **tenant owner**,
I want the agent to send checkout links, mark purchase intent, and auto-tag leads,
So that warm leads get frictionless purchase paths and CRM data stays current.

**Acceptance Criteria:**

**Given** a lead expresses interest in buying
**When** the agent calls `enviar_link_checkout`
**Then** a WhatsApp message is sent to the lead with the product's checkout URL

**Given** the agent detects strong purchase intent signals
**When** `marcar_intencao_compra` is called
**Then** `lead.temperatura` updates to `quente` and a journey event is created: `tipo: "interesse"`

**Given** the agent identifies a lead profile tag from the conversation
**When** `adicionar_tag` is called
**Then** the tag is added with `origem_tag: agente` and the lead immediately matches segment filters with that tag

### Story 7.5: Objection Handling & Knowledge Base Consultation

As a **lead with doubts**,
I want the agent to address my objections thoughtfully,
So that my concerns are resolved and I can make a confident purchase decision.

**Acceptance Criteria:**

**Given** a lead raises an objection matching a category in the knowledge base
**When** the agent processes it
**Then** it calls `consultar_base_conhecimento` with the matching category and uses the counter in its response

**Given** no matching counter is found
**When** the agent handles the objection
**Then** it responds based on persona and method rather than returning an unhelpful empty response

### Story 7.6: Human Transfer Tool

As a **lead who needs more personalized attention**,
I want to be transferred to a human when the agent determines it's necessary,
So that complex situations are handled by a person.

**Acceptance Criteria:**

**Given** the agent calls `transferir_humano` with a reason
**When** executed
**Then** the agent sends: "Vou te conectar com um de nossos especialistas. Um momento!"
**And** `inbox_assignments.status` is set to `aguardando_humano`
**And** a handoff summary is generated: who the lead is, what they want, objections, temperature, suggested approach
**And** a notification is sent to all operators

**Given** the agent is paused for a lead in human handoff
**When** a new message arrives from that lead
**Then** the agent does NOT process it

### Story 7.7: Multimodal Input Processing (Audio + Image)

As a **lead using WhatsApp**,
I want to be able to send voice messages and photos and have the agent understand them,
So that I can communicate naturally.

**Acceptance Criteria:**

**Given** a lead sends a voice message
**When** the webhook delivers it
**Then** the audio is transcribed to text (stored in `messages.transcricao`)
**And** the transcription is passed to the agent and the agent responds coherently to the audio content

**Given** a lead sends an image
**When** processed
**Then** the image URL is included in the agent context and the agent responds to the visual content

**Given** an audio transcription fails
**When** processed
**Then** the agent responds: "Recebi seu audio mas nao consegui entender. Pode me mandar como texto?"

### Story 7.8: Model Routing & Cost Optimization

As a **developer**,
I want non-sales AI tasks to use Haiku instead of Sonnet,
So that AI costs stay within the sustainable margin.

**Acceptance Criteria:**

**Given** the agent calls `adicionar_tag` and needs to classify a tag
**When** the classification model is invoked
**Then** it uses `claude-haiku-*`

**Given** `transferir_humano` generates a handoff summary
**When** the summary is generated
**Then** it uses `claude-haiku-*`

**Given** the AI improvement button generates a text suggestion
**When** executed
**Then** it uses `claude-haiku-*`

**Given** a sales conversation message is processed by the main agent loop
**When** the model is selected
**Then** it uses `claude-sonnet-*`

---

## Epic 8: Agent Playground

Tenant can safely test the complete agent experience â€” including edge scenarios and tool transparency â€” before releasing it to real leads.

### Story 8.1: Playground Chat Interface

As a **tenant operator**,
I want an in-dashboard chat interface that simulates a WhatsApp conversation with my agent,
So that I can verify the agent behaves correctly before releasing it.

**Acceptance Criteria:**

**Given** a tenant operator navigates to Agente -> Playground
**When** the page loads
**Then** a chat interface is shown with a campaign selector and input field

**Given** the operator sends a message
**When** the agent processes it
**Then** the response appears using the same code path as production
**And** NO message is sent to any real WhatsApp number
**And** NO `conversation_window` is created with `billable: true`
**And** NO `usage_counter` is incremented

### Story 8.2: Scenario Simulation & Tool Transparency

As a **tenant operator**,
I want to simulate different lead scenarios and see which tools the agent calls,
So that I can validate the agent's decision-making before going live.

**Acceptance Criteria:**

**Given** the operator selects "Lead recorrente" scenario
**When** the playground initializes
**Then** the agent's context includes mock historical data and the opening references the prior interaction

**Given** the agent calls a tool during the conversation
**When** the tool executes
**Then** a collapsible tool-call panel appears showing: tool name, input, and output

**Given** the operator changes the agent configuration and returns to playground
**When** a new session starts
**Then** the updated config is reflected immediately

---

## Epic 9: Documentation Quality Corrections

The development and product team have accurate, complete, and unambiguous reference documentation before building the more complex downstream epics.

### Story 9.1: PRD â€” NFRs, Success Metrics & LGPD Requirements

As a **product manager and developer**,
I want the PRD to include explicit NFRs, product success metrics, and LGPD requirements,
So that implementation decisions are grounded in measurable targets and legal obligations.

**Acceptance Criteria:**

**Given** the updated PRD
**When** a developer reads the NFR section
**Then** it includes explicit targets for: agent response latency (p95 target), platform availability (uptime SLA), and maximum concurrent dispatch throughput

**Given** the updated PRD
**When** a developer reads the Success Metrics section
**Then** it includes: time-to-V0 operational target, minimum tenant conversion rate, and sustainable AI cost-per-conversation ceiling

**Given** the updated PRD
**When** a developer reads the Compliance/Privacy section (new)
**Then** it includes: LGPD controller/processor definitions, data subject rights, opt-out flow requirements, and data retention limits for conversation logs

### Story 9.2: PRD â€” Onboarding Edge Case & Architecture Webhook Retry/DLQ

As a **developer**,
I want the PRD to clarify the super-admin view of incomplete onboardings and the Architecture to document the webhook retry and DLQ strategy,
So that incomplete setups are handled gracefully and no sales events are silently lost.

**Acceptance Criteria:**

**Given** the updated PRD Module 2 (Onboarding)
**When** a developer reads it
**Then** it specifies how the super-admin sees tenants with incomplete onboarding and what triggers a re-invitation

**Given** the updated Architecture Webhooks section
**When** a developer reads it
**Then** it specifies: retry count (3 attempts with exponential backoff), DLQ destination (BullMQ failed queue), alerting when DLQ grows, and manual replay procedure

### Story 9.3: Architecture â€” Redis TTL, BYOK Enterprise & Audit Log Retention

As a **developer**,
I want the Architecture to document Redis key TTL policies, the BYOK enterprise flow, and the audit log retention policy,
So that operational costs stay bounded and enterprise customers have a clear BYOK target.

**Acceptance Criteria:**

**Given** the updated Architecture Redis section
**When** read
**Then** it specifies TTL for each key type: message buffer (30s), distributed locks (5 min), rate-limit windows (60s), BullMQ job metadata (7 days)

**Given** the updated Architecture Enterprise section (new)
**When** read
**Then** it describes the BYOK flow: tenant provides their own Anthropic API key, stored encrypted, used as override in the AI provider adapter

**Given** the updated Architecture Audit Log section
**When** read
**Then** it specifies: hot storage (90 days in Supabase), cold archival procedure, deletion schedule

### Story 9.4: Execution Plan â€” Time Estimates, Rollback Strategy & CI/CD Detail

As a **project lead**,
I want the Execution Plan to include phase time estimates, a production rollback strategy, and detailed CI/CD pipeline steps,
So that the team can commit to delivery dates and recover safely from bad deploys.

**Acceptance Criteria:**

**Given** the updated Execution Plan
**When** each phase section is read
**Then** it includes an estimated duration in developer-days and any external dependencies that could extend it

**Given** the updated Execution Plan Rollback Strategy section (new)
**When** read
**Then** it describes: how to revert a Vercel deployment, how to roll back a Drizzle migration safely, and the procedure for "migration applied but new code is broken"

**Given** the updated Execution Plan CI/CD Pipeline section
**When** read
**Then** it details all pipeline stages: lint -> typecheck -> unit tests -> migration validation -> build -> deploy staging -> smoke test -> promote production

---

## Epic 10: Campaign Management

Tenant can create and manage launch campaigns with configurable phases, control what the agent offers at each phase, and trigger phase transitions manually or on schedule.

### Story 10.1: Campaign CRUD & Phase Schema

As a **tenant admin**,
I want to create and manage campaigns with phase configuration,
So that I can organize my product launches and control what the agent offers at each stage.

**Acceptance Criteria:**

**Given** the DB migration runs
**When** the schema is applied
**Then** tables `campaigns` and `segments` exist with all columns from Architecture section 6.8

**Given** a tenant admin creates a campaign with name, product, type, and dates
**When** saved
**Then** the campaign is created with `fase: aquecimento` and `status: rascunho`

**Given** a campaign exists
**When** the admin opens it
**Then** they can configure each phase: urgency messaging, key messages, and transition conditions

### Story 10.2: Campaign Activation & Phase Transitions

As a **tenant admin**,
I want to activate a campaign and trigger phase transitions manually or on a scheduled date,
So that the agent automatically shifts its offer strategy at the right moment.

**Acceptance Criteria:**

**Given** a campaign is in `rascunho` status
**When** the admin clicks "Ativar campanha"
**Then** `status` changes to `ativa` and the agent starts using this campaign's product as the active offer

**Given** an active campaign is in `carrinho_aberto` phase and the admin clicks "Iniciar downsell"
**When** confirmed
**Then** `fase` changes to `downsell` and the campaign product switches to the configured downsell product

**Given** a lead already purchased during `carrinho_aberto`
**When** the campaign transitions to `downsell`
**Then** that lead is NOT offered the downsell (`verificar_elegibilidade` returns `eligible: false`)

### Story 10.3: Active Campaign as Agent Context

As a **lead**,
I want the agent to always offer me the right product for the current campaign phase,
So that I receive timely and relevant offers.

**Acceptance Criteria:**

**Given** two campaigns exist but only one is active
**When** the agent calls `consultar_ofertas_ativas`
**Then** only the active campaign's current-phase product is returned

**Given** no campaign is active
**When** the agent is asked what to offer
**Then** `consultar_ofertas_ativas` returns empty and the agent responds helpfully without a specific product offer

---

## Epic 11: Hotmart Gateway Integration

Sales events from Hotmart automatically update lead purchase status, stop the agent from re-offering to buyers, and trigger recovery flows â€” all idempotently.

### Story 11.1: Hotmart Webhook Receiver & Canonical Event Normalization

As a **developer**,
I want a Hotmart webhook endpoint that validates signatures and normalizes events to canonical format,
So that the rest of the system only handles well-defined events regardless of Hotmart's payload format.

**Acceptance Criteria:**

**Given** Hotmart sends a webhook POST with valid signature
**When** received
**Then** the raw payload is stored in `gateway_events.payload_original`
**And** normalized to a canonical event in `payload_normalizado`
**And** `evento_canonico` is set to the matching type (e.g., `compra_aprovada`)

**Given** Hotmart sends a webhook with invalid signature
**When** received
**Then** it responds `403 Forbidden` and discards without processing

**Given** the same Hotmart event ID is received twice
**When** the second event arrives
**Then** `processado: true` is detected and the event is skipped (idempotency)

### Story 11.2: Purchase Approved â€” Lead Status Update

As a **lead who just purchased**,
I want the system to immediately recognize my purchase and stop trying to sell me what I already bought,
So that I don't receive redundant sales messages.

**Acceptance Criteria:**

**Given** a `compra_aprovada` canonical event arrives for a phone number
**When** processed
**Then** the matching lead's `comprou` flag is set to `true` and `produto_comprado_id` is set
**And** a journey event is created: `tipo: "comprou"`
**And** `verificar_elegibilidade` immediately returns `eligible: false` for that product

**Given** the lead sends a message after their purchase is recorded
**When** the agent processes it
**Then** it does not offer the purchased product again

### Story 11.3: Recovery Flow Triggers (Abandoned Cart, Boleto, Pix)

As a **tenant owner**,
I want abandoned cart, boleto, and pix events to automatically trigger recovery flows,
So that leads who showed purchase intent but didn't complete are re-engaged automatically.

**Acceptance Criteria:**

**Given** a `carrinho_abandonado` canonical event arrives
**When** processed
**Then** a journey event is created: `tipo: "carrinho_abandonado"`
**And** if a matching dispatch rule exists, a recovery message is queued

**Given** a `compra_cancelada` or `compra_reembolsada` event arrives
**When** processed
**Then** the lead's `comprou` flag reverts to `false`
**And** a journey event records the cancellation or refund

---

## Epic 12: Meta Template Management

Tenant can build, submit to Meta, and track approval of WhatsApp message templates from within the platform, using a curated library and AI-assisted text improvement.

### Story 12.1: Template Builder & Meta Submission

As a **tenant admin**,
I want to build a WhatsApp message template and submit it to Meta for approval from within the platform,
So that I have approved templates ready for dispatch without using Meta Business Manager directly.

**Acceptance Criteria:**

**Given** a tenant admin creates a template with header, body with variables, footer, CTA button, category, and clicks "Enviar para aprovacao"
**When** submitted
**Then** the template is sent to Meta Graph API
**And** `templates.status` is set to `pendente`
**And** `templates.meta_template_id` is saved from the API response

**Given** the Meta API returns an error during submission
**When** the submission fails
**Then** the error reason is displayed and the template remains in `rascunho`

### Story 12.2: Template Status Tracking & Suggested Library

As a **tenant admin**,
I want to track my templates' Meta approval status in real time and pick from a library of suggested templates,
So that I know which templates are ready and can quickly start from proven formats.

**Acceptance Criteria:**

**Given** Meta sends a `message_template_status_update` webhook with status `APPROVED`
**When** received
**Then** `templates.status` updates to `aprovado` and a notification is triggered

**Given** Meta sends a rejection status update
**When** received
**Then** `templates.status` updates to `rejeitado`, `motivo_rejeicao` is stored, and a notification is triggered with the reason

**Given** a tenant admin navigates to Templates -> Biblioteca
**When** the page loads
**Then** suggested templates are shown by occasion: Boas-vindas, Carrinho abandonado (1h/6h/24h), Ultima chamada, Pos-compra, Reengajamento, Lembrete de evento

**Given** an admin selects a template from the library
**When** they click "Usar este modelo"
**Then** the template builder opens pre-filled with the library template's content, all fields editable

---

## Epic 13: Smart Message Dispatch

Tenant can blast approved templates to filtered lead segments, schedule dispatches at safe hours, set automatic trigger-based rules, and the agent can schedule free follow-ups within the 24h window.

### Story 13.1: Lead Segment Builder

As a **tenant admin**,
I want to create named segments using filter rules (purchased, tags, origin, date range),
So that I can target the right leads for each dispatch without manually selecting them.

**Acceptance Criteria:**

**Given** a tenant admin creates a segment with filters: `comprou = false`, `tag = "interesse_a2"`
**When** saved
**Then** the segment is created with filter rules stored in `segments.filtros` as JSON

**Given** a saved segment
**When** "Visualizar leads" is clicked
**Then** a count and preview list of matching leads is shown and refreshes dynamically as the lead database changes

### Story 13.2: Manual Template Dispatch

As a **tenant admin**,
I want to create and schedule a manual dispatch selecting a template and segment with throttling that respects Meta's tier,
So that I can reach my leads at scale without violating Meta's rate limits.

**Acceptance Criteria:**

**Given** a tenant admin creates a dispatch job with: approved template, segment, scheduled time
**When** saved
**Then** a `dispatch_jobs` record is created with `status: agendado`

**Given** the dispatch job fires at scheduled time
**When** BullMQ processes it
**Then** leads matching the segment are loaded minus exclusions (already bought, opted out, active conversation)
**And** messages are sent with throttling respecting the tenant's Meta messaging tier

**Given** the dispatch job completes
**When** all targets are processed
**Then** `dispatch_jobs.status` updates to `concluido` and final counts (enviados, entregues, respondidos, falhas) are visible

### Story 13.3: Automatic Dispatch Rules

As a **tenant admin**,
I want to configure automatic dispatch rules that fire based on lead behavior triggers,
So that time-sensitive recovery messages are sent without manual intervention.

**Acceptance Criteria:**

**Given** a dispatch rule with trigger `carrinho_abandonado`, template T, and window `1 hora`
**When** a `carrinho_abandonado` event is processed for lead L
**Then** a dispatch target is created for lead L scheduled 1 hour from now

**Given** the lead purchases before the trigger fires
**When** the scheduled message time arrives
**Then** the dispatch target is excluded (already bought) and the message is NOT sent

### Story 13.4: 24h Window Follow-Up & Re-Engagement

As a **tenant operator**,
I want the agent to schedule free follow-ups within the open 24h window and use approved templates when the window closes,
So that warm leads are nudged without unnecessary template costs.

**Acceptance Criteria:**

**Given** the agent calls `agendar_followup` with a time within the next 23 hours
**When** the follow-up time arrives and the 24h window is still open
**Then** the follow-up message is sent as a free-form message (no template cost)
**And** `followups.status` updates to `enviado`

**Given** the follow-up time arrives but the 24h window has closed
**When** the follow-up is attempted
**Then** `followups.status` updates to `janela_fechada`
**And** if a re-engagement dispatch rule exists, it is triggered instead

---

## Epic 14: Human Inbox & Handoff

Operators can monitor all conversations in real time, receive AI-generated handoff summaries, take over from the agent, respond to leads via WhatsApp, and return control to the bot.

### Story 14.1: Real-Time Conversation List & Filters

As a **tenant operator**,
I want to see all active conversations in a real-time list with status indicators and filters,
So that I can quickly identify conversations that need my attention.

**Acceptance Criteria:**

**Given** a tenant operator navigates to Conversas
**When** the page loads
**Then** all conversation windows are listed with: lead name, phone, last message preview, timestamp, and status badge (Bot / Aguardando humano / Em atendimento / Resolvido)

**Given** a lead's conversation status changes to `aguardando_humano`
**When** the operator is on the inbox page
**Then** the conversation moves to the top of the list and an audio notification fires (if browser permission granted)

### Story 14.2: Conversation Detail & AI Handoff Summary

As a **tenant operator**,
I want to open a conversation and see its full history plus an AI-generated handoff summary,
So that I can understand the full context before responding.

**Acceptance Criteria:**

**Given** an operator clicks on a conversation
**When** the detail view opens
**Then** the complete message history is shown in chronological order, clearly differentiated by sender (lead / agent / human)

**Given** the conversation was handed off by the agent
**When** the detail view opens
**Then** a side panel shows: who the lead is, what they want, objections raised, temperature, reason for transfer, suggested next response

### Story 14.3: Human Takeover, Manual Reply & Return to Bot

As a **tenant operator**,
I want to take over a conversation, send manual replies, and return control to the bot when done,
So that I can provide high-touch support without breaking the conversation flow.

**Acceptance Criteria:**

**Given** an operator clicks "Assumir atendimento" and confirms
**When** executed
**Then** `inbox_assignments.status` changes to `em_atendimento`
**And** the agent is paused for this lead

**Given** an operator types and sends a manual reply
**When** submitted
**Then** it is sent to the lead via WhatsApp
**And** saved in `messages` with `autor: humano`

**Given** an operator clicks "Devolver ao bot" and confirms
**When** executed
**Then** the agent is reactivated for this lead
**And** `inbox_assignments.status` reflects the change

---

## Epic 15: Tenant Analytics Dashboard

Tenant can see real-time sales performance, conversation health, most frequent objections, number quality rating, and campaign status in a single dashboard.

### Story 15.1: Core Sales Metrics Dashboard

As a **tenant owner**,
I want to see my key sales metrics on the main dashboard,
So that I know at a glance how the agent is performing commercially.

**Acceptance Criteria:**

**Given** a tenant owner views the Dashboard page
**When** the page loads with the current month as default range
**Then** the following metrics are shown: Conversas iniciadas, Taxa de resposta (%), Conversoes (count), Valor total de vendas (R$), Ticket medio (R$), ROI estimado

**Given** a new `compra_aprovada` event is processed
**When** the dashboard is refreshed
**Then** Conversoes and Valor total de vendas update within 60 seconds

### Story 15.2: Conversation Health & Objection Analytics

As a **tenant owner**,
I want to see which objections my leads raise most frequently,
So that I can improve the knowledge base based on real data.

**Acceptance Criteria:**

**Given** multiple conversations have recorded objections in `lead_journey_events`
**When** the Objections section of the dashboard is viewed
**Then** a ranked list shows the top 5-10 most frequent objections with occurrence count

### Story 15.3: Number Health & Campaign Status Widgets

As a **tenant operator**,
I want to see my WhatsApp number health and active campaign status on the dashboard,
So that I can spot operational issues without navigating to separate settings pages.

**Acceptance Criteria:**

**Given** the tenant has a connected WhatsApp number
**When** the dashboard loads
**Then** a widget shows: connection status, quality rating badge, and messaging tier

**Given** the quality rating is yellow or red
**When** the dashboard renders the number health widget
**Then** the widget shows a warning state with a link to WhatsApp settings

**Given** an active campaign exists
**When** the dashboard loads
**Then** a campaign status widget shows: campaign name, current phase, days remaining

---

## Epic 16: Usage Metering & Overage

Tenant can monitor conversation consumption against their plan limit, receive proactive alerts at 80%/95%/100%, and see transparent overage charges without service interruption.

### Story 16.1: Conversation Counting & Usage Counter

As a **developer**,
I want `usage_counters` to be accurately maintained as conversation windows are created,
So that usage metering is reliable for both billing and tenant transparency.

**Acceptance Criteria:**

**Given** a new billable `conversation_window` is created for a tenant
**When** the window creation use case runs
**Then** `usage_counters.conversas_usadas` is incremented atomically for that tenant and current period

**Given** a tenant is in a new period with no prior counter record
**When** their first conversation of the month occurs
**Then** a new `usage_counters` record is created with `conversas_usadas: 1` and `conversas_limite` from their plan

**Given** a conversation is created in a playground session
**When** the counter is checked
**Then** `conversas_usadas` is NOT incremented

### Story 16.2: Usage Dashboard Widget & Threshold Alerts

As a **tenant operator**,
I want to see my conversation usage clearly and receive alerts before I hit my limit,
So that I can plan and avoid surprises.

**Acceptance Criteria:**

**Given** a tenant has used 830 of 1,000 conversations (83%)
**When** they view the dashboard
**Then** a usage widget shows: "830 / 1.000 conversas (83%)" with a warning-state progress bar

**Given** usage reaches 80% of the plan limit
**When** the threshold is crossed
**Then** a notification is sent: "Voce usou 80% das suas conversas do mes."

**Given** usage reaches 95% and then 100%
**When** each threshold is crossed
**Then** a separate notification is sent for each threshold

### Story 16.3: Overage Handling & Tenant Configuration

As a **tenant owner**,
I want overage conversations to continue working and be billed transparently at R$0,30/conversation,
So that I never lose a sales conversation because of a plan limit.

**Acceptance Criteria:**

**Given** a tenant exceeds their monthly conversation limit
**When** the next billable conversation window is created
**Then** `usage_counters.overage_conversas` is incremented and the agent continues functioning normally

**Given** `overage_conversas` increases
**When** the tenant views the usage widget
**Then** it shows: "Conversas excedentes: X (R$ Y,00 extra)" in orange

**Given** a tenant has configured "bloquear ao atingir limite = ON"
**When** the plan limit is reached
**Then** the agent stops processing new billable conversations
**And** a banner shows: "Limite de conversas atingido. Reative ou faca upgrade para continuar."

---

## Epic 17: Billing & Subscription Management

Tenants are subscribed to a plan via Asaas and are automatically locked or unlocked based on payment status, with a gradual lockdown policy that preserves all data.

### Story 17.1: Asaas Integration & Subscription Creation

As a **super-admin**,
I want Asaas customer and subscription records to be created when a tenant is onboarded,
So that recurring billing is automated from day one.

**Acceptance Criteria:**

**Given** a super-admin creates a new tenant and selects a plan
**When** the tenant record is saved
**Then** an Asaas customer is created and `subscriptions.asaas_customer_id` is stored
**And** a recurring subscription is created in Asaas and `asaas_subscription_id` is stored

**Given** an Asaas API call fails during tenant creation
**When** the error occurs
**Then** the tenant record is still created but flagged `billing_status: pendente_configuracao`
**And** the super-admin sees an alert to manually complete billing setup

### Story 17.2: Payment Webhook â€” Tenant Lock & Unlock

As a **tenant owner**,
I want my account to be automatically unlocked when payment is confirmed and locked gradually if I fall behind,
So that I don't need to contact support for routine payment situations.

**Acceptance Criteria:**

**Given** Asaas sends a `PAYMENT_RECEIVED` webhook for a tenant's invoice
**When** processed
**Then** `tenants.status` is set to `ativo` (if it was blocked) and `invoices.status` updates to `pago`
**And** a notification is sent: "Pagamento confirmado. Sua conta esta ativa!"

**Given** an invoice is overdue for 3 days
**When** the daily billing check job runs
**Then** `tenants.status` is set to `bloqueado` (partial: sending disabled)
**And** a banner in the dashboard reads: "Pagamento atrasado. Regularize para continuar enviando mensagens."

**Given** an invoice is overdue for 7 days
**When** the daily billing check job runs
**Then** `tenants.status` is set to `bloqueado` (full: agent off, data preserved)
**And** the dashboard shows: "Conta suspensa por inadimplencia. Seus dados estao preservados. Regularize para reativar."

### Story 17.3: Tenant Billing Panel

As a **tenant owner**,
I want to see my current plan, invoice history, and next due date in the platform,
So that I can manage billing without contacting support.

**Acceptance Criteria:**

**Given** a tenant owner navigates to Configuracoes -> Cobranca
**When** the page loads
**Then** they see: current plan name and price, billing status, next due date, and last 6 invoices with status

**Given** a tenant clicks on an invoice
**When** the detail opens
**Then** they see the total (plan + overage), due date, payment date (if paid), and a download link for the receipt

---

## Epic 18: Notifications

Tenant users and operators receive timely push and email alerts for all critical business events, with per-user preferences controlling which events arrive on which channel.

### Story 18.1: Notification Infrastructure (Push + Email)

As a **developer**,
I want a notification service that can send web push and email for any system event,
So that all other epics can trigger notifications without building their own delivery logic.

**Acceptance Criteria:**

**Given** any use case calls `notification.enviar({ userId, tipo, titulo, corpo, canal })`
**When** invoked with `canal: push`
**Then** a web push is delivered to the user's browser (if subscribed)

**Given** invoked with `canal: email`
**Then** a React Email template is rendered and sent via Resend from `noreply@leedi.com.br`

**Given** a user has not granted browser push permission
**When** a push notification is triggered
**Then** the push is silently skipped and an email is sent instead (fallback)

### Story 18.2: Event-Driven Notifications & User Preferences

As a **tenant operator**,
I want to choose which business events I'm notified about and through which channels,
So that I only receive alerts relevant to my role.

**Acceptance Criteria:**

**Given** a user navigates to Settings -> Notificacoes
**When** the page loads
**Then** they see a matrix of events x channels (push / email) with toggles

**Given** each of the following events occurs, a notification is triggered per the user's preferences:

- `venda_aprovada`: "Nova venda! [Lead] comprou [Product]"
- `lead_pediu_humano`: "Lead aguardando atendimento: [Lead Name]"
- `template_rejeitado`: "Template [Name] foi rejeitado: [reason]"
- `quality_caindo`: "Atencao: qualidade do numero caindo para [rating]"
- `conta_bloqueada`: "Sua conta foi bloqueada por inadimplencia"
- `disparo_concluido`: "Disparo [name] concluido: X enviados, Y respondidos"
- `alerta_uso`: "Voce usou [X]% das suas conversas do mes"

**Given** a user turns off `venda_aprovada` notifications for the email channel
**When** a sale occurs
**Then** they receive a push notification (if subscribed) but no email

---

## Epic 19: Assisted Onboarding Wizard

New tenants can complete a guided 5-step wizard that takes them from a blank account to a fully connected, configured, and tested agent â€” without needing any technical knowledge.

### Story 19.1: Wizard Infrastructure & Progress Persistence

As a **new tenant owner**,
I want the setup wizard to save my progress at each step so I can resume if interrupted,
So that I don't lose my work if the browser closes.

**Acceptance Criteria:**

**Given** a new tenant's account is created
**When** they first log in
**Then** they are automatically redirected to the onboarding wizard

**Given** a tenant completes steps 1 and 2 and closes the browser
**When** they return the next day
**Then** the wizard opens on step 3 with data from steps 1 and 2 pre-filled

### Story 19.2: Wizard Steps 1-2 (Company Data & WhatsApp Connection)

As a **new tenant owner**,
I want to enter my company details and connect my WhatsApp number through guided steps,
So that my account is branded correctly and my channel is operational.

**Acceptance Criteria:**

**Given** the tenant is on wizard Step 1
**When** they enter company name, logo, and segment and click "Proximo"
**Then** `tenants.nome`, `logo_url`, and `segmento` are saved and they advance to Step 2

**Given** the tenant enters their WhatsApp credentials on Step 2 and validates
**When** validation succeeds
**Then** a green success indicator shows: "Numero conectado: +55 11 99999-9999"
**And** the "Proximo" button becomes enabled

### Story 19.3: Wizard Steps 3-4 (Gateway Connection & Agent Configuration)

As a **new tenant owner**,
I want to connect my Hotmart account and configure my agent's basic settings within the wizard,
So that my sales pipeline and agent are ready before I run the test.

**Acceptance Criteria:**

**Given** the tenant selects Hotmart as their gateway on Step 3
**When** selected
**Then** the system generates a unique webhook URL
**And** instructions show exactly where to paste it in Hotmart's settings

**Given** Hotmart sends a test webhook to the generated URL
**When** received
**Then** the step 3 indicator changes to green: "Webhook confirmado!"

**Given** the tenant is on Step 4 and fills in agent name, persona, and sales method
**When** saved
**Then** a preview shows: "Seu agente [Nome] esta pronto para usar o metodo [Metodo]"

### Story 19.4: Wizard Step 5 (Playground Test) & Completion

As a **new tenant owner**,
I want to test my agent in the playground as the final step before going live,
So that I can verify everything works and feel confident.

**Acceptance Criteria:**

**Given** the tenant is on wizard Step 5
**When** the page loads
**Then** an embedded playground loads with the wizard's agent configuration

**Given** the tenant sends at least one test message and the agent responds
**When** the interaction completes
**Then** the "Concluir configuracao" button becomes enabled

**Given** the tenant clicks "Concluir configuracao"
**When** confirmed
**Then** `tenants.status` is set to `ativo` and they are redirected to the main dashboard
**And** a welcome notification is sent: "Configuracao concluida! Seu agente esta pronto para atender leads."

---

## Epic 20: Super-Admin Financial & Operational Dashboard

The Exponensia team can monitor SaaS health, manage the full tenant lifecycle, and identify upsell and churn-risk signals.

### Story 20.1: Financial Health Dashboard (MRR, Revenue, Delinquencies)

As a **super-admin**,
I want to see the financial health of the SaaS at a glance,
So that I can manage cash flow and identify payment problems early.

**Acceptance Criteria:**

**Given** a super-admin views Admin -> Financeiro
**When** the page loads
**Then** they see: MRR (sum of all active subscriptions), current month received vs projected revenue, total open receivables, and delinquency count (tenants with invoices >3 days overdue)

**Given** the delinquency section is viewed
**When** rendered
**Then** each delinquent tenant is listed with: name, plan, days overdue, and outstanding value

**Given** a tenant pays their overdue invoice
**When** the Asaas webhook is processed
**Then** the delinquency count decreases and the tenant disappears from the delinquent list

### Story 20.2: Tenant List & Lifecycle Management

As a **super-admin**,
I want to see all tenants with their status and perform lifecycle actions (create, impersonate, block, force-release),
So that I can provide support and manage the business efficiently.

**Acceptance Criteria:**

**Given** a super-admin navigates to Admin -> Clientes
**When** the page loads
**Then** a table shows all tenants with: name, plan, status badge, monthly value, overage, last payment date

**Given** a super-admin clicks "Criar tenant" and fills in company name, owner email, and plan
**When** saved
**Then** a new tenant record is created, owner invitation is sent, and Asaas billing is initialized

**Given** a super-admin clicks "Bloquear" on an active tenant and confirms
**When** executed
**Then** `tenants.status` changes to `bloqueado` and an `audit_log` entry is created

**Given** a super-admin clicks "Liberar forcado" with a reason note
**When** confirmed
**Then** `tenants.status` returns to `ativo` and the reason is stored in `audit_logs.detalhes`

### Story 20.3: Operational Health (Conversations, AI Cost, Risk Signals)

As a **super-admin**,
I want to see aggregate operational metrics and risk signals across all tenants,
So that I can spot margin problems and proactively prevent churn.

**Acceptance Criteria:**

**Given** a super-admin views Admin -> Operacional
**When** the page loads
**Then** they see: total conversations across all tenants (current month), aggregate AI cost in USD, estimated real margin percentage, tenants within 20% of their plan limit, and tenants with quality rating yellow or red

**Given** the aggregate AI cost is shown alongside MRR
**When** rendered
**Then** the page displays an estimated margin: `(MRR - AI_cost_in_BRL) / MRR x 100`

**Given** a tenant's quality rating drops to red
**When** the next dashboard refresh occurs
**Then** that tenant appears in the "Risco de churn" list with their quality rating and days at risk

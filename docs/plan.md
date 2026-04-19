# Betty v1 — Project Plan

> Scope: v1 launch only. See `docs/betty-PRD-v1.md` for product spec.

## Overview

Betty v1 is a mobile-first (React Native / Expo) chat-timeline AI assistant for fee-for-service Alberta physicians. The chat **is** the app. Two capabilities ship in v1: (1) Alberta AHCIP fee-code knowledge, and (2) natural-language claim creation with a swappable AHCIP submission pipeline (mock for v1).

**Done looks like** (from PRD):

1. A physician asks fee-code questions more than once.
2. A physician creates a claim via natural language and taps Confirm.
3. A physician returns unprompted the next day.

**Single metric:** does the physician open Betty between patients?

---

## Current State Snapshot

### Backend — `packages/api` (~4k LOC, scaffolded)

- **API routes** (`src/app/api/`): `/api/chat` (SSE streaming), `/api/claims/[id]/confirm`, `/api/fee-codes`, `/api/fee-codes/[code]`, `/api/auth/{request-otp,verify-otp,refresh}`, `/api/timeline`, `/api/health`.
- **DB schema** (`src/db/schema/`): `users`, `claims`, `timeline-entries`, `batch-submissions`, `fee-codes`, `otp-codes`, `audit-logs` — all 5 PRD entities modeled via Drizzle.
- **Claude tool loop** (`src/services/conversation.service.ts`, 247 LOC): 50-entry context window, up to 5 tool iterations per turn, SSE streaming of deltas + widgets.
- **Tools** (`src/tools/`): `create-claim`, `fee-lookup`, `phn-validation`, `date-resolution`.
- **System prompt** (`src/prompts/system.ts`): voice and tool-use instructions — needs polish against PRD voice guidelines.
- **Mock AHCIP adapter** (`src/adapters/ahcip/`): simulates realistic rejections (DOCRQ, duplicate, modifier, PHN registration).
- **Batch service** (`src/services/batch.service.ts`, 168 LOC): collects staged claims, calls adapter, generates rejection action cards.
- **Jobs** (`src/jobs/{queue,scheduler,worker}.ts`): BullMQ/Redis stubs — **not wired**.
- **Auth**: JWT + OTP with mock SMS provider (`src/lib/sms.ts`), PHN encryption at rest (AES-256-GCM).
- **Web preview UI** (`src/components/*.tsx`): `Timeline`, `MessageBubble`, `StreamingBubble`, `ClaimConfirmation`, `ActionCard`, `InputBar`, `WidgetRenderer`, `TypingIndicator`. These are Next.js components; patterns carry over to RN.

### Shared — `packages/shared`

- Types for claim/fee-code/user/batch/timeline.
- PHN check-digit validation (tested) — reusable on mobile.
- Shared constants.

### Mobile — `apps/mobile`

- **Missing entirely.** No Expo, no RN, no Expo Router.

### Data — `docs/support/AB-somb/`

- 32 SOMB reference files (~32 MB): fee schedules, procedure codes, modifiers, diagnostic codes, HLINK spec PDF.
- Importer at `packages/api/src/scripts/import-fee-codes.ts` — unclear if executed against a real DB yet.

### Infra

- `docker-compose.yml`: Postgres 16 + Redis.
- `Dockerfile` (multi-stage Bun → Node), `deploy.sh` (GCP Cloud Run + Cloud SQL + Secret Manager).
- `.env.example`: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `SMS_PROVIDER`.

---

## Gap Analysis vs. PRD Flows

| Flow | Status | What's Missing |
|------|--------|----------------|
| **1. Cold Start** | ⚠️ Partial | Greeting from system prompt needs to match PRD sample copy. Web login works; mobile cold-start not built. |
| **2. Fee-Code Q&A** | ⚠️ Partial | Tool + route wired; fee_codes table population via importer not verified end-to-end. |
| **3. NL Claim Creation** | ⚠️ Partial | Tool loop, PHN validation, date resolution, confirmation widget, and confirm endpoint all exist. Relies on fee data (WS-1). No mobile surface yet. |
| **4. Batch Rejection (Proactive)** | ⚠️ Partial | Mock adapter + rejection action_card generation work. BullMQ scheduler not wired → batches don't run automatically. No push delivery to device. |
| **5. Proactive Engagement** | ❌ Missing | No silence-detection cron. No Expo push notifications. Timeline visibility/importance filtering not implemented in UI despite schema support. |

### Core Entity Coverage

| Entity | Schema | Runtime behavior |
|--------|--------|------------------|
| User | ✅ | OTP auth working |
| TimelineEntry | ✅ | Stored + streamed; filtering UI missing |
| Claim | ✅ | Full state machine in schema; end-to-end needs WS-2 integration test |
| BatchSubmission | ✅ | Created by `batch.service.ts`; not triggered on schedule |
| FeeCode | ✅ | Importer exists; coverage unverified |

---

## Workstreams

Ordered by dependency. Multiple streams run in parallel.

### WS-1 — Data foundation

*Blocks all claim and fee-code flows.*

- Execute `packages/api/src/scripts/import-fee-codes.ts` against dev DB.
- Validate row coverage against SOMB source files in `docs/support/AB-somb/` (ehsmedbc.txt, efeemodr.txt, fee schedule files).
- Smoke-test `fee-lookup` tool + `/api/fee-codes/[code]` against known codes from the PRD example (`03.01AA`).
- Add a minimal seed-check script or migration hook that fails loudly if `fee_codes` is empty.

### WS-2 — Backend hardening

*Delivers the claim loop end-to-end.*

- Wire `src/jobs/queue.ts` + `scheduler.ts` + `worker.ts` into a runnable BullMQ process; expose a `bun run jobs` script.
- Scheduler triggers `batch.service.ts` on a configurable cadence (default: hourly).
- Integration test for claim state machine: `pending_confirmation` → `staged` (on `/api/claims/[id]/confirm`) → `submitted` → `accepted`/`rejected` → `needs_attention` (with action_card).
- Unit tests for `conversation.service.ts` tool loop: tool dispatch, 5-iteration cap, streaming widget payloads.
- Harden `src/prompts/system.ts` against PRD voice guidelines (warm, one-question-at-a-time, shows work, handles bad news with solutions, respects silence).
- Verify cold-start greeting matches PRD sample.

### WS-3 — Mobile app (Expo)

*The PRD-committed v1 surface.*

- Scaffold `apps/mobile` with Expo Router; add `expo`, `expo-router`, `expo-notifications` to workspace.
- Port components from `packages/api/src/components/` to RN equivalents: `Timeline`, `MessageBubble`, `StreamingBubble`, `ClaimConfirmation`, `ActionCard`, `InputBar`, `WidgetRenderer`, `TypingIndicator`.
- Reuse `packages/shared` (types + `validation/phn.ts` check-digit).
- Adapt `useChat` / `useAuth` hooks: SSE transport needs RN-compatible fetch streaming (or polyfill / replace with server-sent-events library).
- Implement Expo Notifications registration + token round-trip with backend.
- iOS + Android build configs; ship to TestFlight + Play internal track.

### WS-4 — Proactive engagement

*Flows 4 and 5.*

- Silence-detection cron: configurable threshold (N days since last claim), one gentle ping per user per window.
- Push-notification delivery for batch-rejection action_cards via Expo Push.
- Timeline visibility filtering: surface `importance_flag = true` entries; hide routine system events unless filter applied (schema already supports `visibility` and `importance_flag`).
- Guardrails: never notify for routine confirmations or marketing.

### WS-5 — Auth & infra

- Decide real SMS provider (Twilio vs. MessageBird) vs. keep mock for pilot; update `src/lib/sms.ts`.
- Confirm `deploy.sh` Cloud Run deploy works end-to-end against a clean GCP project.
- Verify GCP Secret Manager wiring for `ANTHROPIC_API_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, DB creds.
- Update `.env.example` if any new env vars emerge from WS-2/WS-4.

### WS-6 — QA / voice polish

- Scripted end-to-end journey test covering all 5 PRD flows on mobile.
- Tone review of Betty's outputs vs. PRD voice guidelines.
- PHN-failure copy matches PRD sample.
- Widget rendering parity between web preview and RN.

---

## Milestones

Dependency-ordered. Each milestone is shippable internally.

### M1 — Knowledge alpha

- Fee data imported and verified.
- Fee-code Q&A works end-to-end on the web preview.
- Deployed to staging via `deploy.sh`.

**Depends on:** WS-1, parts of WS-2 (prompt polish), WS-5 (staging deploy).

### M2 — Claim loop

- Natural-language claim → confirmation widget → staged → mock batch → accepted/rejected proactive action_card.
- BullMQ scheduler runs on cadence; integration test green.
- Still on web preview.

**Depends on:** M1, rest of WS-2, start of WS-4 (action_card surfacing).

### M3 — Mobile v1

- Expo app on TestFlight + Play internal, feature-parity with M2.
- Push notifications delivering batch-rejection and silence-detection pings.
- Matches PRD's "what proves v1 works" on real devices.

**Depends on:** M2, WS-3, WS-4, WS-5.

---

## Out of Scope (from PRD)

Admin app, real HLINK submission, multimodal input (image/audio), historical claim analysis, billing reports, calendar view, subscription/payments, multi-claim batch input, human-agent escalation.

---

## Verification

| Milestone | How to verify |
|-----------|---------------|
| M1 | `curl` streaming `/api/chat` with a fee-code question; inspect tool calls; hit `/api/fee-codes/03.01AA`; confirm fee shown matches SOMB source. |
| M2 | Send `"03.01AA for Uli 1111111119 on Monday"` via `/api/chat`; receive confirmation widget; POST `/api/claims/[id]/confirm`; manually trigger batch job; observe staged → submitted → accepted (or rejected with action_card) in DB and timeline. Integration test green. |
| M3 | Install Expo build on iOS + Android; run through Flows 1–5 on device; verify push notification delivered for a forced rejection and a forced silence event. |

# Betty Billing — Project Audit

**Date:** 2026-07-04
**Scope:** Full repository at commit `ab1cfef` — application code (`packages/api`, `packages/shared`), data layer, LLM integration, frontend, tests, CI, and deployment (`Dockerfile`, `cloudbuild.yaml`, `deploy.sh`, `docker-compose.yml`).
**Method:** Five parallel deep-review passes (security, backend correctness, data layer, frontend, infrastructure/CI/tests), every finding verified against the actual code; the highest-severity findings were independently re-verified a second time. Local run of the full CI suite.

---

## Health check

All repo checks pass locally, matching CI:

| Check                          | Result                                       |
| ------------------------------ | -------------------------------------------- |
| `eslint .`                     | ✅ clean                                     |
| `prettier --check .`           | ✅ clean                                     |
| `tsc --noEmit` (both packages) | ✅ clean                                     |
| `bun test`                     | ✅ 98 tests pass (28 shared, 70 api), 0 fail |
| `next build`                   | ✅ builds, 15 routes                         |

The codebase is in good day-to-day shape: strict TypeScript, strict ESLint (typed rules + drizzle guards), consistent formatting, money handled as `decimal`/strings end-to-end, PHNs encrypted with correct AES-256-GCM and never returned to clients, and per-user authorization scoping on every claim route and assistant tool (no IDOR found).

However, the audit found **4 critical** and **9 high** severity issues. The dominant themes: **the deployed system's auth and claims pipeline are not production-real** (mock SMS, no migrations, no worker, no Redis), and **every claim state transition is a non-transactional check-then-act** (zero `db.transaction` calls in `src/`), which allows cancelled claims to be submitted, duplicate submissions, and permanently stranded claims.

---

## Critical

### C1. Login codes are printed to logs, and no real SMS exists — in production

`packages/api/src/lib/sms.ts:7-9`, `deploy.sh:114`

The only implemented SMS provider is `MockSmsProvider`, which `console.log`s every OTP, and `deploy.sh` deploys Cloud Run with `SMS_PROVIDER=mock`. The `twilio` branch throws "not implemented."

**Scenario:** anyone with Cloud Logging read access (teammate, contractor, attacker with a leaked viewer credential) can read live login codes for any phone number and log in as any physician. Since no SMS is actually sent, the log _is_ the delivery channel — mock mode is effectively the production auth mechanism.

### C2. Drizzle migrations are gitignored and were never committed — `db:migrate` is a no-op everywhere

`.gitignore:36` (`drizzle/`), `packages/api/drizzle.config.ts`

Verified: no `drizzle/` directory or `.sql` file exists anywhere in the repo or its git history. Commit `8d62d5a` claims "committed migrations" but `.gitignore` silently excluded them; `README.md:24`, `DEPLOY.md:20`, and `deploy.sh:122` all assert committed migrations exist.

**Scenario:** the `betty-migrate` Cloud Run job runs `drizzle-kit migrate`, finds zero migrations, exits 0, and the deploy reports success — against an empty database every DB-backed route 500s. A fresh dev clone has the same problem. Remove `drizzle/` from `.gitignore`, run `db:generate`, and commit the journal.

### C3. Batch submission marks claims `submitted` before calling AHCIP, with no transaction, no failure handling, and no recovery path

`packages/api/src/services/batch.service.ts:57-68`

Claims are flipped to `submitted`, _then_ `adapter.submitBatch()` is awaited — with no try/catch, no transaction, no retry configuration on the scheduled job (`jobs/scheduler.ts:14-18`), no SIGTERM handling in `jobs/worker.ts`, and no reconciliation job.

**Scenario:** the adapter throws (any network error with a real adapter), or Cloud Run kills the worker mid-batch. Every claim in the batch is now `submitted` with the batch row stuck `pending`. Nothing ever re-selects them (the job only picks up `staged`), so the physician's money silently disappears from tracking. The crash-after-adapter-call variant is worse: AHCIP has the claims but their accept/reject results are lost permanently.

### C4. Claim state transitions are unguarded check-then-act writes — cancelled claims can be force-submitted, and claims can be double-submitted

`batch.service.ts:57-65`, `services/claim.service.ts:126-142`, `app/api/claims/[id]/confirm/route.ts:27-44`, `app/api/claims/[id]/apply-update/route.ts:40-97`

Every status update is `UPDATE ... WHERE id = ?` (sometimes `+ userId`) with **no status predicate**, after validating status on a stale read. There are no row locks (`FOR UPDATE SKIP LOCKED`), no unique constraint preventing a claim from appearing in two batches (`batch_submissions.claimIds` is a bare `uuid[]` with no FK), and worker `concurrency: 1` only protects a single process.

**Scenarios (all verified in code):**

- Physician cancels a claim while the hourly batch is between its SELECT and UPDATE → the batch overwrites `cancelled` back to `submitted` and transmits it. Timeline says "cancelled," AHCIP bills it — a compliance problem.
- The reverse interleaving: cancel wins the last write, DB says `cancelled`, but the claim is already in-flight to AHCIP.
- `apply-update` racing the batch writes `status: "staged"` (from its stale read) over `submitted` → the next hourly batch submits the claim to AHCIP a **second** time.
- Two worker processes (scale-out or a manual run beside cron) both select the same staged claims → duplicate billing with no DB constraint to stop it.

**Fix shape (addresses C3+C4 together):** status-guarded updates (`... AND status = 'staged'`, check affected-row count), an intermediate `submitting` state written inside a transaction before the adapter call, and a reconciler for stuck claims.

---

## High

### H1. Refresh tokens: 30-day, non-rotating, non-revocable, stored in localStorage

`lib/auth.ts:8-9,26-33`, `app/api/auth/refresh/route.ts:13-22`, `lib/client-auth.ts:4-17`

Refresh tokens are stateless 30-day JWTs; refresh mints a new access token but never rotates the refresh token and consults no server-side store or denylist — logout only clears `localStorage`. Both tokens live in `localStorage`, readable by any script on the origin. A token captured once (shared device, XSS via a future dependency, log leak) grants 30 days of access to a PHI system, and neither the user nor an admin can revoke it. Move tokens to httpOnly cookies (or at minimum add a session table + rotation).

### H2. Rate limiting silently degrades to per-instance memory in production

`lib/rate-limit.ts:66-72,104-115`, `deploy.sh:108-119`, `DEPLOY.md:22`

`deploy.sh` never sets `REDIS_URL`, so every limiter falls back to per-process memory across `--max-instances=3` with `--min-instances=0`. The OTP brute-force cap of 5/10min (`verify-otp/route.ts:16`) is effectively 15/10min and resets on every cold start — weakening the exact control protecting 6-digit codes. (The code's own comment claims Redis is "the production Cloud Run case.")

### H3. The BullMQ worker is never deployed — staged claims never leave the building

`deploy.sh` (no worker service, no Redis), `DEPLOY.md:3-5`

The core product flow (hourly batch submission, rejection notifications) simply does not run in the deployed app; claims stay `staged` forever. DEPLOY.md documents this as intentional for demo — but nothing in the product UI reflects it, and the physician's experience per the PRD ("the claim is submitted at confirmation") is false in production. If the worker image is deployed as-is it also needs `--min-instances=1` + always-on CPU (BullMQ polling stalls under Cloud Run CPU throttling), which no doc mentions.

### H4. deploy.sh deploys the new revision _before_ running migrations, and rotates the DB password on every run without URL-encoding it

`deploy.sh:47,71,102,141`

(a) New code serving live traffic depends on schema changes that haven't been applied yet (or never apply, if the migrate job fails). Use `--no-traffic` + promote after migration. (b) `openssl rand -base64 24` output contains `/` or `+` roughly two runs in three; a `/` inside the userinfo of `postgresql://betty:${PASSWORD}@/...` breaks URL parsing — a nondeterministic rerun-until-it-works deploy. The rotation also briefly strands the running revision on stale credentials.

### H5. Fee-schedule re-import silently updates nothing — `onConflictDoUpdate` sets columns to themselves

`packages/api/src/scripts/import-fee-codes.ts:121-128,164-172`

`set: { description: feeCodes.description, ... }` renders as `SET "description" = "description"` — the _existing_ row's value, a no-op (verified against drizzle-orm 0.38's `mapUpdateSet`). It must be `sql\`excluded.description\``. When Alberta publishes a SOMB update, re-running `db:seed`reports success while every existing row keeps stale prices —`expectedFee`on new claims is wrong money.`endDate` is missing from the set-list entirely, so end-dated codes stay "active" forever.

### H6. Service dates are computed in server timezone (UTC), not Alberta's

`services/conversation.service.ts:84`, `tools/date-resolution.ts:29`, `tools/create-claim.ts:79,88`, `services/fee-code.service.ts:21`

A physician in Edmonton billing "today" at 7 PM MT gets tomorrow's date (01:00 UTC): the claim carries a future service date and AHCIP rejects it. Conversely, with `TZ=America/Edmonton`, `new Date("YYYY-MM-DD")` (UTC midnight) renders as the _previous_ day in the confirmation widget. Every date site needs an explicit `America/Edmonton` timezone.

### H7. Conversation history can start with an assistant message — the Anthropic API rejects it and the conversation bricks

`services/conversation.service.ts:69-77,188-260`

The newest-50-entry window is converted to messages with no guarantee the first is `user`-role (outbound/system entries map to `assistant`). When the window head lands on an assistant entry — very likely once proactive batch-rejection notifications exist — the API returns 400, the user sees "An unexpected error occurred," and retries keep failing because each retry appends to the _end_ of the window. Drop leading assistant entries before sending.

### H8. Chat and claim-mutation failures are invisible to the user, and chat can't recover from token expiry

`hooks/useChat.ts:102-110,222-229`, `app/page.tsx:48-60`, `components/ClaimConfirmation.tsx:30-47`, `components/ClaimUpdateConfirmation.tsx:36-44`

`sendMessage` uses raw `fetch` instead of the refreshing `apiFetch`, so after 15 minutes of tab-open time every send 401s until a full page reload. All send/confirm/cancel/apply failures are unhandled rejections with **no error UI anywhere** — a physician whose confirm fails (e.g., already confirmed on another device, or rate-limited) sees the button flip back with zero explanation and cannot tell whether the claim was submitted. For a money-moving medical app, errors must be surfaced.

### H9. `.dockerignore` patterns are root-anchored — `packages/api/node_modules` and `.next` (~175 MB) enter the build context and images

`.dockerignore:1-3`, `Dockerfile:12,31`

`node_modules`/`.next`/`.env` match at the root only. `COPY packages/api` overlays host `node_modules` and stale `.next` over the container's fresh install (host-platform binaries can break builds; stale artifacts bake into the worker image), and a `packages/api/.env` would **not** be excluded — committed straight into image layers. Prefix patterns with `**/`.

---

## Medium

**Authentication & OTP hardening (bundle):**

- OTP codes generated with `Math.random()` — not a CSPRNG; use `crypto.randomInt` (`request-otp/route.ts:39`).
- `request-otp` has no `rateLimit()` call and no per-IP cap; its per-phone throttle is check-then-insert (racy). Once real SMS exists this enables SMS-bombing/toll fraud (`request-otp/route.ts:24-46`).
- OTP verify is a TOCTOU: select-then-mark-used lets two concurrent requests redeem the same code; the first-login user upsert next to it can 500 on the phone-unique race (`verify-otp/route.ts:44-80`).
- OTP codes are stored plaintext and never purged; prior codes stay valid when a new one is requested (`db/schema/otp-codes.ts:8`).
- JWT verification doesn't pin `algorithms`/`iss`/`aud`; secrets only require 16 chars and nothing enforces the two secrets differ (`lib/auth.ts:36-41`, `lib/env.ts:6-7`).

**Compliance & data protection:**

- No audit logging of auth or PHN-decryption events — `login`, `otp_requested`, `phn_accessed` exist in the `AuditAction` union but are never emitted, and `ipAddress` is never passed, so post-incident forensics have nothing (`lib/audit.ts` vs call sites).
- Patient names are plaintext in `claims.patient_name`, and names + PHN-last-4 appear in cleartext in timeline `content`/`widget_data` — inconsistent with the encryption intent on the PHN column (`db/schema/claims.ts:37-39`).
- No `onDelete` rules on any FK and no retention strategy — a user-erasure request fails at the DB.

**LLM/tooling robustness:**

- Tool inputs from the model are cast, never zod-validated; unhandled tool exceptions kill the whole streaming turn, and the route's `catch (_error)` discards the error with **no logging at all** — this failure class is invisible in production (`tools/index.ts:44-62`, `app/api/chat/route.ts:57`).
- At the 5-iteration cap, tools still execute (a real claim can be inserted) but results are discarded and Betty may say nothing (`conversation.service.ts:96-167`).
- `update_claim` validates a changed fee code but not diagnostic code/modifier — the model can "fix" a rejection with an ICD-10 code AHCIP will reject again, looping forever (`tools/update-claim.ts:126-161`).
- Tool error paths return raw driver `error.message` as tool content, which the model may echo to the physician (`tools/get-claim.ts:55`).

**Data integrity:**

- Zero `db.transaction` calls in `src/` — create-claim's widget→claim→widget-update triple write can leave an orphaned confirmation card whose Confirm button 404s (`tools/create-claim.ts:115-149`); same for confirm/cancel/apply-update multi-writes.
- Claim state duplicated into timeline `widgetData` is synced by hand everywhere _except_ batch results — a rejected claim's card shows "staged" forever (`batch.service.ts` never touches `claims.timelineEntryId`'s widget).
- No duplicate-claim guard (unique constraint or create-time check) — an LLM retry bills the same visit twice.
- SOMB lab codes are stored with internal padding (`"E  1"`) but looked up as `"E1"` — exact-match misses; claims store the user-typed code instead of the canonical one (`parsers/health-service-codes.ts`, `fee-code.service.ts:68`, `create-claim.ts:136`).
- Missing `"UNKNOWN"` guard: claims from users who never set `ahcip_practitioner_id` are submitted with practitioner `"UNKNOWN"` instead of being blocked at staging (`batch.service.ts:53`, `db/schema/users.ts:11`).
- Bulk import is non-transactional (mid-crash leaves a half-updated fee schedule live) and codes removed from a new extract are never end-dated.
- The unauthenticated `/api/fee-codes` search does leading-wildcard ILIKE with no rate limit and no trigram index — trivially scriptable DB load; the batch job's `status='staged'` scan also has no supporting index (composite leads with `user_id`).

**Operations:**

- Worker has no `error` listener (BullMQ documents this as crash-on-transient-Redis-error) and no graceful shutdown; `getQueue()` leaks a `Queue` per call (`jobs/worker.ts:33-41`, `jobs/queue.ts:16-18`).
- Redis limiter INCR/PEXPIRE is non-atomic — a crash between them leaves a counter key with no TTL, permanently 429ing that user (`lib/rate-limit.ts:80-83`).
- DB pool is module-scoped with no dev-HMR guard, no `prepare: false` consideration for pooled Postgres, no graceful shutdown (`db/index.ts:11`).
- Both Docker stages run as root; `/api/health` never touches the DB, so Cloud Run reports healthy while every real request fails (`Dockerfile`, `app/api/health/route.ts:3-5`).
- Malformed JSON to `/api/chat` and `?before=banana` to `/api/timeline` produce 500s instead of 400s (`chat/route.ts:36`, `timeline/route.ts:28`).

**Frontend:**

- Page auth guard is client-side token-presence only (no `middleware.ts`); any timeline load failure — including transient network errors — redirects an authenticated user to the login screen (`page.tsx:29-46`).
- No `AbortController`/cleanup on the chat stream: sign-out mid-stream keeps the connection reading and the server generating billable tokens (`useChat.ts:81-230`).
- Synthetic entry keys use `Date.now()` — two widgets emitted in the same millisecond collide and one card silently disappears (`useChat.ts:83,164,184`).
- Auto-scroll fires on every streaming delta unconditionally, yanking the viewport while the user reads earlier messages (`Timeline.tsx:33-35`).

**Tests & CI:**

- The fake DB's `where()` discards predicates — the OTP validity check (code equality, `used=false`, expiry all live in the WHERE) is effectively untested: deleting `eq(otpCodes.code, code)` keeps all tests green (`test-support/fakes.ts:61-77`).
- `tools/index.test.ts` re-introduces per-file global `mock.module` calls — the exact pollution pattern commit `f19a331` fixed and `fakes.ts` warns about.
- CI has no DB/Redis-backed tests (could not have caught C3/C4), no dependency audit, no Docker build check, no concurrency cancellation, no timeout; the dummy build env is duplicated between CI and Dockerfile and already drifting.

---

## Low (abbreviated)

- Zoom disabled (`maximumScale: 1`) — WCAG 1.4.4 failure for an older-physician audience; OTP input and chat textarea lack accessible labels.
- Timeline pagination is fully implemented server-side but dead code client-side — history beyond 50 entries is unreachable.
- Concurrent 401s fire parallel refresh calls (single-flight missing) — becomes a logout race the day rotation is added.
- `$NaN` renders as the fee on malformed widget data; `WidgetRenderer` casts through `unknown` instead of using the shared types.
- Mock adapter contradicts its own comment: missing-diagnostic-code claims still pass 80% of the time, making rejection-flow testing nondeterministic.
- `fee-code.ts:33-36` tests the alpha pattern against the _spaced_ string but returns the normalized one — `"E  1"` rejected though `E1` is valid.
- ILIKE wildcards unescaped (`%` matches everything); negative/NaN limits reach `.limit()`.
- `searchFeeCodes` exact-match branch lacks `ORDER BY effectiveDate DESC` — two entry points can disagree on the fee.
- `@anthropic-ai/sdk` frozen at 0.39 (caret on 0.x never advances); drizzle a year behind; bullmq/ioredis exact-pinned without a comment explaining why.
- Stale config: root `workspaces` references a nonexistent `apps/*`; `.gitignore` still carries Expo/iOS/Android entries; CI pins bun 1.3.11 while the Dockerfile floats `1.3-alpine`.
- `tsconfig` lacks `noUncheckedIndexedAccess`; live unchecked indexing exists (e.g. `issues[0].message`, `const [newUser] = ...`).
- `audit_logs` has no `(resource_type, resource_id)`/`created_at` index; `batch_status` value `"submitted"` is dead; timeline cursor on `created_at` alone can skip same-timestamp entries.
- Cloud Build has no shared cache between the two image builds (~2× build time), no timeout.
- **External-spec question:** `phn.ts` implements textbook Luhn correctly, but whether Alberta PHNs actually carry a Luhn check digit should be confirmed with real samples before launch — if not, valid patients get rejected at intake.

---

## Test coverage map

Existing tests are genuinely good (streaming order, tool-loop feedback, real encrypt round-trips, real SSE framing — not tautological). But coverage is concentrated away from the money path:

- **Routes with no tests (9 of 11):** `auth/refresh`, `auth/request-otp`, `claims/[id]/confirm`, `claims/[id]/cancel`, `claims/[id]/apply-update`, `fee-codes`, `fee-codes/[code]`, `timeline`, `health` — the entire claim-mutation surface is untested at the route level.
- **Services with no tests (3 of 5):** `claim.service`, `fee-code.service`, `diag-code.service`.
- **Tools with no direct tests (7):** create/update/get/list/cancel-claim, fee-lookup, diag-code-lookup (only smoke-dispatched against empty mocks).
- **Untested entirely:** all of `jobs/` (queue, scheduler, worker), all of `scripts/` (the SOMB parsers that commit `4ad1a52` had to fix have zero regression tests), `lib/audit.ts`, `lib/sms.ts`, `middleware/auth.ts`, and `redisRateLimit` (its non-atomic INCR/PEXPIRE is unexercised).

---

## What's done well

1. **Money is never a float.** `decimal(10,2)` in Postgres, strings end-to-end, cents→dollars conversion explicit in the importer, `toFixed` only at display.
2. **PHN hygiene.** Correct AES-256-GCM (fresh IV per encryption, auth tag verified), `phn_last4` for display, decryption only inside batch submission, structural stripping in every read path/tool/widget.
3. **No injection surface found.** Zero XSS sinks (all LLM output rendered as React text nodes); all SQL parameterized through Drizzle; env zod-validated at boot with no fallback secrets; deploy secrets in Secret Manager, none baked into images.
4. **apply-update's trust model is right.** The client only points at a server-authored proposal; values come from server-stored widget data, with ownership + linkage checks and a 409 on re-application. Clients can never inject field values.
5. **Consistent per-user authorization** — every claim route and assistant tool scopes by authenticated `userId`; no IDOR found anywhere.
6. **Thoughtful engineering culture:** documented test-fake architecture, strict typed lint config, graceful Redis→memory degradation, honest `partial_failure` batch statuses, Montreal region for Canadian health-data residency.

---

## Recommended remediation order

**Blockers before any real user (days):**

1. Real SMS provider; stop logging OTP codes (C1).
2. Un-ignore and commit Drizzle migrations; verify migrate job applies them (C2).
3. Status-guarded updates + `submitting` intermediate state + transaction around batch submission; stuck-claim reconciler (C3, C4).
4. Provision Redis + set `REDIS_URL`; deploy the worker (or gate claim confirmation off in prod) (H2, H3).

**Next (1–2 weeks):** 5. Fix seed upsert to use `excluded.*` and add `endDate` to the set-list (H5). 6. Alberta timezone for all date resolution (H6). 7. Leading-assistant-message guard in conversation history (H7). 8. Error surfacing in the UI + route `sendMessage` through `apiFetch` (H8). 9. Deploy ordering (migrate before traffic), URL-encode DB password, stop rotating it every deploy (H4); fix `.dockerignore` anchoring (H9). 10. Refresh-token rotation/revocation, httpOnly cookie storage (H1).

**Ongoing hardening:** 11. Route-level tests for confirm/cancel/apply-update; make the fake DB honor WHERE, or add a real-Postgres CI job. 12. OTP bundle (CSPRNG, request-otp rate limit, atomic redeem, hashed + purged codes). 13. Auth/PHN audit-log events with IPs; encrypt patient names or document the decision. 14. Tool-input zod validation; log (don't discard) chat-route errors; worker error listener + graceful shutdown.

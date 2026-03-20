# Betty v1 — Build Spec

## What Betty Is

Betty is a mobile-first AI assistant for fee-for-service physicians in Alberta. The interface is a chat timeline — not a dashboard with a chatbot bolted on. The chat **is** the app. Reports, claim confirmations, notifications, and actions all surface as messages and interactive widgets within the conversation.

Betty's personality is warm, competent, and respectful of the physician's time. She speaks like a trusted personal assistant, not a system. She never sounds like an error log.

## V1 Scope — Exactly What We're Building

Two capabilities, one interface:

1. **Alberta fee code knowledge** — Betty can answer questions about AHCIP billing codes, modifiers, rules, and fee schedules. This works immediately, no account setup required.

2. **Natural language claim creation** — A physician types something like `"03.01AA for Uli 1111111119 on Monday"` and Betty creates a claim. Betty resolves relative dates, validates inputs, and presents a confirmation widget. One tap to confirm. Claims are staged and submitted to AHCIP in batches, but the physician's experience is that the claim is submitted at confirmation.

The chat timeline is the primary and only view. Everything lives here.

## Target User

Fee-for-service Alberta physicians who are personally responsible for their own billing accuracy. They currently manage billing through some mix of HLINK, spreadsheets, billing agents, and memory. They bill AHCIP directly.

**Not for v1:** Salaried physicians, private-pay billing, clinic-level admin features.

## Core UX Flows

### Flow 1: First Open (Cold Start)

Betty is useful before any setup. The physician opens the app and lands in the chat.

```
Betty: Hi, I'm Betty — your billing assistant. I know Alberta fee codes
       inside and out. Ask me anything, or when you're ready, I can start
       handling your claims too.

       What can I help with?
```

No onboarding wall. No forms. The physician can immediately ask fee code questions and get value. Setup for claim submission happens conversationally later, when the physician is ready.

### Flow 2: Fee Code Question

Physician types: `"What's the code for a comprehensive visit with counseling?"`

Betty responds conversationally with the relevant code(s), fees, applicable modifiers, and any rules (time minimums, documentation requirements). Tone is helpful and concise — like a knowledgeable colleague, not a manual.

### Flow 3: Natural Language Claim Creation

Physician types: `"03.01AA for Uli 1111111119 on Monday"`

Betty's processing steps (invisible to user):
1. Resolve "Monday" to a specific date
2. Parse or validate the PHN (1111111119)
3. Validate the fee code (03.01AA)
4. Check if modifiers or additional info are needed
5. Calculate expected fee value

Betty responds with a **claim confirmation widget** — a structured card showing:

```
┌─────────────────────────────────┐
│  Claim Ready to Submit          │
│                                 │
│  Patient:  Uli (PHN ...1119)    │
│  Service:  03.01AA              │
│            Comprehensive Visit  │
│  Date:     Monday, Mar 16       │
│  Expected: $85.00               │
│                                 │
│         [ Confirm ]             │
└─────────────────────────────────┘
```

One tap on Confirm. Betty responds: `"Done — submitted. Anything else?"`

**If something is ambiguous or missing**, Betty asks exactly one smart question — not a list. Example: `"That code usually needs a referral modifier for specialists. Are you the referring or consulting physician?"` Then she re-presents the confirmation widget with the resolved info.

### Flow 4: Batch Submission Failure (Retroactive)

A claim the physician already confirmed gets rejected by AHCIP during batch submission. Betty reaches out proactively:

```
Betty: I tried to submit your Monday claim for Uli but AHCIP flagged
       it — they need a diagnostic code. Want me to pull up the details
       so we can fix it?

       [ View Claim ]  [ Add Diagnostic Code ]
```

**Critical framing:** Betty submitted and then caught a problem. She is not reporting a failure — she is bringing you a problem with a solution. The physician should never feel like Betty lied about the submission. They should feel like Betty is handling a complication on their behalf.

### Flow 5: Proactive Engagement

Betty does **not** spam notifications. She reaches out when:
- A claim she submitted had an issue (see Flow 4)
- The physician hasn't billed in an unusual amount of time
- A task requires physician input that Betty cannot resolve alone

Betty does **not** reach out for:
- Marketing, tips, or feature announcements
- Routine confirmations ("your batch was submitted successfully")
- Anything that doesn't require action or attention

Routine system events (batch submitted, payment received) are logged in the timeline but hidden by default. They are visible when the physician applies a filter or if Betty flags them as important.

## The Timeline Model

The chat is not a conversation — it is a **timeline**. Every interaction, system event, and notification is an entry. The physician's view shows:

- Betty's messages (AI-generated)
- Their own messages
- Interactive widgets (claim confirmations, reports, action cards)
- Important system events (flagged by rules)

Hidden by default (visible via filter):
- Routine system events (batch submissions, payment postings)
- Internal notes from human agents (never visible to physician, admin-app only in future)

The timeline is the physician's complete record of everything Betty has done and everything they've asked.

## Data Model (Core Entities)

### User (Physician)
- id, name, phone, email
- billing_preferences (optional, built up over time)
- ahcip_practitioner_id (added when they set up claim submission)
- subscription_status: free | active
- created_at, updated_at

### TimelineEntry
- id, user_id
- type: message | widget | system_event
- direction: inbound (physician) | outbound (betty) | system
- content: text content for messages
- widget_type: nullable — claim_confirmation | report | action_card
- widget_data: JSON payload for widget rendering
- visibility: default | filtered | internal
- importance_flag: boolean (rules-driven)
- created_at

### Claim
- id, user_id
- timeline_entry_id (links to the confirmation widget)
- status: staged | submitted | accepted | rejected | needs_attention
- fee_code, modifier (nullable)
- phn, patient_name (nullable)
- service_date
- expected_fee
- rejection_reason (nullable)
- submitted_at (nullable), resolved_at (nullable)
- created_at, updated_at

### BatchSubmission
- id
- status: pending | submitted | completed | partial_failure
- claim_ids: array
- submitted_at, completed_at
- response_data: JSON (AHCIP response)

### FeeCode (Reference Data)
- code, description
- base_fee
- modifiers: JSON (applicable modifiers and rules)
- category
- rules_notes: text (documentation requirements, time minimums, etc.)

## Technical Architecture

### Mobile App
- **React Native** (Expo) — single codebase for iOS and Android
- Chat interface as the primary (and initially only) screen
- Widgets rendered as custom components within the chat timeline
- Push notifications via Expo Notifications
- Image/file attachment support (camera, photo library) for future multimodal input

### Backend
- **Next.js API routes** or **Node.js/Express** — REST API
- PostgreSQL database
- AI layer: Anthropic Claude API for Betty's conversational intelligence and fee code knowledge
- Background job system for batch claim submission (cron-based or queue-based)

### AI / Conversation Layer
Betty's AI is powered by Claude with a carefully crafted system prompt that includes:
- Betty's persona and voice guidelines
- Alberta fee code reference data (loaded as context or via tool use)
- Claim creation tool: structured tool that Betty calls when she identifies a billing intent
- PHN validation tool: validates Alberta PHN format and check digit
- Date resolution tool: resolves relative dates ("Monday", "yesterday", "last Friday") to absolute dates
- Fee lookup tool: retrieves fee code details, amount, modifiers, rules

The conversation history (timeline) is sent as context with each message, windowed to a reasonable token limit with recent entries prioritized.

### Claim Submission Pipeline
1. Physician confirms claim via widget → Claim created with status `staged`
2. Background job runs on schedule (configurable — e.g., end of day, hourly)
3. Job collects all `staged` claims, formats for AHCIP submission
4. Submits batch to AHCIP (initially this can be a mock/placeholder — actual HLINK integration is complex and can be a follow-up)
5. Processes response — updates each claim status
6. For rejected claims: creates a proactive TimelineEntry with an action widget

**V1 note on AHCIP integration:** Actual HLINK/AHCIP submission is a significant integration. For v1, build the full pipeline with a **mock AHCIP adapter** that simulates submission and responses. The physician-facing experience is complete and real. The submission backend is swappable.

### PHN Validation
Alberta PHNs are 9 digits with a check-digit algorithm. Betty validates format and check digit before allowing claim confirmation. On failure: `"That PHN doesn't look right — can you double-check? It should be 9 digits."`

## Betty's Voice Guidelines

For the AI system prompt:

- **Warm but efficient.** Betty sounds like a trusted assistant, not a chatbot and not a medical system. She's friendly without being bubbly.
- **One question at a time.** If Betty needs more info, she asks one specific question. Never a list of fields to fill.
- **Shows her work, briefly.** When presenting a claim confirmation, Betty shows what she resolved (date, fee amount) so the physician can verify at a glance.
- **Handles bad news with solutions.** Never "Error: claim rejected." Always "This claim hit a snag — here's what we need to fix it."
- **Respects silence.** If there's nothing to say, Betty says nothing. No check-ins, no "how's your day going."
- **Teaches naturally.** When relevant, Betty mentions billing rules the physician might not know — like claim-back periods, modifier applicability — woven into the conversation, not as tips or tooltips.

## What Is NOT in V1

- Admin app / internal agent interface
- Private-pay billing
- Multimodal input (image/audio OCR of billing sheets, patient notes)
- Historical claim analysis ("find what you've missed")
- Billing reports / earnings dashboard
- Calendar view of shifts
- Subscription/payment system (v1 can be free for initial users)
- Actual AHCIP/HLINK submission (mocked in v1)
- Human agent escalation layer
- Multiple-claim batch input ("bill these 12 patients from today's shift")

## What Proves V1 Works

Betty v1 is validated if:
1. A physician uses Betty to ask fee code questions more than once (knowledge is useful)
2. A physician creates a claim through natural language and taps confirm (the core interaction works)
3. A physician comes back unprompted the next day (the habit is forming)

The single metric that matters: **does the physician open Betty between patients?**

## File / Folder Structure (Suggested)

```
betty/
├── apps/
│   └── mobile/          # React Native (Expo) app
│       ├── app/          # Expo Router screens
│       ├── components/
│       │   ├── chat/     # Timeline, message bubbles, input bar
│       │   └── widgets/  # Claim confirmation, action cards, reports
│       ├── hooks/
│       ├── services/     # API client, notification handlers
│       └── constants/
├── packages/
│   └── api/             # Backend API
│       ├── routes/       # API endpoints
│       ├── services/     # Business logic (claim processing, AI, batch jobs)
│       ├── models/       # Database models
│       ├── tools/        # Claude tool definitions (fee lookup, PHN validation, etc.)
│       ├── prompts/      # Betty system prompt and templates
│       └── adapters/     # AHCIP submission adapter (mock for v1)
├── packages/
│   └── shared/          # Shared types, constants, validation logic
└── docs/                # This spec and future documentation
```

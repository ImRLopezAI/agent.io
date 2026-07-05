---
title: 'feat: Conversation substrate (threads/calls/messages) + ingestion'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §5 §5b · docs/threads-model.md §2 §6
---

# feat: Conversation substrate (threads/calls/messages) + ingestion

## Overview

Define the three polymorphic conversation tables (`threads`, `calls`, `messages`) plus the supporting `contacts` table; implement the two ingestion flows (text and voice); establish monotonic sequence generation, idempotency via an application-enforced uniqueness guard on `providerMessageId` (Convex has no native unique constraints — enforced in the insert mutation via the `by_provider_message` index), delivery-status patching via `by_provider_message`, and derived counter maintenance via the convex-helpers `Triggers` helper. Wire the inbound text turn into the existing v7 orchestrator pattern in `src/server/ai/index.ts`. Register the `/webhooks/{provider}/{tenantId}` HTTP surface on the Convex Hono router.

Depends on **phase 001** (Convex foundations: schema base, RLS wrappers, Triggers bootstrap, tenant config table). Cross-references **phase 003** (channel adapters — inbound parse and outbound send) and **phase 005** (ElevenLabs post-call webhook wiring).

> **Verification conventions (this repo):** Bun runtime; Biome formatting (tabs, single quotes, no semicolons). Typecheck with `node_modules/.bin/tsc --noEmit` (NOT `npx tsc`). Tests with `node_modules/.bin/vp test run`. Lint/format with `node_modules/.bin/biome check --write` (invoke the local binary; do not assume a global `biome`).

---

## Problem Frame

The legacy platform scatters a conversation across seven storage locations (`calls`, `calls.messages[]`, `transcripts`, `widgetSessions.transcript[]`, `events`, `toolCalls`, `smsMessages`/`whatsappMessages`) causing: a 7-step lookup chain with a recency-heuristic fallback, a `callDedup` cron that merges phantom rows, OCC contention on a hot array column, and delivery-status logs that are entirely unlinked from thread content. This plan replaces that with a three-table model with stable keyed upserts, append-only ledger rows, and a single indexed delivery-status patch path.

---

## Requirements Trace

- **R1** — `threads`, `calls`, `messages`, `contacts` tables defined in `convex/schema.ts` with the exact validators from `threads-model.md §2` and all prescribed indexes.
- **R2** — Monotonic per-parent `sequence` generation is correct under concurrent inserts (Convex mutation serialization / OCC guarantees this; documented in approach).
- **R3** — Insert idempotency enforced **in the mutation** via the `by_provider_message` index (Convex has no DB-level unique constraints) — safe redelivery of webhooks.
- **R4** — Delivery-status webhook patches the message via `by_provider_message` index without touching any other field.
- **R5** — Thread-level counters (`messageCount`, `lastMessageAt`, `lastMessagePreview`) maintained by a convex-helpers `Triggers` registration on the `messages` table — never hand-rolled in mutation logic.
- **R6** — Text ingestion flow: inbound webhook → upsert thread by `(tenantId, channel, contactId)` → insert inbound message → run agent turn (`runAgentTurn` action) → insert agent message(s).
- **R7** — Voice ingestion flow: ElevenLabs post-call webhook → upsert call by `conversationId` → bulk-insert transcript messages → patch call fields (status, durationMs, audioUrl, providerCostUsd).
- **R8** — Webhook route surface `/webhooks/{provider}/{tenantId}` registered in `convex/http.ts` (Hono); tenantId read from the route param, never from a lookup table.
- **R9** — `runAgentTurn` Convex action wires into `src/server/ai/index.ts`'s `agentRequestHandler` pattern (v7 `ToolLoopAgent` — non-streaming `.generate()` for webhook-driven turns).
- **R10** — Public Convex functions use `authQuery`/`authMutation` from `convex/utils.ts` (RLS; org-scoped via `ctx.org.organizationId`); webhook-driven writes go through `internalMutation`/`internalAction`; webhook HTTP actions validate provider signature before any DB write.
- **R11** — V8 runtime risk for AI SDK in Convex flagged and Node-action fallback documented.

---

## Scope Boundaries

**In scope:**

- Schema: `contacts`, `threads`, `calls`, `messages` (with all indexes from threads-model.md §2).
- Convex mutations: `threads.upsert`, `messages.insert`, `messages.patchDeliveryStatus`, `calls.upsert`, `calls.patch`, `contacts.upsertByPhone`.
- Convex actions: `agentRuntime.runAgentTurn`, `webhooks.ingestTextTurn`, `webhooks.ingestVoicePostCall`.
- HTTP routes in `convex/http.ts`: `/webhooks/{provider}/{tenantId}`.
- convex-helpers `Triggers`: `messages` insert → thread counter patch.
- Sequence generation helper (inside the insert mutation).

**### Deferred to Separate Tasks**

- Channel-adapter inbound parse logic (WhatsApp, SMS, email, widget) — **phase 003**.
- ElevenLabs agent sync and outbound call dispatch — **phase 005**.
- Composio / BYO MCP tool wiring into specialist sub-agents — **phase 004**.
- Polar usage metering on `runAgentTurn` token usage — **phase 007**.
- Outbound send via channel adapters (called from `runAgentTurn` stub, implemented in 003) — **phase 003**.
- Batch dialing — **phase 006**.
- Surveys anchored to threads/calls — **phase 009**.
- `@convex-dev/aggregate` counter replacement (if needed for analytics) — **phase 009**.
- `callEvents` table definition and ingestion — **phase 005**.

---

## Context & Research

### Relevant code and patterns (repo-relative paths) — verified against the live agent.io repo

| Path                              | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`                | Currently `defineSchema({})` — the target for all new table definitions in this plan                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `convex/utils.ts`                 | Exports `authQuery`/`authMutation` (`zCustomQuery`/`zCustomMutation` via `convex-helpers/server/zod4`) injecting `{ user, org }` into ctx; `org.organizationId` is the tenant id; also `query`/`mutation` (NoOp, unauthed) and the `includes(...)` conditional-index query builder. Use `authQuery`/`authMutation` for client-facing fns. **Note: there is NO `authInternalMutation` here — internal fns called by actions use the raw `internalMutation`/`internalAction`/`internalQuery` from `convex/_generated/server`** |
| `convex/http.ts`                  | Hono-on-Convex router via `convex-helpers/server/hono` (`HonoWithConvex<ActionCtx>` + `HttpRouterWithHono`); `app` is a `Hono` from `hono/tiny`; `c.env` IS the Convex `ActionCtx` (so `c.env.runMutation` / `c.env.runAction` / `c.env.scheduler` are valid). Existing routes: `POST /api/agents`, `/api/chat` → `agentRequestHandler`; `POST /resend/events` → `resend.handleResendEventWebhook`. `authKit.registerRoutes(http)` is also wired. Extend with `/webhooks/:provider/:tenantId`                                |
| `convex/auth.ts`                  | `authKit` — WorkOS AuthKit Convex component (`@convex-dev/workos-authkit`); `authKit.getAuthUser(ctx)` used inside `getAuthUser` in `utils.ts`                                                                                                                                                                                                                                                                                                                                                                               |
| `convex/auth.config.ts`           | Two `customJwt` providers (SSO issuer `https://api.workos.com/` + user_management issuer `https://api.workos.com/user_management/${clientId}`)                                                                                                                                                                                                                                                                                                                                                                               |
| `convex/convex.config.ts`         | `app.use(workOSAuthKit)` + `app.use(resend)`. (No `@convex-dev/aggregate` yet — that is a phase 009 add if analytics counters are needed)                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/server/ai/index.ts`          | `agentRequestHandler(req)` — builds a `ToolLoopAgent({ id, model: gateway(model), reasoning: 'medium', instructions })` and returns `createAgentUIStreamResponse({ agent, uiMessages, sendStart, sendFinish, sendReasoning, headers, abortSignal })`. `runAgentTurn` adapts this for webhook-driven, **non-streaming** turns via `.generate()`                                                                                                                                                                               |
| `src/server/ai/agents/routing.ts` | `routing({ description, agent })` + `customRouting({ description, agent, overrideTool })` — generic specialist-routing tools; `routing` runs the sub-agent via `agent.stream(...)` and re-streams with the **top-level** `toUIMessageStream({ stream: result.stream })` + `readUIMessageStream({ stream })`. (Specialist wiring is phase 004; `runAgentTurn` here uses `.generate()`, not these stream tools, until phase 004)                                                                                               |
| `src/server/rpc/init.ts`          | `org` middleware — `organizationId` from session, never client input; mirror the same "tenant from trusted context, not client arg" discipline                                                                                                                                                                                                                                                                                                                                                                               |

### Design-doc section references

- `threads-model.md §2` — exact validator shapes for `threads`, `calls`, `messages` (quoted verbatim in Implementation Unit 1).
- `threads-model.md §6` — two ingestion flows (text + voice), idempotency rule, delivery-status patch, counter Trigger sketch.
- `rebuild-architecture.md §5` — webhook route design: `tenantId` from route param, no lookup table; WhatsApp per-WABA override note.
- `rebuild-architecture.md §5b` — table taxonomy: `threads`/`calls` are Transactional; `messages` is Ledger/Entry (append-only).
- `rebuild-architecture.md §6` — convex-helpers Triggers for `messageCount`/`lastMessageAt`; `convex-helpers` `0.1.119` already in `package.json`.
  - VERIFY: confirm the exact §-numbering for the `runAgentTurn` sketch (the original plan cited "§4b" for the text agent runtime; confirm that section exists/number in the current `rebuild-architecture.md` — cite the real section).

### Sunday reference patterns

- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/agents/routing.ts` — `routing()` / `customRouting()` helpers (already mirrored, v7-adapted, in agent.io `src/server/ai/agents/routing.ts`).
- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/agents/` — pattern: one `agent.ts` per specialist; orchestrator in `index.ts`; do NOT import the heavy `/Users/angel/dev/ontology/src/server/ai/agents` specials (jsonRender/db-doctor) — not needed here.

---

## Key Technical Decisions

**Polymorphic FK as `(parentType: union literal, parentId: v.string())` — not a union of typed IDs.**
Convex does not support union-typed `v.id()` for FK fields. Using `v.string()` for `parentId` (with `parentType: v.union(v.literal("thread"), v.literal("call"))`) matches the design-doc validator exactly (`threads-model.md §2`) and avoids the type gymnastics of a discriminated union ID. Runtime safety is enforced by the insert mutations, which always supply a validated Convex `_id` cast to string; when reading the parent inside the Trigger, re-narrow with `ctx.db.normalizeId('threads', msg.parentId)` (which returns `Id<'threads'> | null`) rather than a bare `as` cast.

**Sequence generation: read-max-then-increment inside the same mutation transaction.**
Convex mutations are transactional and run under OCC; a conflicting concurrent write causes the whole mutation to retry, so a read-max within the mutation always reflects committed state on the winning run. Approach: `db.query("messages").withIndex("by_parent_sequence", q => q.eq("parentType", pt).eq("parentId", pid)).order("desc").first()` → take `(result?.sequence ?? -1) + 1`. No separate sequence counter table needed. (For the voice bulk-insert case the caller passes an explicit `sequence`, so make the arg optional — see Unit 6.)

**`runAgentTurn` as a Convex internal action in the Node runtime — not a TanStack server route.**
The AI SDK v7-beta is not guaranteed safe under Convex's V8 runtime. Webhook turns are fire-and-forget (the provider gets a `200` immediately), so streaming to a client is not required — use `ToolLoopAgent.generate({ prompt | messages })` (non-streaming) and write the result to `messages` via an internal mutation. Stop the tool loop with `stopWhen: isStepCount(n)` in the agent settings — **there is no `maxSteps` option in v7-beta.178** (it was removed; `isStepCount(n)` / `stepCountIs(n)` are the replacements). Flag: confirm the Convex Node runtime spike (see Risks).

**Webhook ingress on Convex Hono (`convex/http.ts`) — not a TanStack server route.**
The webhook lives at `convex.site` (the Convex HTTP deployment), keeping provider signature validation co-located with the DB writes in the same runtime. The Hono router in `convex/http.ts` already handles this pattern (`agentRequestHandler`, `resend.handleResendEventWebhook`) — extend it for `/webhooks/:provider/:tenantId`. `c.env` is the Convex `ActionCtx`, so the handler calls `c.env.scheduler.runAfter(0, internal.…)` (durable fire-and-forget) or `c.env.runAction(...)`.

**Contacts table: minimal for phase 002, extended later.**
`contacts` is defined with the fields needed to link `threads`/`calls` (`tenantId`, `phone`, `email`, `name`) plus the indexes required for upsert-by-phone or upsert-by-email. Deep contact enrichment (HubSpot sync, grouping, archival) is deferred to domain phases.

**Thread counters via convex-helpers `Triggers` (not `@convex-dev/aggregate`).**
Counter accuracy matters for the inbox UX. `Triggers` run atomically inside the triggering mutation's transaction (the trigger wraps `ctx.db`), so `messageCount`/`lastMessageAt` cannot drift. The wiring is: build one `const triggers = new Triggers<DataModel>()`, `triggers.register('messages', …)`, then define the message-writing mutations with `customMutation(rawInternalMutation, customCtx(triggers.wrapDB))`. **There is NO `triggers.middleware()` method in convex-helpers `0.1.119` — the original plan's `triggers.middleware()` is wrong. The real API is `triggers.wrapDB` (a ctx transform) used via `customCtx`, or the lower-level `writerWithTriggers(...)`.** `@convex-dev/aggregate` (O(log n) range sums for analytics) is deferred to phase 009 — complementary, not an alternative here.

---

## Open Questions

### Resolved

- **Polymorphic FK type:** `v.string()` for `parentId` + discriminated `parentType` literal — see decision above. Parent-read narrowing via `ctx.db.normalizeId(...)`.
- **Sequence under concurrency:** Convex OCC transactional retry makes read-max-then-increment safe inside a single mutation — no external counter needed.
- **Webhook runtime:** Convex Hono httpAction dispatching to an internal action via `c.env.scheduler.runAfter(0, …)` — not TanStack. Same router as existing `resend.handleResendEventWebhook`.
- **`runAgentTurn` streaming vs non-streaming:** Non-streaming (`ToolLoopAgent.generate()`) for webhook-driven turns; streaming is a separate UI path. Loop bound via `stopWhen: isStepCount(n)` (NOT `maxSteps`).
- **Triggers API:** `new Triggers<DataModel>()` + `.register(table, fn)` + `customMutation(raw, customCtx(triggers.wrapDB))`. No `.middleware()`.

### Deferred to Implementation

- **WhatsApp: Hono route vs Meta app-level callback + per-WABA override.** The design doc specifies registering the per-WABA callback override at embedded-signup time. This is a one-time operational step per tenant. The route `/webhooks/whatsapp/:tenantId` is registered here; Meta routing is a phase 003 operational concern.
- **Provider signature verification per provider** — VERIFY exact header names/methods per provider in the implementing phase: Twilio `X-Twilio-Signature` (HMAC-SHA1 over the full URL + sorted POST params, `twilio.validateRequest`); Meta WhatsApp `X-Hub-Signature-256` (HMAC-SHA256 of raw body with the app secret); ElevenLabs `ElevenLabs-Signature` (header is lowercased `elevenlabs-signature` on the wire; verify with the SDK `elevenlabs.webhooks.constructEvent(rawBody, sigHeader, secret)` which checks HMAC-SHA256 **and** the timestamp). The middleware scaffold is defined here; real HMAC impls land in phase 003 (per-adapter) and phase 005 (ElevenLabs).
- **Contact upsert strategy for voice:** ElevenLabs post-call payload does NOT carry a bare top-level phone number — the phone (for telephony calls) lives under `data.metadata` / `data.conversation_initiation_client_data` (dynamic vars). Upsert contact by `(tenantId, phone)` when resolvable; otherwise a placeholder contact. Tie-breaking when a number belongs to two contacts is deferred to phase 010 (migration). VERIFY the exact phone field path against a real Twilio-native ElevenLabs payload in phase 005.
- **`runAgentTurn` Polar metering hook:** `result.usage` is available from `ToolLoopAgent.generate()`; passing it to Polar is wired in phase 007.

---

## Output Structure

```
convex/
  schema.ts                          Modify — add contacts, threads, calls, messages tables
  http.ts                            Modify — add /webhooks/:provider/:tenantId Hono routes
  triggers.ts                        Create — convex-helpers Triggers instance + wrapped internalMutation factory
  contacts.ts                        Create — upsertByPhone, upsertPlaceholder, get, listByTenant
  threads.ts                         Create — upsert (by tenantId+channel+contactId), get, listByTenant
  calls.ts                           Create — upsert (by conversationId), patch, get, listByTenant
  messages.ts                        Create — insert (trigger-wrapped), patchDeliveryStatus, history (internalQuery), listByParent
  agentRuntime.ts                    Create — runAgentTurn internal action (Node runtime)  ['use node']
  webhooks.ts                        Create — ingestTextTurn, ingestVoicePostCall internal actions  ['use node']
src/server/
  webhooks/
    middleware.ts                    Create — provider signature verification scaffold (string-only, runtime-agnostic)
    providers/
      text.ts                        Create — generic text-turn normalizer stub (parseInboundText)
      voice.ts                       Create — ElevenLabs post-call payload Zod schema + parser stub
```

> Note on layout: existing Convex fns in this repo live directly under `convex/` (e.g. `convex/auth.ts`, `convex/resend.ts`, `convex/utils.ts`), not under a `convex/funcs/` subdir. This plan places new fns directly under `convex/` to match (the original plan's `convex/funcs/*` paths are corrected to `convex/*`). Internal-action files that use the AI SDK / Node-only APIs carry a top-of-file `'use node'` directive. Pure-string signature helpers and Zod schemas live under `src/server/webhooks/` and are imported into the Convex actions (they have no Convex or Node-runtime dependency themselves).

---

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────────┐
│  Inbound text webhook                                               │
│  POST /webhooks/{provider}/{tenantId}                               │
│  convex/http.ts (Hono on Convex; c.env === ActionCtx)              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ 1. verify provider signature (phase 003 adapter)
                   │ 2. c.env.scheduler.runAfter(0, internal.webhooks.ingestTextTurn, …)
                   │ 3. return 200 immediately
                   ▼
        ingestTextTurn (internalAction, 'use node', convex/webhooks.ts)
                   │  parse raw body via parseInboundText(provider, rawBody)  [phase 003 stub]
          ┌────────┴────────┐
          ▼                 ▼
  contacts.upsertByPhone  threads.upsert
  (internalMutation)      (by tenantId+channel+contactId, internalMutation)
          └────────┬────────┘
                   ▼
          messages.insert (inbound, role=user)  [trigger-wrapped internalMutation]
                   │  ← Trigger fires inside same txn: thread.messageCount++, lastMessageAt, preview
                   ▼
          agentRuntime.runAgentTurn (internalAction, 'use node')
                   │  ← ctx.runQuery(internal.messages.history, { parentType:'thread', parentId, limit:50 })
                   │  ← agent config stub (agents table is a later phase)
                   │  ← ToolLoopAgent.generate({ messages, ... }) with stopWhen: isStepCount(n)
                   ▼
          messages.insert (agent reply, role=agent)  ← Trigger fires
                   ▼
          channel adapter send (phase 003 stub)

┌─────────────────────────────────────────────────────────────────────┐
│  ElevenLabs post-call webhook                                       │
│  POST /webhooks/elevenlabs/{tenantId}                              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ verify elevenlabs-signature (SDK constructEvent; phase 005)
                   │ scheduler.runAfter(0, internal.webhooks.ingestVoicePostCall, …)
                   ▼
        ingestVoicePostCall (internalAction, 'use node', convex/webhooks.ts)
                   │  parse { type, event_timestamp, data } envelope → data.*
          ┌────────┴────────┐
          ▼                 ▼
  contacts.upsert(Placeholder)  calls.upsert (by conversationId)
  (phone resolution phase 005)  + calls.patch status/durationMs/cost
          └────────┬────────┘
                   ▼
          loop: messages.insert (transcript turns, parentType=call, explicit sequence)
                   │  (Trigger guard skips call-parent: no threads row to patch)
                   ▼
          Polar event: voice_minutes (phase 007 stub)
```

---

## Implementation Units

---

### Unit 1 — Schema: `contacts`, `threads`, `calls`, `messages`

**Goal:** Define all four tables in `convex/schema.ts` with validators and indexes exactly matching `threads-model.md §2`. The schema is the immutable contract everything else builds on.

**Requirements:** R1

**Dependencies:** None (schema is the base layer). Phase 001 must have established the Convex project and `tenant` table before deploying this schema alongside it.

**Files:**

- `convex/schema.ts` — Modify (currently `defineSchema({})`)

**Approach:**
Copy the verbatim validator blocks from `threads-model.md §2` into `defineSchema({})`. Add `contacts` with the minimal shape needed by `threads.contactId` / `calls.contactId` FKs and voice upsert-by-phone. Keep `messages.parentId` as `v.string()` (not `v.id(...)`) per the polymorphic FK decision. `threads.batchId` / `calls.batchId` in the design doc are `v.optional(v.id("batches"))`; since the `batches` table is not defined until phase 006, **either** (a) define them as `v.optional(v.id("batches"))` and land a stub `batches: defineTable({...})` here, **or** (b) keep them as `v.optional(v.string())` until phase 006 and tighten then. Recommend (b) for this phase to avoid a forward table dependency — VERIFY which the phase-006 plan expects and keep them consistent.

**Technical design (directional):**

```ts
// convex/schema.ts — directional, not final
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	// Minimal — enriched in later phases (phase 010 migration adds more fields)
	contacts: defineTable({
		tenantId: v.string(),
		phone: v.optional(v.string()), // E.164
		email: v.optional(v.string()),
		name: v.optional(v.string()),
		externalId: v.optional(v.string()), // CRM id (HubSpot etc.) — populated later
		archived: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant_phone', ['tenantId', 'phone'])
		.index('by_tenant_email', ['tenantId', 'email'])
		.index('by_tenant', ['tenantId']),

	// threads, calls, messages — VERBATIM validators from threads-model.md §2
	threads: defineTable({
		tenantId: v.string(),
		channel: v.union(
			v.literal('whatsapp'),
			v.literal('sms'),
			v.literal('widget'),
			v.literal('email'),
			v.literal('web'),
		),
		kind: v.union(
			v.literal('whatsapp_chat'),
			v.literal('sms'),
			v.literal('widget_text'),
			v.literal('email'),
			v.literal('web_chat'),
		),
		contactId: v.id('contacts'),
		channelExternalId: v.optional(v.string()),
		agentId: v.optional(v.string()),
		batchId: v.optional(v.string()), // option (b): string until phase 006 defines `batches`
		status: v.string(), // active | completed | abandoned
		lastMessageAt: v.optional(v.number()),
		lastMessagePreview: v.optional(v.string()),
		messageCount: v.number(),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant_channel_contact', ['tenantId', 'channel', 'contactId'])
		.index('by_tenant_kind_created', ['tenantId', 'kind', 'createdAt'])
		.index('by_contact', ['contactId'])
		.index('by_batch', ['batchId']),

	calls: defineTable({
		tenantId: v.string(),
		contactId: v.id('contacts'),
		kind: v.union(
			v.literal('voice_call'),
			v.literal('whatsapp_voice'),
			v.literal('widget_voice'),
		),
		conversationId: v.optional(v.string()), // conv_xxx (ElevenLabs)
		agentId: v.optional(v.string()),
		batchId: v.optional(v.string()), // option (b), as above
		status: v.string(), // pending|in_progress|completed|voicemail|no_answer|failed
		durationMs: v.optional(v.number()),
		audioUrl: v.optional(v.string()),
		providerCostUsd: v.optional(v.number()),
		failureReason: v.optional(v.string()),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_conversation', ['conversationId'])
		.index('by_tenant_created', ['tenantId', 'createdAt'])
		.index('by_contact', ['contactId'])
		.index('by_batch', ['batchId']),

	messages: defineTable({
		tenantId: v.string(),
		parentType: v.union(v.literal('thread'), v.literal('call')),
		parentId: v.string(), // threads._id or calls._id
		role: v.union(
			v.literal('user'),
			v.literal('agent'),
			v.literal('system'),
			v.literal('tool'),
		),
		direction: v.optional(v.union(v.literal('inbound'), v.literal('outbound'))),
		contentType: v.union(
			v.literal('text'),
			v.literal('audio'),
			v.literal('image'),
			v.literal('file'),
			v.literal('tool_call'),
			v.literal('tool_result'),
			v.literal('event'),
		),
		text: v.optional(v.string()),
		sequence: v.number(),
		timestamp: v.number(),
		providerMessageId: v.optional(v.string()),
		deliveryStatus: v.optional(v.string()),
		attachments: v.optional(
			v.array(
				v.object({
					storageId: v.optional(v.id('_storage')),
					url: v.optional(v.string()),
					kind: v.string(),
					mimeType: v.optional(v.string()),
					fileName: v.optional(v.string()),
					providerFileId: v.optional(v.string()),
				}),
			),
		),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
	})
		.index('by_parent_sequence', ['parentType', 'parentId', 'sequence'])
		.index('by_tenant_created', ['tenantId', 'createdAt'])
		.index('by_provider_message', ['providerMessageId']),
})
```

Note: Convex does NOT enforce FK integrity or uniqueness at the DB level. The `by_provider_message` index supports an application-level uniqueness guard (Unit 3), not a DB constraint. The optional `batchId` reference is safe before `batches` exists (option b uses `v.string()`).

**Patterns to follow:** Convex `defineTable` / `defineSchema`; replace the empty `defineSchema({})` shell in `convex/schema.ts`.

**Test scenarios:**

- `schema compiles` → `node_modules/.bin/tsc --noEmit` produces zero net-new errors in `convex/schema.ts` and `convex/_generated/`.
- `contacts index by_tenant_phone` → lookup by `(tenantId, phone)` returns the correct row in a dev deployment.
- `messages index by_provider_message` → lookup by `providerMessageId` returns at most one row (uniqueness verified at the application layer via the insert guard).

**Verification:**

```
node_modules/.bin/tsc --noEmit
# VERIFY exact deploy command — `convex deploy --dry-run` flag availability is version-dependent;
# confirm against the installed convex (1.41) CLI. Pushing schema to the dev deployment validates it:
bunx convex dev --once   # pushes + validates tables/indexes
```

---

### Unit 2 — Convex mutation layer: `contacts`, `threads`, `calls` (+ `messages.patchDeliveryStatus`)

**Goal:** Implement the upsert/patch mutations the ingestion flows call (`contacts.upsertByPhone`, `contacts.upsertPlaceholder`, `threads.upsert`, `calls.upsert`, `calls.patch`, `messages.patchDeliveryStatus`). `messages.insert` itself is defined in Unit 3 (it must be created via the trigger-wrapped factory).

**Requirements:** R3, R4, R10

**Dependencies:** Unit 1 (schema), Phase 001 (RLS wrappers available in `convex/utils.ts`).

**Files:**

- `convex/contacts.ts` — Create
- `convex/threads.ts` — Create
- `convex/calls.ts` — Create
- `convex/messages.ts` — Create (`patchDeliveryStatus` here; `insert`/`history` added in Units 3/7)

**Approach:**
These are webhook/internal-driven writes, so use the raw `internalMutation` from `convex/_generated/server` (NOT `authMutation` — there is no authenticated WorkOS session on a webhook; tenant comes from the trusted route param). Public, client-facing reads/writes (Unit 7) use `authQuery`/`authMutation` from `convex/utils.ts`. Internal actions call these via `ctx.runMutation(internal.messages.insert, …)`.

`calls.upsert`: check `by_conversation` for `conversationId` via `.unique()` — if exists, return existing `_id`; otherwise insert. `threads.upsert`: same pattern on `by_tenant_channel_contact`. (See Unit 3 for the OCC caveat on a true-concurrent first insert of a not-yet-existing row.)

**Technical design (directional):**

```ts
// convex/messages.ts — patchDeliveryStatus (insert is in Unit 3)
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

export const patchDeliveryStatus = internalMutation({
	args: { providerMessageId: v.string(), deliveryStatus: v.string() },
	handler: async (ctx, { providerMessageId, deliveryStatus }) => {
		const msg = await ctx.db
			.query('messages')
			.withIndex('by_provider_message', (q) =>
				q.eq('providerMessageId', providerMessageId),
			)
			.unique()
		if (!msg) return // provider fired status for a message we don't track — ignore
		await ctx.db.patch(msg._id, { deliveryStatus })
	},
})
```

```ts
// convex/threads.ts — upsert (directional)
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

export const upsert = internalMutation({
	args: {
		tenantId: v.string(),
		channel: v.union(
			v.literal('whatsapp'),
			v.literal('sms'),
			v.literal('widget'),
			v.literal('email'),
			v.literal('web'),
		),
		kind: v.union(
			v.literal('whatsapp_chat'),
			v.literal('sms'),
			v.literal('widget_text'),
			v.literal('email'),
			v.literal('web_chat'),
		),
		contactId: v.id('contacts'),
		channelExternalId: v.optional(v.string()),
		agentId: v.optional(v.string()),
		batchId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('threads')
			.withIndex('by_tenant_channel_contact', (q) =>
				q
					.eq('tenantId', args.tenantId)
					.eq('channel', args.channel)
					.eq('contactId', args.contactId),
			)
			.unique()
		if (existing) return existing._id
		const now = Date.now()
		return await ctx.db.insert('threads', {
			...args,
			status: 'active',
			messageCount: 0,
			createdAt: now,
			updatedAt: now,
		})
	},
})
```

```ts
// convex/contacts.ts — upsertByPhone + upsertPlaceholder (directional)
export const upsertByPhone = internalMutation({
	args: {
		tenantId: v.string(),
		phone: v.string(),
		name: v.optional(v.string()),
	},
	handler: async (ctx, { tenantId, phone, name }) => {
		const existing = await ctx.db
			.query('contacts')
			.withIndex('by_tenant_phone', (q) =>
				q.eq('tenantId', tenantId).eq('phone', phone),
			)
			.unique()
		if (existing) return existing._id
		const now = Date.now()
		return await ctx.db.insert('contacts', {
			tenantId,
			phone,
			name,
			createdAt: now,
			updatedAt: now,
		})
	},
})

// Used by voice ingestion until phase 005 resolves the real phone.
export const upsertPlaceholder = internalMutation({
	args: { tenantId: v.string() },
	handler: async (ctx, { tenantId }) => {
		const now = Date.now()
		return await ctx.db.insert('contacts', {
			tenantId,
			createdAt: now,
			updatedAt: now,
		})
	},
})
```

```ts
// convex/calls.ts — upsert + patch (directional)
export const upsert = internalMutation({
	args: {
		tenantId: v.string(),
		conversationId: v.string(),
		contactId: v.id('contacts'),
		kind: v.union(
			v.literal('voice_call'),
			v.literal('whatsapp_voice'),
			v.literal('widget_voice'),
		),
		agentId: v.optional(v.string()),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('calls')
			.withIndex('by_conversation', (q) =>
				q.eq('conversationId', args.conversationId),
			)
			.unique()
		if (existing) return existing._id
		const now = Date.now()
		return await ctx.db.insert('calls', {
			...args,
			createdAt: now,
			updatedAt: now,
		})
	},
})

export const patch = internalMutation({
	args: {
		callId: v.id('calls'),
		status: v.optional(v.string()),
		durationMs: v.optional(v.number()),
		audioUrl: v.optional(v.string()),
		providerCostUsd: v.optional(v.number()),
	},
	handler: async (ctx, { callId, ...fields }) => {
		await ctx.db.patch(callId, { ...fields, updatedAt: Date.now() })
	},
})
```

**Patterns to follow:** raw `internalMutation` from `convex/_generated/server` for webhook/internal-driven writes; `authMutation` from `convex/utils.ts` only for client-facing writes.

**Test scenarios:**

- `threads.upsert convergence` → two sequential calls with `(tenantId, channel, contactId)` both return the same thread `_id`.
- `messages.patchDeliveryStatus hit` → status updates from `sent` to `delivered` on the correct row.
- `messages.patchDeliveryStatus miss` → unknown `providerMessageId` is a silent no-op (no throw).
- `calls.upsert idempotency` → two upserts for the same `conversationId` return the same `_id`.
- `contacts.upsertByPhone` → second call with same `(tenantId, phone)` returns the first `_id`.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/messages.test.ts
node_modules/.bin/vp test run convex/threads.test.ts
node_modules/.bin/vp test run convex/calls.test.ts
# VERIFY: tests use convex-test (an in-memory Convex runtime) — confirm convex-test is added as a devDep.
```

---

### Unit 3 — convex-helpers Triggers: thread counters + trigger-wrapped `messages.insert`

**Goal:** Register a `Triggers` handler on the `messages` table that atomically patches the parent thread's `messageCount`, `lastMessageAt`, and `lastMessagePreview` on every insert, and define `messages.insert` through the trigger-wrapped mutation factory so the trigger always fires. Triggers run inside the same Convex transaction as the triggering mutation — no drift possible.

**Requirements:** R5, R2, R3

**Dependencies:** Unit 1 (schema), Unit 2 (other mutations), Phase 001 (Triggers bootstrap pattern — if phase 001 already creates a shared `triggers` instance + wrapped factory, REUSE it instead of creating a second one; a second `Triggers` instance with its own wrapped factory would not see writes done through the first).

**Files:**

- `convex/triggers.ts` — Create (or extend the phase-001 shared instance)
- `convex/messages.ts` — Modify (define `insert` via the trigger-wrapped factory)

**Approach:**
`convex-helpers` `0.1.119` ships `Triggers` at `convex-helpers/server/triggers`. Correct API (verified against the installed `.d.ts`): construct `new Triggers<DataModel>()`, call `triggers.register('messages', async (ctx, change) => …)`, then build the mutation factory with `customMutation(rawInternalMutation, customCtx(triggers.wrapDB))` from `convex-helpers/server/customFunctions`. The `change` object is `{ id, operation: 'insert'|'update'|'delete', oldDoc, newDoc }`. There is **no `triggers.middleware()`** (the original plan's call is invalid).

The trigger fires only for `thread`-parent messages (voice call messages have no `threads` row). Guard on `change.operation === 'insert'` and `change.newDoc.parentType === 'thread'`, and narrow the parent id with `ctx.db.normalizeId('threads', change.newDoc.parentId)`.

Idempotency (R3): Convex has no unique constraints. In `messages.insert`, before inserting, if `providerMessageId` is provided, read `by_provider_message` via `.unique()` — if a row exists, return its `_id` without inserting. This collapses duplicate webhook deliveries (the common case). Under a true concurrent double-delivery of a not-yet-existing row, OCC does not serialize a read-then-write across distinct documents, so a residual race exists — accept it as rare and rely on `scheduler.runAfter(0,…)` dispatch ordering + the read guard. VERIFY whether stricter de-dup is required; if so, phase 003 can add a dedicated `webhookEvents` idempotency-key table (mirrors the legacy `events` audit row).

**Technical design (CORRECTED — `wrapDB` + `customCtx`, not `.middleware()`):**

```ts
// convex/triggers.ts
import {
	customCtx,
	customMutation,
} from 'convex-helpers/server/customFunctions'
import { Triggers } from 'convex-helpers/server/triggers'
import { internalMutation as rawInternalMutation } from './_generated/server'
import type { DataModel } from './_generated/dataModel'

export const triggers = new Triggers<DataModel>()

triggers.register('messages', async (ctx, change) => {
	if (change.operation !== 'insert') return
	const msg = change.newDoc
	if (msg.parentType !== 'thread') return

	const threadId = ctx.db.normalizeId('threads', msg.parentId)
	if (!threadId) return
	const thread = await ctx.db.get(threadId)
	if (!thread) return

	await ctx.db.patch(threadId, {
		messageCount: (thread.messageCount ?? 0) + 1,
		lastMessageAt: msg.timestamp,
		lastMessagePreview: msg.text?.slice(0, 120),
		updatedAt: Date.now(),
	})
})

// Trigger-aware internalMutation factory — every mutation defined with this
// runs registered triggers inside the same transaction.
export const internalMutationWithTriggers = customMutation(
	rawInternalMutation,
	customCtx(triggers.wrapDB),
)
```

```ts
// convex/messages.ts — insert defined via the trigger-wrapped factory
import { v } from 'convex/values'
import { internalMutationWithTriggers } from './triggers'

export const insert = internalMutationWithTriggers({
	args: {
		tenantId: v.string(),
		parentType: v.union(v.literal('thread'), v.literal('call')),
		parentId: v.string(),
		role: v.union(
			v.literal('user'),
			v.literal('agent'),
			v.literal('system'),
			v.literal('tool'),
		),
		direction: v.optional(v.union(v.literal('inbound'), v.literal('outbound'))),
		contentType: v.union(
			v.literal('text'),
			v.literal('audio'),
			v.literal('image'),
			v.literal('file'),
			v.literal('tool_call'),
			v.literal('tool_result'),
			v.literal('event'),
		),
		text: v.optional(v.string()),
		sequence: v.optional(v.number()), // explicit for voice bulk-insert; computed for text
		timestamp: v.number(),
		providerMessageId: v.optional(v.string()),
		attachments: v.optional(v.array(v.any())), // tighten to the §2 attachment shape in impl
		metadata: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		// Idempotency guard (R3) — common-case redelivery; see OCC caveat above.
		if (args.providerMessageId) {
			const existing = await ctx.db
				.query('messages')
				.withIndex('by_provider_message', (q) =>
					q.eq('providerMessageId', args.providerMessageId),
				)
				.unique()
			if (existing) return existing._id
		}

		// Sequence: explicit if provided, else read-max-then-increment (OCC-safe within the txn).
		let sequence = args.sequence
		if (sequence === undefined) {
			const last = await ctx.db
				.query('messages')
				.withIndex('by_parent_sequence', (q) =>
					q.eq('parentType', args.parentType).eq('parentId', args.parentId),
				)
				.order('desc')
				.first()
			sequence = (last?.sequence ?? -1) + 1
		}

		const { sequence: _omit, ...rest } = args
		return await ctx.db.insert('messages', {
			...rest,
			sequence,
			createdAt: Date.now(),
		})
	},
})
```

**Patterns to follow:** `rebuild-architecture.md §6` Triggers rationale; convex-helpers `Triggers` (`server/triggers`) + `customMutation`/`customCtx` (`server/customFunctions`) — the canonical wiring shown in the helper's own docstring (`customMutation(rawMutation, customCtx(triggers.wrapDB))`).

**Test scenarios:**

- `trigger increments messageCount` → thread starts at `0`; after 3 thread-parent inserts, `messageCount === 3`.
- `trigger updates lastMessageAt` → equals the timestamp of the most recent inserted message.
- `trigger preview` → `lastMessagePreview` is the first 120 chars of the latest message text.
- `trigger call-parent skip` → inserting `parentType: 'call'` does not patch any threads row.
- `trigger atomic` → if the mutation throws after insert, the counter patch is rolled back (Convex transaction semantics).
- `insert sequence` → three sequential thread inserts produce `0, 1, 2`.
- `insert idempotency` → same `providerMessageId` twice returns the same `_id`, one row.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/triggers.test.ts
node_modules/.bin/vp test run convex/messages.test.ts
```

---

### Unit 4 — Webhook HTTP routes in `convex/http.ts`

**Goal:** Register `/webhooks/:provider/:tenantId` (text) and `/webhooks/elevenlabs/:tenantId` (voice post-call) on the existing Convex Hono router. The handler verifies the provider signature (scaffolded here; impls in phases 003/005), reads the raw body, dispatches to the appropriate internal action via the scheduler, and returns `200` immediately.

**Requirements:** R8, R10

**Dependencies:** Unit 2/3 (internal mutations + `messages.insert` exist), Unit 5/6 (internal actions exist — or register routes with a TODO dispatch first), existing Hono router in `convex/http.ts`.

**Files:**

- `convex/http.ts` — Modify (add routes; register the more specific `/webhooks/elevenlabs/:tenantId` BEFORE the generic `/webhooks/:provider/:tenantId`)
- `src/server/webhooks/middleware.ts` — Create (provider signature verification scaffold — pure functions on `(rawBody: string, headers: Record<string,string>)`)
- `src/server/webhooks/providers/text.ts` — Create (`parseInboundText(provider, rawBody)` stub)
- `src/server/webhooks/providers/voice.ts` — Create (ElevenLabs payload Zod schema + parse — see Unit 6)

**Approach:**
Tenant is always read from the route param — never from a DB lookup. The handler dispatches with `c.env.scheduler.runAfter(0, internal.webhooks.ingestTextTurn, { tenantId, provider, rawBody, headers })` (durable, survives the HTTP response; preferred over `void c.env.runAction(...)` which is not guaranteed to complete after the response is returned). Return `200` immediately. `c.env` is the Convex `ActionCtx` (confirmed in `convex/http.ts`'s `HonoWithConvex<ActionCtx>` typing), so `c.env.scheduler` / `c.env.runAction` are available.

Signature verification is a function returning `boolean` (or throwing) — stubs return `true` in dev; real per-provider impls plug in (phases 003/005). For ElevenLabs, the real impl uses the SDK `elevenlabs.webhooks.constructEvent(rawBody, sigHeader, secret)` (header `elevenlabs-signature`).

**Technical design (directional — additions to the existing `app`):**

```ts
// convex/http.ts — additions (the existing `app`, `HttpRouterWithHono`, authKit.registerRoutes stay)
import { internal } from './_generated/api'
import { verifyProviderSignature } from '@server/webhooks/middleware'

// Voice (more specific) FIRST so it isn't shadowed by the generic route.
app.post('/webhooks/elevenlabs/:tenantId', async (c) => {
	const { tenantId } = c.req.param()
	const rawBody = await c.req.text()
	const headers = Object.fromEntries(c.req.raw.headers.entries())

	const sigOk = await verifyProviderSignature('elevenlabs', rawBody, headers)
	if (!sigOk) return c.text('Forbidden', 403)

	await c.env.scheduler.runAfter(0, internal.webhooks.ingestVoicePostCall, {
		tenantId,
		rawBody,
	})
	return c.text('ok', 200)
})

// Generic text channels: whatsapp, sms, email, widget
app.post('/webhooks/:provider/:tenantId', async (c) => {
	const { provider, tenantId } = c.req.param()
	const rawBody = await c.req.text()
	const headers = Object.fromEntries(c.req.raw.headers.entries())

	const sigOk = await verifyProviderSignature(provider, rawBody, headers)
	if (!sigOk) return c.text('Forbidden', 403)

	await c.env.scheduler.runAfter(0, internal.webhooks.ingestTextTurn, {
		tenantId,
		provider,
		rawBody,
		headers,
	})
	return c.text('ok', 200)
})
```

> Hono route precedence note: with `hono/tiny` (used here), register the literal `/webhooks/elevenlabs/:tenantId` before the param `/webhooks/:provider/:tenantId`. VERIFY ordering behavior with a quick test — `hono/tiny` uses a smaller router; confirm it honors static-over-param precedence for this overlap, and if not, branch on `provider === 'elevenlabs'` inside the single generic handler instead.
>
> Meta WhatsApp GET verification: Meta requires a `GET` challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`) on the callback URL at subscription time. Add the matching `app.get('/webhooks/whatsapp/:tenantId', …)` in phase 003 (operational), noted here so the route shape is reserved.

**Patterns to follow:** existing `app.post('/resend/events', …)` and `app.on('POST', ['/api/agents','/api/chat'], …)` handlers in `convex/http.ts`; `rebuild-architecture.md §5` (tenant from route, no lookup table).

**Test scenarios:**

- `route param extraction` → `provider=twilio`, `tenantId=org_01H…` extracted from the path.
- `bad signature → 403` → invalid HMAC returns 403 before any dispatch/DB write.
- `dispatch then 200` → handler returns 200 and the scheduled action runs (verify the row appears after the scheduler drains).
- `elevenlabs route priority` → `POST /webhooks/elevenlabs/org_abc` hits the voice handler, not the generic text handler.

**Verification:**

```
node_modules/.bin/tsc --noEmit
# Manual: curl POST to <deployment>.convex.site/webhooks/twilio/org_test → 200
# Manual: curl POST with wrong sig → 403
```

---

### Unit 5 — Text ingestion action: `ingestTextTurn` + `runAgentTurn`

**Goal:** Implement the text inbound flow as two Convex internal actions: `ingestTextTurn` orchestrates upsert-contact → upsert-thread → insert-inbound-message → call `runAgentTurn`; `runAgentTurn` loads history, builds a v7 `ToolLoopAgent`, runs `.generate()`, and inserts the agent reply. Adapt the `src/server/ai/index.ts` pattern (non-streaming).

**Requirements:** R6, R9, R11

**Dependencies:** Units 1–4, `src/server/ai/index.ts` + `src/server/ai/agents/routing.ts` (existing), Phase 001.

**Files:**

- `convex/webhooks.ts` — Create (`ingestTextTurn`; `ingestVoicePostCall` added in Unit 6) — top-of-file `'use node'`
- `convex/agentRuntime.ts` — Create (`runAgentTurn`) — top-of-file `'use node'`

**Approach:**
Both files start with `'use node'` (Convex Node-runtime directive) because the AI SDK v7-beta is not guaranteed V8-safe. `ingestTextTurn` receives `{ tenantId, provider, rawBody, headers }`, normalizes via `parseInboundText(provider, rawBody)` (phase 003 stub → `{ phone, text, providerMessageId, channelExternalId, channel, kind }`), upserts contact + thread, inserts the inbound message, then `ctx.runAction(internal.agentRuntime.runAgentTurn, …)`.

`runAgentTurn` reads history via `ctx.runQuery(internal.messages.history, { parentType:'thread', parentId, limit:50 })`, builds a `ToolLoopAgent` matching `src/server/ai/index.ts` (`model: gateway('anthropic/claude-haiku-4.5')`, `instructions`, `stopWhen: isStepCount(6)`), calls `agent.generate({ messages })`, inserts the reply, logs `result.usage` (Polar hook phase 007), and calls the channel-send stub (phase 003).

**v7-beta API specifics (verified against installed `ai@7.0.0-beta.178`):**

- `new ToolLoopAgent({ id, model, instructions, stopWhen, tools?, reasoning? })`. `stopWhen` is a settings field; pass `stopWhen: isStepCount(6)`. **`maxSteps` does NOT exist** — the original plan's `agent.generate({ messages, maxSteps: 6 })` is wrong on two counts (no `maxSteps`, and the stop condition belongs in agent settings, not the call).
- `agent.generate({ prompt | messages })` — `messages` must be `ModelMessage[]` (role + content); `prompt` may be a string or `ModelMessage[]`. For converting stored UIMessage-shaped data you would use `await convertToModelMessages(uiMessages)` (it is async in this beta — await it); here history rows are plain text turns, so a direct `{ role, content }[]` mapping to `ModelMessage` is fine.
- `result.text` and `result.usage` are on the returned `GenerateTextResult`.
- Do NOT use the removed result-method `result.toUIMessageStream()`; the orchestrator's streaming path (not used here) uses the top-level `toUIMessageStream({ stream })` (as in `src/server/ai/agents/routing.ts`).

**V8 runtime risk (R11):** mark `agentRuntime.ts` and `webhooks.ts` with `'use node'`. SPIKE first: deploy a minimal `'use node'` internalAction that imports `ai` + `@ai-sdk/gateway` and calls `gateway('anthropic/claude-haiku-4.5')` to confirm the AI SDK loads under the deployed Convex Node runtime before building out `runAgentTurn`. Fallback if blocked: run the turn in a TanStack server function that calls the Convex internal mutations via a `ConvexHttpClient`, with the webhook httpAction scheduling a notify instead of running the model inline.

**Technical design (CORRECTED — `stopWhen: isStepCount`, no `maxSteps`):**

```ts
// convex/agentRuntime.ts
'use node'
import { v } from 'convex/values'
import { gateway } from '@ai-sdk/gateway'
import { ToolLoopAgent, isStepCount, type ModelMessage } from 'ai'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'

export const runAgentTurn = internalAction({
	args: {
		tenantId: v.string(),
		threadId: v.string(),
		inboundText: v.string(),
	},
	handler: async (ctx, { tenantId, threadId, inboundText }) => {
		const history = await ctx.runQuery(internal.messages.history, {
			parentType: 'thread',
			parentId: threadId,
			limit: 50,
		})

		// Agent config stub — resolved from the agents table in a later phase.
		const agent = new ToolLoopAgent({
			id: `agent.io-${tenantId}`,
			model: gateway('anthropic/claude-haiku-4.5'),
			instructions: 'You are a helpful agent. Respond to the user message.',
			stopWhen: isStepCount(6),
			// tools: {} — routing tools (src/server/ai/agents/routing.ts) added in phase 004
		})

		const messages: ModelMessage[] = [
			...history.map((m) => ({
				role: (m.role === 'agent'
					? 'assistant'
					: m.role) as ModelMessage['role'],
				content: m.text ?? '',
			})),
			{ role: 'user', content: inboundText },
		]

		const result = await agent.generate({ messages })

		await ctx.runMutation(internal.messages.insert, {
			tenantId,
			parentType: 'thread',
			parentId: threadId,
			role: 'agent',
			direction: 'outbound',
			contentType: 'text',
			text: result.text,
			timestamp: Date.now(),
		})

		console.log('[agentRuntime] usage', result.usage) // phase 007 → Polar
		// Phase 003 stub: await ctx.runAction(internal.channels.send, { threadId, text: result.text })
	},
})
```

```ts
// convex/webhooks.ts — ingestTextTurn
'use node'
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { parseInboundText } from '@server/webhooks/providers/text'

export const ingestTextTurn = internalAction({
	args: {
		tenantId: v.string(),
		provider: v.string(),
		rawBody: v.string(),
		headers: v.any(),
	},
	handler: async (ctx, { tenantId, provider, rawBody }) => {
		const parsed = parseInboundText(provider, rawBody) // phase 003 stub
		if (!parsed) return

		const contactId = await ctx.runMutation(internal.contacts.upsertByPhone, {
			tenantId,
			phone: parsed.phone,
		})
		const threadId = await ctx.runMutation(internal.threads.upsert, {
			tenantId,
			channel: parsed.channel,
			kind: parsed.kind,
			contactId,
			channelExternalId: parsed.channelExternalId,
		})
		await ctx.runMutation(internal.messages.insert, {
			tenantId,
			parentType: 'thread',
			parentId: threadId,
			role: 'user',
			direction: 'inbound',
			contentType: 'text',
			text: parsed.text,
			timestamp: Date.now(),
			providerMessageId: parsed.providerMessageId,
		})
		await ctx.runAction(internal.agentRuntime.runAgentTurn, {
			tenantId,
			threadId,
			inboundText: parsed.text,
		})
	},
})
```

**Patterns to follow:** `src/server/ai/index.ts` (`ToolLoopAgent` + `gateway(model)`); `src/server/ai/agents/routing.ts` (specialist tools, phase 004). `runAgentTurn` deliberately uses `.generate()` (non-streaming), not the `routing()` stream tools.

**Test scenarios:**

- `ingestTextTurn happy path` → thread upserted, inbound `role=user sequence=0`, `runAgentTurn` called, agent `role=agent sequence=1`.
- `runAgentTurn history load` → a thread with 5 messages produces a 5-message `ModelMessage[]` (plus the new user turn).
- `runAgentTurn reply inserted` → after `generate()`, a `role=agent` row exists.
- `runAgentTurn usage logged` → `result.usage` appears (spy on `console.log`).
- `runAgentTurn stop condition` → agent built with `stopWhen: isStepCount(6)` (type-level; no `maxSteps` reference anywhere).
- `node runtime spike` → minimal `'use node'` action importing `ai` loads in the deployed runtime.
- `ingestTextTurn idempotency` → same `providerMessageId` twice → exactly one inbound row.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/agentRuntime.test.ts
node_modules/.bin/vp test run convex/webhooks.test.ts
node_modules/.bin/biome check --write convex/agentRuntime.ts convex/webhooks.ts
```

---

### Unit 6 — Voice ingestion action: `ingestVoicePostCall`

**Goal:** Implement the ElevenLabs post-call ingestion: parse the `{ type, event_timestamp, data }` envelope, upsert call by `conversationId`, bulk-insert transcript turns (`parentType=call`, explicit sequence), patch call fields, and log a Polar voice-minutes stub.

**Requirements:** R7

**Dependencies:** Units 1–3 (schema + `calls.upsert`/`calls.patch`/`messages.insert`), Unit 4 (route). Phase 005 completes ElevenLabs signature verification (SDK `constructEvent`) and replaces the directional Zod schema with SDK types.

**Files:**

- `convex/webhooks.ts` — Modify (add `ingestVoicePostCall`)
- `src/server/webhooks/providers/voice.ts` — Create (`ElevenLabsPostCallSchema` + `parsePostCall`)

**Approach (CORRECTED payload shape):**
The ElevenLabs `post_call_transcription` webhook is an **envelope**: `{ type: 'post_call_transcription', event_timestamp, data: {...} }`. The conversation data lives under `data`, NOT at the top level. The original plan's flat schema (`conversation_id`, `from_phone`, `recording_url`, `metadata.*` at the root) is wrong:

- `conversation_id`, `agent_id`, `status`, `transcript[]` are under `data`.
- transcript turns are `{ role: 'agent'|'user', message, time_in_call_secs, … }` under `data.transcript`.
- duration/cost are `data.metadata.call_duration_secs` and `data.metadata.cost`.
- **There is no `recording_url` / `from_phone` field.** Audio arrives via a SEPARATE `post_call_audio` webhook (base64), not this one — so `audioUrl` from this webhook should stay undefined here (set it in phase 005 when wiring the audio webhook or fetching the recording via the API). Phone (for native telephony) is under `data.metadata` / `data.conversation_initiation_client_data.dynamic_variables` — VERIFY the exact path against a real telephony payload in phase 005.

In this phase, parse with a directional Zod schema in `src/server/webhooks/providers/voice.ts`; phase 005 swaps to the SDK's typed `constructEvent` result. Upsert the call by `conversationId`, insert each transcript turn with explicit `sequence: i` and `providerMessageId: ${conversationId}-turn-${i}` (idempotent redelivery), then `calls.patch`. Contact upsert uses a placeholder until phase 005 resolves the real phone.

`bulkInsert` is not a special Convex op — it's a loop of `ctx.runMutation(internal.messages.insert, …)` from the action. Because each insert is its own mutation, per-turn idempotency relies on the `providerMessageId` guard.

**Technical design (CORRECTED — envelope + `data.*`, no `recording_url`/`from_phone` at root):**

```ts
// src/server/webhooks/providers/voice.ts
import { z } from 'zod'

export const ElevenLabsPostCallSchema = z.object({
	type: z.literal('post_call_transcription'),
	event_timestamp: z.number().optional(),
	data: z.object({
		conversation_id: z.string(),
		agent_id: z.string().optional(),
		status: z.string(),
		transcript: z.array(
			z.object({
				role: z.string(), // 'agent' | 'user'
				message: z.string().nullable().optional(),
				time_in_call_secs: z.number().optional(),
			}),
		),
		metadata: z
			.object({
				call_duration_secs: z.number().optional(),
				cost: z.number().optional(),
				start_time_unix_secs: z.number().optional(),
				// phone path for telephony lives here or under conversation_initiation_client_data — VERIFY (phase 005)
			})
			.optional(),
		conversation_initiation_client_data: z.any().optional(),
	}),
})

export function parsePostCall(rawBody: string) {
	return ElevenLabsPostCallSchema.parse(JSON.parse(rawBody)).data
}
```

```ts
// convex/webhooks.ts — ingestVoicePostCall (same 'use node' file as ingestTextTurn)
import { parsePostCall } from '@server/webhooks/providers/voice'

export const ingestVoicePostCall = internalAction({
	args: { tenantId: v.string(), rawBody: v.string() },
	handler: async (ctx, { tenantId, rawBody }) => {
		const data = parsePostCall(rawBody) // throws on malformed payload before any DB write

		// Placeholder contact for this phase; real phone resolution in phase 005.
		const contactId = await ctx.runMutation(
			internal.contacts.upsertPlaceholder,
			{ tenantId },
		)

		const callId = await ctx.runMutation(internal.calls.upsert, {
			tenantId,
			conversationId: data.conversation_id,
			agentId: data.agent_id,
			kind: 'voice_call',
			contactId,
			status: data.status,
		})

		for (let i = 0; i < data.transcript.length; i++) {
			const turn = data.transcript[i]
			await ctx.runMutation(internal.messages.insert, {
				tenantId,
				parentType: 'call',
				parentId: callId,
				role: turn.role === 'agent' ? 'agent' : 'user',
				contentType: 'text',
				text: turn.message ?? '',
				sequence: i, // transcript is already ordered → explicit sequence
				timestamp: Date.now(),
				providerMessageId: `${data.conversation_id}-turn-${i}`,
				metadata: { kind: 'voice', timeInCallSecs: turn.time_in_call_secs },
			})
		}

		await ctx.runMutation(internal.calls.patch, {
			callId,
			status: data.status === 'done' ? 'completed' : data.status,
			durationMs: (data.metadata?.call_duration_secs ?? 0) * 1000,
			// audioUrl: undefined — set in phase 005 via post_call_audio webhook or recording fetch
			providerCostUsd: data.metadata?.cost,
		})

		console.log('[ingestVoicePostCall] polar stub', {
			tenantId,
			minutes: (data.metadata?.call_duration_secs ?? 0) / 60,
		})
	},
})
```

**Patterns to follow:** `threads-model.md §6` voice flow; ElevenLabs post-call webhook docs (envelope + `data.*`, signature `elevenlabs-signature` via SDK `constructEvent`).

**Test scenarios:**

- `ingestVoicePostCall happy path` → a 5-turn `data.transcript` produces 5 rows, sequences 0–4, all `parentType=call`.
- `ingestVoicePostCall idempotency` → running twice with the same payload → exactly 5 rows (per-turn `providerMessageId` de-dupes).
- `ingestVoicePostCall call patched` → call row has `status=completed`, `durationMs` after the action; `audioUrl` stays undefined this phase.
- `ingestVoicePostCall envelope` → schema rejects a flat (non-enveloped) body and accepts `{ type, data }`.
- `ingestVoicePostCall bad payload` → malformed JSON / missing `data.conversation_id` throws at Zod parse, before any DB write.
- `trigger skip on call-parent` → the messages Trigger does not patch a threads row for `parentType=call`.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/webhooks.test.ts
node_modules/.bin/biome check --write convex/webhooks.ts src/server/webhooks/providers/voice.ts
```

---

### Unit 7 — Query layer: `messages.history`, `threads.listByTenant`, `calls.get`

**Goal:** Implement the reads needed by `runAgentTurn` (history) and future UI (inbox list, thread/call detail). Internal-only reads use `internalQuery`; client-facing reads use `authQuery` (tenant from `ctx.org.organizationId`).

**Requirements:** R10

**Dependencies:** Unit 1 (schema), Unit 2 (mutations), Phase 001 (`authQuery`).

**Files:**

- `convex/messages.ts` — Modify (add `history` internalQuery)
- `convex/threads.ts` — Modify (add `listByTenant`, `get`)
- `convex/calls.ts` — Modify (add `get`, `listByTenant`)
- `convex/contacts.ts` — Modify (add `get`, `listByTenant`)

**Approach:**
`messages.history` is an `internalQuery` (called from internal actions) — args `parentType`, `parentId`, `limit`; returns messages ordered by `by_parent_sequence` ascending. Client-facing `threads.listByTenant` / `calls.listByTenant` use `authQuery` from `convex/utils.ts`; **the tenant comes from `ctx.org.organizationId`** (injected by the `authQuery` input transform — verified in `convex/utils.ts`), NOT from a client arg. The `includes(...)` helper (from `convex/utils.ts`) applies a conditional index.

**Technical design (CORRECTED — `ctx.org.organizationId`, `internalQuery` from generated server, `includes` API matches utils.ts):**

```ts
// convex/messages.ts — history (internal)
import { internalQuery } from './_generated/server'
import { v } from 'convex/values'

export const history = internalQuery({
	args: {
		parentType: v.union(v.literal('thread'), v.literal('call')),
		parentId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { parentType, parentId, limit = 50 }) => {
		return await ctx.db
			.query('messages')
			.withIndex('by_parent_sequence', (q) =>
				q.eq('parentType', parentType).eq('parentId', parentId),
			)
			.order('asc')
			.take(limit)
	},
})
```

```ts
// convex/threads.ts — client-facing, RLS via authQuery
import { authQuery, includes } from './utils'
import { v } from 'convex/values'

export const listByTenant = authQuery({
	args: { kind: v.optional(v.string()), limit: v.optional(v.number()) },
	handler: async (ctx, { kind, limit = 50 }) => {
		const tenantId = ctx.org.organizationId // injected by authQuery — never trust a client tenantId
		return await includes(ctx.db.query('threads'))
			// when kind absent, fall back to a tenant-prefixed index range so every path stays tenant-filtered
			.matching(
				'by_tenant_kind_created',
				(q) =>
					kind
						? q.eq('tenantId', tenantId).eq('kind', kind)
						: q.eq('tenantId', tenantId),
				true,
			)
			.execute((data) => data.slice(0, limit))
	},
})
```

> Note: `authQuery` args go through the zod4 custom-query layer; `v.optional(v.string())` here is illustrative — match the exact arg-validator convention used by other `authQuery` fns in the repo (zod vs `v.*`). VERIFY against the first real `authQuery` written in phase 001.

**Patterns to follow:** `convex/utils.ts` `authQuery` (ctx has `user` + `org`); `includes(...).matching(...).execute(...)` exactly as defined in `convex/utils.ts`; `AuthCtx` type for handler typing.

**Test scenarios:**

- `messages.history ordered` → 10 messages in ascending sequence.
- `messages.history limit` → `limit=3` → at most 3 rows.
- `threads.listByTenant RLS` → org A query never returns org B threads (tenant from `ctx.org`, not args).
- `threads.listByTenant kind filter` → `kind=whatsapp_chat` returns only those.
- `calls.get unknown id` → returns null, no throw.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/messages.test.ts
node_modules/.bin/vp test run convex/threads.test.ts
node_modules/.bin/biome check --write convex/messages.ts convex/threads.ts convex/calls.ts
```

---

## System-Wide Impact

- **`convex/schema.ts`** — `defineSchema({})` → 4 new tables, ~12 new indexes. Phases 003–010 have a schema dependency on this plan.
- **`convex/http.ts`** — two new Hono routes; register `/webhooks/elevenlabs/:tenantId` before the generic `/webhooks/:provider/:tenantId` (or branch inside one handler for `hono/tiny`).
- **`convex/_generated/`** — `api.ts` / `dataModel.ts` regenerated on `bunx convex dev`; downstream `_generated` importers re-resolve.
- **Phase 003 dependency** — channel adapters implement `parseInboundText(provider, rawBody)` (stub here) + `internal.channels.send` (called from `runAgentTurn`) + per-provider signature verification (Twilio/Meta).
- **Phase 005 dependency** — ElevenLabs SDK `constructEvent` signature verification + typed payload replace the Zod stub; audio (`post_call_audio`) wires `audioUrl`; phone resolution wires the real contact.
- **Phase 007 dependency** — `result.usage` (text) and `providerCostUsd` (voice) feed Polar metering.
- **No UI impact** this phase — `threads.listByTenant` / `messages.history` are the surfaces future UI consumes.

---

## Risks & Dependencies

| Risk                                                                                                                      | Severity           | Mitigation                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convex V8 runtime incompatibility with AI SDK v7-beta** — `ToolLoopAgent.generate()` may need Node APIs                 | High               | `'use node'` on `agentRuntime.ts` + `webhooks.ts`; SPIKE a minimal `'use node'` action importing `ai`+`@ai-sdk/gateway` and calling `gateway(...)` before building `runAgentTurn`. Fallback: run the model in a TanStack server fn via `ConvexHttpClient`, webhook only schedules a notify. |
| **`maxSteps` does not exist in ai@7.0.0-beta.178**                                                                        | High (correctness) | Use `stopWhen: isStepCount(n)` in `ToolLoopAgent` settings (verified in installed `.d.ts`; `maxSteps` is ABSENT, `stopWhen`/`isStepCount`/`stepCountIs` are present).                                                                                                                       |
| **convex-helpers Triggers API** — original plan used non-existent `triggers.middleware()`                                 | High (correctness) | Use `new Triggers<DataModel>()` + `.register(table, fn)` + `customMutation(raw, customCtx(triggers.wrapDB))` (verified in `triggers.d.ts` for 0.1.119). Reuse the phase-001 shared instance if one exists.                                                                                  |
| **ElevenLabs payload shape** — original flat schema (top-level `from_phone`/`recording_url`) is wrong                     | High (correctness) | Use the `{ type, event_timestamp, data: {...} }` envelope; conversation fields under `data`; no recording url here (separate `post_call_audio` webhook). Phase 005 swaps to SDK `constructEvent` types. VERIFY phone path on a real telephony payload.                                      |
| **Convex has no unique constraints** — idempotency is app-enforced, with a residual true-concurrent first-delivery race   | Medium             | `by_provider_message` `.unique()` read-guard handles redelivery (the common case); scheduler dispatch serializes typical retries. If stricter de-dup needed, add a `webhookEvents` idempotency-key table in phase 003.                                                                      |
| **`threads.upsert` / `calls.upsert` concurrent first-insert**                                                             | Medium             | Convex OCC retries conflicting writes touching the same docs; the `.unique()` read returns the committed row on retry. The unguarded gap is only when two inserts of a not-yet-existing row interleave — rare; documented, with the optional idempotency table as the hardening path.       |
| **Hono `hono/tiny` route precedence for overlapping `/webhooks/elevenlabs/:tenantId` vs `/webhooks/:provider/:tenantId`** | Medium             | Register specific-first; VERIFY ordering with a test, else branch on `provider === 'elevenlabs'` in one handler.                                                                                                                                                                            |
| **WhatsApp Meta app-level callback + GET verify challenge**                                                               | Medium             | Per-WABA override + GET challenge handler are phase 003 operational; route shapes reserved here.                                                                                                                                                                                            |
| **Phase 001 prerequisites** — `authQuery`/`authMutation` and (ideally) a shared Triggers instance                         | High               | Deploy after phase 001; reuse phase-001's Triggers instance to avoid split trigger registries.                                                                                                                                                                                              |

---

## Documentation & References

### External dependencies introduced/used (verified versions + canonical docs)

| Dependency                                  | Status / install                                                                                                                                 | Canonical docs                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai` (AI SDK v7-beta)                       | **installed `7.0.0-beta.178`** (pinned beta; do not float)                                                                                       | https://ai-sdk.dev/docs — `ToolLoopAgent`, `isStepCount`/`stepCountIs`, `generate`/`stream`, `convertToModelMessages` (async), `toUIMessageStream`, `readUIMessageStream`. API surface verified against `node_modules/ai/dist/index.d.ts`.                                                                                                                                                                                                    |
| `@ai-sdk/gateway`                           | **installed `4.0.0-beta.109`**                                                                                                                   | https://ai-sdk.dev/docs — `gateway(modelId)` model factory (used in `src/server/ai/index.ts`).                                                                                                                                                                                                                                                                                                                                                |
| `@ai-sdk/react` / `@ai-sdk/provider`        | installed `4.0.0-beta.182` / `4.0.0-beta.19`                                                                                                     | https://ai-sdk.dev/docs (not directly used in this phase; orchestrator UI path only).                                                                                                                                                                                                                                                                                                                                                         |
| `convex`                                    | **installed `1.41`**                                                                                                                             | https://docs.convex.dev — schema (`defineSchema`/`defineTable`), `internalAction`/`internalMutation`/`internalQuery`, `'use node'` actions (https://docs.convex.dev/functions/runtimes), scheduler (`ctx.scheduler.runAfter`), HTTP actions (https://docs.convex.dev/functions/http-actions).                                                                                                                                                 |
| `convex-helpers`                            | **installed `0.1.119`**                                                                                                                          | Triggers: https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/triggers.ts (`Triggers`, `.register`, `.wrapDB`, `writerWithTriggers`; **no `.middleware()`**). Hono: https://stack.convex.dev/hono-with-convex + `server/hono` (`HonoWithConvex`, `HttpRouterWithHono`; `c.env` is `ActionCtx`). zod4 custom fns + `customFunctions` (`customMutation`/`customCtx`). All verified against installed `.d.ts`. |
| `hono`                                      | installed (router via `hono/tiny`)                                                                                                               | https://hono.dev/docs/api/routing (route precedence; param vs static).                                                                                                                                                                                                                                                                                                                                                                        |
| `zod`                                       | installed `4`                                                                                                                                    | https://zod.dev (ElevenLabs payload schema; convex-helpers zod4 custom fns).                                                                                                                                                                                                                                                                                                                                                                  |
| `@elevenlabs/elevenlabs-js`                 | **NOT yet installed — phase 005**; `bun add @elevenlabs/elevenlabs-js` (latest stable; VERIFY pin at install — search showed `2.30.0` published) | Post-call webhooks: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks (envelope `{ type:'post_call_transcription', event_timestamp, data }`; signature header `elevenlabs-signature`; verify via `elevenlabs.webhooks.constructEvent(rawBody, sig, secret)`). SDK: https://www.npmjs.com/package/@elevenlabs/elevenlabs-js · https://github.com/elevenlabs/elevenlabs-js                                                  |
| Twilio (text signature, phase 003)          | **NOT installed — phase 003**; `bun add twilio` (VERIFY pin)                                                                                     | Webhook signature `X-Twilio-Signature`, `twilio.validateRequest(...)`: https://www.twilio.com/docs/usage/webhooks/webhooks-security                                                                                                                                                                                                                                                                                                           |
| WhatsApp Cloud API / Meta Graph (phase 003) | no SDK required (raw HMAC)                                                                                                                       | `X-Hub-Signature-256` HMAC-SHA256 of raw body w/ app secret; GET verify challenge (`hub.mode`/`hub.verify_token`/`hub.challenge`): https://developers.facebook.com/docs/graph-api/webhooks/getting-started                                                                                                                                                                                                                                    |
| `@convex-dev/resend`                        | **installed** (existing `/resend/events` route)                                                                                                  | https://github.com/get-convex/resend — pattern reference for webhook httpAction.                                                                                                                                                                                                                                                                                                                                                              |
| Polar (`@polar-sh/sdk`, phase 007)          | **NOT installed — phase 007**                                                                                                                    | Metering hook target for `result.usage` / `providerCostUsd`. Out of scope here.                                                                                                                                                                                                                                                                                                                                                               |

### Design-doc sections this plan builds on

- `docs/threads-model.md §2` — verbatim `threads`/`calls`/`messages` validators + indexes (Unit 1 mirrors them exactly).
- `docs/threads-model.md §6` — two ingestion flows, idempotency rule, delivery-status patch, counter Trigger (Units 3–6).
- `docs/rebuild-architecture.md §5` — webhook route design (tenant from route param; WhatsApp per-WABA override) (Unit 4).
- `docs/rebuild-architecture.md §5b` — table taxonomy (Transactional vs Ledger/Entry → append-only `messages`).
- `docs/rebuild-architecture.md §6` — convex-helpers Triggers vs Aggregate rationale (Unit 3).
- VERIFY: the `runAgentTurn`/text-runtime section number in `rebuild-architecture.md` (original plan cited "§4b" — confirm and cite the real section).

### Reference-repo paths

- agent.io live code: `convex/{utils.ts,http.ts,convex.config.ts,auth.config.ts,auth.ts,schema.ts}`, `src/server/ai/{index.ts,agents/routing.ts}`, `src/server/rpc/init.ts` — all read and verified for this plan.
- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/agents/routing.ts` — clean `routing()`/`customRouting()` reference.
- `/Users/angel/dev/ontology/src/server/ai/agents` — heavy specials (jsonRender/db-doctor) — intentionally NOT imported.

### Sibling plans (hard prerequisites / handoffs)

- `2026-06-17-001-feat-convex-foundations-plan.md` — `authQuery`/`authMutation`, RLS, tenant table, (ideally) shared Triggers instance — hard prerequisite.
- `2026-06-17-003-feat-channel-adapters-plan.md` — `parseInboundText`, `internal.channels.send`, Twilio/Meta signature verification.
- `2026-06-17-005-feat-voice-runtime-plan.md` — ElevenLabs `constructEvent` + typed payload, audio/`audioUrl`, phone resolution.
- `2026-06-17-007-feat-billing-plan.md` — Polar metering (`result.usage`, `providerCostUsd`).

---

## Sources & References (in-repo)

- `docs/threads-model.md` §2 §6 — schema source of truth + ingestion flows.
- `docs/rebuild-architecture.md` §5 §5b §6 — webhook route design, table taxonomy, Triggers rationale.
- `src/server/ai/index.ts` — `agentRequestHandler` (`ToolLoopAgent` + `gateway` + `createAgentUIStreamResponse`) — the pattern `runAgentTurn` adapts (non-streaming).
- `src/server/ai/agents/routing.ts` — `routing()`/`customRouting()` (v7-adapted: top-level `toUIMessageStream`) — specialist wiring in phase 004.
- `convex/utils.ts` — `authQuery`/`authMutation` (inject `{ user, org }`; tenant = `org.organizationId`), `includes(...)`, `query`/`mutation` (NoOp).
- `convex/http.ts` — Hono-on-Convex (`HonoWithConvex<ActionCtx>`, `c.env === ActionCtx`); existing `resend.handleResendEventWebhook` pattern.
- `convex-helpers@0.1.119` — `server/triggers` (`Triggers`/`wrapDB`), `server/customFunctions` (`customMutation`/`customCtx`), `server/zod4`, `server/hono`.

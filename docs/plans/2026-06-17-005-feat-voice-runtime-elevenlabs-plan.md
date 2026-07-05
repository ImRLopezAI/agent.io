---
title: 'feat: Voice runtime — ElevenLabs SDK + post-call ingestion + Agent Workflows'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §4 + §4c, docs/threads-model.md §6
---

# feat: Voice runtime — ElevenLabs SDK + post-call ingestion + Agent Workflows

## Overview

Replaces all raw `fetch` calls to ElevenLabs with the typed `@elevenlabs/elevenlabs-js` Node SDK
(client class **`ElevenLabsClient`**; all Agents-platform methods are namespaced under
`client.conversationalAi.*`). Delivers: (a) agent CRUD/sync from our `agents` table
(`externalId`-only — no workflow mirror), (b) outbound call initiation per-tenant telephony mode
(`managed` vs `byo_sip`), (c) knowledge-base document lifecycle, (d) a typed post-call webhook HTTP
handler that upserts the `calls` row, bulk-inserts transcript turns into `messages`, patches
cost/duration/audio, and emits a Polar voice event (cross-reference plan 007), and (e) Agent
Workflow push at agent-create time via the ElevenLabs SDK using the verified
`conversation_config.workflow` field with UNDERSCORE node types.

Voice agent config never leaks into Convex beyond `agents.externalId` — the workflow JSON is owned
entirely by ElevenLabs; we push it once at create time and never mirror it.

> **CORRECTION vs the task brief.** The brief carried "ElevenLabs `workflow` TOP-LEVEL agent field"
> as an anchored fact. The current official ElevenLabs docs contradict this: the workflow lives
> under **`conversation_config.workflow`** (NOT a top-level request field), and `nodes`/`edges` are
> **objects keyed by node id** (NOT arrays). Node `type` strings ARE underscore_case. This plan uses
> the doc-verified shape and flags the discrepancy as a VERIFY item (see Open Questions). Source:
> [ElevenLabs Agent Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows).

## Problem Frame

The legacy platform hand-rolls `fetch` to ElevenLabs inside Convex mutations and Next.js middleware,
producing: untyped responses that fail silently, a 7-step `callId` lookup chain in `sync.ts`, a
`callDedup` cron to merge phantom rows, and `calls.messages[]` arrays that contend under OCC and
hit the 1 MiB doc limit. The new model (`calls` keyed by `conversationId` + `messages` as rows)
eliminates all three antipatterns while the typed SDK provides retries and typed webhooks
(`client.webhooks.constructEvent`).

## Requirements Trace

- **R1** Agent CRUD — create, update, delete an ElevenLabs agent; store only `externalId` in `agents`.
- **R2** Workflow push — push Agent Workflow JSON at create-time inside `conversation_config.workflow`;
  `nodes`/`edges` are objects keyed by id; UNDERSCORE node `type` strings: `start`, `override_agent`
  (the subagent node), `dispatch_tool`, `agent_transfer`, `transfer_to_number`, `end`.
- **R3** Outbound call — initiate via SDK; respect `tenant.phones[].telephonyMode` (`managed` →
  `client.conversationalAi.twilio.outboundCall`; `byo_sip` → SIP-trunk path, creds from Vault).
- **R4** Knowledge-base lifecycle — create/update/delete KB documents; link
  `knowledgeBaseDocs.externalId` to ElevenLabs; push updated IDs onto `agents.knowledgeBaseIds`.
- **R5** Post-call webhook ingestion — typed HTTP endpoint on the Convex Hono router; upsert `calls`
  by `conversationId`; bulk-insert `data.transcript` into `messages`; patch `durationMs`, `audioUrl`,
  `providerCostUsd`, `status`; extract `data.analysis.data_collection_results` for survey ingestion
  (plan 009).
- **R6** Polar voice event — emit `voice_minutes` event per completed call (cross-reference plan 007).
- **R7** Telephony — branded caller ID note for `byo_sip` tenants; MCP-off caveat for ZRM/HIPAA
  agents flagged in config.
- **R8** oRPC surface — `agents`, `knowledgeBaseDocs` management endpoints secured by `org`
  middleware; `organizationId` always from session, never from client input.

## Scope Boundaries

In scope:

- ElevenLabs agent CRUD + Workflow push (create time only).
- Outbound call initiation (single call; batch fan-out is plan 006).
- Knowledge-base document CRUD and agent linkage.
- Post-call webhook → `calls` upsert + `messages` bulk-insert + Polar event.
- `convex/schema.ts` additions: `agents`, `calls`, `messages`, `knowledgeBaseDocs`,
  `knowledgeBaseHistory` (depends on plan 001 for `tenant`, `contacts`; coordinate indexes).
- oRPC contracts/routes for agents and KB management.

### Deferred to Separate Tasks

- Batch dialing fan-out (`@convex-dev/workflow` + workpool) → plan 006.
- Polar subscription management, LLM-strategy metering → plan 007.
- WorkOS Vault secret retrieval pattern (ElevenLabs API key, SIP trunk creds) → plan 008.
- Survey response extraction from `data_collection_results` → plan 009.
- Inbound call routing / forwarding logic (beyond webhook ingestion).
- ElevenLabs Procedures (alpha/dashboard-only — manual enhancement only).

## Context & Research

### Relevant Code and Patterns (repo-relative paths)

| Path                        | Role                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`          | Currently empty `defineSchema({})` — all tables in scope are NEW                                                                                                                                |
| `convex/convex.config.ts`   | Registers `workOSAuthKit` + `resend` via `app.use(...)`; ElevenLabs has no component (SDK-only)                                                                                                 |
| `convex/utils.ts`           | `authQuery`/`authMutation` via `zCustomQuery`/`zCustomMutation` (convex-helpers `server/zod4`); injects `{user, org}`                                                                           |
| `convex/auth.config.ts`     | Two `customJwt` providers (SSO + user_management issuers)                                                                                                                                       |
| `convex/http.ts`            | **Hono** router (`HttpRouterWithHono` + `Hono` from `hono/tiny`), NOT bare `httpRouter()`. Routes registered as `app.post(...)`. The ElevenLabs post-call webhook is added here as a Hono route |
| `src/server/rpc/init.ts`    | `implement(contract).$context<RpcContextType>()` → `os`; middleware variants `auth` / `org` / `admin` / `adminOrg`. `org` adds `context.organizationId` from session                            |
| `src/server/rpc/contracts/` | Contract definitions built on `base` (`oc.errors(baseErrors)`); files named `*.contract.ts`; aggregated in `contracts/index.ts`                                                                 |
| `src/server/rpc/routes/`    | Route implementations named `*.router.ts`; a router is `org.<contractPath>.handler(...)`; aggregated in `src/server/rpc/index.ts` via `os.router({...})`                                        |
| `src/server/ai/index.ts`    | `createAgentUIStreamResponse` + `ToolLoopAgent` from `'ai'` (text side; voice uses ElevenLabs natively)                                                                                         |

### Design-Doc References

- `docs/rebuild-architecture.md` §4 — ElevenLabs SDK (`@elevenlabs/elevenlabs-js`); telephony mode (`managed`/`byo_sip`); batch dialing overview
- `docs/rebuild-architecture.md` §4c — Agent Workflows; node types (subagent/dispatch-tool/agent-transfer/transfer-to-number/start/end); Procedures (alpha); MCP-off-in-ZRM caveat; "we keep only `agents.externalId`"
- `docs/rebuild-architecture.md` §5 — `agents`, `calls`, `messages`, `knowledgeBaseDocs` schema sketches; ERD
- `docs/threads-model.md` §2 — `calls` + `messages` table definitions (authoritative field list + indexes)
- `docs/threads-model.md` §6 — Voice ingestion flow: upsert call by `conversationId` → bulk-insert transcript → patch → Polar event
- `docs/threads-model.md` §7 — `surveyResponses` with `source: 'voice_data_collection'` fed from `data_collection_results` (plan 009 seam)
- `docs/rebuild-architecture.md` §3 — Polar event ingestion (`voice_minutes` event shape; `metadata.cost` credits)
- `docs/rebuild-architecture.md` §2 — Vault for static creds (ElevenLabs API key, SIP trunk)

### Sunday/Ontology Reference Paths

- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai` — clean AI-layer reference (text side; voice does not use it)
- `/Users/angel/dev/ontology/src/server/ai/agents` — orchestrator + sub-agents pattern (text side reference only)
- `src/server/ai/index.ts` (agent.io) — `createAgentUIStreamResponse` + `ToolLoopAgent` usage (text side; not voice)

### Verified Corrections (from this research pass — 2026-06-17)

1. **SDK client class + namespace:** the package exports **`ElevenLabsClient`** (`new ElevenLabsClient({ apiKey })`), and ALL Agents-platform methods are under `client.conversationalAi.*` — `client.conversationalAi.agents.create/update/delete`, `client.conversationalAi.twilio.outboundCall`, `client.conversationalAi.knowledgeBase.documents.*`, `client.conversationalAi.conversations.*`. The plan's earlier `el.agents.create` / `el.knowledgeBases.*` / `el.conversations.startCall` are WRONG. ([npm](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js), [SDK conversational-ai docs](https://tessl.io/registry/tessl/npm-elevenlabs--elevenlabs-js/2.24.0/files/docs/conversational-ai.md))
2. **Workflow field placement (CORRECTED vs brief):** workflow is nested at **`conversation_config.workflow`**, NOT a top-level request field; `nodes` and `edges` are **objects keyed by node id**, NOT arrays. Node `type` strings use UNDERSCORES: `start`, `override_agent`, `dispatch_tool`, `agent_transfer`, `transfer_to_number`, `end`. ([Agent Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows))
3. **Post-call webhook payload:** envelope is `{ type: 'post_call_transcription', event_timestamp, data }`. `data` carries `agent_id`, `conversation_id`, `status`, `user_id`, `transcript[]` (each turn: `role: 'agent'|'user'`, `message`, `time_in_call_secs`, nullable `tool_calls`/`tool_results`), `metadata` (`start_time_unix_secs`, `call_duration_secs`, `cost`, `charging`), and `analysis` (`data_collection_results`, `evaluation_criteria_results`, `call_successful`, `transcript_summary`). NOTE: cost is under `data.metadata.cost`; duration is `data.metadata.call_duration_secs` (not `duration_secs`); data-collection is under `data.analysis.data_collection_results` (not a top-level field). ([Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks))
4. **Webhook signature verification:** use the SDK helper `client.webhooks.constructEvent(rawBody, signatureHeader, secret)` — it verifies the HMAC signature, validates the timestamp, and parses the JSON in one call (throws on mismatch). Header name is `ElevenLabs-Signature` (case-insensitive). Auth method is configurable (HMAC or OAuth) per webhook in the ElevenLabs dashboard. Do NOT hand-roll `createHmac` as the earlier sketch did. ([Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks))
5. **MCP-off in ZRM/HIPAA:** ElevenLabs native MCP is disabled in Zero-Retention Mode — flag this on agents where `zrmEnabled: true`; those agents cannot use MCP tool servers.
6. **Telephony per-tenant:** `tenant.phones[].telephonyMode` drives the call path; `managed` uses `conversationalAi.twilio.outboundCall`; `byo_sip` enables branded caller ID (Apple Business Connect) but requires the tenant to own the carrier relationship and pair with an agent flow handling iOS 26 "Ask Reason for Calling" screening.
7. **Polar meter balance:** hard-cap guardrails require reading the balance via raw `@polar-sh/sdk` (`customers.getStateExternal`) in a Convex action — the `@convex-dev/polar` component does NOT expose meter balance directly (plan 007).

## Key Technical Decisions

| Decision                                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`agents.externalId` only — no workflow mirror**                                     | ElevenLabs owns the workflow JSON; mirroring it would add drift, sync complexity, and a table with no query value. We push at create time, never read it back. Design doc §4c: "we keep only `agents.externalId`."                                                                                                                                                                                                                                                                                                      |
| **Post-call webhook as a Convex Hono route (`"use node"` action under the SDK)**      | `convex/http.ts` is a `HttpRouterWithHono` Hono app — add `app.post('/webhooks/elevenlabs/:tenantId', ...)` there, NOT via bare `httpRouter()`. The Hono handler validates + parses with the SDK (`client.webhooks.constructEvent`) and calls internal Convex mutations. If the SDK requires Node-only built-ins not in Convex's V8 HTTP runtime, route the signature-verify + parse into a `"use node"` internal action invoked by the Hono handler, or promote to a TanStack Server Function (Node). Flag as a spike. |
| **Bulk-insert transcript via one `internalMutation` that iterates `data.transcript`** | Transcript turns are ordered (sequence = index); insert each as an independent `messages` row so the append-only pattern holds and OCC contention is avoided. A single internal mutation iterates the array to reduce round-trips and keep the insert atomic per-call.                                                                                                                                                                                                                                                  |
| **Vault for ElevenLabs API key; never exposed to client**                             | API key retrieved via WorkOS Vault in Convex actions (plan 008). Until plan 008 lands, gate the action with `process.env.ELEVENLABS_API_KEY` server-side only. Webhook secret via `process.env.ELEVENLABS_WEBHOOK_SECRET`.                                                                                                                                                                                                                                                                                              |
| **`telephonyMode` drives SDK call shape**                                             | `managed` → `client.conversationalAi.twilio.outboundCall({ agentId, agentPhoneNumberId, toNumber })`; `byo_sip` → SIP-trunk outbound path (VERIFY exact SDK method/params, see below) with creds from Vault. One code path, branched by the tenant config field.                                                                                                                                                                                                                                                        |
| **Workflow push via SDK at agent create-time, not ElevenLabs CLI**                    | The CLI (`agents pull/push`) is a dev-time tool; production sync must be API-driven. `client.conversationalAi.agents.create({ conversationConfig: { ..., workflow } })` is the seam.                                                                                                                                                                                                                                                                                                                                    |

## Open Questions

### Resolved

- **SDK client + namespace?** Resolved: `ElevenLabsClient`; methods under `client.conversationalAi.*`.
- **Workflow top-level or nested?** Resolved (doc-verified): nested at `conversation_config.workflow`; `nodes`/`edges` objects keyed by id; UNDERSCORE node `type` strings. (This corrects the task brief's "top-level" claim.)
- **Post-call webhook field names?** Resolved: `data.conversation_id`, `data.agent_id`, `data.status`, `data.transcript[]`, `data.metadata.cost` (credits), `data.metadata.call_duration_secs`, `data.analysis.data_collection_results`.
- **Webhook signature verification?** Resolved: SDK `client.webhooks.constructEvent(rawBody, sigHeader, secret)`; header `ElevenLabs-Signature`.
- **MCP in HIPAA mode?** Resolved: off — flag on agent config (`zrmEnabled`).

### Deferred to Implementation

- **VERIFY: Workflow field placement** — this plan follows the live docs (`conversation_config.workflow`) over the brief's "top-level" claim. Confirm against the installed SDK's `.d.ts` for `BodyCreateAgentV1...`/`ConversationalConfig` types once `@elevenlabs/elevenlabs-js` is installed (look for a `workflow?` property on the conversation-config input type). If the SDK exposes `workflow` at the request top level instead, adjust Unit 2 accordingly.
- **VERIFY: byo_sip outbound SDK method** — the docs confirm `conversationalAi.twilio.outboundCall` for managed; the exact SIP-trunk outbound method/params (e.g. a `conversationalAi.sip*` namespace, or a `sourceType`/SIP-trunk phone-number id passed to a generic outbound call) is NOT confirmed. Inspect the installed SDK's `.d.ts` and [SIP trunking docs](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking). For `byo_sip`, the SIP trunk is typically registered as a phone number (`conversationalAi.phoneNumbers.create`) whose `agentPhoneNumberId` is then passed to `twilio.outboundCall` — VERIFY this is the actual seam.
- **VERIFY: knowledge-base create method shape** — docs show `client.conversationalAi.knowledgeBase.documents.get(...)` and `.delete(...)` plus a `conversationalAi.addToKnowledgeBase({ url | file })` create path. Confirm whether create is `knowledgeBase.documents.createFromFile` / `createFromUrl` / `createFromText` or the flatter `addToKnowledgeBase` against the installed SDK `.d.ts`.
- **VERIFY: `data_collection_results` value shape** — the per-key value object fields (e.g. `value`, `rationale`, `data_collection_id`) were not confirmed from a live doc page (the analysis page 404'd). Confirm at plan 009 implementation from the installed SDK types or a captured live payload.
- **ElevenLabs SDK version to pin** — latest is `2.53.0` (engines: `node >=18`). Pin minor at install; check changelog for breaking changes.
- **Convex V8 runtime support for the ElevenLabs SDK** — spike required (Unit 2 Verification). If V8 is unsupported, isolate SDK calls in `"use node"` internal actions, or promote the webhook handler to a TanStack Server Function.
- **`providerCostUsd` conversion** — `data.metadata.cost` is in ElevenLabs credits; clarify credit-to-USD rate or store raw credits (`metadata.rawCredits`) and convert at Polar event emission (plan 007).

## Output Structure

```
convex/
  schema.ts                         # Modify — add agents, calls, messages, knowledgeBaseDocs, knowledgeBaseHistory
  http.ts                           # Modify — add Hono app.post('/webhooks/elevenlabs/:tenantId', ...)
  elevenlabs.ts                     # Create — ElevenLabsClient factory + typed helpers ('use node' if V8 fails)
  agents.ts                         # Create — internal query/mutation/action: get, setExternalId, syncToElevenLabs, delete
  calls.ts                          # Create — internal mutations/action: upsert, upsertByConversationId, patchPostCall, initiateOutbound
  messages.ts                       # Create — internal mutation: bulkInsertVoiceTranscript
  knowledgeBaseDocs.ts              # Create — CRUD + history insert + EL sync action
src/
  server/
    rpc/
      contracts/
        agents.contract.ts          # Create — oRPC contract: agents CRUD + KB management (built on `base`)
        index.ts                    # Modify — register agentsContract in the contract map
      routes/
        agents.router.ts            # Create — oRPC route implementations (org middleware)
      index.ts                      # Modify — register agentsRouter in os.router({...})
```

## High-Level Technical Design

```
Agent create (oRPC)
  → src/server/rpc/routes/agents.router.ts (org middleware)
  → convex.mutation(internal.agents.create, { tenantId, ... })       (tenantId = context.organizationId)
  → convex.action(internal.agents.syncToElevenLabs, { agentDocId, workflow })
      → client.conversationalAi.agents.create({ name, conversationConfig: { agent, workflow } })
      → convex.mutation(internal.agents.setExternalId, { agentDocId, externalId: agent_id })

Outbound call (oRPC)
  → src/server/rpc/routes/agents.router.ts initiateCall (org middleware)
  → convex.action(internal.calls.initiateOutbound)
      → read tenant.phones[phoneNumberId]
      → managed: client.conversationalAi.twilio.outboundCall({ agentId, agentPhoneNumberId, toNumber })
        byo_sip: SIP-trunk outbound path (VERIFY method) with creds from Vault (plan 008)
      → internal.calls.upsert({ status: 'pending' }) BEFORE the SDK call
      → patch conversationId from the SDK response

Post-call webhook (convex/http.ts — Hono)
  app.post('/webhooks/elevenlabs/:tenantId', ...)
  → const event = client.webhooks.constructEvent(rawBody, c.req.header('ElevenLabs-Signature'), secret)   // verifies + parses
  → const { conversation_id, agent_id, status, transcript, metadata, analysis } = event.data
  → internal.calls.upsertByConversationId({ tenantId, conversationId, agentExternalId, status, durationMs, audioUrl, providerCostUsd })
  → internal.messages.bulkInsertVoiceTranscript({ tenantId, callId, transcript })
  → internal.billing.emitVoiceEvent({ tenantId, callId, durationSecs, providerCostUsd })   ← plan 007 seam
  → internal.surveyResponses.ingestDataCollection({ tenantId, callId, dataCollectionResults: analysis.data_collection_results })   ← plan 009 seam
```

## Implementation Units

---

### Unit 1 — Schema additions: `agents`, `calls`, `messages`, `knowledgeBaseDocs`

**Goal:** Add the voice-domain tables to `convex/schema.ts` with all indexes required by the post-call webhook and the oRPC management layer. Coordinate with plan 001 (`tenant`, `contacts`) which must exist before FK-style string refs are usable.

**Requirements:** R1, R4, R5

**Dependencies:** Plan 001 (tenant + contacts tables in schema first; if 001 is not yet merged, stub `contacts` + `tenant` as `defineTable({...})` stubs and note them as a merge dependency).

**Files:**

- `convex/schema.ts` — Modify (add tables)

**Approach:**
Add `agents`, `calls`, `messages`, `knowledgeBaseDocs`, `knowledgeBaseHistory` following the exact field shapes from `docs/threads-model.md §2` and `docs/rebuild-architecture.md §5`. Use `v.string()` for all `tenantId` fields (WorkOS org id). `knowledgeBaseDocs.externalId` is the ElevenLabs doc id; `agents.externalId` is the ElevenLabs agent id. The `calls` and `messages` tables match `threads-model.md §2` verbatim (including index names) so plan 001/006 coordinate cleanly.

**Technical design (directional):**

```ts
// convex/schema.ts — directional additions
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	agents: defineTable({
		tenantId: v.string(),
		externalId: v.optional(v.string()), // ElevenLabs agent id (set after sync)
		name: v.string(),
		provider: v.literal('elevenlabs'),
		model: v.optional(v.string()),
		instructions: v.optional(v.string()), // orchestrator prompt (voice)
		knowledgeBaseIds: v.optional(v.array(v.string())), // ElevenLabs KB doc ids
		specialists: v.optional(v.array(v.any())), // text side (plan 002)
		zrmEnabled: v.optional(v.boolean()), // Zero-Retention Mode — MCP unavailable when true
		metadata: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant', ['tenantId'])
		.index('by_external', ['externalId']),

	calls: defineTable({
		tenantId: v.string(),
		contactId: v.string(), // contacts._id as string ref (Id once 001 lands)
		kind: v.union(
			v.literal('voice_call'),
			v.literal('whatsapp_voice'),
			v.literal('widget_voice'),
		),
		conversationId: v.optional(v.string()), // conv_xxx — resolver for post-call webhook
		agentId: v.optional(v.string()), // agents._id as string
		batchId: v.optional(v.string()), // batches._id (plan 006)
		status: v.string(), // pending|in_progress|completed|voicemail|no_answer|failed
		durationMs: v.optional(v.number()),
		audioUrl: v.optional(v.string()),
		providerCostUsd: v.optional(v.number()), // from data.metadata.cost (credits) → Polar event
		failureReason: v.optional(v.string()),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_conversation', ['conversationId']) // post-call webhook primary lookup
		.index('by_tenant_created', ['tenantId', 'createdAt'])
		.index('by_contact', ['contactId'])
		.index('by_batch', ['batchId']),

	messages: defineTable({
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

	knowledgeBaseDocs: defineTable({
		tenantId: v.string(),
		externalId: v.optional(v.string()), // ElevenLabs doc id
		name: v.string(),
		mimeType: v.optional(v.string()),
		storageId: v.optional(v.id('_storage')),
		url: v.optional(v.string()),
		status: v.string(), // pending|synced|error|deleted
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant', ['tenantId'])
		.index('by_external', ['externalId']),

	knowledgeBaseHistory: defineTable({
		tenantId: v.string(),
		docId: v.string(), // knowledgeBaseDocs._id
		changeType: v.string(), // created|updated|deleted|error
		snapshot: v.optional(v.any()),
		changedAt: v.number(),
	}).index('by_doc', ['docId']),
})
```

> **Idempotency note:** Convex `.index()` does not enforce uniqueness. The webhook's "no double-insert" guarantee for redelivered transcripts comes from the handler logic (look up the `call` by `by_conversation`, and skip transcript insert if `messages` already exist for that `parentId`), NOT from a unique constraint. See Unit 4.

**Patterns to follow:** `docs/threads-model.md §2` field names + index names verbatim; `convex/utils.ts` shows the existing `NoOp` + `zCustomQuery`/`zCustomMutation` (convex-helpers `server/zod4`) wiring.

**Test scenarios:**

- `schema compiles → node_modules/.bin/tsc --noEmit exits 0 with zero net-new errors on convex/schema.ts`
- `by_conversation index → lookup by conversationId returns exactly one call row`
- `by_parent_sequence index → ordered message fetch for a callId returns rows in sequence order`

**Verification:**

```bash
node_modules/.bin/tsc --noEmit   # zero net-new errors in convex/schema.ts
node_modules/.bin/biome check --write convex/schema.ts
```

---

### Unit 2 — ElevenLabs SDK client factory + agent sync action

**Goal:** Install `@elevenlabs/elevenlabs-js`; create `convex/elevenlabs.ts` with a typed `ElevenLabsClient` factory (API key from env / Vault seam); implement `internal.agents.syncToElevenLabs` action that creates or updates an ElevenLabs agent (including the `conversation_config.workflow` push), writes back `externalId`, and handles the `zrmEnabled` caveat.

**Requirements:** R1, R2, R7

**Dependencies:** Unit 1 (schema); Plan 008 (Vault) — use `process.env.ELEVENLABS_API_KEY` until 008 lands.

**Files:**

- `convex/elevenlabs.ts` — Create (`ElevenLabsClient` factory + shared types)
- `convex/agents.ts` — Create (internal query + mutations + actions for agent sync)

**Approach:**
The `ElevenLabsClient` from `@elevenlabs/elevenlabs-js` is instantiated once per action call (Convex actions are stateless). `syncToElevenLabs` accepts the agent doc id + optional workflow, reads the agent row, calls `client.conversationalAi.agents.create(...)` or `.update(externalId, ...)` (branch on whether `externalId` exists), then patches the Convex `agents` row with the returned `agent_id`. Workflow is pushed inside `conversationConfig.workflow` — doc-verified shape (see Verified Corrections #2). If `zrmEnabled` is true, log a warning and omit MCP server references from the push.

**SPIKE FLAG:** Confirm `@elevenlabs/elevenlabs-js` runs in Convex V8 HTTP runtime before writing production code. If it uses Node.js built-ins not available in V8, add `'use node'` to `convex/elevenlabs.ts` (and any action file that imports it) so it runs in the Convex Node action runtime. While verifying V8/Node, also confirm the `.d.ts` placement of `workflow` (top-level vs `conversationConfig.workflow`) and the `byo_sip` outbound method (see Open Questions VERIFY items).

**Technical design (directional):**

```ts
// convex/elevenlabs.ts
'use node' // SPIKE: confirm V8 compatibility; keep if the SDK needs Node built-ins
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

export function getElevenLabsClient() {
	const apiKey = process.env.ELEVENLABS_API_KEY // plan 008: swap to Vault.get(tenantId, 'elevenlabs')
	if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')
	return new ElevenLabsClient({ apiKey })
}
```

```ts
// convex/agents.ts — directional
import { v } from 'convex/values'
import { internal } from './_generated/api'
import {
	internalAction,
	internalMutation,
	internalQuery,
} from './_generated/server'
import { getElevenLabsClient } from './elevenlabs'

export const syncToElevenLabs = internalAction({
	args: {
		agentDocId: v.id('agents'),
		workflow: v.optional(v.any()), // workflow JSON; lives under conversation_config.workflow
	},
	handler: async (ctx, { agentDocId, workflow }) => {
		const agent = await ctx.runQuery(internal.agents.get, { agentDocId })
		if (!agent) throw new Error(`agent ${agentDocId} not found`)
		const client = getElevenLabsClient()

		if (
			agent.zrmEnabled &&
			agent.specialists?.some((s: any) => s.mcpServerKeys?.length)
		) {
			console.warn(
				`Agent ${agentDocId}: MCP tools are disabled in ZRM mode — omitting mcpServers from EL push`,
			)
		}

		// conversationConfig is the SDK's camelCase mapping of conversation_config.
		// workflow nests inside it (doc-verified). VERIFY exact key against installed .d.ts.
		const conversationConfig = {
			agent: {
				prompt: { prompt: agent.instructions ?? '' },
				// llm/model field name per SDK type — VERIFY against .d.ts
			},
			...(workflow ? { workflow } : {}),
		}

		let externalId = agent.externalId
		if (externalId) {
			await client.conversationalAi.agents.update(externalId, {
				conversationConfig,
			})
		} else {
			const created = await client.conversationalAi.agents.create({
				name: agent.name,
				conversationConfig,
			})
			externalId = created.agentId // SDK returns camelCase agentId (wire: agent_id) — VERIFY casing
		}

		await ctx.runMutation(internal.agents.setExternalId, {
			agentDocId,
			externalId,
		})
	},
})

export const get = internalQuery({
	args: { agentDocId: v.id('agents') },
	handler: (ctx, { agentDocId }) => ctx.db.get(agentDocId),
})

export const setExternalId = internalMutation({
	args: { agentDocId: v.id('agents'), externalId: v.string() },
	handler: async (ctx, { agentDocId, externalId }) => {
		await ctx.db.patch(agentDocId, { externalId, updatedAt: Date.now() })
	},
})
```

**Workflow node reference (directional — doc-verified shape):**

```ts
// conversation_config.workflow — nodes & edges are OBJECTS KEYED BY ID, node `type` is underscore_case
const workflow = {
	nodes: {
		start_node: { type: 'start' },
		support_agent: {
			type: 'override_agent', // the "subagent" node — swap prompt/LLM/voice/tools/KB
			// config per SDK schema (prompt override, etc.)
		},
		dispatch_crm: {
			type: 'dispatch_tool', // guaranteed tool execution with success/failure routing
			// config: { tool_id / tool_name, ... } per SDK schema
		},
		end_node: { type: 'end' },
	},
	edges: {
		// edges are also an object keyed by id; conditions: llm | expression | unconditional
		e1: { from: 'start_node', to: 'support_agent' },
		e2: { from: 'support_agent', to: 'dispatch_crm' },
		e3: { from: 'dispatch_crm', to: 'end_node' },
	},
}
// Other node types: agent_transfer, transfer_to_number (human handoff).
```

**Patterns to follow:** `convex/utils.ts` for `internalAction`/`internalMutation`/`internalQuery` usage; `'use node'` directive placement if V8 compatibility fails.

**Test scenarios:**

- `create agent with workflow → conversationConfig.workflow sent; externalId written back to agents row`
- `update agent (externalId exists) → agents.update(externalId, ...) called, not create`
- `zrmEnabled agent with MCP specialist keys → MCP omitted from EL payload, console.warn fired`
- `missing API key → throws with descriptive message before SDK call`

**Verification:**

```bash
bun add @elevenlabs/elevenlabs-js   # pin minor (latest 2.53.x; engines node>=18)
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/agents.test.ts
node_modules/.bin/biome check --write convex/elevenlabs.ts convex/agents.ts
```

---

### Unit 3 — Outbound call initiation (telephony-mode aware)

**Goal:** Implement `internal.calls.initiateOutbound` Convex action that reads `tenant.phones[phoneNumberId]`, branches on `telephonyMode`, calls the ElevenLabs SDK to start the call, and upserts a `calls` row with `status: 'pending'`.

**Requirements:** R3, R7

**Dependencies:** Unit 1 (calls schema); Unit 2 (ElevenLabs client); Plan 001 (tenant schema + `phones[]`); Plan 008 (SIP trunk creds from Vault for `byo_sip`).

**Files:**

- `convex/calls.ts` — Create (internal action + mutations)
- `src/server/rpc/contracts/agents.contract.ts` — Modify (add `initiateCall` procedure)
- `src/server/rpc/routes/agents.router.ts` — Modify (add `initiateCall` route)

**Approach:**
The oRPC route (`org` middleware) validates input, then calls the Convex action via the server-side Convex client. The action reads tenant config to find the phone entry, resolves telephony mode, conditionally fetches SIP trunk creds from Vault (plan 008 seam), and calls the SDK. A `calls` row is upserted before the SDK call (optimistic `status: 'pending'`) so the post-call webhook always has a row to patch.

Branded caller ID is a telephony-carrier concern, not an SDK flag — note in code comments that `byo_sip` tenants must configure Apple Business Connect / STIR-SHAKEN at carrier level, and pair with an agent flow handling iOS 26 "Ask Reason for Calling" screening.

**Technical design (directional):**

```ts
// convex/calls.ts — directional
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'
import { getElevenLabsClient } from './elevenlabs'

export const initiateOutbound = internalAction({
	args: {
		tenantId: v.string(),
		contactId: v.string(),
		phoneNumberId: v.string(), // tenant.phones[].phoneNumberId (= EL agentPhoneNumberId for managed)
		agentExternalId: v.string(),
		toNumber: v.string(),
	},
	handler: async (ctx, args) => {
		const tenant = await ctx.runQuery(internal.tenant.getByTenantId, {
			tenantId: args.tenantId,
		})
		const phone = tenant?.phones?.find(
			(p: any) => p.phoneNumberId === args.phoneNumberId,
		)
		if (!phone)
			throw new Error(
				`Phone ${args.phoneNumberId} not found for tenant ${args.tenantId}`,
			)

		// Upsert call row BEFORE the SDK call — webhook always has a row to patch
		const callId = await ctx.runMutation(internal.calls.upsert, {
			tenantId: args.tenantId,
			contactId: args.contactId,
			kind: 'voice_call',
			agentExternalId: args.agentExternalId,
			status: 'pending',
		})

		const client = getElevenLabsClient()

		if (phone.telephonyMode === 'managed') {
			// Managed (ElevenLabs-native Twilio) outbound — doc-verified method + params
			const result = await client.conversationalAi.twilio.outboundCall({
				agentId: args.agentExternalId,
				agentPhoneNumberId: args.phoneNumberId,
				toNumber: args.toNumber,
			})
			await ctx.runMutation(internal.calls.patchConversationId, {
				callId,
				conversationId: (result as any).conversationId, // VERIFY response field name
			})
		} else {
			// byo_sip: SIP trunk is registered as an EL phone number whose id is passed to outboundCall.
			// creds from Vault (plan 008 seam). NOTE: branded caller ID (Apple Business Connect) is
			// configured at carrier level; agent must handle iOS 26 "Ask Reason for Calling" screening.
			// VERIFY: exact SIP-trunk outbound SDK method/params against installed .d.ts + SIP docs.
			const result = await client.conversationalAi.twilio.outboundCall({
				agentId: args.agentExternalId,
				agentPhoneNumberId: phone.sipTrunkId ?? args.phoneNumberId, // SIP-trunk phone number id
				toNumber: args.toNumber,
			})
			await ctx.runMutation(internal.calls.patchConversationId, {
				callId,
				conversationId: (result as any).conversationId,
			})
		}

		return callId
	},
})
```

**Patterns to follow:** `src/server/rpc/init.ts` `org` middleware for the oRPC layer; `convex/utils.ts` `authMutation`/`authQuery` for any tenant-scoped Convex wrappers.

**Test scenarios:**

- `managed telephony → twilio.outboundCall called with { agentId, agentPhoneNumberId, toNumber }; calls row status=pending`
- `byo_sip telephony → SIP-trunk phone number id used; (plan 008) Vault creds resolved`
- `phone not found → throws before SDK call`
- `SDK throws → calls row remains status=pending (webhook or retry patches)`

**Verification:**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/calls.test.ts
node_modules/.bin/biome check --write convex/calls.ts
```

---

### Unit 4 — Post-call webhook HTTP handler (Hono route)

**Goal:** Add `app.post('/webhooks/elevenlabs/:tenantId', ...)` to the existing Hono router in `convex/http.ts`; verify + parse the payload with the SDK (`client.webhooks.constructEvent`); upsert the `calls` row by `conversationId`; bulk-insert transcript turns into `messages`; patch `durationMs`, `audioUrl`, `providerCostUsd`, `status`; emit a Polar voice event (plan 007 seam); pass `analysis.data_collection_results` to plan 009.

**Requirements:** R5, R6

**Dependencies:** Unit 1 (schema); Unit 2 (SDK client); Unit 3 (calls mutations); Plan 007 (Polar event action seam); Plan 009 (survey ingestion seam).

**Files:**

- `convex/http.ts` — Modify (add Hono route alongside existing `/resend/events`)
- `convex/calls.ts` — Modify (add `upsertByConversationId`, `patchPostCall`)
- `convex/messages.ts` — Create (`bulkInsertVoiceTranscript`)

**Approach:**
`convex/http.ts` is a `HttpRouterWithHono` app (existing routes use `app.post('/resend/events', ...)` and `app.on('POST', [...], ...)`). Add the ElevenLabs webhook as a Hono route. Inside the handler, read the raw body and the `ElevenLabs-Signature` header, then call `client.webhooks.constructEvent(rawBody, sig, process.env.ELEVENLABS_WEBHOOK_SECRET)` — this single call verifies the HMAC signature, validates the timestamp, and returns the parsed typed event (throws on mismatch → respond 401). Then run the mutations off the `event.data` fields. The Hono handler's `c.env` is the Convex `ActionCtx`/mutation ctx (as `/resend/events` already does via `RunMutationCtx`).

**Idempotency (no unique index needed):** `upsertByConversationId` looks up the existing `call` via `by_conversation`; the transcript bulk-insert is guarded by checking whether `messages` already exist for that `parentId` (skip if present) so redelivery is safe.

**SPIKE FLAG:** If `client.webhooks.constructEvent` needs Node-only crypto unavailable in Convex's V8 HTTP runtime, move verify+parse into a `"use node"` internal action that the Hono handler calls (`ctx.runAction`), passing it the raw body + signature header; the action returns the parsed event, and the Hono route runs the mutations. If even that fails, promote the whole handler to a TanStack Server Function (`src/routes/api/webhooks/elevenlabs/$tenantId.ts`) that calls Convex internal mutations via the Convex HTTP client.

**Technical design (directional):**

```ts
// convex/http.ts — directional addition (Hono route on the existing app)
import { getElevenLabsClient } from './elevenlabs'
// ... existing imports: agentRequestHandler, HttpRouterWithHono, Hono from 'hono/tiny', etc.

app.post('/webhooks/elevenlabs/:tenantId', async (c) => {
	const tenantId = c.req.param('tenantId')
	if (!tenantId) return c.text('missing tenantId', 400)

	const rawBody = await c.req.text()
	const sig = c.req.header('ElevenLabs-Signature') ?? ''
	const secret = process.env.ELEVENLABS_WEBHOOK_SECRET ?? ''

	// Single call: verifies HMAC signature, validates timestamp, parses JSON. Throws on mismatch.
	let event: any
	try {
		const client = getElevenLabsClient() // SPIKE: if V8-incompatible, run constructEvent in a 'use node' action
		event = await client.webhooks.constructEvent(rawBody, sig, secret)
	} catch {
		return c.text('signature/parse failure', 401)
	}

	if (event.type !== 'post_call_transcription') return c.text('ignored', 200)

	const ctx = c.env as unknown as RunMutationCtx
	const { conversation_id, agent_id, status, transcript, metadata, analysis } =
		event.data

	// 1. Upsert the calls row by conversationId (idempotent on redelivery via by_conversation)
	const callId = await ctx.runMutation(internal.calls.upsertByConversationId, {
		tenantId,
		conversationId: conversation_id,
		agentExternalId: agent_id,
		status: mapStatus(status), // EL status → our enum
		durationMs: Math.round((metadata?.call_duration_secs ?? 0) * 1000),
		audioUrl: metadata?.recording_url, // VERIFY key (audio is a separate webhook type)
		providerCostUsd:
			metadata?.cost != null ? creditsToUsd(metadata.cost) : undefined,
	})

	// 2. Bulk-insert transcript turns as messages rows (skips if messages already exist for this call)
	if (transcript?.length) {
		await ctx.runMutation(internal.messages.bulkInsertVoiceTranscript, {
			tenantId,
			callId,
			transcript, // [{ role: 'agent'|'user', message, time_in_call_secs }]
		})
	}

	// 3. Polar voice event (plan 007 seam — stub until 007 lands)
	await ctx.runAction(internal.billing.emitVoiceEvent, {
		tenantId,
		callId,
		durationSecs: metadata?.call_duration_secs ?? 0,
		providerCostUsd: metadata?.cost != null ? creditsToUsd(metadata.cost) : 0,
	})

	// 4. Survey extraction seam (plan 009) — analysis.data_collection_results
	const dcr = analysis?.data_collection_results
	if (dcr && Object.keys(dcr).length) {
		await ctx.runAction(internal.surveyResponses.ingestDataCollection, {
			tenantId,
			callId,
			dataCollectionResults: dcr,
		})
	}

	return c.text('ok', 200)
})
```

```ts
// convex/messages.ts — directional
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

export const bulkInsertVoiceTranscript = internalMutation({
	args: {
		tenantId: v.string(),
		callId: v.string(),
		transcript: v.array(
			v.object({
				role: v.union(v.literal('user'), v.literal('agent')),
				message: v.string(),
				time_in_call_secs: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, { tenantId, callId, transcript }) => {
		// Idempotency: skip if this call already has transcript messages
		const existing = await ctx.db
			.query('messages')
			.withIndex('by_parent_sequence', (q) =>
				q.eq('parentType', 'call').eq('parentId', callId),
			)
			.first()
		if (existing) return

		const now = Date.now()
		for (let i = 0; i < transcript.length; i++) {
			const turn = transcript[i]
			await ctx.db.insert('messages', {
				tenantId,
				parentType: 'call',
				parentId: callId,
				role: turn.role === 'user' ? 'user' : 'agent',
				direction: turn.role === 'user' ? 'inbound' : 'outbound',
				contentType: 'text',
				text: turn.message,
				sequence: i,
				timestamp: now,
				metadata: { kind: 'voice', timeInCallSecs: turn.time_in_call_secs },
				createdAt: now,
			})
		}
	},
})
```

**Patterns to follow:** existing `convex/http.ts` Hono routes (`/resend/events`, `RunMutationCtx`); `docs/threads-model.md §6` voice ingestion flow; `by_conversation` upsert + `by_parent_sequence` ordering.

**Test scenarios:**

- `valid signature + full payload → calls row upserted, N messages inserted, Polar event emitted`
- `invalid signature → constructEvent throws → 401, no mutations run`
- `missing tenantId path param → 400 before parse`
- `duplicate delivery (same conversation_id) → existing call patched; transcript NOT double-inserted (idempotency guard)`
- `empty transcript → no messages inserted; calls row still patched`
- `analysis.data_collection_results present → plan 009 seam action called`
- `event.type != 'post_call_transcription' (e.g. post_call_audio) → 200 ignored`

**Verification:**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/http.test.ts
node_modules/.bin/biome check --write convex/http.ts convex/calls.ts convex/messages.ts
```

---

### Unit 5 — Knowledge-base document lifecycle

**Goal:** CRUD for `knowledgeBaseDocs` — upload a file to Convex Storage, create/delete the ElevenLabs KB document via SDK, store `externalId`, append a `knowledgeBaseHistory` row on each change, and link/unlink doc IDs on the `agents` row.

**Requirements:** R4

**Dependencies:** Unit 1 (schema); Unit 2 (ElevenLabs client factory); Plan 008 (API key).

**Files:**

- `convex/knowledgeBaseDocs.ts` — Create (internal mutations + action for EL sync)
- `src/server/rpc/contracts/agents.contract.ts` — Modify (add KB contract procedures)
- `src/server/rpc/routes/agents.router.ts` — Modify (add KB route implementations)

**Approach:**
File upload uses Convex's built-in `generateUploadUrl` + `_storage` mechanism (the oRPC layer triggers a Convex mutation that returns an upload URL; the client uploads directly; a confirm mutation stores `storageId`). The sync action creates the EL KB document and deletes via `client.conversationalAi.knowledgeBase.documents.*` (VERIFY exact create method — `createFromFile`/`createFromUrl`/`createFromText` vs the flatter `conversationalAi.addToKnowledgeBase({ file | url })`; delete is `knowledgeBase.documents.delete(documentationId)`). History rows are append-only. Agent `knowledgeBaseIds` is patched after each create/delete.

**Technical design (directional):**

```ts
// convex/knowledgeBaseDocs.ts — directional
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { getElevenLabsClient } from './elevenlabs'

export const syncDocToElevenLabs = internalAction({
	args: {
		docId: v.id('knowledgeBaseDocs'),
		operation: v.union(v.literal('create'), v.literal('delete')),
	},
	handler: async (ctx, { docId, operation }) => {
		const doc = await ctx.runQuery(internal.knowledgeBaseDocs.get, { docId })
		if (!doc) throw new Error(`kb doc ${docId} not found`)
		const client = getElevenLabsClient()

		if (operation === 'create') {
			const url = await ctx.storage.getUrl(doc.storageId!)
			if (!url) throw new Error(`kb doc ${docId} has no stored file`)
			const resp = await fetch(url)
			const blob = await resp.blob()
			// VERIFY exact create method/params against installed .d.ts (createFromFile vs addToKnowledgeBase)
			const result =
				await client.conversationalAi.knowledgeBase.documents.createFromFile({
					name: doc.name,
					file: blob,
				})
			await ctx.runMutation(internal.knowledgeBaseDocs.setExternalId, {
				docId,
				externalId: (result as any).id,
				status: 'synced',
			})
		} else {
			if (doc.externalId) {
				await client.conversationalAi.knowledgeBase.documents.delete(
					doc.externalId,
				)
			}
			await ctx.runMutation(internal.knowledgeBaseDocs.markDeleted, { docId })
		}

		await ctx.runMutation(internal.knowledgeBaseDocs.appendHistory, {
			docId,
			changeType: operation,
			tenantId: doc.tenantId,
		})
	},
})
```

**Patterns to follow:** Convex `_storage` upload pattern (`generateUploadUrl` → client upload → `storageId` in mutation); `convex/utils.ts` `authMutation` for the oRPC-facing mutations.

**Test scenarios:**

- `create doc → EL doc created; externalId written; history row inserted; agents.knowledgeBaseIds updated`
- `delete doc → EL doc deleted; status=deleted; history row inserted; knowledgeBaseIds patched`
- `doc with no storageId and no url → throws before SDK call`
- `EL API error on create → status=error written; history row with error changeType`

**Verification:**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/knowledgeBaseDocs.test.ts
node_modules/.bin/biome check --write convex/knowledgeBaseDocs.ts
```

---

### Unit 6 — oRPC contract + route: agents and KB management

**Goal:** Expose ElevenLabs-backed agent CRUD and knowledge-base management as type-safe oRPC procedures, secured by the `org` middleware (session `organizationId` = `tenantId` always from server, never from client input).

**Requirements:** R1, R2, R4, R8

**Dependencies:** Units 2, 3, 5; `src/server/rpc/init.ts` (`org` middleware), `contracts/index.ts` + `src/server/rpc/index.ts` (registration).

**Files:**

- `src/server/rpc/contracts/agents.contract.ts` — Create (built on `base`)
- `src/server/rpc/contracts/index.ts` — Modify (add `agents: agentsContract`)
- `src/server/rpc/routes/agents.router.ts` — Create
- `src/server/rpc/index.ts` — Modify (add `agents: agentsRouter` to `os.router({...})`)

**Approach:**
Follow the existing contract-first pattern: contracts extend `base` (`oc.errors(baseErrors)`) and use `.route({...}).input(...).output(...)`; routes are `org.<contractPath>.handler(...)`. The `org` middleware adds `context.organizationId` from the verified WorkOS session — procedures NEVER accept `tenantId`/`organizationId` from client input. Agent create inserts the Convex row then calls `internal.agents.syncToElevenLabs`; update calls it again with the delta; `initiateCall` calls Unit 3's action. KB procedures wrap Unit 5.

**Technical design (directional):**

```ts
// src/server/rpc/contracts/agents.contract.ts — directional
import { z } from 'zod'
import { base } from './base'

export const agentsContract = {
	create: base
		.route({
			method: 'POST',
			path: '/agents',
			tags: ['Agents'],
			summary: 'Create voice agent',
		})
		.input(
			z.object({
				name: z.string(),
				instructions: z.string().optional(),
				model: z.string().optional(),
				knowledgeBaseIds: z.array(z.string()).optional(),
				workflow: z.any().optional(), // pushed into conversation_config.workflow
				zrmEnabled: z.boolean().optional(),
			}),
		)
		.output(z.object({ agentId: z.string() })),

	update: base
		.route({
			method: 'PATCH',
			path: '/agents/{agentId}',
			tags: ['Agents'],
			summary: 'Update voice agent',
		})
		.input(
			z.object({
				agentId: z.string(),
				patch: z.object({
					name: z.string().optional(),
					instructions: z.string().optional(),
					workflow: z.any().optional(),
				}),
			}),
		)
		.output(z.object({ success: z.boolean() })),

	delete: base
		.route({
			method: 'DELETE',
			path: '/agents/{agentId}',
			tags: ['Agents'],
			summary: 'Delete voice agent',
		})
		.input(z.object({ agentId: z.string() }))
		.output(z.object({ success: z.boolean() })),

	initiateCall: base
		.route({
			method: 'POST',
			path: '/agents/{agentId}/calls',
			tags: ['Agents'],
			summary: 'Start outbound call',
		})
		.input(
			z.object({
				agentId: z.string(),
				contactId: z.string(),
				phoneNumberId: z.string(),
				toNumber: z.string(),
			}),
		)
		.output(z.object({ callId: z.string() })),

	kbRequestUpload: base
		.route({
			method: 'POST',
			path: '/agents/kb/upload-url',
			tags: ['Agents'],
			summary: 'KB upload URL',
		})
		.input(z.object({ name: z.string(), mimeType: z.string() }))
		.output(z.object({ uploadUrl: z.string(), docId: z.string() })),

	kbConfirmUpload: base
		.route({
			method: 'POST',
			path: '/agents/kb/confirm',
			tags: ['Agents'],
			summary: 'Confirm KB upload',
		})
		.input(z.object({ docId: z.string(), storageId: z.string() }))
		.output(z.object({ success: z.boolean() })),

	kbDelete: base
		.route({
			method: 'DELETE',
			path: '/agents/kb/{docId}',
			tags: ['Agents'],
			summary: 'Delete KB doc',
		})
		.input(z.object({ docId: z.string() }))
		.output(z.object({ success: z.boolean() })),
}
```

```ts
// src/server/rpc/routes/agents.router.ts — directional sketch
import { org } from '@server/rpc/init' // org middleware adds context.organizationId
import { internal } from '../../../../convex/_generated/api'
import { convex } from '@/lib/convex' // server-side Convex client (VERIFY import path)

export const agentsRouter = {
	create: org.agents.create.handler(async ({ input, context }) => {
		const tenantId = context.organizationId // NEVER from input
		const agentDocId = await convex.mutation(internal.agents.create, {
			tenantId,
			name: input.name,
			instructions: input.instructions,
			model: input.model,
			knowledgeBaseIds: input.knowledgeBaseIds,
			zrmEnabled: input.zrmEnabled,
			provider: 'elevenlabs',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})
		await convex.action(internal.agents.syncToElevenLabs, {
			agentDocId,
			workflow: input.workflow,
		})
		return { agentId: agentDocId }
	}),
	// ... update, delete, initiateCall, kbRequestUpload, kbConfirmUpload, kbDelete
}
```

> The router object's keys must match the contract paths so `os.router({ agents: agentsRouter })` type-checks against `agentsContract`.

**Patterns to follow:** `src/server/rpc/contracts/health.contract.ts` (contract shape on `base`), `src/server/rpc/routes/health.router.ts` (`os.<path>.handler`), `src/server/rpc/init.ts` (`org` middleware), `src/server/rpc/index.ts` (`os.router({...})` registration), `contracts/index.ts` (contract map).

**Test scenarios:**

- `create agent → Convex row inserted, syncToElevenLabs called, externalId written back`
- `create agent without active org → NO_ACTIVE_ORGANIZATION thrown by org middleware`
- `initiateCall with a tenantId in body (ignored) → session organizationId used exclusively`
- `kbRequestUpload → Convex storage URL returned; docId pending`
- `kbConfirmUpload → syncDocToElevenLabs action enqueued`

**Verification:**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run src/server/rpc/routes/agents.router.test.ts
node_modules/.bin/biome check --write src/server/rpc/contracts/agents.contract.ts src/server/rpc/routes/agents.router.ts
```

---

## System-Wide Impact

| Area                      | Impact                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`        | Adds 5 tables (`agents`, `calls`, `messages`, `knowledgeBaseDocs`, `knowledgeBaseHistory`); coordinate index names with plan 001 (`tenant`, `contacts`) and plan 006 (`batches`) |
| `convex/http.ts`          | Adds one Hono route alongside `/resend/events` + the AuthKit routes; signature failure on this route must not affect others                                                      |
| `convex/convex.config.ts` | No new Convex components — ElevenLabs is SDK-only (no `@convex-dev/elevenlabs`)                                                                                                  |
| Polar (plan 007)          | `internal.billing.emitVoiceEvent` is a stub; plan 007 implements it against `@convex-dev/polar` event ingestion (`voice_minutes`)                                                |
| Surveys (plan 009)        | `internal.surveyResponses.ingestDataCollection` is a stub; plan 009 implements it from `analysis.data_collection_results`                                                        |
| Vault (plan 008)          | ElevenLabs API key + webhook secret + SIP trunk creds via `process.env` until plan 008 lands; swap to Vault calls then                                                           |
| Batch dialing (plan 006)  | `calls.batchId` field is present; batch fan-out calls `initiateOutbound` internally                                                                                              |

## Risks & Dependencies

| Risk                                                                      | Likelihood | Severity | Mitigation                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElevenLabs SDK incompatible with Convex V8 runtime                        | Medium     | High     | Isolate SDK calls in `'use node'` internal actions (incl. `client.webhooks.constructEvent`); if the Hono webhook handler can't call the SDK at all, promote to a TanStack Server Function. Spike in Unit 2/4.    |
| Workflow field location differs from doc (`conversation_config.workflow`) | Medium     | Medium   | This plan follows the live docs over the brief's "top-level" claim; VERIFY against installed `.d.ts` (Unit 2). Workflow stored as `v.any()` in our contract, so a shape change is contained to the EL push call. |
| `byo_sip` SIP-trunk outbound SDK method differs from sketch               | Medium     | Medium   | VERIFY against `.d.ts` + SIP trunking docs; the action is the only call site. Likely path: register trunk as an EL phone number, pass its id to `twilio.outboundCall`.                                           |
| KB create method name (`createFromFile` vs `addToKnowledgeBase`)          | Medium     | Low      | VERIFY against `.d.ts`; both routes write the same `externalId` back                                                                                                                                             |
| `providerCostUsd` credit-to-USD conversion not documented                 | Low        | Low      | Store raw credits in `metadata.rawCredits` alongside `providerCostUsd`; Polar event can meter credits if USD rate unavailable                                                                                    |
| Plan 001 (`tenant`, `contacts`) not merged before Unit 1                  | High       | Medium   | Stub the tables in schema; merge order 001 → 005                                                                                                                                                                 |
| ElevenLabs Agent Workflow schema changes (pre-GA)                         | Medium     | Low      | Push workflow JSON as `v.any()`; the EL SDK is the validation boundary                                                                                                                                           |

## Documentation & References

### External dependencies the plan introduces

| Dependency                  | Install command (verified)                                                            | Canonical docs                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@elevenlabs/elevenlabs-js` | `bun add @elevenlabs/elevenlabs-js` (latest `2.53.0`; engines `node >=18`; pin minor) | [npm](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js) · [SDK Conversational-AI reference](https://tessl.io/registry/tessl/npm-elevenlabs--elevenlabs-js/2.24.0/files/docs/conversational-ai.md) · [GitHub elevenlabs/packages](https://github.com/elevenlabs/packages) |

ElevenLabs API/feature docs cited inline above:

- Agent Workflows (node types, `conversation_config.workflow`, nodes/edges keyed by id) — https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows
- Post-call webhooks (payload `data.{transcript,metadata.cost,metadata.call_duration_secs,analysis.data_collection_results}`, `ElevenLabs-Signature` header, `constructEvent`) — https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- Twilio outbound call (`client.conversationalAi.twilio.outboundCall({ agentId, agentPhoneNumberId, toNumber })`) — https://elevenlabs.io/docs/api-reference/twilio/outbound-call
- Knowledge base (documents `get`/`delete`, `addToKnowledgeBase`) — https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
- SIP trunking (byo_sip) — https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking
- Procedures (alpha, dashboard-only) — https://elevenlabs.io/docs/eleven-agents/customization/procedures

Cross-plan seams:

- Polar event ingestion (`voice_minutes`) — https://polar.sh/docs/features/usage-based-billing/event-ingestion (plan 007)

### Design-doc sections & reference-repo paths the units build on

- `docs/rebuild-architecture.md` §4 (ElevenLabs SDK + telephony modes), §4c (Workflows/Procedures/MCP-off-in-ZRM, `agents.externalId`-only), §5 (schema ERD + field shapes), §3 (Polar `voice_minutes`), §2 (Vault for ElevenLabs key + SIP creds)
- `docs/threads-model.md` §2 (authoritative `calls`/`messages` table defs + index names), §6 (voice ingestion flow), §7 (`surveyResponses` voice_data_collection seam)
- agent.io code: `convex/http.ts` (Hono router pattern — `HttpRouterWithHono`, `app.post`), `convex/utils.ts` (`zCustomQuery`/`zCustomMutation` zod4), `convex/convex.config.ts` (`app.use`), `src/server/rpc/{init.ts (org middleware), contracts/{base,health.contract},routes/health.router,index.ts}` (contract-first oRPC pattern)
- Reference repos: `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai` (clean AI layer — text side only), `/Users/angel/dev/ontology/src/server/ai/agents` (orchestrator + sub-agents — text side only)

## Sources & References

- `docs/rebuild-architecture.md` §2/§3/§4/§4c/§5; `docs/threads-model.md` §2/§6/§7 (as listed above)
- [ElevenLabs Agent Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows)
- [ElevenLabs Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
- [ElevenLabs Twilio outbound call](https://elevenlabs.io/docs/api-reference/twilio/outbound-call)
- [ElevenLabs Knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base)
- [ElevenLabs SIP trunking](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking)
- [`@elevenlabs/elevenlabs-js` on npm](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js) · [SDK conversational-ai reference](https://tessl.io/registry/tessl/npm-elevenlabs--elevenlabs-js/2.24.0/files/docs/conversational-ai.md)
- [Polar Event Ingestion](https://polar.sh/docs/features/usage-based-billing/event-ingestion)
- Sibling plans: `2026-06-17-001-feat-convex-foundations-plan.md` (tenant/contacts — precedes Unit 1), `...-006-feat-batch-dialing-plan.md` (calls.batchId + workpool), `...-007-feat-billing-polar-plan.md` (Polar event seam), `...-008-feat-secrets-vault-plan.md` (Vault API key seam), `...-009-feat-surveys-sentiment-analytics-plan.md` (data_collection_results seam)

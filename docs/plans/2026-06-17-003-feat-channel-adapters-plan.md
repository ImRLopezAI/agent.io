---
title: 'feat: Channel adapters — WhatsApp / SMS / email / widget'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §5, docs/threads-model.md §4, §6
---

# feat: Channel adapters — WhatsApp / SMS / email / widget

## Overview

A Chat-SDK-style adapter layer that normalises inbound messages from every
supported channel into one canonical envelope, and sends outbound replies back
through the correct provider transport. Each adapter handles: (1) signature
verification / webhook ack, (2) payload parsing → normalised `InboundMessage`,
(3) per-tenant endpoint resolution in-memory against `tenant.phones[]` /
`whatsapps[]` / `widgets[]`, and (4) outbound send + delivery-status write.
Static transport credentials (Twilio account SID/token, Meta system-user token)
come from WorkOS Vault — never inline in code or DB — following the Secrets plan
(008). The adapter layer consumes the thread-upsert and message-insert provided
by the Conversation Substrate plan (002) and the tenant config schema baked in
the Foundations plan (001).

Supported channels in this phase: **WhatsApp** (Meta Cloud API), **SMS**
(Twilio), **email** (Resend — `@convex-dev/resend` v0.2.4 already installed),
and the **web widget** (public token = `${tenantId}.${nonce}`).

> **Ground-truth corrections applied during review.** The most load-bearing:
>
> 1. **`messages` is polymorphic** (`parentType: 'thread' | 'call'`,
>    `parentId: string`) — there is **no `threadId` column**. Every
>    `messages.insert` call here passes `parentType: 'thread'` +
>    `parentId: threadId` (`threads-model.md §2`).
> 2. **`by_provider_message` is NOT a unique index** — Convex has no unique
>    constraints. Idempotency (R8) is a **query-then-skip** inside the insert
>    mutation, not a DB constraint. The design doc's phrasing "insert by unique
>    `(parentType, parentId, providerMessageId)`" (`threads-model.md §6`) is an
>    _intent_, realised in code as a guarded read.
> 3. **Resend delivery status flows through the component's `onEmailEvent`
>    mutation** (`convex/resend.ts` → `handleEmailEvent`), **not** a
>    hand-written `/resend/events` route. The `/resend/events` route already
>    exists in `convex/http.ts` and is owned by the component.
> 4. **HMAC uses Web Crypto (`crypto.subtle`)** — available in the Convex V8
>    runtime; `node:crypto` is not. Twilio signing is **HMAC-SHA1 over (URL +
>    sorted POST params)**, _not_ a raw-body HMAC.

---

## Problem Frame

The legacy platform scatters channel handling across `sync.webhook` (~120 lines
of lookup/dedup/OCC patching), per-message tables (`smsMessages`,
`whatsappMessages`), and a fragile agent-match heuristic (`sync.ts:428`). There
is no stable, per-tenant webhook path: a single app-level Meta callback fans out
to all tenants by scanning.

The new platform fixes this at two levels:

1. **Route = tenant identity.** `/webhooks/{provider}/{tenantId}` gives the
   tenant from the URL with a single indexed read — no scan, no reverse-lookup
   table. WhatsApp is the exception (Meta controls the callback URL) and is
   handled by the per-WABA callback override registered at embedded-signup time.
2. **Adapter contract.** Every provider normalises to one `InboundMessage`
   envelope before touching Convex; outbound replies go through the mirror
   `send()` function. Delivery-status webhooks patch `messages.deliveryStatus`
   via `by_provider_message`. Adding a channel = adding one adapter; no other
   files change.

---

## Requirements Trace

- **R1** — Tenant identity from the webhook route, not a DB scan
  (`rebuild-architecture.md §5`, "Webhook ingress").
- **R2** — Per-WABA callback override for WhatsApp so Meta's single app-level
  callback self-identifies by tenant (`rebuild-architecture.md §5`).
- **R3** — Normalised `InboundMessage` envelope:
  `{ tenantId, channel, kind, channelExternalId, contactPhone, text, attachments, providerMessageId, metadata }`
  (`threads-model.md §4`).
- **R4** — Per-tenant endpoint resolution in-memory against `tenant.phones[]` /
  `whatsapps[]` / `widgets[]`; no reverse-lookup table
  (`rebuild-architecture.md §5`).
- **R5** — Outbound send writes a `messages` row (`parentType: 'thread'`) with
  `deliveryStatus: 'sent'` and patches status via `by_provider_message` on
  delivery/read webhooks (`threads-model.md §2, §6`).
- **R6** — Widget token parsing: `${tenantId}.${nonce}` → split on first `.` to
  extract `tenantId` without a DB lookup (`rebuild-architecture.md §5`).
- **R7** — Static transport creds (Twilio, Meta) resolved at call-time from
  WorkOS Vault; never stored in Convex or inline in code (plan 008 dependency).
- **R8** — Idempotent ingestion: duplicate provider webhook deliveries must not
  create duplicate `messages` rows — deduplicate on `providerMessageId` via a
  **guarded read inside the insert mutation** (`by_provider_message` index),
  since Convex has no unique constraints (`threads-model.md §6`).
- **R9** — Convex V8 runtime risk: signature HMAC + provider REST calls run in
  the V8 HTTP/action runtime. `crypto.subtle` is available; `node:crypto` is
  not. Flag any adapter that may need a `'use node'` fallback.

---

## Scope Boundaries

In scope:

- Hono webhook routes on the Convex HTTP router (via `HttpRouterWithHono`) for
  WhatsApp, SMS (Twilio), and widget. Email delivery status is **not** a new
  route — it rides the existing `/resend/events` component route.
- Adapter functions: inbound parse, outbound send, delivery-status patch.
- In-memory endpoint resolution helper (reads the `tenant` doc loaded once per
  request).
- Widget token decoder + `isActive` / `allowText` guard.
- Signature verification for each provider (Meta HMAC-SHA256, Twilio HMAC-SHA1
  `X-Twilio-Signature`; Resend/Svix verification is handled inside the
  component).
- Convex `httpAction` + scheduled `internalAction` wrappers that call 002's
  thread-upsert + message-insert internals, then fire
  `agentRuntime.runAgentTurn` (002).
- Outbound Convex `internalAction` per channel that fetches Vault creds and
  calls the provider SDK/API.
- Schema additions required only by this plan: **none** beyond what 001 defines
  for `tenant` and 002 defines for `threads`/`messages`/`contacts`.

### Deferred to Separate Tasks

- Email **inbound** parsing — Resend's `email.received` event also flows through
  the component's `onEmailEvent` mutation, but routing an inbound email into a
  `thread` is deferred; this plan covers outbound email via Resend + delivery
  status only.
- Voice transport via Twilio (plan 005 — ElevenLabs + Twilio voice calls).
- Composio / BYO MCP tool wiring into the agent turn (plan 004).
- Polar billing event push for per-message fees (plan 007).
- Per-tenant data migration from legacy `smsMessages`/`whatsappMessages` (plan
  010).

---

## Context & Research

### Relevant code (repo-relative, agent.io) — verified to exist

| Path                                      | Role                                                                                                                                                                                                                                                   | Verified     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `convex/http.ts`                          | `HonoWithConvex<ActionCtx>` app under `HttpRouterWithHono`; `app.use(cors())`, `app.use(requestId())`; existing `/resend/events`, `/api/agents`, `/api/chat` routes; `authKit.registerRoutes(http)`                                                    | ✅ read      |
| `convex/convex.config.ts`                 | `defineApp()` + `app.use(workOSAuthKit)` + `app.use(resend)`                                                                                                                                                                                           | ✅ read      |
| `convex/resend.ts`                        | `new Resend(components.resend, { testMode: false, onEmailEvent: internal.resend.handleEmailEvent })`; `handleEmailEvent` is an `internalMutation` taking `vOnEmailEventArgs` and currently only `console.log`s                                         | ✅ read      |
| `convex/utils.ts`                         | `authQuery`/`authMutation` via convex-helpers `zCustomQuery`/`zCustomMutation` (zod4) injecting `{ user, org }`; `getOrgFromJwt`. **No `internalAction` helper here** — import `internalAction`/`internalMutation` from `./_generated/server` directly | ✅ read      |
| `convex/schema.ts`                        | Owned by 001 (`tenant`) + 002 (`threads`/`calls`/`messages`/`contacts`); not modified by this plan                                                                                                                                                     | doc-verified |
| `src/server/rpc/init.ts`                  | `os = implement(contract).$context<RpcContextType>()`; middleware `auth`/`admin`/`org`/`adminOrg` are **derived** (`auth.use(...)`, `org.use(...)`) and exported from this file; context carries `session`, `workOs`, `headers`, `resHeaders`          | ✅ read      |
| `src/server/rpc/contracts/index.ts`       | `export const contract = { health, workOs }` — add `channels` here                                                                                                                                                                                     | ✅ read      |
| `src/server/rpc/routes/work-os.router.ts` | Router shape: `os.workOs.router({...})` with handlers built off the imported `org`/`adminOrg`/`auth` proxies (e.g. `org.workOs.organization.getActive.handler(...)`)                                                                                   | ✅ read      |

### Design-doc references (verified line ranges)

- `rebuild-architecture.md §5` (lines ~583–596) — webhook ingress, per-provider
  tenant-scoped routes (`/webhooks/twilio/{tenantId}`,
  `/webhooks/resend/{tenantId}`, `/webhooks/sms/{tenantId}`), per-WABA override,
  in-memory endpoint match, `phone` vs `sms` distinct kinds.
- `rebuild-architecture.md §1` (lines ~68–98) — `tenant.phones[]`
  (`phoneNumberId`, `phoneNumber`, `capabilities`, `agentIds`, `telephonyMode`,
  `sipTrunkId`…), `whatsapps[]` (`accountId` = Meta `phone_number_id`, `wabaId`,
  `phoneNumber`, `metaUserId`, `agentIds`), `widgets[]` (`token`,
  `enabledAgentIds`, `allowVoice`, `allowText`, `allowWhatsApp`, `isActive`,
  `welcomeMessage`, `branding`).
- `rebuild-architecture.md §2` (lines ~152–169) — WorkOS Vault for static creds
  (Twilio SID+token, Meta System User token); rule "OAuth → Pipes; static/PII →
  Vault".
- `rebuild-architecture.md §4b` (lines ~369–381) — "ack fast; the orchestrated
  turn runs async" (the doc's sketch uses Next.js `after()`; on Convex this is
  `ctx.scheduler.runAfter(0, ...)`).
- `threads-model.md §2` — `threads`/`calls`/`messages` schema; `messages` is
  polymorphic (`parentType`/`parentId`); `by_provider_message` index
  (non-unique); `deliveryStatus`; `attachments[]`.
- `threads-model.md §4` — `thread.kind` union + per-message `metadata` shapes
  (`metadata.kind` ∈ `whatsapp | sms | voice | email | tool | web_chat`).
- `threads-model.md §6` — ingestion redesign: upsert thread → insert message →
  run agent turn → send; delivery status via `by_provider_message`; idempotency
  via guarded `providerMessageId` read.

### Reference patterns

- Clean routing pattern (no jsonRender/db-doctor):
  `src/server/ai/agents/routing.ts`.
- Hono HTTP router already wired in `convex/http.ts` (`HttpRouterWithHono`,
  `HonoWithConvex`); `c.runMutation`/`c.runAction` are available off the Convex
  `ActionCtx` env, and the scheduler off `c.env.scheduler`.
- Convex action → Vault at call-time (plan 008 interface; stub with env vars
  until 008 lands).

---

## Key Technical Decisions

| Decision                                                                                             | Rationale                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hono on Convex HTTP router** (`HttpRouterWithHono`) for all webhook ingress                        | Webhooks are unauthenticated POST from providers; they belong on the Convex HTTP layer (already wired). TanStack server functions expect a session. The app is typed `HonoWithConvex<ActionCtx>`, so handlers reach `runAction`/`scheduler` off the Convex env.                                                                    |
| **Tenant from route path, not DB scan** (`/webhooks/{provider}/{tenantId}`)                          | Single indexed read on `tenant.by_tenant`; consistent with the design-doc rule ("no reverse-lookup table"). Widget is the only exception — token is parsed (`split('.')`) to extract tenantId.                                                                                                                                     |
| **Per-WABA callback override registered at embedded-signup** for WhatsApp                            | Meta controls the app-level webhook URL; the override lets each WABA self-identify to `/webhooks/whatsapp/{tenantId}` without server-side fan-out.                                                                                                                                                                                 |
| **WorkOS Vault at action call-time** for Twilio/Meta creds (stub with env vars until plan 008 lands) | Design-doc §2: static creds → Vault, never inline or in DB. Stub reads `process.env.*`; real impl fetches via plan 008's Vault interface at send time.                                                                                                                                                                             |
| **HMAC via `crypto.subtle` (Web Crypto)**, not `node:crypto`                                         | Convex V8 runtime exposes `crypto.subtle` (HMAC-SHA256/SHA1 verified working; only ECDH `deriveBits` is unimplemented). `node:crypto` is unavailable in V8. No `'use node'` action needed for signature verification.                                                                                                              |
| **Twilio signature = HMAC-SHA1 over (full URL + alphabetically-sorted POST params)**                 | Per Twilio security docs — NOT a raw-body HMAC. We reconstruct the signed string from the parsed form params + the request URL, then compare base64 HMAC-SHA1 against `X-Twilio-Signature`. (twilio-node's `validateRequest` does the same but pulls in the Node SDK; a small `crypto.subtle` helper avoids the dependency in V8.) |
| **Idempotency via guarded `providerMessageId` read** (not a unique index)                            | Convex has no unique indexes. The insert mutation (plan 002) reads `by_provider_message` first; if a row exists, it no-ops. Re-delivered webhooks converge.                                                                                                                                                                        |
| **In-memory endpoint resolution** (load tenant once per action, match in the array)                  | Arrays are bounded (≤ ~52 phones for the largest tenant); the `tenant` doc is a single indexed read; no secondary table.                                                                                                                                                                                                           |
| **Email delivery status via `onEmailEvent`** (not a custom route)                                    | The Resend component owns `/resend/events` and routes every event through the `handleEmailEvent` internalMutation in `convex/resend.ts`. Patch `messages.deliveryStatus` there.                                                                                                                                                    |

---

## Open Questions

### Resolved

- **Widget token format**: `${tenantId}.${nonce}` — split on first `.` (design
  doc §5).
- **WhatsApp inbound route**: per-WABA callback override to
  `/webhooks/whatsapp/{tenantId}` (design doc §5).
- **`phone` vs `sms` disambiguation**: separate `kind` values (`voice_call` vs
  `sms`) even when sharing one E.164 — medium and runtime differ (design doc
  §5).
- **Vault stub**: use `process.env.TWILIO_*` / `process.env.META_*` env vars as
  a shim until plan 008 ships the real Vault integration.
- **Resend webhook**: handled entirely by the component
  (`handleResendEventWebhook` at `/resend/events`, secret
  `RESEND_WEBHOOK_SECRET`). Delivery status is patched inside `handleEmailEvent`
  (the `onEmailEvent` mutation), not a new route.
- **Convex V8 HMAC**: `crypto.subtle` works in V8 — no Node action needed for
  verification.
- **Graph API version**: use **v22.0** (current usable as of June 2026; v21.0
  stable, v23 rolling). Pin one constant.

### Deferred to Implementation

- **VERIFY**: Whether Meta's HMAC secret for the per-WABA override is the global
  **App Secret** (`META_APP_SECRET`) or a per-WABA secret. Current Meta docs
  sign all app webhooks with the App Secret over the raw body
  (`X-Hub-Signature-256`); confirm no per-WABA override secret exists at
  embedded-signup time.
- **VERIFY**: Twilio `StatusCallback` URL must be publicly reachable and is set
  **per outbound message** (the `StatusCallback` param on `Messages.create`) —
  it is not a number-level config in our flow. Confirm Convex `.convex.site` URL
  is reachable from Twilio.
- **VERIFY**: Exact `EmailId` ↔ `providerMessageId` linkage for the outbound
  email path — `resend.sendEmail` returns the component's `EmailId`; the
  `onEmailEvent` payload carries `{ id: EmailId, event }` where
  `event.data.email_id` is the Resend id. Decide which one is stored as
  `messages.providerMessageId` so the delivery-status patch can find the row
  (recommend storing the component `EmailId`, matched by `args.id` in
  `handleEmailEvent`).
- **VERIFY**: `agentRuntime.runAgentTurn` arg shape from plan 002 (the §4b
  sketch passes `{ tenantId, threadId, inboundText }`; confirm before wiring).
- **VERIFY**: The contact identity field on `threads`/`contacts` used for
  outbound `to` (e.g. `contactPhone`/`contactEmail`) — plan 002 owns `contacts`;
  resolve the recipient from the contact doc, not a denormalised thread field,
  if 002 doesn't denormalise it.

---

## Output Structure

```
convex/
  channels/
    adapters/
      whatsapp.ts       # inbound parse + outbound send (WhatsApp)
      sms.ts            # inbound parse + outbound send (SMS via Twilio)
      email.ts          # outbound send (email via Resend)
      widget.ts         # inbound parse + outbound send (web widget)
    resolve.ts          # resolveEndpoint() — in-memory match against tenant arrays
    verify.ts           # per-provider signature verifiers (crypto.subtle)
    types.ts            # InboundMessage, OutboundPayload, ChannelAdapter interface
    index.ts            # ADAPTER_MAP + ingest / send / deliveryStatus actions
  http.ts               # (modify) add webhook + widget routes
  resend.ts             # (modify) patch messages.deliveryStatus inside handleEmailEvent
  schema.ts             # (owned by 001/002) tenant + threads + messages — not modified here

src/server/rpc/
  contracts/
    channels.contract.ts   # oRPC contract for channel mgmt (CRUD on phones[]/whatsapps[]/widgets[])
  routes/
    channels.router.ts     # oRPC router implementing channels.contract
  contracts/index.ts       # (modify) add channels contract
  routes/index.ts          # (modify/create) add channels router  [VERIFY: file does not exist yet — see Unit 8]
```

---

## High-Level Technical Design

```
Provider HTTP POST
      │
      ▼
Hono route on Convex HTTP router: /webhooks/{provider}/{tenantId}  (or /widget/{token})
  ├─ verify signature (Meta HMAC-SHA256 raw body / Twilio HMAC-SHA1 url+params)
  ├─ schedule ingest:  c.env.scheduler.runAfter(0, internal.channels.ingest, {...})
  └─ ack 200 immediately
          │
          ▼
      channels.ingest (internalAction)
          ├─ load tenant doc  (internal.tenant.getByTenantId — 1 indexed read)
          ├─ ADAPTER_MAP[provider].parse(rawBody, tenant) → InboundMessage | null
          │     └─ resolveEndpoint(tenant, provider, phoneNumberId / toNumber / token)
          ├─ runMutation(internal.contacts.upsertByPhone)            → contactId
          ├─ runMutation(internal.threads.upsert)                    → threadId
          ├─ runMutation(internal.messages.insert, {parentType:'thread', parentId:threadId, …, providerMessageId})
          │     └─ guarded by by_provider_message read (R8 idempotency, inside 002's mutation)
          └─ runAction(internal.agentRuntime.runAgentTurn, { tenantId, threadId, inboundText })
                  │
                  ▼  (002 runtime calls back into channels.send with the reply)
      channels.send (internalAction)
          ├─ fetch Vault creds for provider + tenantId (env stub until 008)
          ├─ ADAPTER_MAP[provider].send(payload, endpoint, creds) → { providerMessageId }
          │     └─ email is special-cased: resend.sendEmail(ctx, …) → EmailId
          └─ runMutation(internal.messages.insert, {parentType:'thread', parentId:threadId, direction:'outbound', deliveryStatus:'sent', providerMessageId})

Delivery status:
  Twilio  → POST /webhooks/twilio/{tenantId}/status → channels.deliveryStatus → messages.patchDeliveryStatus (by_provider_message)
  Resend  → /resend/events (component) → handleEmailEvent → messages.patchDeliveryStatus
  Meta    → statuses[] on the same /webhooks/whatsapp/{tenantId} payload → channels.deliveryStatus

Widget inbound:
  POST /widget/{token} → tenantId = token.split('.', 2)[0] → same ingest action → widget adapter
```

---

## Implementation Units

---

### Unit 1 — Adapter types, interface, and `resolveEndpoint`

**Goal**: Define the shared `InboundMessage` / `OutboundPayload` types and the
`ChannelAdapter` interface; implement the in-memory endpoint matchers.

**Requirements**: R3, R4

**Dependencies**: Plan 001 (tenant doc shape); plan 002 (thread/message types).

**Files**

| Path                         | Action |
| ---------------------------- | ------ |
| `convex/channels/types.ts`   | Create |
| `convex/channels/resolve.ts` | Create |

**Approach**

`types.ts` exports the canonical envelope and the adapter interface so every
provider adapter is a plain object implementing the same two functions. No class
hierarchy; duck-typed.

`resolve.ts` takes the loaded `tenant` doc plus a `provider + externalId` and
returns the matching endpoint entry or `null`, iterating the correct sub-array
(`phones`, `whatsapps`, `widgets`) in memory. No additional DB read.

The `TenantDoc` type comes from the 001 schema via `Doc<'tenant'>`
(`import type { Doc } from '../_generated/dataModel'`). Endpoint entry types are
the array element types of `tenant.phones` / `whatsapps` / `widgets` — derive
with `NonNullable<Doc<'tenant'>['whatsapps']>[number]` rather than re-declaring
shapes (keeps them in lockstep with 001).

**Technical design** (directional)

```ts
// convex/channels/types.ts
import type { Doc } from '../_generated/dataModel'

export type TenantDoc = Doc<'tenant'>
export type WhatsAppEndpoint = NonNullable<TenantDoc['whatsapps']>[number]
export type PhoneEndpoint = NonNullable<TenantDoc['phones']>[number]
export type WidgetEndpoint = NonNullable<TenantDoc['widgets']>[number]
export type ChannelEndpoint = WhatsAppEndpoint | PhoneEndpoint | WidgetEndpoint

// channel + kind mirror the threads schema unions (threads-model.md §2)
export type Channel = 'whatsapp' | 'sms' | 'widget' | 'email' | 'web'
export type MessageKind =
	| 'whatsapp_chat'
	| 'sms'
	| 'widget_text'
	| 'email'
	| 'web_chat'

export interface InboundMessage {
	tenantId: string
	channel: Channel
	kind: MessageKind
	/** Meta phone_number_id, our E.164 To number, widget token, or email address */
	channelExternalId: string
	/** sender E.164 / widget contact ref — used to upsert/find the contact */
	contactPhone: string
	text: string
	attachments?: Array<{
		url?: string
		kind: 'image' | 'file' | 'audio' // stored as v.string() on messages.attachments[]
		mimeType?: string
		fileName?: string
		providerFileId?: string
	}>
	providerMessageId: string
	/** matches the threads-model §4 MessageMetadata union (kind: whatsapp|sms|email|web_chat) */
	metadata?: Record<string, unknown>
}

export interface OutboundPayload {
	to: string // E.164, WhatsApp recipient, or email
	text: string
	attachments?: Array<{ url: string; mimeType?: string }>
}

export interface ChannelCreds {
	twilioAccountSid?: string
	twilioAuthToken?: string
	metaSystemUserToken?: string
	statusCallbackUrl?: string
}

export interface ChannelAdapter {
	parse(rawBody: string, tenant: TenantDoc): InboundMessage | null
	send(
		payload: OutboundPayload,
		endpoint: ChannelEndpoint,
		creds: ChannelCreds,
	): Promise<{ providerMessageId: string }>
}
```

```ts
// convex/channels/resolve.ts
import type {
	TenantDoc,
	WhatsAppEndpoint,
	PhoneEndpoint,
	WidgetEndpoint,
} from './types'

export function resolveWhatsAppEndpoint(
	tenant: TenantDoc,
	phoneNumberId: string,
): WhatsAppEndpoint | null {
	return tenant.whatsapps?.find((w) => w.accountId === phoneNumberId) ?? null
}

export function resolveSmsEndpoint(
	tenant: TenantDoc,
	toNumber: string,
): PhoneEndpoint | null {
	// match against phones[] where 'sms' is in capabilities (capabilities is optional)
	return (
		tenant.phones?.find(
			(p) => p.phoneNumber === toNumber && p.capabilities?.includes('sms'),
		) ?? null
	)
}

export function resolveWidgetEndpoint(
	tenant: TenantDoc,
	token: string,
): WidgetEndpoint | null {
	return tenant.widgets?.find((w) => w.token === token && w.isActive) ?? null
}
```

**Patterns to follow**: design-doc §5 in-memory match;
`tenant.phones[]`/`whatsapps[]`/`widgets[]` shape from
`rebuild-architecture.md §1` (verified field names: WhatsApp endpoint key is
**`accountId`** = Meta `phone_number_id`; phone key is **`phoneNumber`** +
optional **`capabilities`**; widget key is **`token`** + **`isActive`** +
**`allowText`**/**`allowVoice`** + **`enabledAgentIds`**).

**Test scenarios**

| Input                                                                               | Outcome                              |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| `resolveWhatsAppEndpoint(tenant, knownAccountId)`                                   | Returns matching entry               |
| `resolveWhatsAppEndpoint(tenant, unknownId)`                                        | Returns `null`                       |
| `resolveWidgetEndpoint(tenant, token)` where `isActive: false`                      | Returns `null`                       |
| `resolveWidgetEndpoint(tenant, validToken)`                                         | Returns entry with `enabledAgentIds` |
| `resolveSmsEndpoint(tenant, number)` where phone has `capabilities: ['voice']` only | Returns `null`                       |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in touched files.
- `node_modules/.bin/vp test run convex/channels/resolve.test.ts`

---

### Unit 2 — Hono webhook routes on Convex HTTP router + signature verification

**Goal**: Register `/webhooks/whatsapp/:tenantId`, `/webhooks/twilio/:tenantId`,
`/webhooks/twilio/:tenantId/status`, and `/widget/:token` on the existing Hono
app in `convex/http.ts`; verify provider signatures; ack 200 and schedule the
`channels.ingest` / `channels.deliveryStatus` action.

**Requirements**: R1, R2, R6, R8, R9

**Dependencies**: Unit 1 (types), plan 001 (tenant schema), plan 002
(`channels.ingest` action — stub during dev).

**Files**

| Path                        | Action                                                      |
| --------------------------- | ----------------------------------------------------------- |
| `convex/http.ts`            | Modify — add webhook + widget routes                        |
| `convex/channels/verify.ts` | Create — per-provider signature verifiers (`crypto.subtle`) |

**Approach**

Add route registrations to the **existing** `app` in `convex/http.ts` (the file
already constructs `const app: HonoWithConvex<ActionCtx> = new Hono()` from
`hono/tiny` and applies `cors()` + `requestId()`). Each route: read raw body →
verify signature → schedule the action via `c.env.scheduler.runAfter(0, ...)` →
return `c.text('ok')`. Scheduling before returning guarantees the 200 is sent
before the heavy work runs (`rebuild-architecture.md §4b`, adapted from the
Next.js `after()` sketch to the Convex scheduler).

**CORS**: `app.use(cors())` is currently global. Provider webhook routes are
server-to-server, so CORS does not affect them. The **widget** browser route is
the only one a browser hits — do not advertise permissive `*` CORS to it; scope
a `cors({ origin: tenantOrigin })` middleware to `/widget/*` only, or serve the
widget same-origin via the app proxy. (See System-Wide Impact.)

Signature verifiers (`verify.ts`) are async (Web Crypto is promise-based) and
return `Promise<boolean>`:

- **Meta** (`verifyMetaHmac`): `X-Hub-Signature-256: sha256=<hex>` is an
  **HMAC-SHA256 of the raw request body** keyed by the App Secret
  (`META_APP_SECRET`). Compute with `crypto.subtle.importKey` + `.sign('HMAC')`,
  hex-encode, constant-time compare.
- **Twilio** (`verifyTwilioSignature`): `X-Twilio-Signature` is a **base64
  HMAC-SHA1** of
  `url + <alphabetically-sorted POST params concatenated as key+value>` keyed by
  the **Twilio Auth Token**. We parse the form body, sort keys, concat,
  HMAC-SHA1 via `crypto.subtle`, base64-encode, compare. The `url` must be the
  exact public URL Twilio called (scheme+host+path; include the `.convex.site`
  host).

Widget token decoding: `token.split('.', 2)` → `[tenantId, nonce]`.

**Technical design** (directional)

```ts
// convex/http.ts — additions to the EXISTING app (do not re-create app/http)
import { internal } from './_generated/api'
import { verifyMetaHmac, verifyTwilioSignature } from './channels/verify'

// WhatsApp — Meta per-WABA callback override points here.
// Meta also sends a GET verification challenge (hub.mode/hub.verify_token/hub.challenge).
app.get('/webhooks/whatsapp/:tenantId', (c) => {
	const mode = c.req.query('hub.mode')
	const token = c.req.query('hub.verify_token')
	const challenge = c.req.query('hub.challenge')
	if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
		return c.text(challenge ?? '')
	}
	return c.text('Forbidden', 403)
})

app.post('/webhooks/whatsapp/:tenantId', async (c) => {
	const tenantId = c.req.param('tenantId')
	const rawBody = await c.req.text()
	if (!(await verifyMetaHmac(rawBody, c.req.raw.headers)))
		return c.text('Forbidden', 403)
	await c.env.scheduler.runAfter(0, internal.channels.ingest, {
		tenantId,
		provider: 'whatsapp',
		rawBody,
	})
	return c.text('ok')
})

// SMS — Twilio. Route name 'twilio' matches the design-doc example route.
app.post('/webhooks/twilio/:tenantId', async (c) => {
	const tenantId = c.req.param('tenantId')
	const rawBody = await c.req.text()
	if (!(await verifyTwilioSignature(rawBody, c.req.raw.headers, c.req.url)))
		return c.text('Forbidden', 403)
	await c.env.scheduler.runAfter(0, internal.channels.ingest, {
		tenantId,
		provider: 'sms',
		rawBody,
	})
	return c.text('ok')
})

// Twilio delivery status (StatusCallback set per-message on send)
app.post('/webhooks/twilio/:tenantId/status', async (c) => {
	const tenantId = c.req.param('tenantId')
	const rawBody = await c.req.text()
	if (!(await verifyTwilioSignature(rawBody, c.req.raw.headers, c.req.url)))
		return c.text('Forbidden', 403)
	await c.env.scheduler.runAfter(0, internal.channels.deliveryStatus, {
		tenantId,
		provider: 'sms',
		rawBody,
	})
	return c.text('ok')
})

// Widget — same-origin browser POST; tenantId parsed from the token.
app.post('/widget/:token', async (c) => {
	const token = c.req.param('token')
	const [tenantId] = token.split('.', 2)
	if (!tenantId) return c.text('Bad token', 400)
	const rawBody = await c.req.text()
	await c.env.scheduler.runAfter(0, internal.channels.ingest, {
		tenantId,
		provider: 'widget',
		rawBody,
		widgetToken: token,
	})
	return c.text('ok')
})
```

```ts
// convex/channels/verify.ts — Web Crypto only (no node:crypto in V8)
function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

export async function verifyMetaHmac(
	rawBody: string,
	headers: Headers,
): Promise<boolean> {
	const header = headers.get('x-hub-signature-256') ?? ''
	const sig = header.startsWith('sha256=') ? header.slice('sha256='.length) : ''
	const secret = process.env.META_APP_SECRET ?? ''
	if (!sig || !secret) return false
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const mac = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(rawBody),
	)
	return timingSafeEqual(sig, toHex(mac))
}

export async function verifyTwilioSignature(
	body: string,
	headers: Headers,
	url: string,
): Promise<boolean> {
	const provided = headers.get('x-twilio-signature') ?? ''
	const token = process.env.TWILIO_AUTH_TOKEN ?? ''
	if (!provided || !token) return false
	// Twilio: base64( HMAC-SHA1( url + sorted(key+value) , authToken ) )
	const params = new URLSearchParams(body)
	const sorted = [...params.keys()].sort()
	let data = url
	for (const k of sorted) data += k + (params.get(k) ?? '')
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(token),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign'],
	)
	const mac = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(data),
	)
	const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
	return timingSafeEqual(provided, expected)
}
```

**V8 runtime note (R9)**: `crypto.subtle` (HMAC-SHA256/SHA1) is available in the
Convex V8 HTTP runtime — verified via Convex backend issue tracking (only ECDH
`deriveBits` is unimplemented). No `'use node'` action is needed for signature
verification. If a future provider SDK needs Node APIs, move just that call into
a `'use node'`-annotated action.

**Patterns to follow**: existing `convex/http.ts` Hono pattern (`app.post`,
`c.req.raw.headers`, `c.env.scheduler`); `scheduler.runAfter(0, …)` for the "ack
fast" async hop (design-doc §4b).

**Test scenarios**

| Input                                                                                     | Outcome                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| GET `/webhooks/whatsapp/org_x?hub.mode=subscribe&hub.verify_token=<ok>&hub.challenge=123` | Returns `123`                               |
| POST `/webhooks/whatsapp/org_x` with valid Meta HMAC                                      | 200 + schedules ingest                      |
| POST `/webhooks/whatsapp/org_x` with bad HMAC                                             | 403, no action scheduled                    |
| POST `/webhooks/twilio/org_x` with valid `X-Twilio-Signature`                             | 200 + schedules ingest                      |
| POST `/webhooks/twilio/org_x` with bad signature                                          | 403                                         |
| POST `/widget/org_abc.nonce123`                                                           | parses tenantId `org_abc`, schedules ingest |
| POST `/widget/.nonce` (missing tenantId)                                                  | 400                                         |
| POST `/webhooks/twilio/org_x/status`                                                      | 200 + schedules deliveryStatus              |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `node_modules/.bin/vp test run convex/channels/verify.test.ts`
- Manual: Twilio CLI
  `twilio phone-numbers:update <SID> --sms-url <ngrok>/webhooks/twilio/<tenantId>`
  to replay an inbound; Meta Developer Console "Send test event".

---

### Unit 3 — WhatsApp adapter (inbound parse + outbound send + status)

**Goal**: Implement the WhatsApp `ChannelAdapter`: parse Meta Cloud API webhook
payloads (text + media) into `InboundMessage`; send outbound messages via the
Meta Send Message API using Vault-resolved credentials. (`statuses[]` payloads
are handled by `channels.deliveryStatus` in Unit 7.)

**Requirements**: R2, R3, R4, R5, R7, R8

**Dependencies**: Unit 1 (types + `resolveWhatsAppEndpoint`), plan 008 (Vault) —
stub with `process.env.META_SYSTEM_USER_TOKEN` until 008 lands.

**Files**

| Path                                   | Action |
| -------------------------------------- | ------ |
| `convex/channels/adapters/whatsapp.ts` | Create |

**Approach**

Parse the Meta Cloud API `entry[0].changes[0].value` envelope (confirmed shape:
`{ messaging_product, metadata: { display_phone_number, phone_number_id }, contacts: [...], messages?: [...], statuses?: [...] }`).
Each `messages[]` entry maps to one `InboundMessage`; `statuses[]`-only payloads
carry no `messages[]` and return `null` from `parse()` (the delivery path reads
them). Resolve the receiving `phone_number_id` against `tenant.whatsapps[]` via
`resolveWhatsAppEndpoint()` (matches on `accountId`). Media messages carry
`{type, image|document|audio: { id, mime_type, filename? }}` — record the
`media.id` as `providerFileId`; the actual download (Graph `GET /{media-id}` →
signed URL) is done lazily by the runtime if needed, not in `parse()`.

Outbound send: `POST https://graph.facebook.com/v22.0/{accountId}/messages` with
`{ messaging_product: 'whatsapp', to, type: 'text', text: { body } }` and
`Authorization: Bearer <metaSystemUserToken>`. Return `messages[0].id`
(`wamid…`) as `providerMessageId`.

**Technical design** (directional)

```ts
// convex/channels/adapters/whatsapp.ts
import type { ChannelAdapter, WhatsAppEndpoint, InboundMessage } from '../types'
import { resolveWhatsAppEndpoint } from '../resolve'

const META_API = 'https://graph.facebook.com/v22.0'

export const whatsappAdapter: ChannelAdapter = {
	parse(rawBody, tenant) {
		const body = JSON.parse(rawBody)
		const change = body?.entry?.[0]?.changes?.[0]?.value
		if (!change?.messages?.length) return null // status-only / echo — handled elsewhere

		const msg = change.messages[0]
		const phoneNumberId = change.metadata?.phone_number_id
		const endpoint = resolveWhatsAppEndpoint(tenant, phoneNumberId)
		if (!endpoint) return null // not our WABA

		return {
			tenantId: tenant.tenantId,
			channel: 'whatsapp',
			kind: 'whatsapp_chat',
			channelExternalId: phoneNumberId,
			contactPhone: msg.from, // E.164 sender
			text: msg.text?.body ?? '',
			attachments: buildAttachments(msg),
			providerMessageId: msg.id, // wamid…
			metadata: {
				kind: 'whatsapp', // threads-model §4
				replyToMessageId: msg.context?.id,
			},
		}
	},

	async send(payload, endpoint, creds) {
		const accountId = (endpoint as WhatsAppEndpoint).accountId
		const res = await fetch(`${META_API}/${accountId}/messages`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${creds.metaSystemUserToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				messaging_product: 'whatsapp',
				to: payload.to,
				type: 'text',
				text: { body: payload.text },
			}),
		})
		const data = (await res.json()) as { messages?: Array<{ id: string }> }
		const providerMessageId = data.messages?.[0]?.id ?? ''
		if (!providerMessageId)
			throw new Error(`Meta send failed: ${JSON.stringify(data)}`)
		return { providerMessageId }
	},
}

// Maps msg.image / msg.document / msg.audio → attachments[]. media.id → providerFileId.
function buildAttachments(
	msg: Record<string, any>,
): InboundMessage['attachments'] {
	const out: NonNullable<InboundMessage['attachments']> = []
	for (const t of ['image', 'document', 'audio'] as const) {
		const m = msg[t]
		if (m?.id)
			out.push({
				kind: t === 'document' ? 'file' : (t as 'image' | 'audio'),
				mimeType: m.mime_type,
				fileName: m.filename,
				providerFileId: m.id,
			})
	}
	return out.length ? out : undefined
}
```

**Patterns to follow**: `threads-model.md §4` (`metadata.kind: 'whatsapp'`,
`replyToMessageId`); design-doc §5 per-WABA callback override;
`rebuild-architecture.md §2` (Vault for the Meta System User token). Meta Cloud
API send: `https://graph.facebook.com/v22.0/{phone-number-id}/messages`.

**Test scenarios**

| Input                                                  | Outcome                                              |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Meta text message payload with valid `phone_number_id` | `InboundMessage { kind: 'whatsapp_chat' }`           |
| Meta status-only payload (no `messages[]`)             | Returns `null` (delivery path handles it)            |
| `phone_number_id` not in `tenant.whatsapps[]`          | Returns `null`                                       |
| Media (image) message                                  | `attachments[0].providerFileId` set, `kind: 'image'` |
| `send()` with valid creds                              | `{ providerMessageId: 'wamid…' }`                    |
| Meta API error JSON                                    | Throws with the response body                        |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in
  `convex/channels/adapters/whatsapp.ts`.
- `node_modules/.bin/vp test run convex/channels/adapters/whatsapp.test.ts`
- Integration: capture a real Meta test-event payload (Meta Developer Console) →
  assert round-trip.

---

### Unit 4 — SMS adapter (Twilio inbound parse + outbound send + delivery status)

**Goal**: Implement the SMS `ChannelAdapter`: parse Twilio inbound SMS webhook
(URL-encoded form), send outbound SMS via the Twilio REST API, and provide the
status mapper used by `channels.deliveryStatus`.

**Requirements**: R3, R4, R5, R7, R8

**Dependencies**: Unit 1 (types + `resolveSmsEndpoint`), plan 008 (Vault) — stub
with `process.env.TWILIO_ACCOUNT_SID` + `process.env.TWILIO_AUTH_TOKEN`.

**Files**

| Path                              | Action |
| --------------------------------- | ------ |
| `convex/channels/adapters/sms.ts` | Create |

**Approach**

Twilio inbound SMS POST is `application/x-www-form-urlencoded`. Parse with
`new URLSearchParams(rawBody)`. Confirmed params: `MessageSid` (canonical
34-char id — `SmsMessageSid`/`SmsSid` are legacy aliases), `From` (sender
E.164), `To` (our number), `Body` (text), `NumMedia`,
`MediaUrl{N}`/`MediaContentType{N}`, `NumSegments`. Match `To` against
`tenant.phones[]` with `capabilities` including `'sms'`.

Outbound send via the Twilio Messages REST API
(`https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`), Basic auth
`base64(sid:token)`, form body `{ To, From, Body, StatusCallback }`. The
`StatusCallback` is set **per message** (not number-level) →
`/webhooks/twilio/{tenantId}/status`. Response JSON
`{ sid, status, error_message? }` → `sid` is `providerMessageId` (`SM…`).

Delivery status webhook: `MessageSid` + `MessageStatus`
(`queued|sent|delivered|undelivered|failed`). `mapTwilioStatus()` maps to our
`deliveryStatus` (`sent|delivered|failed`); the patch is done in
`channels.deliveryStatus` (Unit 7) via `by_provider_message`.

**Technical design** (directional)

```ts
// convex/channels/adapters/sms.ts
import type { ChannelAdapter, PhoneEndpoint } from '../types'
import { resolveSmsEndpoint } from '../resolve'

export const smsAdapter: ChannelAdapter = {
	parse(rawBody, tenant) {
		const p = new URLSearchParams(rawBody)
		const toNumber = p.get('To') ?? ''
		const endpoint = resolveSmsEndpoint(tenant, toNumber)
		if (!endpoint) return null

		const segments = Number(p.get('NumSegments') ?? '1')
		return {
			tenantId: tenant.tenantId,
			channel: 'sms',
			kind: 'sms',
			channelExternalId: toNumber,
			contactPhone: p.get('From') ?? '',
			text: p.get('Body') ?? '',
			providerMessageId: p.get('MessageSid') ?? '', // canonical (not SmsMessageSid)
			metadata: { kind: 'sms', segments }, // threads-model §4 (metadata.kind: 'sms')
		}
	},

	async send(payload, endpoint, creds) {
		const sid = creds.twilioAccountSid ?? ''
		const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
		const body = new URLSearchParams({
			To: payload.to,
			From: (endpoint as PhoneEndpoint).phoneNumber,
			Body: payload.text,
		})
		if (creds.statusCallbackUrl)
			body.set('StatusCallback', creds.statusCallbackUrl)
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${btoa(`${sid}:${creds.twilioAuthToken}`)}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		})
		const data = (await res.json()) as { sid?: string; error_message?: string }
		if (!data.sid)
			throw new Error(`Twilio send failed: ${data.error_message ?? 'unknown'}`)
		return { providerMessageId: data.sid }
	},
}

// Maps a Twilio MessageStatus → our deliveryStatus (used by channels.deliveryStatus)
export function mapTwilioStatus(s: string): 'sent' | 'delivered' | 'failed' {
	if (s === 'delivered') return 'delivered'
	if (s === 'failed' || s === 'undelivered') return 'failed'
	return 'sent'
}
```

**Note on `phone` vs `sms`**: `voice_call` and `sms` are distinct `kind` values
even on a dual-capability number (`capabilities: ['voice','sms']`). The SMS
adapter always produces `kind: 'sms'` (a `thread`); the voice path (plan 005)
produces a `call`. (`rebuild-architecture.md §5`.)

**Patterns to follow**: `threads-model.md §4` (`metadata.kind: 'sms'`,
`segments?`); `rebuild-architecture.md §5` ("phone vs sms distinct kinds");
Twilio Messages resource + StatusCallback.

**Test scenarios**

| Input                                               | Outcome                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| Twilio inbound form with `To` matching tenant phone | `InboundMessage { kind: 'sms' }`, `providerMessageId` from `MessageSid` |
| `To` not in `tenant.phones[]`                       | Returns `null`                                                          |
| Phone with only `capabilities: ['voice']`           | Returns `null`                                                          |
| `send()` with valid creds                           | `{ providerMessageId: 'SM…' }`                                          |
| Twilio API error (no `sid`)                         | Throws with `error_message`                                             |
| `mapTwilioStatus('undelivered')`                    | `'failed'`                                                              |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `node_modules/.bin/vp test run convex/channels/adapters/sms.test.ts`
- Integration: Twilio test credentials + webhook replay.

---

### Unit 5 — Email adapter (outbound via `@convex-dev/resend` + delivery status)

**Goal**: Implement email outbound send via the already-installed
`@convex-dev/resend` component (v0.2.4); patch `messages.deliveryStatus` inside
the component's `onEmailEvent` mutation (`handleEmailEvent`).

**Requirements**: R3, R5, R8

**Dependencies**: Unit 1 (types), `convex/resend.ts` (existing component
instance), plan 002 (`messages.insert`, `messages.patchDeliveryStatus`).

**Files**

| Path                                | Action                                                   |
| ----------------------------------- | -------------------------------------------------------- |
| `convex/channels/adapters/email.ts` | Create                                                   |
| `convex/resend.ts`                  | Modify — patch delivery status inside `handleEmailEvent` |

**Approach**

Resend is registered (`convex.config.ts` `app.use(resend)`; `convex/resend.ts`
exports `resend` + `handleEmailEvent`). **The component owns `/resend/events`**
(already wired in `convex/http.ts` via `resend.handleResendEventWebhook`) and
routes every event through `handleEmailEvent` (the `onEmailEvent` mutation). So:

- **Outbound**: call `resend.sendEmail(ctx, { from, to, subject, text })` →
  returns the component `EmailId`. This is the value we store as
  `messages.providerMessageId` for the outbound row. `sendEmail` accepts any ctx
  that can run a mutation (mutation **or** action), so it works from
  `channels.send`. (Verified signature in
  `node_modules/@convex-dev/resend/dist/client/index.d.ts`:
  `sendEmail(ctx: RunMutationCtx, options: SendEmailOptions): Promise<EmailId>`.)
- **Delivery status**: extend `handleEmailEvent` to map `event.type` → our
  `deliveryStatus` and call `internal.messages.patchDeliveryStatus` keyed by the
  component `EmailId` (`args.id`). `email.delivered` → `'delivered'`;
  `email.bounced` / `email.failed` → `'failed'`; `email.sent` → `'sent'`.
  (`handleEmailEvent` receives `{ id: EmailId, event: EmailEvent }` per
  `vOnEmailEventArgs`.)

For the `email` adapter object, `parse()` returns `null` (inbound deferred); its
`send()` throws — the live outbound path is special-cased in `channels.send`
(Unit 7) because it needs the action `ctx` for `resend.sendEmail`.

> **No new Hono route, no Svix code here** — the component verifies the Svix
> signature (`RESEND_WEBHOOK_SECRET`) internally inside
> `handleResendEventWebhook`.

**Technical design** (directional)

```ts
// convex/channels/adapters/email.ts
import type { ChannelAdapter } from '../types'

// Resend needs ctx to enqueue; the adapter's send is invoked by channels.send,
// which holds the action ctx and calls resend.sendEmail directly (see Unit 7).
// This object documents the contract + the inbound stub.
export const emailAdapter: ChannelAdapter = {
	parse(_rawBody, _tenant) {
		// Inbound email parsing deferred — see Scope Boundaries.
		return null
	},
	async send() {
		// Email send is special-cased in channels.send (needs ctx for resend.sendEmail).
		throw new Error('email.send is handled inline in channels.send (needs ctx)')
	},
}
```

```ts
// convex/resend.ts — extend the EXISTING handleEmailEvent (currently console.log only)
import { Resend, vOnEmailEventArgs } from '@convex-dev/resend'
import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'

export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	onEmailEvent: internal.resend.handleEmailEvent,
})

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (ctx, { id, event }) => {
		const status =
			event.type === 'email.delivered'
				? 'delivered'
				: event.type === 'email.bounced' || event.type === 'email.failed'
					? 'failed'
					: event.type === 'email.sent'
						? 'sent'
						: undefined
		if (!status) return
		// plan 002 mutation; `id` is the component EmailId stored as providerMessageId
		await ctx.runMutation(internal.messages.patchDeliveryStatus, {
			providerMessageId: id,
			status,
		})
	},
})
```

**Patterns to follow**: `convex/resend.ts` existing instance +
`vOnEmailEventArgs`; `@convex-dev/resend` `sendEmail(ctx, options)` returns
`EmailId` (verified in `dist/client/index.d.ts`); event union from the same
d.ts.

**Test scenarios**

| Input                                     | Outcome                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `channels.send` (email)                   | Calls `resend.sendEmail`; stores returned `EmailId` as `providerMessageId` |
| `handleEmailEvent` with `email.delivered` | Patches `deliveryStatus = 'delivered'`                                     |
| `handleEmailEvent` with `email.bounced`   | Patches `deliveryStatus = 'failed'`                                        |
| `handleEmailEvent` with `email.opened`    | No-op (status `undefined`)                                                 |
| `emailAdapter.parse(...)`                 | Returns `null` (deferred)                                                  |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in
  `convex/channels/adapters/email.ts` and `convex/resend.ts`.
- `node_modules/.bin/vp test run convex/channels/adapters/email.test.ts`
- Integration: Resend test env → confirm `email.delivered` patches the row.

---

### Unit 6 — Widget adapter + isActive / channel-guard

**Goal**: Implement the widget `ChannelAdapter`: parse inbound HTTP POST
payloads from the embedded widget; guard against inactive widgets and disallowed
channels; deliver replies reactively (no provider REST call).

**Requirements**: R3, R4, R6, R8

**Dependencies**: Unit 1 (types + `resolveWidgetEndpoint`), plan 002.

**Files**

| Path                                 | Action |
| ------------------------------------ | ------ |
| `convex/channels/adapters/widget.ts` | Create |

**Approach**

The widget token `${tenantId}.${nonce}` is split in Unit 2's route (tenantId for
the action); the **full token** is passed as `widgetToken`.
`resolveWidgetEndpoint(tenant, widgetToken)` returns the `widgets[]` entry (and
already enforces `isActive`). Additional guard: `allowText === false` → `null`.

Outbound: the widget is a client-side session; replies are delivered via a
Convex reactive query (the widget subscribes to `messages` for its thread). The
`messages` insert in plan 002's flow **is** the delivery mechanism — so
`widget.send()` is a no-op marker (the reply row already exists when the runtime
would otherwise call `send()`).

**Technical design** (directional)

```ts
// convex/channels/adapters/widget.ts
import type { ChannelAdapter } from '../types'
import { resolveWidgetEndpoint } from '../resolve'

export const widgetAdapter: ChannelAdapter = {
	parse(rawBody, tenant) {
		const body = JSON.parse(rawBody) as {
			token: string
			text: string
			contactRef?: string
			messageId?: string
		}
		const endpoint = resolveWidgetEndpoint(tenant, body.token)
		if (!endpoint) return null // unknown or inactive token
		if (!endpoint.allowText) return null // text not allowed on this widget

		return {
			tenantId: tenant.tenantId,
			channel: 'widget',
			kind: 'widget_text',
			channelExternalId: body.token,
			contactPhone: body.contactRef ?? 'anonymous', // widget may have no phone
			text: body.text,
			providerMessageId: body.messageId ?? crypto.randomUUID(),
			metadata: { kind: 'web_chat' }, // threads-model §4
		}
	},

	async send() {
		// Widget delivery is reactive (Convex query subscription on messages).
		// The agent message row written in plan 002's flow IS the delivery.
		return { providerMessageId: 'widget-reactive' }
	},
}
```

**Patterns to follow**: `rebuild-architecture.md §1` (`widgets[].isActive`,
`allowText`, `allowVoice`, `token`, `enabledAgentIds`); `threads-model.md §4`
(`metadata.kind: 'web_chat'`; thread `kind: 'widget_text'`,
`channel: 'widget'`).

**Test scenarios**

| Input                                            | Outcome                                   |
| ------------------------------------------------ | ----------------------------------------- |
| Valid token, `isActive: true`, `allowText: true` | `InboundMessage { kind: 'widget_text' }`  |
| Token not in `tenant.widgets[]`                  | Returns `null`                            |
| `isActive: false`                                | Returns `null`                            |
| `allowText: false`                               | Returns `null`                            |
| Malformed JSON body                              | Throws — caught by the Hono route handler |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `node_modules/.bin/vp test run convex/channels/adapters/widget.test.ts`

---

### Unit 7 — `channels.ingest` + `channels.send` + `channels.deliveryStatus` actions + adapter map

**Goal**: Implement the Convex `internalAction` entry points that glue
everything: `ingest` (load tenant → parse → upsert contact/thread → insert
message → run agent turn), `send` (creds → adapter.send / resend.sendEmail →
insert outbound message), and `deliveryStatus` (parse status → patch
`deliveryStatus`).

**Requirements**: R1, R3, R5, R7, R8, R9

**Dependencies**: Units 1–6; plan 001 (`internal.tenant.getByTenantId`); plan
002 (`internal.contacts.upsertByPhone`, `internal.threads.upsert`,
`internal.threads.get`, `internal.messages.insert`,
`internal.messages.patchDeliveryStatus`, `internal.agentRuntime.runAgentTurn`);
plan 008 (Vault — stub with env vars).

**Files**

| Path                       | Action                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `convex/channels/index.ts` | Create — `ADAPTER_MAP`, `ingest`, `send`, `deliveryStatus` |

**Approach**

`ADAPTER_MAP` is a plain record keyed by provider; the dispatcher selects the
adapter at runtime. (Email has no inbound parse and its outbound is
special-cased, so it is omitted from the map.)

`ingest` is an `internalAction` (imported from `./_generated/server`, NOT from
`utils.ts` — there is no `internalAction` helper there). It: (1) loads the
tenant by `tenantId`, (2) `adapter.parse()`, (3) `upsertByPhone` → contactId,
(4) `threads.upsert` → threadId, (5) `messages.insert` for the inbound message
**with `parentType: 'thread'`, `parentId: threadId`** (idempotency is enforced
inside that mutation via the `by_provider_message` guarded read — plan 002), (6)
fires `agentRuntime.runAgentTurn`. On `parse()` → `null`, log and exit.

`send` is an `internalAction` called by `agentRuntime.runAgentTurn` (002) after
the reply is produced. Email is special-cased (needs ctx for
`resend.sendEmail`); all other providers go through `adapter.send()`.

`deliveryStatus` is an `internalAction` for status-only webhooks (Twilio
`StatusCallback`, and WhatsApp `statuses[]` payloads) — patches
`messages.deliveryStatus` via `internal.messages.patchDeliveryStatus`.

**Technical design** (directional)

```ts
// convex/channels/index.ts
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server' // NOT from utils.ts
import { resend } from '../resend'
import { mapTwilioStatus, smsAdapter } from './adapters/sms'
import { whatsappAdapter } from './adapters/whatsapp'
import { widgetAdapter } from './adapters/widget'
import type { ChannelCreds } from './types'

const ADAPTER_MAP = {
	whatsapp: whatsappAdapter,
	sms: smsAdapter,
	widget: widgetAdapter,
	// email: no inbound parse; outbound special-cased in `send`
} as const

const providerValidator = v.union(
	v.literal('whatsapp'),
	v.literal('sms'),
	v.literal('email'),
	v.literal('widget'),
)

export const ingest = internalAction({
	args: {
		tenantId: v.string(),
		provider: providerValidator,
		rawBody: v.string(),
		widgetToken: v.optional(v.string()),
	},
	handler: async (ctx, { tenantId, provider, rawBody }) => {
		if (provider === 'email') return // no inbound email path in this plan
		const tenant = await ctx.runQuery(internal.tenant.getByTenantId, {
			tenantId,
		})
		if (!tenant) return

		const inbound = ADAPTER_MAP[provider].parse(rawBody, tenant)
		if (!inbound) return // status-only / unknown endpoint / inactive widget

		const contactId = await ctx.runMutation(internal.contacts.upsertByPhone, {
			tenantId,
			phone: inbound.contactPhone,
		})

		const threadId = await ctx.runMutation(internal.threads.upsert, {
			tenantId,
			channel: inbound.channel,
			kind: inbound.kind,
			contactId,
			channelExternalId: inbound.channelExternalId,
		})

		// messages is polymorphic: parentType/parentId, NOT threadId.
		// Idempotency on providerMessageId is enforced inside this mutation (plan 002).
		await ctx.runMutation(internal.messages.insert, {
			tenantId,
			parentType: 'thread',
			parentId: threadId,
			role: 'user',
			direction: 'inbound',
			contentType: 'text',
			text: inbound.text,
			attachments: inbound.attachments,
			providerMessageId: inbound.providerMessageId,
			metadata: inbound.metadata,
		})

		// VERIFY arg shape with plan 002 before wiring (§4b sketch passes inboundText).
		await ctx.runAction(internal.agentRuntime.runAgentTurn, {
			tenantId,
			threadId,
			inboundText: inbound.text,
		})
	},
})

export const send = internalAction({
	args: {
		tenantId: v.string(),
		provider: providerValidator,
		threadId: v.id('threads'),
		text: v.string(),
	},
	handler: async (ctx, { tenantId, provider, threadId, text }) => {
		const tenant = await ctx.runQuery(internal.tenant.getByTenantId, {
			tenantId,
		})
		const thread = await ctx.runQuery(internal.threads.get, { threadId })
		if (!tenant || !thread) return

		const creds = resolveCredsStub(provider, tenantId)

		let providerMessageId: string
		if (provider === 'email') {
			// resend.sendEmail accepts an action ctx and returns the component EmailId.
			providerMessageId = await resend.sendEmail(ctx, {
				from: tenant.defaults?.fromEmail ?? process.env.RESEND_FROM ?? '',
				to: await resolveRecipient(ctx, thread), // VERIFY contact email field (002)
				subject: thread.lastMessagePreview ?? 'Re:',
				text,
			})
		} else {
			const endpoint = resolveEndpointForThread(tenant, thread)
			if (!endpoint) return
			const result = await ADAPTER_MAP[provider].send(
				{ to: await resolveRecipient(ctx, thread), text },
				endpoint,
				creds,
			)
			providerMessageId = result.providerMessageId
		}

		await ctx.runMutation(internal.messages.insert, {
			tenantId,
			parentType: 'thread',
			parentId: threadId,
			role: 'agent',
			direction: 'outbound',
			contentType: 'text',
			text,
			providerMessageId,
			deliveryStatus: 'sent',
		})
	},
})

export const deliveryStatus = internalAction({
	args: {
		tenantId: v.string(),
		provider: providerValidator,
		rawBody: v.string(),
	},
	handler: async (ctx, { provider, rawBody }) => {
		if (provider === 'sms') {
			const p = new URLSearchParams(rawBody)
			const sid = p.get('MessageSid')
			const status = p.get('MessageStatus')
			if (!sid || !status) return
			await ctx.runMutation(internal.messages.patchDeliveryStatus, {
				providerMessageId: sid,
				status: mapTwilioStatus(status),
			})
			return
		}
		if (provider === 'whatsapp') {
			const change = JSON.parse(rawBody)?.entry?.[0]?.changes?.[0]?.value
			const st = change?.statuses?.[0]
			if (!st?.id || !st?.status) return
			await ctx.runMutation(internal.messages.patchDeliveryStatus, {
				providerMessageId: st.id,
				status: st.status, // delivered | read | failed
			})
		}
		// email delivery status arrives via handleEmailEvent, not here.
	},
})

function resolveCredsStub(_provider: string, _tenantId: string): ChannelCreds {
	// Stub until plan 008 (WorkOS Vault) ships. Replace with the 008 Vault read:
	//   await vault.getSecret({ organizationId: tenantId, name: `${provider}.creds` })
	return {
		twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
		twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
		metaSystemUserToken: process.env.META_SYSTEM_USER_TOKEN,
		statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
	}
}

// VERIFY (plan 002): how the recipient (E.164 / email) is read from the contact.
// Read the contact doc by thread.contactId rather than a denormalised thread field
// unless 002 denormalises it.
async function resolveRecipient(ctx: any, thread: any): Promise<string> {
	const contact = await ctx.runQuery(internal.contacts.get, {
		contactId: thread.contactId,
	})
	return contact?.phone ?? contact?.email ?? ''
}

// Maps a thread back to its endpoint for outbound, using thread.channelExternalId.
function resolveEndpointForThread(tenant: any, thread: any) {
	if (thread.channel === 'whatsapp')
		return (
			tenant.whatsapps?.find(
				(w: any) => w.accountId === thread.channelExternalId,
			) ?? null
		)
	if (thread.channel === 'sms')
		return (
			tenant.phones?.find(
				(p: any) => p.phoneNumber === thread.channelExternalId,
			) ?? null
		)
	if (thread.channel === 'widget')
		return (
			tenant.widgets?.find((w: any) => w.token === thread.channelExternalId) ??
			null
		)
	return null
}
```

**Patterns to follow**: `internalAction`/`internalMutation` imported from
`./_generated/server` (verified — `utils.ts` exports only
`authQuery`/`authMutation`

- `query`/`mutation`); design-doc §4b "ack fast; the orchestrated turn runs
  async"; plan 002 internal API. `messages` polymorphic insert
  (`parentType`/`parentId`) per `threads-model.md §2`.

**Test scenarios**

| Input                                                                 | Outcome                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ingest` valid WhatsApp payload, tenant found, parse → InboundMessage | contact upserted, thread upserted, message inserted (`parentType:'thread'`), agent turn fired |
| `ingest` unknown tenantId                                             | Returns early, no writes                                                                      |
| `ingest` parse → `null`                                               | Returns early, no writes                                                                      |
| `ingest` provider `email`                                             | Returns early (no inbound path)                                                               |
| `send` (sms)                                                          | Calls `smsAdapter.send`; outbound message row with `deliveryStatus:'sent'`                    |
| `send` (email)                                                        | Calls `resend.sendEmail`; stores `EmailId` as `providerMessageId`                             |
| `ingest` twice same `providerMessageId`                               | Second insert no-ops (guarded read in 002) — no duplicate row (R8)                            |
| `deliveryStatus` Twilio `MessageStatus:'delivered'`                   | Patches `deliveryStatus = 'delivered'`                                                        |
| `deliveryStatus` WhatsApp `statuses[0].status:'read'`                 | Patches `deliveryStatus = 'read'`                                                             |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors across
  `convex/channels/`.
- `node_modules/.bin/vp test run convex/channels/index.test.ts`
- `bunx biome check --write convex/channels/`
- Integration smoke: deploy to Convex dev, fire a test webhook, assert a row is
  created.

---

### Unit 8 — oRPC channel-management endpoints (tenant phones/whatsapps/widgets CRUD)

**Goal**: Add an oRPC contract + router for channel-management operations the
dashboard needs: list/add/update/remove entries in `tenant.phones[]`,
`whatsapps[]`, `widgets[]`.

**Requirements**: R4

**Dependencies**: Plan 001 (tenant table + the internal `tenant` mutations the
router calls); `src/server/rpc/init.ts` (`os`, `org`, `adminOrg` — verified
exports).

**Files**

| Path                                            | Action                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| `src/server/rpc/contracts/channels.contract.ts` | Create                                                  |
| `src/server/rpc/routes/channels.router.ts`      | Create                                                  |
| `src/server/rpc/contracts/index.ts`             | Modify — add `channels: channelsContract` to `contract` |
| `src/server/rpc/routes/index.ts`                | Create or modify — assemble routers [VERIFY below]      |

> **VERIFY**: `src/server/rpc/routes/index.ts` does not currently exist (the
> routes dir holds only `health.router.ts` + `work-os.router.ts`). Find where
> the root router is assembled (the consumer that wires `healthRouter` +
> `workOsRouter` into the `os` implementer) and register `channelsRouter` there
> following the existing assembly, instead of assuming `routes/index.ts`.

**Approach**

The verified router pattern is **contract-first via the shared `os`
implementer**, not a per-router `implement(contract)` call. Handlers are built
off the middleware proxies exported from `init.ts`: `os.<path>.router({...})`
for grouping, and `org.<path>.<op>.handler(...)` /
`adminOrg.<path>.<op>.handler(...)` for the auth gate (exactly as
`work-os.router.ts` does). `organizationId` always comes from
`context.organizationId` (added by `org`/`adminOrg`), never from input. Widget
`token` is generated server-side:
`${context.organizationId}.${crypto.randomUUID()}`.

The contract is **pure** (zod only, no server imports — `contracts/index.ts` is
documented as importing zero server code). Mutations call into Convex internal
`tenant.*` mutations from plan 001 via whatever server→Convex client the
codebase already uses in `src/server` (VERIFY the exact client/import —
`work-os.router.ts` calls the WorkOS SDK off `context.workOs`; do not invent
`@/lib/convex`).

**Technical design** (directional)

```ts
// src/server/rpc/contracts/channels.contract.ts
import { z } from 'zod'

import { base } from './base' // verified to exist; oc + shared meta/errors

// Mirror the 001 tenant.phones[] / whatsapps[] / widgets[] element shapes.
export const phoneEntrySchema = z.object({
	phoneNumberId: z.string(),
	phoneNumber: z.string(),
	label: z.string().optional(),
	capabilities: z.array(z.string()).optional(),
	agentIds: z.array(z.string()).optional(),
	telephonyMode: z.union([z.literal('managed'), z.literal('byo_sip')]),
})
export const whatsappEntrySchema = z.object({
	accountId: z.string(),
	wabaId: z.string().optional(),
	phoneNumber: z.string().optional(),
	label: z.string().optional(),
	metaUserId: z.string().optional(),
	agentIds: z.array(z.string()).optional(),
})
export const widgetEntrySchema = z.object({
	token: z.string(),
	enabledAgentIds: z.array(z.string()),
	allowVoice: z.boolean(),
	allowText: z.boolean(),
	allowWhatsApp: z.boolean().optional(),
	welcomeMessage: z.string().optional(),
	isActive: z.boolean(),
})

// Author each procedure with the shared `base` builder, matching
// health.contract.ts / work-os.contract.ts (base.input(...).output(...)).
export const channelsContract = {
	phones: {
		list: base.output(z.array(phoneEntrySchema)),
		add: base
			.input(phoneEntrySchema.omit({ phoneNumberId: true }))
			.output(phoneEntrySchema),
		remove: base
			.input(z.object({ phoneNumberId: z.string() }))
			.output(z.void()),
	},
	whatsapps: {
		list: base.output(z.array(whatsappEntrySchema)),
		add: base.input(whatsappEntrySchema).output(whatsappEntrySchema),
		remove: base.input(z.object({ accountId: z.string() })).output(z.void()),
	},
	widgets: {
		list: base.output(z.array(widgetEntrySchema)),
		create: base
			.input(
				z.object({
					allowText: z.boolean(),
					allowVoice: z.boolean(),
					enabledAgentIds: z.array(z.string()),
					welcomeMessage: z.string().optional(),
				}),
			)
			.output(z.object({ token: z.string() })),
		deactivate: base.input(z.object({ token: z.string() })).output(z.void()),
	},
}
```

> **VERIFY**: the exact contract builder surface. The codebase uses
> `@orpc/contract` via `contracts/base.ts` (shared `base`) +
> `contracts/errors.ts` (typed errors). Confirm whether procedures are authored
> as `base.input(...).output(...)` or `oc.input(...).output(...)` by reading
> `health.contract.ts` and match it.

```ts
// src/server/rpc/routes/channels.router.ts (directional)
import { adminOrg, org, os } from '@server/rpc/init'

export const channelsRouter = os.channels.router({
	phones: {
		list: org.channels.phones.list.handler(async ({ context }) => {
			// call plan 001's server→Convex client; organizationId from middleware
			return listPhones(context.organizationId)
		}),
		add: adminOrg.channels.phones.add.handler(async ({ context, input }) => {
			return addPhone(context.organizationId, input)
		}),
		remove: adminOrg.channels.phones.remove.handler(
			async ({ context, input }) => {
				return removePhone(context.organizationId, input.phoneNumberId)
			},
		),
	},
	whatsapps: {
		/* same shape: list via org, add/remove via adminOrg */
	},
	widgets: {
		list: org.channels.widgets.list.handler(async ({ context }) => {
			return listWidgets(context.organizationId)
		}),
		create: adminOrg.channels.widgets.create.handler(
			async ({ context, input }) => {
				const token = `${context.organizationId}.${crypto.randomUUID()}`
				return createWidget(context.organizationId, {
					...input,
					token,
					isActive: true,
				})
			},
		),
		deactivate: adminOrg.channels.widgets.deactivate.handler(
			async ({ context, input }) =>
				deactivateWidget(context.organizationId, input.token),
		),
	},
})
```

```ts
// src/server/rpc/contracts/index.ts — add channels
import { channelsContract } from './channels.contract'
import { healthContract } from './health.contract'
import { workOsContract } from './work-os.contract'

export const contract = {
	health: healthContract,
	workOs: workOsContract,
	channels: channelsContract,
}
export type AppContract = typeof contract
```

**Patterns to follow**: `src/server/rpc/routes/work-os.router.ts` (verified
`os.workOs.router({...})` + `org.<path>.<op>.handler` /
`adminOrg.<path>.<op>.handler` shape, middleware imported from
`@server/rpc/init`); `contracts/index.ts` (verified `contract` object — pure
zod); `contracts/work-os.contract.ts` (real zod schemas, not `z.any`/`z.custom`,
so `JsonifiedClient` preserves types).

**Test scenarios**

| Input                                            | Outcome                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `channels.phones.list` with org session          | Returns `tenant.phones[]` for that org                          |
| `channels.phones.add` as admin                   | Appends entry; returns it with server-generated `phoneNumberId` |
| `channels.phones.add` as non-admin               | Throws `NO_ADMIN_ROLE`                                          |
| `channels.widgets.create`                        | Returns `{ token: '${orgId}.${uuid}' }`, `isActive: true`       |
| `channels.phones.remove` unknown `phoneNumberId` | No-op (or typed `NOT_FOUND`)                                    |

**Verification**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in `src/server/rpc/`.
- `node_modules/.bin/vp test run src/server/rpc/routes/channels.router.test.ts`
- `bunx biome check --write src/server/rpc/contracts/channels.contract.ts src/server/rpc/routes/channels.router.ts`

---

## System-Wide Impact

- `convex/http.ts` gains WhatsApp/Twilio/widget routes on the **existing** Hono
  `app`. `app.use(cors())` is currently global — the **widget** browser route is
  the only one a browser hits, so scope CORS for `/widget/*` to the tenant's
  origin (or serve it same-origin via the app proxy); provider webhook routes
  are server-to-server and unaffected by CORS. Do not weaken the existing global
  config without scoping.
- Each inbound webhook does ~1 indexed `tenant` read (`by_tenant`) + in-memory
  array match (≤ ~52 entries). Acceptable.
- No new Convex components are added; all adapters are plain `internalAction`s.
  `@convex-dev/resend` and `@convex-dev/workos-authkit` are already registered.
- `convex/schema.ts` is NOT modified here — owned by 001 (`tenant`) and 002
  (`threads`/`messages`/`contacts`). This plan depends on those definitions and
  on the 002 internal mutations enforcing `providerMessageId` idempotency.
- `convex/resend.ts`'s `handleEmailEvent` changes from a `console.log` stub to a
  delivery-status patch — verify no other consumer relies on its current no-op.
- The oRPC channels contract (Unit 8) adds `channels` to the shared `contract`
  object; update the contract index and the root router assembly together to
  avoid a broken intermediate state.

---

## Risks & Dependencies

| Risk / Dependency                                                                                                                                                             | Likelihood      | Impact                             | Mitigation                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Plan 001 not landed** — `tenant` schema / `internal.tenant.*` not available                                                                                                 | High (sequence) | Blocker                            | Complete 001 before Units 3–8                                                                                            |
| **Plan 002 not landed** — `threads.upsert`, `messages.insert`/`patchDeliveryStatus`, `contacts.upsertByPhone`/`get`, `agentRuntime.runAgentTurn`, `threads.get` not available | High (sequence) | Blocker for Unit 7                 | Coordinate with 002; stub internals during dev                                                                           |
| **Plan 008 (Vault) not landed** — Twilio/Meta creds not in Vault                                                                                                              | High (sequence) | Outbound send broken               | `resolveCredsStub` reads `process.env.*`; `// TODO(008)` markers                                                         |
| **Convex V8 HMAC**                                                                                                                                                            | Low (resolved)  | —                                  | `crypto.subtle` HMAC-SHA256/SHA1 verified available in V8; no Node action                                                |
| **`by_provider_message` not unique** — Convex has no unique indexes                                                                                                           | Medium          | Duplicate rows if dedup is omitted | Idempotency is a guarded read **inside** 002's `messages.insert`; this plan must not assume a DB constraint              |
| **Meta per-WABA secret vs App Secret**                                                                                                                                        | Medium          | WhatsApp HMAC verify fails         | Default to `META_APP_SECRET` over raw body; VERIFY at impl                                                               |
| **Twilio `StatusCallback` reachability**                                                                                                                                      | Low             | Delivery status never patches      | Set per-message to `https://<deployment>.convex.site/webhooks/twilio/{tenantId}/status`; confirm reachable               |
| **Email `providerMessageId` linkage**                                                                                                                                         | Medium          | Delivery patch can't find the row  | Store the component `EmailId` (returned by `sendEmail`) as `providerMessageId`; patch by `args.id` in `handleEmailEvent` |
| **Widget no-auth** POST to `/widget/{token}`                                                                                                                                  | Low (by design) | DoS vector                         | Rate-limit via `@convex-dev/rate-limiter` (added in a later plan); validate token shape early                            |

---

## Documentation & References

### External dependencies introduced/used by this plan

| Dependency                                             | Status                                                                                 | Install / config                                                                                                                                         | Canonical docs                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex-dev/resend`                                   | **Installed v0.2.4** (`convex/convex.config.ts` `app.use(resend)`; `convex/resend.ts`) | already present; env `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`                                                                                           | https://www.convex.dev/components/resend · https://github.com/get-convex/resend · `sendEmail`/`handleResendEventWebhook`/`vOnEmailEventArgs` verified in `node_modules/@convex-dev/resend/dist/client/index.d.ts`                                                                                             |
| `convex-helpers` (Hono)                                | **Installed v0.1.119** (`HttpRouterWithHono`, `HonoWithConvex` in `convex/http.ts`)    | already present                                                                                                                                          | https://github.com/get-convex/convex-helpers · https://www.npmjs.com/package/convex-helpers                                                                                                                                                                                                                   |
| `hono`                                                 | **Installed** (`hono/tiny`, `hono/cors`, `hono/request-id`)                            | already present                                                                                                                                          | https://hono.dev/docs                                                                                                                                                                                                                                                                                         |
| `convex`                                               | **Installed v1.41**                                                                    | `ctx.scheduler.runAfter`, `internalAction`, `crypto.subtle`                                                                                              | https://docs.convex.dev/functions/http-actions · https://docs.convex.dev/scheduling/scheduled-functions · V8 `crypto.subtle` availability: https://github.com/get-convex/convex-backend/issues/399                                                                                                            |
| Twilio Messaging (no SDK — raw REST + `crypto.subtle`) | external API                                                                           | env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (→ Vault, plan 008); optional `bun add twilio` only if `validateRequest` is preferred over the inline HMAC | Inbound webhook params: https://www.twilio.com/docs/messaging/guides/webhook-request · Send + StatusCallback: https://www.twilio.com/docs/messaging/api/message-resource · Signature (HMAC-SHA1, `X-Twilio-Signature`): https://www.twilio.com/docs/usage/security                                            |
| WhatsApp Cloud API (Meta Graph, no SDK)                | external API                                                                           | env `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_SYSTEM_USER_TOKEN` (→ Vault, plan 008)                                                                 | Send (v22.0): https://developers.facebook.com/docs/whatsapp/cloud-api/messages · Webhooks setup + `X-Hub-Signature-256`: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks · Payload examples: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples |
| `@orpc/contract`, `@orpc/server`                       | **Installed** (`src/server/rpc/*`)                                                     | already present                                                                                                                                          | https://orpc.unnoq.com                                                                                                                                                                                                                                                                                        |
| `zod`                                                  | **Installed v4** (contracts)                                                           | already present                                                                                                                                          | https://zod.dev                                                                                                                                                                                                                                                                                               |

### Deprecation / sunset check (mandatory)

- **WhatsApp**: the **On-Premises API was deprecated/shut down October 2025** —
  Cloud API (Graph) is the only supported path, which is what this plan uses. No
  further deprecation for the Cloud API send/webhook endpoints as of June 2026.
  Pin **Graph API v22.0** (v21.0 stable, v23 rolling; pick one constant and bump
  deliberately).
- **Twilio**: Messages REST + StatusCallback + `X-Twilio-Signature` validation
  are current; no sunset. `SmsMessageSid`/`SmsSid` are **legacy aliases** of
  `MessageSid` — use `MessageSid`.
- **Resend**: webhook event types + Svix signing current; component owns the
  verification. No sunset.

### Design-doc sections this plan builds on

- `docs/rebuild-architecture.md §1` — `tenant` schema incl.
  `phones[]`/`whatsapps[]`/`widgets[]` (verified field names).
- `docs/rebuild-architecture.md §2` — WorkOS Vault for static transport creds.
- `docs/rebuild-architecture.md §4b` — "ack fast; turn runs async" (Next.js
  `after()` → Convex scheduler) + Chat-SDK adapter concept.
- `docs/rebuild-architecture.md §5` — webhook ingress (route = tenant), per-WABA
  override, in-memory endpoint match, `phone` vs `sms`.
- `docs/threads-model.md §2` — `threads`/`calls`/`messages` schema; polymorphic
  `messages`; `by_provider_message`; `deliveryStatus`; `attachments[]`.
- `docs/threads-model.md §4` — `kind` + `metadata` union
  (`whatsapp|sms|email|web_chat`).
- `docs/threads-model.md §6` — ingestion redesign + idempotency intent.

### Reference repos / files

- `convex/http.ts`, `convex/resend.ts`, `convex/utils.ts`,
  `convex/convex.config.ts` (agent.io — verified).
- `src/server/rpc/init.ts`,
  `src/server/rpc/contracts/{index,work-os,base,errors}.ts`,
  `src/server/rpc/routes/work-os.router.ts` (agent.io — verified).
- `src/server/ai/agents/routing.ts` (agent.io — clean routing reference).
- External adapter-normalisation pattern:
  https://vercel.com/kb/guide/how-to-build-an-ai-agent-for-slack-with-chat-sdk-and-ai-sdk.md

### Sibling phase plans (cross-reference)

- `2026-06-17-001-feat-convex-foundations-rls-plan.md` — tenant schema,
  `internal.tenant.*`, authQuery/authMutation (required substrate).
- `2026-06-17-002-feat-conversation-substrate-ingestion-plan.md` —
  threads/messages/contacts, agent runtime, ingestion flow, `providerMessageId`
  idempotency (required substrate).
- `2026-06-17-008-feat-secrets-workos-vault-pipes-plan.md` — WorkOS Vault
  (Twilio/Meta creds; stub until landed).
- `2026-06-17-007-feat-billing-polar-metering-plan.md` — Polar per-message fee
  events (out of scope; hook after `send()`).

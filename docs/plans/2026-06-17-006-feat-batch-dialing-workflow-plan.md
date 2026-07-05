---
title: 'feat: Batch dialing — durable workflow + workpool + rate-limiter'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md
---

# feat: Batch dialing — durable workflow + workpool + rate-limiter

## Overview

Replace the legacy `batches.status` hand-rolled state machine, `pacePerMinute`
cron, and `autoStart` logic with a fully durable, resumable execution stack
built on three Convex components: `@convex-dev/workflow` (one durable workflow
instance per batch run), `@convex-dev/workpool` (bounded concurrency for the
dial fan-out), and `@convex-dev/rate-limiter` (per-tenant `pacePerMinute` +
ElevenLabs provider cap). Each dial invokes the ElevenLabs outbound call action
from plan 005 (`internal.calls.initiateOutbound`) and writes a `calls` row. Live
progress is surfaced via `@convex-dev/aggregate` Triggers on the `calls` table
(plan 009) — this plan does **not** hand-maintain counters.

## Problem Frame

The legacy dialer is a fragile hand-crafted loop: status is a string enum that
mutations patch directly, `pacePerMinute` is enforced by a cron that fires every
minute and checks a counter, duplicate dial rows appear when webhooks race the
outbound action, and a server restart while a batch is running leaves it in an
indeterminate `paused` state requiring operator intervention. The new design
makes all of these concerns declarative: the workflow carries durable state, the
workpool caps fan-out, the rate limiter replaces the pace cron, and the
ElevenLabs SDK returns a stable `conversationId` before the webhook can arrive.

## Requirements Trace

- **R1** — One durable `@convex-dev/workflow` instance per batch replaces the
  `batches.status` state machine and `autoStart` cron; survives Convex restarts.
- **R2** — `batchConfigurations` table holds reusable campaign templates (agent,
  phone, script, survey, target contacts or group); `batches` table holds one
  run with `workflowRunId`.
- **R3** — `@convex-dev/workpool` enforces bounded concurrency (max parallel
  dials platform-wide); prevents resource spikes during fan-out.
- **R4** — `@convex-dev/rate-limiter` enforces per-tenant `pacePerMinute`
  (token-bucket, key = `tenantId`) and a global ElevenLabs provider cap (fixed
  window, singleton key).
- **R5** — Each dial step calls the ElevenLabs outbound action (plan 005:
  `internal.calls.initiateOutbound`), which creates/upserts a `calls` row
  (`status: pending`), then the post-call webhook (plan 005) completes it.
- **R6** — `calls.batchId` reference links each voice call back to its batch for
  progress queries and Polar billing attribution.
- **R7** — Live progress (dialed / answered / failed / remaining) is served from
  `@convex-dev/aggregate` counters maintained by plan 009 Triggers on `calls`
  (no per-request table scans, no hand-rolled counters).
- **R8** — Batch cancellation drains in-flight dials gracefully: `cancelBatch`
  patches `batches.status = 'cancelled'`; the workflow step detects it and stops
  enqueuing new work; in-flight workpool jobs are allowed to finish.
- **R9** — Batch CRUD/status/progress is exposed to the dashboard as Convex
  `authMutation` / `authQuery` functions called directly from the client via
  `@convex-dev/react-query` (the established dashboard→Convex path);
  `organizationId` always from the WorkOS JWT (`ctx.org.organizationId`), never
  from a client-supplied tenant field.
- **R10** — Zero net-new TypeScript errors in touched files
  (`node_modules/.bin/tsc --noEmit`); Biome-formatted (tabs, single quotes, no
  semicolons).

## Scope Boundaries

In scope:

- `convex/schema.ts` additions: `batches` + `batchConfigurations` table
  definitions.
- `convex/convex.config.ts`: register `workflow`, `workpool` (named
  `dialWorkpool`), `rateLimiter` components.
- `convex/batches/`: workflow definition, workpool instance, rate-limiter
  instance, dial-step action, enqueue/cancel/start mutations, progress + status
  queries.
- Integration wiring to plan 005 outbound call action
  (`internal.calls.initiateOutbound`).
- Progress query wiring to plan 009 aggregate counters on `calls`.

### Deferred to Separate Tasks

- SMS / WhatsApp bulk messaging batches (same workflow shape, different channel
  adapter) — plan 003.
- Per-contact retry policy for voicemail / no-answer disposition — post-MVP.
- Pause / resume workflow event — deferred; the workflow component supports it
  via in-DB flag polling (and a true external `cancel()` exists, see below);
  cancellation covers the MVP use case.
- Dashboard UI components for batch progress — frontend sprint after this plan.
- Data migration of legacy `batches` rows — plan 010.
- Sentiment alerts triggered by batch call outcomes — plan 009.
- oRPC route surface for batches — **explicitly out of scope**: the dashboard
  reaches Convex domain functions directly through `@convex-dev/react-query`;
  the oRPC layer in this repo is reserved for WorkOS Management API operations
  (see `src/server/rpc/routes/work-os.router.ts`). See "Key Technical
  Decisions".

## Context & Research

### Relevant Code and Patterns

**Design doc sections:**

- `docs/rebuild-architecture.md §4` — batch dialing architecture decision; the
  workflow/workpool/rate-limiter trio (lines 245–249).
- `docs/rebuild-architecture.md §5` — ERD: `batches` (lines 504–510) and
  `batchConfigurations` (lines 511–514) shapes; `batches ||--o{ calls` (line
  414).
- `docs/rebuild-architecture.md §6` — component adoption table:
  `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`
  (lines 638–640).
- `docs/rebuild-architecture.md §5b` — taxonomy: `batches` = Register,
  `batchConfigurations` = Setup/Configuration (lines 610, 613, 624).
- `docs/threads-model.md §2` — `calls` table definition used by the dial step.

**Existing substrate (agent.io repo — already built, do not re-plan):**

- `convex/convex.config.ts` — currently registers `workOSAuthKit` + `resend`
  only (verified: 8 lines); this plan adds `workflow`, `workpool`
  (`{ name: 'dialWorkpool' }`), `rateLimiter`.
- `convex/utils.ts` — **exports only `query`, `mutation`, `authQuery`,
  `authMutation`** (via `zCustomQuery`/`zCustomMutation` from
  `convex-helpers/server/zod4`). The auth wrappers inject `{ user, org }` where
  `org.organizationId` comes from the WorkOS JWT. **It does NOT export
  `internalQuery` / `internalMutation` / `internalAction`** — those come from
  `./_generated/server`. (Verified by reading the file.)
- `convex/schema.ts` — currently `defineSchema({})` (empty, 3 lines); this plan
  adds the first domain tables.
- `src/server/rpc/init.ts` — oRPC `os`, `auth`, `org`, `admin`, `adminOrg`
  middleware. The RPC context (`RpcContextType`) carries
  `{ headers, resHeaders, session, workOs }` — **there is no Convex client in
  the RPC context.** oRPC routes call the WorkOS SDK, not Convex.
- `src/lib/rpc/index.tsx` + `src/lib/rpc/context.ts` — the dashboard talks to
  Convex via `@convex-dev/react-query` (`convexQuery`,
  `useQuery`/`useMutation`/`useAction` re-exported). This is the path batch CRUD
  uses.

**Reference component APIs (verified against current GitHub READMEs — see
Documentation & References):**

- `@convex-dev/workflow@0.4.4` —
  `new WorkflowManager(components.workflow, { workpoolOptions? })`;
  `workflow.define({ args, returns }).handler(async (step, args): Promise<R> => …)`;
  **top-level** `import { start } from '@convex-dev/workflow'` →
  `start(ctx, internal.path.toWorkflow, args, { onComplete?, context? })`
  returns a `WorkflowId` (string); `step.runAction` / `step.runMutation` /
  `step.runQuery` / `step.runWorkflow`; `step.sleep(ms)`. **Cancellation:**
  `import { cancel } from '@convex-dev/workflow'` →
  `cancel(ctx, components.workflow, workflowId)` (in-progress `step.runAction`
  calls still finish). Determinism: `fetch`/env-vars/`crypto` are blocked;
  `Date`, `Math.random()`, `console` are _patched_ (seeded/safe) — so the
  constraint is "no raw I/O", not "no Date".
- `@convex-dev/workpool@0.4.7` —
  `new Workpool(components.dialWorkpool, { maxParallelism, retryActionsByDefault?, defaultRetryBehavior? })`;
  `pool.enqueueAction(ctx, internal.path.action, args, { onComplete?, context?, retry? })`;
  the `onComplete` handler is an `internalMutation` whose args are
  `vOnCompleteValidator(contextSchema)` and whose handler receives
  `{ workId, context, result }` where `result.kind` is
  `'success' | 'failed' | 'canceled'` (one 'l').
- `@convex-dev/rate-limiter@0.3.2` —
  `new RateLimiter(components.rateLimiter, { name: { kind, rate, period, capacity? } })`;
  exports `SECOND`, `MINUTE`, `HOUR`;
  `rateLimiter.limit(ctx, name, { key?, count?, throws?, config?, reserve? })`
  returns `{ ok, retryAfter }`. **`config` lets you override the named
  rate/period at call time** — so per-tenant `pacePerMinute` can be passed
  directly; no ceiling/`count` arithmetic is needed (see correction in Unit 2).

**Plan 005 dependency**
(`2026-06-17-005-feat-voice-runtime-elevenlabs-plan.md`):

- The outbound action is **`internal.calls.initiateOutbound`** (NOT
  `dialOutbound`), in flat `convex/calls.ts`. It reads
  `tenant.phones[phoneNumberId]`, branches on `telephonyMode`, calls the
  ElevenLabs SDK, and upserts a `calls` row via `internal.calls.upsert` with
  `status: 'pending'`, then patches `conversationId` via
  `internal.calls.patchConversationId`. Its arg list must include `batchId` and
  `contactId` (coordinate — plan 005 already lists `calls.batchId`).
- Plan 005's `calls.batchId` is declared `v.optional(v.string())` (stores
  `batches._id` as a string) with a `by_batch` index. **NOTE the cross-plan
  inconsistency:** plan 009 line 221 declares `calls.batchId` as
  `v.optional(v.id('batches'))`. See Open Questions → VERIFY.

**Plan 009 dependency**
(`2026-06-17-009-feat-surveys-sentiment-analytics-plan.md`):

- Plan 009 does **not** expose `internal.aggregates.*` increment/progress
  functions. It registers `@convex-dev/aggregate` and maintains named
  aggregators (e.g. `calls_total`, `calls_duration_ms`) via **Convex Triggers on
  the `calls` table** (`insert` fires
  `aggregate.insert(namespace=tenantId, …)`), with `tenantId` as the aggregate
  namespace. Its dashboard read is `convex/analytics.ts:dashboardSummary`
  (action-cache wrapped). Consequently this plan must NOT call increment
  mutations from `dialOne`; the `calls` insert that plan 005 performs
  automatically feeds plan 009's Trigger. Batch progress is read either from a
  plan-009 aggregator scoped to `(namespace=tenantId, batchId bound)` if plan
  009 adds a `calls`-by-batch aggregator, or — for MVP — by counting the
  `calls.by_batch` index. See Open Questions → VERIFY.

## Key Technical Decisions

| Decision                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One `WorkflowManager` workflow per batch (not a cron loop)                                                        | Durability is the point: the workflow survives restarts, carries loop state as durable step outputs, and is observable/cancellable via the Convex dashboard. The legacy `autoStart` cron and `paused/resuming` string states are deleted.                                                                                                                                                                                                                                |
| **Dashboard reaches batch functions directly via Convex (`@convex-dev/react-query`), not oRPC**                   | The repo's oRPC layer (`src/server/rpc`) wraps the WorkOS Management API and has no Convex client in its context (`RpcContextType` = `{ headers, resHeaders, session, workOs }`). Batch CRUD is plain Convex `authMutation`/`authQuery` reached through the same client the rest of the dashboard uses. This corrects the original plan's oRPC route unit, which assumed a non-existent `context.convex`.                                                                |
| Workpool `maxParallelism` is a compile-time config (not per-tenant)                                               | Per-tenant parallelism would require dynamic pool creation, which the component does not support. A safe platform ceiling is set at the pool definition; `pacePerMinute` is the per-tenant throttle via the rate limiter.                                                                                                                                                                                                                                                |
| Rate limiter `dialPace` key = `tenantId` (token bucket), **per-call `config` override**                           | Token bucket handles burst allowance (a tenant accumulates tokens while idle, then bursts at batch start). The rate-limiter's `config` option lets `dialOne` pass the tenant's `pacePerMinute` as the rate at call time — no ceiling/`count` arithmetic needed (the original plan's "ceiling trick" is removed).                                                                                                                                                         |
| ElevenLabs provider cap as a separate fixed-window rate limit (singleton key)                                     | ElevenLabs has a platform-level concurrent-call limit independent of any one tenant; a global fixed-window limit (no `key` arg) enforces it without coupling to tenant logic.                                                                                                                                                                                                                                                                                            |
| Batch contact list stored as `contactIds: v.array(v.id('contacts'))` on `batchConfigurations`, NOT a staged table | For MVP batch sizes (hundreds to low thousands) an embedded array fits the Convex 1 MiB doc limit. A `stagedContacts` table is the deferred path for 10k+ imports (plan 010).                                                                                                                                                                                                                                                                                            |
| `calls.batchId` is the only linkage — no `batchContacts` join table                                               | Progress is read from plan 009's aggregate counters (or the `calls.by_batch` index), keeping the dial hot-path to a single `calls` upsert per call.                                                                                                                                                                                                                                                                                                                      |
| Workflow cancellation via `batches.status = 'cancelled'` flag checked each loop iteration                         | `@convex-dev/workflow` _does_ expose an external `cancel(ctx, components.workflow, workflowId)`, but it hard-cancels (only in-flight `step.runAction` finishes). For _graceful_ drain of an already-enqueued batch we prefer the DB-flag check at the top of each loop iteration so already-enqueued workpool jobs complete naturally. (The original plan claimed no cancel API exists — that is incorrect; the flag approach is a deliberate choice, not a workaround.) |

## Open Questions

### Resolved

- **Workpool vs workflow-native parallelism:** the workflow can run steps in
  parallel via `Promise.all`, but it does not enforce a cross-batch ceiling. Use
  both — workflow orchestrates the loop, workpool bounds each dial. (Resolved.)
- **Rate limiter placement:** `rateLimiter.limit(...)` must run in a
  mutation/action, never inside the deterministic workflow handler. Place it
  inside the `dialOne` action (the workpool job). (Resolved.)
- **`pacePerMinute` source of truth:** stored on
  `batchConfigurations.pacePerMinute`, passed to the workflow as an arg, and
  passed to `rateLimiter.limit(..., { config })` at dial time. (Resolved.)
- **Aggregate maintenance:** done by plan 009 Triggers on `calls`, not by
  increment calls in this plan. The `calls` upsert by plan 005 is the only write
  needed. (Resolved.)
- **oRPC vs Convex for batch CRUD:** Convex `authQuery`/`authMutation` via
  `@convex-dev/react-query` (no oRPC). (Resolved — see Key Technical Decisions.)

### Deferred to Implementation

- **VERIFY:** `calls.batchId` type discrepancy between plan 005
  (`v.optional(v.string())`) and plan 009 (`v.optional(v.id('batches'))`). Align
  all three plans before implementation; this plan assumes the plan-005 form
  (`v.string()` holding `batches._id`) since plan 005 owns the `calls` table and
  the dial write.
- **VERIFY:** Whether plan 009 adds a per-batch `calls` aggregator
  (namespace=`tenantId`, sort/bound by `batchId`) that yields
  `{ dialed, answered, failed }`, or whether batch progress for MVP counts the
  `calls.by_batch` index directly in `convex/batches/queries.ts`. The
  `remaining` figure = `batch.totalContacts − dialed` regardless.
- **VERIFY:** Exact `maxParallelism` ceiling for the dial workpool — start at
  20; confirm the current Convex plan's concurrent-action ceiling and ElevenLabs
  concurrent-call limit before raising.
- **VERIFY:** ElevenLabs outbound concurrent-call limit (check the ElevenLabs
  dashboard) — set `elOutbound` rate accordingly at implementation time
  (placeholder 100/min).
- **VERIFY:** Whether plan 005's `internal.calls.initiateOutbound` arg list
  already accepts `contactId` (it must resolve the contact's phone number); if
  not, coordinate the addition.
- **VERIFY:** Exact exported validator symbol names — `@convex-dev/workpool`
  `vOnCompleteValidator`, `@convex-dev/workflow` `vWorkflowId` /
  `vResultValidator` — confirm at implementation time (used in `onDialComplete`
  / `onWorkflowComplete`).

## Output Structure

```
convex/
  convex.config.ts                   (Modify — add workflow, workpool {name:'dialWorkpool'}, rateLimiter)
  schema.ts                          (Modify — add batches, batchConfigurations)
  batches/
    workflow.ts                      (Create — WorkflowManager + dialWorkflow definition)
    actions.ts                       (Create — dialOne action: rate-limit + EL outbound)
    mutations.ts                     (Create — createConfiguration, createAndStartBatch, cancelBatch, enqueueDialOne, onDialComplete, markCompleted, onWorkflowComplete + authMutation wrappers)
    queries.ts                       (Create — getContactIds, isCancelled (internal); getBatch, listBatches, batchProgress (authQuery))
    pool.ts                          (Create — Workpool instance export)
    rateLimiter.ts                   (Create — RateLimiter instance export)
```

(No `src/server/rpc/...` files — batch CRUD is Convex-direct; see Key Technical
Decisions.)

## High-Level Technical Design

```
Dashboard (TanStack Start) — @convex-dev/react-query useMutation
  → api.batches.mutations.startBatch  (authMutation; tenantId = ctx.org.organizationId)
    → ctx.runMutation(internal.batches.mutations.createAndStartBatch, …)
      → start(ctx, internal.batches.workflow.dialWorkflow, args,
              { onComplete: internal.batches.mutations.onWorkflowComplete, context: { batchId } })
      → patch batches.workflowRunId + status = 'running'

dialWorkflow (workflow.define — durable, resumable; deterministic handler)
  contactIds = await step.runQuery(internal.batches.queries.getContactIds, { configurationId })
  for contactId of contactIds:
    1. if await step.runQuery(internal.batches.queries.isCancelled, { batchId })  → break
    2. await step.runMutation(internal.batches.mutations.enqueueDialOne, { ... })  ← workpool enqueue (mutation ctx)
    3. if paceGapMs > 0: await step.sleep(paceGapMs)                                ← coarse pacing
  await step.runMutation(internal.batches.mutations.markCompleted, { batchId })

enqueueDialOne (internalMutation)
  → dialPool.enqueueAction(ctx, internal.batches.actions.dialOne, args,
      { onComplete: internal.batches.mutations.onDialComplete, context: { batchId, contactId }, retry: false })

dialOne (internalAction — the workpool job)
  1. rateLimiter.limit(ctx, 'dialPace', { key: tenantId, throws: true,
       config: { kind: 'token bucket', rate: pacePerMinute, period: MINUTE, capacity: pacePerMinute } })
  2. rateLimiter.limit(ctx, 'elOutbound', { throws: true })          ← global EL cap (singleton key)
  3. await ctx.runAction(internal.calls.initiateOutbound, { tenantId, contactId, agentId, phoneId, batchId })  [plan 005]
       → ElevenLabs SDK + calls upsert (status 'pending')  → plan 009 Trigger increments calls aggregate

Post-call webhook [plan 005]
  → internal.calls.upsertByConversationId / patchPostCall  → plan 009 Trigger updates aggregate; Polar ingest [plan 007]

Progress query (reactive)
  → api.batches.queries.batchProgress({ batchId })  → reads plan-009 aggregate (or calls.by_batch count)
  → returns { batch, dialed, answered, failed, remaining }
```

## Implementation Units

---

### Unit 1: Schema additions — `batches` + `batchConfigurations` tables

**Goal:** Define the two batch domain tables in `convex/schema.ts`, completing
the ERD for batch dialing.

**Requirements:** R1, R2, R6

**Dependencies:** plan 001 (schema base established, `contacts` table exists for
id references).

**Files:**

- `convex/schema.ts` — Modify: add `batches` and `batchConfigurations` table
  definitions.

**Approach:**

Add both tables to the `defineSchema({})` call. `batchConfigurations` is a
Setup/Configuration template (per §5b taxonomy, line 610); `batches` is a
Register (one campaign run, per line 613/624). Keep `workflowRunId` as
`v.optional(v.string())` — it is set after the workflow is started in unit 4
(`start()` returns a `WorkflowId` string).

**Technical design (directional):**

```ts
// convex/schema.ts — directional, not final
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	batchConfigurations: defineTable({
		tenantId: v.string(),
		name: v.string(),
		channel: v.union(
			v.literal('voice'),
			v.literal('sms'),
			v.literal('whatsapp'),
		),
		agentId: v.optional(v.string()), // ElevenLabs agent externalId (voice)
		phoneId: v.optional(v.string()), // phoneNumberId from tenant.phones[]
		scriptId: v.optional(v.id('scripts')),
		surveyId: v.optional(v.id('surveys')),
		smsTemplateId: v.optional(v.id('smsTemplates')),
		contactIds: v.array(v.id('contacts')), // MVP: embedded; large lists → stagedContacts (plan 010)
		pacePerMinute: v.number(), // token-bucket rate for rateLimiter
		maxRetries: v.optional(v.number()),
		scheduledAt: v.optional(v.number()), // future: scheduled start
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant', ['tenantId'])
		.index('by_tenant_created', ['tenantId', 'createdAt']),

	batches: defineTable({
		tenantId: v.string(),
		configurationId: v.id('batchConfigurations'),
		channel: v.union(
			v.literal('voice'),
			v.literal('sms'),
			v.literal('whatsapp'),
		),
		status: v.union(
			v.literal('draft'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('cancelled'),
			v.literal('failed'),
		),
		workflowRunId: v.optional(v.string()), // set after start(); opaque WorkflowId
		totalContacts: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_tenant', ['tenantId'])
		.index('by_tenant_status', ['tenantId', 'status'])
		.index('by_tenant_created', ['tenantId', 'createdAt']),
})
```

**Patterns to follow:** every table has `tenantId: v.string()` required (design
doc §7); no nullable tenant key. Tabs + single quotes + no semicolons (Biome).

**Test scenarios:**

- `batches` insert with `status: 'draft'` → round-trips; `by_tenant_status`
  index returns it.
- `batches.workflowRunId` starts `undefined`, is patched to a string after start
  → `db.get` returns updated doc.
- `batchConfigurations.contactIds` empty array → insert succeeds (valid draft
  state).
- `batchConfigurations` with `channel: 'sms'` and no `agentId` → insert allowed
  (voice fields optional).

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/biome check --write convex/schema.ts
```

---

### Unit 2: Component registration — workflow + workpool + rateLimiter

**Goal:** Register `@convex-dev/workflow`, `@convex-dev/workpool` (as
`dialWorkpool`), and `@convex-dev/rate-limiter` in `convex/convex.config.ts`;
export typed instances in `convex/batches/pool.ts` and
`convex/batches/rateLimiter.ts`.

**Requirements:** R1, R3, R4

**Dependencies:** unit 1 (schema exists so `_generated/api` regenerates with the
new tables).

**Install (not yet in `node_modules`):**

```
bun add @convex-dev/workflow@0.4.4 @convex-dev/workpool@0.4.7 @convex-dev/rate-limiter@0.3.2
```

**Files:**

- `convex/convex.config.ts` — Modify: add `workflow`, `workpool`
  (`{ name: 'dialWorkpool' }`), `rateLimiter`.
- `convex/batches/pool.ts` — Create: `Workpool` instance export.
- `convex/batches/rateLimiter.ts` — Create: `RateLimiter` instance with
  `dialPace` + `elOutbound` limits.

**Approach:**

`workpool` supports multiple named instances; register it as `dialWorkpool` to
leave room for future email/SMS pools
(`app.use(workpool, { name: 'dialWorkpool' })`). `workflow` and `rateLimiter`
register without a name. `maxParallelism: 20` is a conservative starting
ceiling. Set `retryActionsByDefault: false` — `dialOne` is not idempotent (it
initiates an ElevenLabs call), so retries must not happen automatically.

The `RateLimiter` defines two named limits. **Correction vs original plan:** the
rate-limiter exposes a per-call `config` override, so there is **no
ceiling/`count` arithmetic**. Define `dialPace` with a sane default; `dialOne`
passes the tenant's real `pacePerMinute` via `limit(..., { config })`.
`elOutbound` is a global fixed-window cap consumed with no `key` (singleton).

**Technical design (directional):**

```ts
// convex/convex.config.ts — directional
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import resend from '@convex-dev/resend/convex.config'
import workflow from '@convex-dev/workflow/convex.config.js'
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config'
import workpool from '@convex-dev/workpool/convex.config.js'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(workOSAuthKit)
app.use(resend)
app.use(workflow)
app.use(workpool, { name: 'dialWorkpool' })
app.use(rateLimiter)
export default app
```

```ts
// convex/batches/pool.ts — directional
import { Workpool } from '@convex-dev/workpool'
import { components } from '../_generated/api'

export const dialPool = new Workpool(components.dialWorkpool, {
	maxParallelism: 20,
	retryActionsByDefault: false,
})
```

```ts
// convex/batches/rateLimiter.ts — directional
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Default per-tenant pace; dialOne overrides `rate` per call via `config`.
	dialPace: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 60 },
	// Global ElevenLabs concurrent-call cap (singleton — consumed with no `key`).
	// Placeholder 100/min; confirm against the ElevenLabs dashboard before prod.
	elOutbound: { kind: 'fixed window', rate: 100, period: MINUTE },
})
```

**Patterns to follow:** import `components` from `../_generated/api`
(regenerated by `convex dev`); component `convex.config` imports use the `.js`
suffix (matches the workflow/workpool/rate-limiter READMEs and the existing
resend/workos pattern).

**Test scenarios:**

- After registration, `bunx convex dev --once` compiles and `_generated/api.ts`
  includes `components.workflow`, `components.dialWorkpool`,
  `components.rateLimiter`.
- `rateLimiter.limit(ctx, 'dialPace', { key: 'org_test', config: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 10 } })`
  → `ok: true` on first call, depletes a token.
- `dialPool` exported from `pool.ts` is a `Workpool` instance.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/biome check --write convex/convex.config.ts convex/batches/pool.ts convex/batches/rateLimiter.ts
```

---

### Unit 3: Durable batch workflow — `dialWorkflow` definition + internal queries

**Goal:** Define the `WorkflowManager` and the `dialWorkflow` that loops over a
batch's contacts, checks cancellation, enqueues each dial into the workpool, and
marks the batch complete. Add the two internal queries the workflow reads.

**Requirements:** R1, R3, R8

**Dependencies:** unit 2 (components registered; `dialPool`/`rateLimiter`
exported); unit 1 (schema); plan 005 (`internal.calls.initiateOutbound` exists).

**Files:**

- `convex/batches/workflow.ts` — Create: `WorkflowManager` export +
  `dialWorkflow` definition.
- `convex/batches/queries.ts` — Create (internal portion): `isCancelled`,
  `getContactIds` internal queries.

**Approach:**

The workflow handler must be deterministic — no raw `fetch`/env-vars/`crypto`;
all side-effects via `step.run*`. (`Date`/`Math.random` are patched and safe,
but this handler needs neither.) The loop:

1. Reads the contact list via
   `step.runQuery(internal.batches.queries.getContactIds, …)`.
2. Iterates; at each iteration checks cancellation via
   `step.runQuery(internal.batches.queries.isCancelled, …)` → `break`.
3. Enqueues a dial via
   `step.runMutation(internal.batches.mutations.enqueueDialOne, …)`. **Workpool
   `enqueueAction` must run from a mutation context, not directly inside the
   workflow handler**, hence the thin `enqueueDialOne` mutation.
4. Applies coarse pacing with `step.sleep(paceGapMs)` when `pacePerMinute < 60`
   (fine-grained pacing is the rate-limiter's job inside `dialOne`).
5. On loop exit:
   `step.runMutation(internal.batches.mutations.markCompleted, …)`.

Note: `internalQuery` comes from `./_generated/server`, **not** from
`convex/utils.ts` (which only exports the public/auth wrappers). Cited
correction.

**Technical design (directional):**

```ts
// convex/batches/workflow.ts — directional
import { WorkflowManager } from '@convex-dev/workflow'
import { v } from 'convex/values'
import { components, internal } from '../_generated/api'

export const workflow = new WorkflowManager(components.workflow)

export const dialWorkflow = workflow
	.define({
		args: {
			batchId: v.id('batches'),
			tenantId: v.string(),
			configurationId: v.id('batchConfigurations'),
			pacePerMinute: v.number(),
			agentId: v.string(),
			phoneId: v.string(),
		},
		returns: v.null(),
	})
	.handler(async (step, args): Promise<null> => {
		const { batchId, configurationId, pacePerMinute } = args

		const contactIds = await step.runQuery(
			internal.batches.queries.getContactIds,
			{ configurationId },
		)

		// Coarse workflow-level gap (rate-limiter does fine pacing in dialOne).
		const paceGapMs =
			pacePerMinute > 0 ? Math.floor((60_000 / pacePerMinute) * 0.8) : 0

		for (const contactId of contactIds) {
			const cancelled = await step.runQuery(
				internal.batches.queries.isCancelled,
				{ batchId },
			)
			if (cancelled) break

			await step.runMutation(internal.batches.mutations.enqueueDialOne, {
				batchId,
				tenantId: args.tenantId,
				contactId,
				agentId: args.agentId,
				phoneId: args.phoneId,
				pacePerMinute,
			})

			if (paceGapMs > 0) await step.sleep(paceGapMs)
		}

		await step.runMutation(internal.batches.mutations.markCompleted, {
			batchId,
		})
		return null
	})
```

```ts
// convex/batches/queries.ts (internal portion) — directional
import { v } from 'convex/values'
import { internalQuery } from '../_generated/server'

export const isCancelled = internalQuery({
	args: { batchId: v.id('batches') },
	handler: async (ctx, { batchId }) => {
		const batch = await ctx.db.get(batchId)
		return batch?.status === 'cancelled'
	},
})

export const getContactIds = internalQuery({
	args: { configurationId: v.id('batchConfigurations') },
	handler: async (ctx, { configurationId }) => {
		const cfg = await ctx.db.get(configurationId)
		return cfg?.contactIds ?? []
	},
})
```

**Patterns to follow:** workflow handler deterministic; all
mutations/queries/actions via `step.run*`; `internalQuery` from
`./_generated/server`. Function reference is
`internal.batches.queries.getContactIds` etc. (folder `batches`, file `queries`,
export name).

**Test scenarios:**

- 3-contact batch, no cancellation → `enqueueDialOne` called 3×, `markCompleted`
  once.
- `isCancelled` returns `true` after the 1st contact → loop breaks;
  `enqueueDialOne` called once; `markCompleted` still called.
- `pacePerMinute: 30` → `step.sleep` called with ≈ 1600 ms gap.
- Simulated restart mid-loop → re-hydrates from the last completed step
  (validate via the workflow component's status helper).

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/batches/__tests__/workflow.test.ts
node_modules/.bin/biome check --write convex/batches/workflow.ts convex/batches/queries.ts
```

---

### Unit 4: Dial action + lifecycle mutations

**Goal:** Implement `dialOne` (workpool action: rate-limit → ElevenLabs
outbound), `enqueueDialOne` (enqueues it), `onDialComplete` (workpool
`onComplete`), `markCompleted`, `cancelBatch`, `createConfiguration`,
`createAndStartBatch`, and `onWorkflowComplete` (workflow-level `onComplete`).

**Requirements:** R2, R3, R4, R5, R6, R8

**Dependencies:** unit 2 (pool + rateLimiter); unit 3 (workflow calls
`enqueueDialOne`); plan 005 (`internal.calls.initiateOutbound` + `calls` table).

**Files:**

- `convex/batches/actions.ts` — Create: `dialOne` internal action.
- `convex/batches/mutations.ts` — Create: `enqueueDialOne`, `onDialComplete`,
  `markCompleted`, `cancelBatch`, `createConfiguration`, `createAndStartBatch`,
  `onWorkflowComplete`.

**Approach:**

`dialOne` is an `internalAction` (from `./_generated/server`). It:

1. `rateLimiter.limit(ctx, 'dialPace', { key: tenantId, throws: true, config: { kind: 'token bucket', rate: pacePerMinute, period: MINUTE, capacity: pacePerMinute } })`
   — per-tenant pace via the `config` override (no `count` math).
2. `rateLimiter.limit(ctx, 'elOutbound', { throws: true })` — global EL cap
   (singleton).
3. `ctx.runAction(internal.calls.initiateOutbound, { tenantId, contactId, agentId, phoneId, batchId })`
   — plan 005 creates the ElevenLabs call + upserts the `calls` row.

It does **not** increment any aggregate — plan 009's Trigger on the `calls`
insert handles counting.

`throws: true` makes `dialOne` throw on limit exceeded; the workpool surfaces
this as a failed job; `onDialComplete` (args = `vOnCompleteValidator(...)`,
handler `{ workId, context, result }`) logs/records the disposition.
`result.kind` is `'success' | 'failed' | 'canceled'`.

`createAndStartBatch` reads the configuration, inserts a `batches` row
(`status: 'running'`, `totalContacts`), calls **top-level**
`start(ctx, internal.batches.workflow.dialWorkflow, args, { onComplete: internal.batches.mutations.onWorkflowComplete, context: { batchId } })`,
and patches `workflowRunId` with the returned `WorkflowId`.

`cancelBatch` patches `batches.status = 'cancelled'` — the workflow's next
`isCancelled` check halts the loop. (A hard
`cancel(ctx, components.workflow, workflowRunId)` is available if immediate
teardown is ever required, but graceful drain is the MVP behavior.)

**Technical design (directional):**

```ts
// convex/batches/actions.ts — directional
import { MINUTE } from '@convex-dev/rate-limiter'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { rateLimiter } from './rateLimiter'

export const dialOne = internalAction({
	args: {
		batchId: v.id('batches'),
		tenantId: v.string(),
		contactId: v.id('contacts'),
		agentId: v.string(),
		phoneId: v.string(),
		pacePerMinute: v.number(),
	},
	handler: async (ctx, args) => {
		const { tenantId, batchId, contactId, agentId, phoneId, pacePerMinute } =
			args

		// Per-tenant pace (config override — no count arithmetic)
		await rateLimiter.limit(ctx, 'dialPace', {
			key: tenantId,
			throws: true,
			config: {
				kind: 'token bucket',
				rate: pacePerMinute,
				period: MINUTE,
				capacity: pacePerMinute,
			},
		})
		// Global ElevenLabs cap (singleton)
		await rateLimiter.limit(ctx, 'elOutbound', { throws: true })

		// Plan 005 outbound action — creates the EL call + upserts the calls row.
		// (calls insert triggers plan 009's aggregate maintenance.)
		await ctx.runAction(internal.calls.initiateOutbound, {
			tenantId,
			contactId,
			agentId,
			phoneId,
			batchId, // calls.batchId is v.string() per plan 005 — pass the id as string
		})
	},
})
```

```ts
// convex/batches/mutations.ts — directional
import { start } from '@convex-dev/workflow'
import { vOnCompleteValidator } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation } from '../_generated/server'
import { dialPool } from './pool'

export const enqueueDialOne = internalMutation({
	args: {
		batchId: v.id('batches'),
		tenantId: v.string(),
		contactId: v.id('contacts'),
		agentId: v.string(),
		phoneId: v.string(),
		pacePerMinute: v.number(),
	},
	handler: async (ctx, args) => {
		await dialPool.enqueueAction(ctx, internal.batches.actions.dialOne, args, {
			onComplete: internal.batches.mutations.onDialComplete,
			context: { batchId: args.batchId, contactId: args.contactId },
			retry: false,
		})
	},
})

// vOnCompleteValidator(contextSchema) builds the { workId, context, result } args.
export const onDialComplete = internalMutation({
	args: vOnCompleteValidator(
		v.object({ batchId: v.id('batches'), contactId: v.id('contacts') }),
	),
	handler: async (_ctx, { result }) => {
		// Aggregate counting is handled by plan 009's Trigger on the calls insert.
		// React only to failed dials if needed (logging / future retry policy).
		if (result.kind === 'failed') {
			// e.g. console.warn('dial failed')
		}
	},
})

export const markCompleted = internalMutation({
	args: { batchId: v.id('batches') },
	handler: async (ctx, { batchId }) => {
		const batch = await ctx.db.get(batchId)
		if (!batch) return
		// Don't overwrite a cancelled batch.
		const status = batch.status === 'cancelled' ? 'cancelled' : 'completed'
		await ctx.db.patch(batchId, { status, updatedAt: Date.now() })
	},
})

export const createConfiguration = internalMutation({
	args: {
		tenantId: v.string(),
		name: v.string(),
		channel: v.union(
			v.literal('voice'),
			v.literal('sms'),
			v.literal('whatsapp'),
		),
		agentId: v.optional(v.string()),
		phoneId: v.optional(v.string()),
		contactIds: v.array(v.id('contacts')),
		pacePerMinute: v.number(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return ctx.db.insert('batchConfigurations', {
			...args,
			createdAt: now,
			updatedAt: now,
		})
	},
})

export const createAndStartBatch = internalMutation({
	args: { tenantId: v.string(), configurationId: v.id('batchConfigurations') },
	handler: async (ctx, { tenantId, configurationId }) => {
		const cfg = await ctx.db.get(configurationId)
		if (!cfg || cfg.tenantId !== tenantId) throw new Error('Not found')
		if (cfg.channel !== 'voice') throw new Error('Only voice batches in MVP')

		const now = Date.now()
		const batchId = await ctx.db.insert('batches', {
			tenantId,
			configurationId,
			channel: cfg.channel,
			status: 'running',
			totalContacts: cfg.contactIds.length,
			createdAt: now,
			updatedAt: now,
		})

		const workflowRunId = await start(
			ctx,
			internal.batches.workflow.dialWorkflow,
			{
				batchId,
				tenantId,
				configurationId,
				pacePerMinute: cfg.pacePerMinute,
				agentId: cfg.agentId ?? '',
				phoneId: cfg.phoneId ?? '',
			},
			{
				onComplete: internal.batches.mutations.onWorkflowComplete,
				context: { batchId },
			},
		)
		await ctx.db.patch(batchId, { workflowRunId, updatedAt: Date.now() })
		return batchId
	},
})

export const onWorkflowComplete = internalMutation({
	// Prefer vWorkflowId / vResultValidator from @convex-dev/workflow once the
	// exact exported names are confirmed (VERIFY). Placeholders below.
	args: { workflowId: v.string(), result: v.any(), context: v.any() },
	handler: async (ctx, { result, context }) => {
		if (result.kind === 'error' || result.kind === 'failed') {
			await ctx.db.patch(context.batchId, {
				status: 'failed',
				updatedAt: Date.now(),
			})
		}
	},
})

export const cancelBatch = internalMutation({
	args: { batchId: v.id('batches'), tenantId: v.string() },
	handler: async (ctx, { batchId, tenantId }) => {
		const batch = await ctx.db.get(batchId)
		if (!batch || batch.tenantId !== tenantId) throw new Error('Not found')
		if (batch.status !== 'running') throw new Error('Batch not running')
		await ctx.db.patch(batchId, { status: 'cancelled', updatedAt: Date.now() })
	},
})
```

**Patterns to follow:** `internalAction` / `internalMutation` from
`./_generated/server`; `tenantId` always passed through from an already-verified
context (the public wrapper in unit 5 injects `ctx.org.organizationId`); never
accept a raw tenant id from untrusted client input.

**Test scenarios:**

- `dialOne` with `pacePerMinute: 30` → `dialPace` consumes from a 30/min bucket;
  `initiateOutbound` called once.
- `dialOne` when `elOutbound` is exhausted → throws; workpool `onDialComplete`
  gets `result.kind === 'failed'`.
- `cancelBatch` on a non-`running` batch → throws `'Batch not running'`.
- `cancelBatch` with wrong `tenantId` → throws `'Not found'` (tenant isolation).
- `createAndStartBatch` on a non-voice config → throws
  `'Only voice batches in MVP'`.
- `createAndStartBatch` → `batches` row `status: 'running'`, `workflowRunId` set
  to the `start()` return.
- `enqueueDialOne` → `dialPool.enqueueAction` called with the `onDialComplete`
  reference and `retry: false`.

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/batches/__tests__/mutations.test.ts
node_modules/.bin/biome check --write convex/batches/actions.ts convex/batches/mutations.ts
```

---

### Unit 5: Dashboard-facing queries + mutation wrappers (Convex authQuery/authMutation)

**Goal:** Expose batch CRUD, status, and live progress to the dashboard as
Convex `authQuery` / `authMutation` functions (reached via
`@convex-dev/react-query`), all scoped to `ctx.org.organizationId`. Progress
reads plan 009 aggregate counters (or the `calls.by_batch` index for MVP).

**Requirements:** R7, R9

**Dependencies:** unit 1 (schema); unit 4 (`createConfiguration`,
`createAndStartBatch`, `cancelBatch` internals); plan 009 (aggregate on `calls`,
if available); plan 005 (`calls` table + `by_batch` index).

**Files:**

- `convex/batches/queries.ts` — Modify: add `getBatch`, `listBatches`,
  `batchProgress` `authQuery`s.
- `convex/batches/mutations.ts` — Modify: add `createConfig`, `startBatch`,
  `cancel` public `authMutation` wrappers (thin: inject
  `ctx.org.organizationId`, delegate to the internal mutations from unit 4 via
  `ctx.runMutation`).

**Approach:**

Public wrappers use `authMutation` / `authQuery` from `convex/utils.ts` (the
verified exports). The auth wrappers inject `{ user, org }`; read the tenant as
`ctx.org.organizationId`. Each wrapper scopes by
`tenantId = ctx.org.organizationId` and validates ownership before
returning/mutating (function-level RLS). Use the `by_tenant` /
`by_tenant_status` indexes — never `collect()` a full table.

For `batchProgress`, the source depends on the plan-009 VERIFY item: if plan 009
publishes a `calls`-by-batch aggregator, read it (namespace=`tenantId`);
otherwise count the `calls.by_batch` index (bounded to one batch).
`remaining = batch.totalContacts − dialed`.

**Technical design (directional):**

```ts
// convex/batches/queries.ts (authQuery additions) — directional
import { v } from 'convex/values'
import { authQuery } from '../utils'

export const getBatch = authQuery({
	args: { batchId: v.id('batches') },
	handler: async (ctx, { batchId }) => {
		const batch = await ctx.db.get(batchId)
		if (!batch || batch.tenantId !== ctx.org.organizationId) return null
		return batch
	},
})

export const listBatches = authQuery({
	args: {
		status: v.optional(
			v.union(
				v.literal('draft'),
				v.literal('running'),
				v.literal('completed'),
				v.literal('cancelled'),
				v.literal('failed'),
			),
		),
	},
	handler: async (ctx, { status }) => {
		const tenantId = ctx.org.organizationId
		const q = ctx.db
			.query('batches')
			.withIndex('by_tenant_status', (idx) =>
				status
					? idx.eq('tenantId', tenantId).eq('status', status)
					: idx.eq('tenantId', tenantId),
			)
		return q.order('desc').take(50)
	},
})

export const batchProgress = authQuery({
	args: { batchId: v.id('batches') },
	handler: async (ctx, { batchId }) => {
		const batch = await ctx.db.get(batchId)
		if (!batch || batch.tenantId !== ctx.org.organizationId) return null
		// MVP: count the calls.by_batch index (plan 005 owns the calls table).
		// If plan 009 publishes a per-batch calls aggregator, swap this for an
		// O(log n) aggregate read keyed by (namespace=tenantId, batchId).
		const calls = await ctx.db
			.query('calls')
			.withIndex('by_batch', (idx) => idx.eq('batchId', batchId))
			.collect()
		const dialed = calls.length
		const answered = calls.filter((c) => c.status === 'completed').length
		const failed = calls.filter((c) => c.status === 'failed').length
		return {
			batch,
			dialed,
			answered,
			failed,
			remaining: Math.max(0, batch.totalContacts - dialed),
		}
	},
})
```

```ts
// convex/batches/mutations.ts (authMutation wrappers) — directional
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { authMutation } from '../utils'

export const createConfig = authMutation({
	args: {
		name: v.string(),
		channel: v.union(
			v.literal('voice'),
			v.literal('sms'),
			v.literal('whatsapp'),
		),
		agentId: v.optional(v.string()),
		phoneId: v.optional(v.string()),
		contactIds: v.array(v.id('contacts')),
		pacePerMinute: v.number(),
	},
	handler: async (ctx, args) =>
		ctx.runMutation(internal.batches.mutations.createConfiguration, {
			tenantId: ctx.org.organizationId,
			...args,
		}),
})

export const startBatch = authMutation({
	args: { configurationId: v.id('batchConfigurations') },
	handler: async (ctx, { configurationId }) =>
		ctx.runMutation(internal.batches.mutations.createAndStartBatch, {
			tenantId: ctx.org.organizationId,
			configurationId,
		}),
})

export const cancel = authMutation({
	args: { batchId: v.id('batches') },
	handler: async (ctx, { batchId }) => {
		await ctx.runMutation(internal.batches.mutations.cancelBatch, {
			tenantId: ctx.org.organizationId,
			batchId,
		})
		return { ok: true }
	},
})
```

> Note: an `authMutation` runs in the V8 mutation runtime;
> `ctx.runMutation(internal…)` (mutation→internal mutation) is allowed. The
> workflow `start()` and `enqueueAction()` happen inside the internal mutation
> (`createAndStartBatch` / `enqueueDialOne`), which is correct — they require a
> mutation context.

**Patterns to follow:** `authQuery`/`authMutation` from `convex/utils.ts`; read
tenant as `ctx.org.organizationId`; validate
`tenantId === ctx.org.organizationId` before returning/mutating; use indexes
(the `batchProgress` `.collect()` over `by_batch` is bounded to one batch's
calls — acceptable for MVP, upgrade to the aggregate when plan 009 lands).

**Test scenarios:**

- `getBatch` with wrong tenant → `null` (no cross-tenant leak).
- `listBatches` with `status: 'running'` → only running batches for this tenant.
- `batchProgress` during an active batch →
  `{ batch, dialed, answered, failed, remaining }`.
- `listBatches` with no batches → `[]`.
- `startBatch` → underlying `createAndStartBatch` runs with
  `tenantId = ctx.org.organizationId` (never client-supplied).

**Verification:**

```
node_modules/.bin/tsc --noEmit
node_modules/.bin/vp test run convex/batches/__tests__/queries.test.ts
node_modules/.bin/biome check --write convex/batches/queries.ts convex/batches/mutations.ts
```

---

## System-Wide Impact

| Area                          | Impact                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`            | Gains `batches` + `batchConfigurations`; first domain tables in the empty schema.                                                                                               |
| `convex/convex.config.ts`     | Gains `workflow`, `dialWorkpool`, `rateLimiter`. Convex deployment must be re-pushed (`bunx convex deploy`) after this change.                                                  |
| `_generated/api.ts`           | Regenerated after schema + config changes; downstream imports update automatically.                                                                                             |
| `calls` table (plan 005)      | `dialOne` → `internal.calls.initiateOutbound` writes `calls` rows with `batchId` set. Plan 005's `initiateOutbound` arg list must accept `batchId` and `contactId`. Coordinate. |
| Aggregate counters (plan 009) | No direct call from this plan. Plan 009's Trigger on the `calls` insert maintains counters. `batchProgress` reads the aggregate (or `calls.by_batch` for MVP).                  |
| Polar billing (plan 007)      | No direct call here — Polar ingest happens in plan 005's post-call webhook; `batchId` is passed through to `calls` so plan 007 can attribute per-batch costs.                   |
| Dashboard / oRPC              | Batch CRUD is Convex-direct via `@convex-dev/react-query`. **No oRPC contract/route is added** — the oRPC layer stays WorkOS-only.                                              |

## Risks & Dependencies

| Risk / Dependency                                                                         | Severity   | Mitigation                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan 005 `initiateOutbound` must accept `batchId` + `contactId`                           | High       | Coordinate with plan 005; `calls.batchId` already exists as `v.optional(v.string())` there.                                                                                                               |
| `calls.batchId` type mismatch across plans 005 (`v.string()`) and 009 (`v.id('batches')`) | Medium     | Align before implementation; this plan assumes the plan-005 string form. VERIFY.                                                                                                                          |
| Plan 009 aggregate shape for per-batch progress not finalized                             | Medium     | MVP `batchProgress` counts the `calls.by_batch` index (bounded to one batch); swap to the aggregate when plan 009 publishes a per-batch `calls` aggregator.                                               |
| Workflow handler determinism                                                              | Low        | All I/O via `step.run*`; no raw `fetch`/env/`crypto`. `Date`/`Math.random` are patched and safe but unused here. The ElevenLabs SDK call lives in `dialOne` (action, Node runtime), never in the handler. |
| ElevenLabs concurrent-call ceiling unknown                                                | Medium     | Placeholder `elOutbound: 100/min`; confirm in the ElevenLabs dashboard and update before production. VERIFY.                                                                                              |
| `batchConfigurations.contactIds` embedded array — 1 MiB doc limit                         | Low-Medium | Fits MVP batches (< ~5k contact ids); large-import path via `stagedContacts` deferred to plan 010.                                                                                                        |
| Workpool `maxParallelism: 20` shared across ALL active batches (multi-tenant)             | Medium     | Conservative start; raise after confirming the Convex plan's action-concurrency ceiling and the EL concurrent-call limit. High-volume tenants share the pool; revisit per-tenant isolation post-MVP.      |

## Documentation & References

### External dependencies introduced by this plan (install commands verified 2026-06-18)

```
bun add @convex-dev/workflow@0.4.4
bun add @convex-dev/workpool@0.4.7
bun add @convex-dev/rate-limiter@0.3.2
```

(`@convex-dev/aggregate@0.2.1` is installed by plan 009, not here.)

- **@convex-dev/workflow** — https://www.convex.dev/components/workflow ·
  README: https://github.com/get-convex/workflow · Used in: Unit 2
  (`app.use(workflow)` from `@convex-dev/workflow/convex.config.js`), Unit 3
  (`new WorkflowManager(components.workflow)`, `workflow.define().handler()`,
  `step.runQuery/runMutation/sleep`), Unit 4 (top-level
  `import { start } from '@convex-dev/workflow'` →
  `start(ctx, fn, args, { onComplete, context })` returns `WorkflowId`;
  `vWorkflowId`/`vResultValidator`; `cancel(ctx, components.workflow, id)`
  available but not used). Determinism: `fetch`/env/`crypto` blocked;
  `Date`/`Math.random`/`console` patched.
- **@convex-dev/workpool** — https://www.convex.dev/components/workpool ·
  README: https://github.com/get-convex/workpool · Used in: Unit 2
  (`app.use(workpool, { name: 'dialWorkpool' })` from
  `@convex-dev/workpool/convex.config.js`;
  `new Workpool(components.dialWorkpool, { maxParallelism, retryActionsByDefault })`),
  Unit 4
  (`dialPool.enqueueAction(ctx, fn, args, { onComplete, context, retry })`;
  `vOnCompleteValidator(contextSchema)`; handler `{ workId, context, result }`,
  `result.kind ∈ 'success'|'failed'|'canceled'`).
- **@convex-dev/rate-limiter** — https://www.convex.dev/components/rate-limiter
  · README: https://github.com/get-convex/rate-limiter · Used in: Unit 2
  (`app.use(rateLimiter)`; `new RateLimiter(components.rateLimiter, { … })`;
  `MINUTE` export), Unit 4
  (`rateLimiter.limit(ctx, name, { key, throws, count?, config?, reserve? })`
  returns `{ ok, retryAfter }`; per-call `config` override for the tenant
  `pacePerMinute`; token-bucket vs fixed-window).
- **@convex-dev/aggregate** (referenced, owned by plan 009) —
  https://www.convex.dev/components/aggregate · README:
  https://github.com/get-convex/aggregate · Used implicitly: plan 009's Trigger
  on `calls` maintains counters this plan's `batchProgress` reads.

### Design-doc sections this plan builds on

- `docs/rebuild-architecture.md §4` (lines 234–249) — voice runtime + durable
  workflow/workpool/rate-limiter trio.
- `docs/rebuild-architecture.md §5` (ERD lines 414, 504–514) — `batches`,
  `batchConfigurations`, `batches ||--o{ calls`.
- `docs/rebuild-architecture.md §5b` (lines 610, 613, 624–625) — `batches` =
  Register, `batchConfigurations` = Setup/Configuration.
- `docs/rebuild-architecture.md §6` (lines 638–641) — component adoption table.
- `docs/threads-model.md §2` — `calls` table definition.

### Existing agent.io substrate (verified by reading)

- `convex/convex.config.ts` — current registrations (`workOSAuthKit`, `resend`).
- `convex/utils.ts` — exports `query`, `mutation`, `authQuery`, `authMutation`
  only; `org.organizationId` injected from WorkOS JWT. `internal*` come from
  `./_generated/server`.
- `convex/schema.ts` — currently `defineSchema({})`.
- `src/server/rpc/init.ts` — oRPC `os`/`auth`/`org`/`admin`/`adminOrg`;
  `RpcContextType = { headers, resHeaders, session, workOs }` (no Convex client)
  — why batch CRUD is Convex-direct.
- `src/lib/rpc/index.tsx`, `src/lib/rpc/context.ts` — `@convex-dev/react-query`
  dashboard→Convex path.
- `src/server/rpc/routes/work-os.router.ts` — reference for the contract-first
  oRPC pattern (WorkOS-only).

### Sibling plan dependencies

- `2026-06-17-005-feat-voice-runtime-elevenlabs-plan.md` —
  `internal.calls.initiateOutbound`, `calls` table + `by_batch` index,
  `calls.batchId: v.optional(v.string())`.
- `2026-06-17-009-feat-surveys-sentiment-analytics-plan.md` —
  `@convex-dev/aggregate` + Triggers on `calls`;
  `convex/analytics.ts:dashboardSummary` (no `internal.aggregates.*`).
- `2026-06-17-001-feat-convex-foundations-rls-plan.md` — component-registration
  substrate, `contacts` table, Triggers infrastructure.
- `2026-06-17-007-feat-billing-polar-metering-plan.md` — Polar ingest from plan
  005's post-call webhook, attributed via `calls.batchId`.

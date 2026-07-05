---
title: 'feat: Convex foundations — schema base, components, RLS, triggers, tenant config'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md
---

# feat: Convex foundations — schema base, components, RLS, triggers, tenant config

## Overview

Phase 001 establishes the non-negotiable substrate that every subsequent phase builds on: Convex component registration, the `tenant` config table, an airtight RLS spine via convex-helpers `wrapDatabaseReader`/`wrapDatabaseWriter` composed into the existing `zCustomQuery`/`zCustomMutation` factories, and a Triggers wiring point for derived counters and cascades. No domain tables beyond `tenant` are added here — those live in 002 and later. Completing this phase gates all other phases.

## Problem Frame

`convex/schema.ts` is `defineSchema({})` (empty). `convex/convex.config.ts` registers only `@convex-dev/workos-authkit` and `@convex-dev/resend`. `convex/utils.ts` already wires `authQuery`/`authMutation` (built with `zCustomQuery`/`zCustomMutation` from `convex-helpers/server/zod4`) that inject `{user, org}` from the WorkOS JWT via `getAuthUser` → `getOrgFromJwt`, but there is no Triggers infrastructure, no RLS `wrapDatabaseReader`/`wrapDatabaseWriter`, no `tenant` table, no `tenantId`-on-ctx convenience alias, no shared `zodToConvex` validators seam, and none of the batch/analytics/migration components are registered.

> Ground-truth note (verified against `convex/utils.ts`): `getAuthUser` returns `{ user, org }` and the input fn spreads `...user` (i.e. spreads the whole `{ user, org }` object). So inside a handler the org id is `ctx.org.organizationId` — **not** `ctx.user.org.organizationId`. The original plan's RLS sketch used `user.org.organizationId`, which is wrong; corrected throughout.

Without this foundation:

- Domain functions can be written that silently ignore `tenantId` — a cross-tenant data leak by omission.
- `@convex-dev/workflow`, `workpool`, `rate-limiter`, `aggregate`, and `action-cache` are unavailable; 003–009 cannot reference them.
- The `tenant` config row (with embedded `phones[]`, `whatsapps[]`, `widgets[]`, `mcpServers[]`) has no home — webhook routing (002+) and channel adapters (003) cannot resolve tenants.
- Schema evolution via `@convex-dev/migrations` is unplanned; a backfill in 010 will be painful without it pre-registered.

## Requirements Trace

- **R1** — Register all Convex components the rebuild depends on in `convex/convex.config.ts` (keep workos-authkit + resend; add workflow, workpool, rate-limiter, aggregate, action-cache, migrations).
- **R2** — Define the `tenant` config table in `convex/schema.ts` per §1 of rebuild-architecture.md: `tenantId` + `by_tenant` index, embedded `phones[]` / `whatsapps[]` / `widgets[]` / `mcpServers[]` arrays, `defaults` object, `updatedAt`.
- **R3** — Every Convex query/mutation that touches domain data must be tenant-scoped by construction. Extend `convex/utils.ts` `authQuery`/`authMutation` to surface `org.organizationId` as a canonical `ctx.tenantId` in every handler's ctx.
- **R4** — Add convex-helpers RLS (`wrapDatabaseReader` for queries, `wrapDatabaseWriter` for mutations) as a second layer of defence so ad-hoc `db` reads/writes inside auth'd fns cannot cross tenant boundaries.
- **R5** — Wire convex-helpers `Triggers` so derived counter updates (e.g. `thread.messageCount`, `thread.lastMessageAt`) and cascade deletes are fired atomically with their writes — ready for 002 to register message triggers.
- **R6** — Establish a `zodToConvex` validation seam so per-kind metadata discriminated unions (threads/messages, introduced in 002) can be validated at the edge without changing the stored `v.any()` shape.
- **R7** — The polymorphic-FK decision for `messages.parentId` (plain `v.string()` vs two optional `v.id()` fields) must be flagged and deferred to plan 002.

## Scope Boundaries

**In scope:**

- `convex/convex.config.ts` — register 6 additional components.
- `convex/schema.ts` — `tenant` table only (with `by_tenant` index).
- `convex/utils.ts` — extend `authQuery`/`authMutation` to expose `ctx.tenantId` and wrap `ctx.db` with RLS; define the RLS rules registry.
- `convex/triggers.ts` — new file; Triggers singleton + `customCtx(triggers.wrapDB)`-based mutation factory; placeholder hook registration.
- Zod validation seam: a shared `convex/validators.ts` with a `tenantIdValidator` + the `zodToConvex` re-export pattern for per-table use.
- `bun add` commands to install the 6 new `@convex-dev/*` packages.

### Deferred to Separate Tasks

- Domain tables (`threads`, `calls`, `messages`, `contacts`, `agents`, `batches`, etc.) → plan 002 and later.
- Actual Trigger registrations for `messages` → plan 002.
- Polar component (`@convex-dev/polar`) registration + billing wiring → plan 007.
- WorkOS Vault/Pipes calls — no Convex component for these; they are HTTP actions in 002+.
- `@convex-dev/migrations` runtime usage (defining actual migrations) → plan 010.
- Aggregate component wiring for specific counters → plan 009.
- Action-cache usage → plan 009.
- oRPC `tenant.*` routes exposing tenant CRUD — a thin route layer can follow once the Convex fns exist (not in this plan).
- Polymorphic-FK decision for `messages.parentId` → plan 002 (see Open Questions).

## Context & Research

### Relevant Code and Patterns

**agent.io (actual stack — the only paths that matter for implementation):**

| File                      | Current state (verified)                                                                                                                                                                                                                                | Role in this plan                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `convex/convex.config.ts` | imports from `@convex-dev/resend/convex.config` + `@convex-dev/workos-authkit/convex.config` (no `.js` suffix), `defineApp()`, `app.use(workOSAuthKit)`, `app.use(resend)`                                                                              | Add 6 components                                                                                                                                     |
| `convex/schema.ts`        | `defineSchema({})`                                                                                                                                                                                                                                      | Add `tenant` table                                                                                                                                   |
| `convex/utils.ts`         | exports `query`/`mutation` (`zCustomQuery(convexQuery, NoOp)` etc.), `authQuery`/`authMutation` (`zCustomQuery`/`zCustomMutation` with `input` calling `getAuthUser`, spreading `...user` = `{user, org}`), `AuthCtx<T>` = `ZCustomCtx<typeof authQuery | authMutation>`, plus an `includes()`query helper.`getOrgFromJwt`derives`organizationId`from`identity.organization.organizationId ?? identity.org_id` | Extend: expose `ctx.tenantId`; wrap `ctx.db` with RLS |
| `convex/auth.config.ts`   | two `customJwt` providers (SSO issuer `https://api.workos.com/` + user_management issuer `https://api.workos.com/user_management/${clientId}`)                                                                                                          | Read-only reference; already correct                                                                                                                 |
| `convex/auth.ts`          | `authKit` instance (imported by `utils.ts`); org lifecycle event wiring                                                                                                                                                                                 | Read-only reference; Unit 6 adds `tenant.ensure` call                                                                                                |

**Design-doc authority (read for WHAT, adapt for HOW):**

- rebuild-architecture.md §1 (lines 40–122) — `tenant` table shape (full field-by-field spec, embedded arrays, `defaults`, `by_tenant` index). The plan's Unit 2 sketch matches this field-for-field (verified).
- rebuild-architecture.md "components" section (the `@convex-dev/*` list, incl. `@convex-dev/rate-limiter` line ~249) — component install list.
- rebuild-architecture.md RLS rationale — "makes forgotten `tenantId` filter structurally impossible".
- threads-model.md §4 — `zodToConvex` discriminated-union seam (metadata shapes); this plan establishes the seam, not the types.

**Reference patterns (patterns only — do NOT copy code for voice/agent concerns):**

- convex-helpers source (installed `0.1.119`, verified): `wrapDatabaseReader`/`wrapDatabaseWriter` at `convex-helpers/server/rowLevelSecurity`; `Triggers` class at `convex-helpers/server/triggers`; `zCustomQuery`/`zCustomMutation`/`zodToConvex`/`zid` at `convex-helpers/server/zod4`; `customCtx`/`NoOp` at `convex-helpers/server/customFunctions`.
- `convex/utils.ts` already uses `zCustomQuery`/`zCustomMutation` from `convex-helpers/server/zod4` and `NoOp` from `convex-helpers/server/customFunctions`. Zod 4 variant is the one in use.

### Verified API shapes (read from installed `.d.ts` — use these, do not re-derive)

`convex-helpers/server/rowLevelSecurity.d.ts`:

```ts
type Rule<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>
export type Rules<Ctx, DataModel> = {
	[T in TableNamesInDataModel<DataModel>]?: {
		read?: Rule<Ctx, DocumentByName<DataModel, T>>
		modify?: Rule<Ctx, DocumentByName<DataModel, T>> // replace/patch/delete
		insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>
	}
}
export function wrapDatabaseReader<Ctx, DataModel>(
	ctx: Ctx,
	db,
	rules,
	config?,
): GenericDatabaseReader<DataModel>
export function wrapDatabaseWriter<Ctx, DataModel>(
	ctx: Ctx,
	db,
	rules,
	config?,
): GenericDatabaseWriter<DataModel>
// config?: { defaultPolicy?: "allow" | "deny" }  (default "allow")
// NOTE: the older RowLevelSecurity({...}) middleware is @deprecated — use wrap*+customFunction.
```

**Key correction:** RLS rules are **per-document predicates** `(ctx, doc) => Promise<boolean>`, applied row-by-row as the DB is read/written. They do **not** rewrite `db.query()` into a `.withIndex('by_tenant', …)`. A `db.query('tenant').collect()` still scans, but rows failing the `read` predicate are filtered out; `modify`/`insert` predicates **throw** on violation. (The original plan claimed the wrapper returns `db.query(table).withIndex(...)` for all tables — that is incorrect.)

`convex-helpers/server/triggers.d.ts`:

```ts
export class Triggers<DataModel, Ctx = GenericMutationCtx<DataModel>> {
	register<T>(tableName: T, trigger: Trigger<Ctx, DataModel, T>): void
	wrapDB: <C extends Ctx>(ctx: C) => C // pass to customCtx(...)
}
// Trigger = (ctx & { innerDb: GenericDatabaseWriter }, change) => Promise<void>
// Change = { id } & ( {operation:"insert", oldDoc:null, newDoc} | {operation:"update", oldDoc, newDoc} | {operation:"delete", oldDoc, newDoc:null} )
```

**Key correction:** there is **no** `triggers.middleware()` method. Wrap with `customMutation(rawMutation, customCtx(triggers.wrapDB))`. The trigger callback receives `ctx.innerDb` (un-triggered writer for use inside the callback) and a `change` whose update operation is `"update"` (not `"patch"`), with `oldDoc`/`newDoc`.

`convex-helpers/server/zod4.d.ts`: exports `zCustomQuery`, `zCustomMutation`, `zCustomAction`, `zid`, `zodToConvex`, `zodToConvexFields`, type `ZCustomCtx` (all verified present).

### Design-Doc Section Citations

- §1 (tenant table) — authoritative field list (lines 43–119).
- components section — `@convex-dev/*` install list.
- RLS rationale — `wrapDatabaseReader`/`wrapDatabaseWriter` composed via custom functions.
- threads-model.md §4 — `zodToConvex` metadata seam.

## Key Technical Decisions

**1. `ctx.tenantId` alias injected into every `authQuery`/`authMutation` ctx — not passed as an arg.**
Rationale: `convex/utils.ts` already extracts `org.organizationId` in `getOrgFromJwt`. Surface it as `ctx.tenantId` (aliasing `ctx.org.organizationId`) so domain handlers write one unambiguous name and the compiler enforces it is always present (`getOrgFromJwt` throws if missing). If a handler omits a tenant filter, it still compiles, but the RLS layer (decision 2) catches it at runtime. Defence-in-depth: the framework makes it easy to do right and hard to do wrong.

**2. RLS via `wrapDatabaseReader` (queries) + `wrapDatabaseWriter` (mutations) — composed inside the existing `zCustom*` `input` fn, not as separate middleware.**
Rationale: `authQuery`/`authMutation` is the primary gate (throws if no org). RLS is the secondary layer: inside the same `input` fn, after deriving `tenantId`, replace `ctx.db` with `wrapDatabaseReader(rlsCtx, ctx.db, rlsRules)` (queries) / `wrapDatabaseWriter(rlsCtx, ctx.db, rlsRules)` (mutations), where `rlsCtx = { tenantId }`. Each table's `read`/`modify`/`insert` rule asserts `doc.tenantId === ctx.tenantId`. Because rules are per-document predicates, a forgotten `.filter` cannot leak another tenant's rows (reads are filtered; writes throw). The `tenant` table's rule compares `doc.tenantId === tenantId`. (Replaces the original plan's `wrapDatabaseReader({ user: tenantId }, …)` call shape and its incorrect "prescoped withIndex" model.)

**3. Triggers singleton in a dedicated `convex/triggers.ts` — mutations are built with `customMutation(rawMutation, customCtx(triggers.wrapDB))`.**
Rationale: convex-helpers `Triggers.wrapDB` wraps the mutation's `db` so registered callbacks fire in the same transaction. A single `triggers.ts` exporting the singleton lets 002 call `triggers.register('messages', cb)` as a module side-effect with no cross-file coordination. For auth'd mutations, the RLS-wrapped writer (decision 2) and the trigger-wrapped writer must be composed in a defined order (see Unit 4 — Triggers wrap first/innermost so callbacks see the real writer, RLS wraps outermost; VERIFY exact composition during implementation).

**4. Polymorphic-FK for `messages.parentId` deferred to 002.**
Rationale: `parentType: v.string()` + `parentId: v.string()` (threads-model.md) avoids a schema dependency on both `threads` and `calls` existing before `messages`. The alternative — two optional `v.id("threads")` / `v.id("calls")` fields (or `zid()` for the zod path) — gives stronger FK type-safety but requires both tables in the same schema step. Since 001 only adds `tenant`, deferring keeps 001 self-contained. Settle in 002 before any message insert.

**5. zod4 variant (`convex-helpers/server/zod4`) throughout.**
Rationale: `convex/utils.ts` already imports `zCustomQuery`/`zCustomMutation` from `convex-helpers/server/zod4` (Zod v4, installed `zod@^4`). All new validators use the same zod4 path. `zodToConvex` (and `zid` for typed ids in 002) are re-exported from that module — single import point.

## Open Questions

### Resolved

- **Two `customJwt` providers** — already correct in `convex/auth.config.ts` (SSO issuer + user_management issuer). No change needed.
- **`tenantId` source** — `org.organizationId` from `getOrgFromJwt` in `convex/utils.ts` (`identity.organization.organizationId ?? identity.org_id`). `getOrgFromJwt` already throws with a clear message instructing the dev to confirm the WorkOS JWT template includes `organization.organizationId`.
- **ctx shape** — handlers see `ctx.org` and `ctx.user` (input fn spreads the `{user, org}` object). The canonical org id is `ctx.org.organizationId`. The new alias is `ctx.tenantId`.
- **Zod major** — zod4, matching existing `convex/utils.ts` imports.
- **convex-helpers version** — `0.1.119` installed; `wrapDatabaseReader`/`wrapDatabaseWriter` + `Triggers` confirmed in installed `.d.ts`.

### Deferred to Implementation

- **Polymorphic-FK decision** (`parentType`/`parentId` as `v.string()` vs two optional typed `zid()`/`v.id()` fields on `messages`) — deferred to plan 002. Must be settled before any message insert is coded.
- **VERIFY: Trigger ordering** — confirm `Triggers.register` callbacks fire in registration order (so a `messages` trigger in 002 fires after a `threads` upsert trigger if both are registered). Not stated in the `.d.ts`; check `triggers.ts` source/behaviour before 002 ships.
- **VERIFY: RLS + Triggers + zCustom composition** — exact wrapping order of `wrapDatabaseWriter` and `customCtx(triggers.wrapDB)` inside a single `zCustomMutation` `input` fn so both the RLS check and the trigger fire correctly in one transaction. Prototype in `bunx convex dev` before relying on it in 002. Triggers should wrap the innermost real writer; RLS should wrap the result the handler sees.
- **VERIFY: `convex-test` is NOT installed** in agent.io (`node_modules/convex-test` absent). Integration tests that need a Convex runtime must either `bun add -d convex-test` first or use the live dev deployment via `bunx convex run`. Vitest (`vp`) IS installed.
- **RLS in actions** — `wrapDatabaseReader`/`Writer` only cover `ctx.db` inside queries/mutations. Convex `action`s have no `ctx.db`; they must call internal queries/mutations (which carry RLS) via `ctx.runQuery`/`ctx.runMutation` rather than reaching the DB directly. Flag for all action authors in 002+.

## Output Structure

```
convex/
  convex.config.ts          # Modified — add 6 @convex-dev/* components
  schema.ts                 # Modified — add tenant table
  utils.ts                  # Modified — expose ctx.tenantId; wrap ctx.db with RLS reader/writer; define rlsRules
  triggers.ts               # Create — Triggers singleton + customCtx(triggers.wrapDB) factory
  validators.ts             # Create — tenantIdValidator + zodToConvex seam exports
  tenant.ts                 # Create (Unit 6) — ensure/get/patch
```

## High-Level Technical Design

```
WorkOS JWT (verified by Convex via two customJwt providers)
  └─► getAuthUser() → { user, org }   ;  org.organizationId  (getOrgFromJwt)
        │
        ▼
  authQuery / authMutation  (zCustomQuery / zCustomMutation, input fn)
        │  ctx.tenantId = org.organizationId            [PRIMARY GATE: throws if missing]
        │  ctx.db = wrapDatabaseReader/Writer({ tenantId }, ctx.db, rlsRules)  [SECONDARY RLS]
        │     → per-doc predicate: doc.tenantId === ctx.tenantId
        │        reads filtered out; modify/insert throw on violation
        │
        ▼  (mutations only)
  customMutation(rawMutation, customCtx(triggers.wrapDB))   [TRIGGERS LAYER]
        │  insert/patch/delete fires registered callbacks atomically (ctx.innerDb in cb)
        │
        ▼
  domain fn handler
        writes to: tenant (this plan) → threads/calls/messages/contacts (002+)
```

Component registration map:

```
convex/convex.config.ts
  app.use(workOSAuthKit)                       ← already registered
  app.use(resend)                              ← already registered
  app.use(workflow)                            ← NEW (durable batch dialing — plan 006)
  app.use(workpool, { name: 'dialWorkpool' })  ← NEW (bounded concurrency — plan 006); named instance
  app.use(rateLimiter)                         ← NEW (pacing — plan 006)
  app.use(aggregate, { name: '<counter>' })    ← NEW (counters — plan 009); named instance(s)
  app.use(actionCache)                         ← NEW (analytics cache — plan 009)
  app.use(migrations)                          ← NEW (data import — plan 010)
```

> Naming note (verified from component READMEs): `workpool` and `aggregate` are intended to be registered as **named** instances when you want more than one pool/aggregate (`app.use(workpool, { name })` → `components.<name>`). 001 may register a single default of each (bare `app.use`), but since 006/009 will want multiple, prefer naming them now and let 006/009 add more `app.use(...)` lines. The exact names are a 006/009 concern; this plan just registers the components so codegen exposes them.

## Implementation Units

---

### Unit 1 — Install and register Convex components

**Goal:** Add the 6 missing `@convex-dev/*` components so every subsequent plan can reference them in `components.*` without an install step.

**Requirements:** R1

**Dependencies:** None (purely additive).

**Files:**

- `convex/convex.config.ts` — Modify (add 6 `app.use()` calls)
- `package.json` — Modified implicitly by `bun add`

**Approach:**
Install packages with `bun add`, then wire each component into `convex.config.ts` following the existing registration pattern (the file imports from `<pkg>/convex.config` without a `.js` suffix; keep that convention). Component packages and their export paths:

| Package                    | Import path (repo convention)            | Local name    | app.use shape                                  |
| -------------------------- | ---------------------------------------- | ------------- | ---------------------------------------------- |
| `@convex-dev/workflow`     | `@convex-dev/workflow/convex.config`     | `workflow`    | `app.use(workflow)`                            |
| `@convex-dev/workpool`     | `@convex-dev/workpool/convex.config`     | `workpool`    | `app.use(workpool, { name })` (named)          |
| `@convex-dev/rate-limiter` | `@convex-dev/rate-limiter/convex.config` | `rateLimiter` | `app.use(rateLimiter)`                         |
| `@convex-dev/aggregate`    | `@convex-dev/aggregate/convex.config`    | `aggregate`   | `app.use(aggregate, { name })` for >1 instance |
| `@convex-dev/action-cache` | `@convex-dev/action-cache/convex.config` | `actionCache` | `app.use(actionCache)`                         |
| `@convex-dev/migrations`   | `@convex-dev/migrations/convex.config`   | `migrations`  | `app.use(migrations)`                          |

Install command:

```bash
bun add @convex-dev/workflow @convex-dev/workpool @convex-dev/rate-limiter @convex-dev/aggregate @convex-dev/action-cache @convex-dev/migrations
```

**Technical design (directional — not an implementation spec):**

```ts
// convex/convex.config.ts
import actionCache from '@convex-dev/action-cache/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import resend from '@convex-dev/resend/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config'
import workpool from '@convex-dev/workpool/convex.config'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(workOSAuthKit)
app.use(resend)
app.use(workflow)
app.use(workpool, { name: 'dialWorkpool' }) // named — 006 adds more pools as needed
app.use(rateLimiter)
app.use(aggregate, { name: 'threadCounts' }) // named — 009 adds more aggregates as needed
app.use(actionCache)
app.use(migrations)
export default app
```

`components.*` in `convex/_generated/api` will include the new components after the next `bunx convex dev` codegen run (named instances appear under their `name`).

**Patterns to follow:** Existing `convex/convex.config.ts` (import from `<pkg>/convex.config`, call `app.use()`). Keep Biome import ordering (alphabetical, the existing file is already sorted).

**Test scenarios:**

- **Happy:** `bunx convex dev` (or `bunx convex deploy --dry-run`) succeeds with no "unknown component" errors; `convex/_generated/api.d.ts` includes the registered component accessors.
- **Edge:** A component version peer-dep conflict with `convex@1.41.0` — verify `bun add` resolves cleanly or pin to a compatible version (all current `@convex-dev/*` components target convex `^1.x`).
- **Error:** Misspelled import path (e.g. `@convex-dev/ratelimiter/...` instead of `@convex-dev/rate-limiter/...`) — TypeScript errors at import; caught by typecheck.

**Verification:**

- Outcome: `convex/_generated/api.d.ts` contains `components.workflow`, `components.dialWorkpool` (or whatever names you chose), `components.rateLimiter`, `components.threadCounts`, `components.actionCache`, `components.migrations`.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/convex.config.ts`.
- Run: `node_modules/.bin/biome check --write convex/convex.config.ts` (or `bunx biome ...`).

---

### Unit 2 — `tenant` table in `convex/schema.ts`

**Goal:** Define the `tenant` config table — one row per WorkOS org — with all embedded channel arrays and the `by_tenant` index. This is the only domain table added in phase 001.

**Requirements:** R2

**Dependencies:** Unit 1 (components registered so codegen can re-run and `DataModel` updates).

**Files:**

- `convex/schema.ts` — Modify (replace empty `defineSchema({})`)

**Approach:**
Transcribe the `tenant` table from rebuild-architecture.md §1 (lines 43–119) into Convex `defineTable` notation. Keep the embedded arrays as `v.optional(v.array(...))` exactly as specified (bounded, read together with the tenant row — no separate join). Add `by_tenant` as `.index("by_tenant", ["tenantId"])`. **Convex does not enforce unique indexes**, so the mutation layer (Unit 6) enforces one-row-per-tenant via an upsert pattern.

Schema uses flat `v.*` validators — no `zodToConvex` at the storage layer (zod validation is at the edge/mutation-arg level, not in `defineTable`).

**Technical design (directional — field list authoritative from §1, verified to compile):**

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	tenant: defineTable({
		tenantId: v.string(), // WorkOS org id — unique by convention (enforced in mutation)
		timezone: v.optional(v.string()),
		branding: v.optional(v.any()),
		loginStyle: v.optional(v.any()),
		aiSettings: v.optional(v.any()),
		customContactFields: v.optional(v.any()),
		defaultModules: v.optional(v.array(v.string())),

		defaults: v.optional(
			v.object({
				phone: v.optional(v.string()),
				sms: v.optional(v.string()),
				whatsapp: v.optional(v.string()),
				elevenlabs: v.optional(v.string()),
			}),
		),

		phones: v.optional(
			v.array(
				v.object({
					phoneNumberId: v.string(),
					phoneNumber: v.string(),
					label: v.optional(v.string()),
					capabilities: v.optional(v.array(v.string())),
					agentIds: v.optional(v.array(v.string())),
					telephonyMode: v.union(v.literal('managed'), v.literal('byo_sip')),
					sipTrunkId: v.optional(v.string()),
					carrier: v.optional(v.string()),
					brandedCallerId: v.optional(v.boolean()),
				}),
			),
		),

		whatsapps: v.optional(
			v.array(
				v.object({
					accountId: v.string(),
					wabaId: v.optional(v.string()),
					phoneNumber: v.optional(v.string()),
					label: v.optional(v.string()),
					metaUserId: v.optional(v.string()),
					agentIds: v.optional(v.array(v.string())),
				}),
			),
		),

		widgets: v.optional(
			v.array(
				v.object({
					token: v.string(),
					enabledAgentIds: v.array(v.string()),
					allowVoice: v.boolean(),
					allowText: v.boolean(),
					allowWhatsApp: v.optional(v.boolean()),
					branding: v.optional(v.any()),
					welcomeMessage: v.optional(v.string()),
					isActive: v.boolean(),
				}),
			),
		),

		mcpServers: v.optional(
			v.array(
				v.object({
					key: v.string(),
					label: v.optional(v.string()),
					transport: v.union(
						v.literal('sse'),
						v.literal('http'),
						v.literal('stdio'),
					),
					url: v.optional(v.string()),
					command: v.optional(v.string()),
					backedBy: v.union(
						v.literal('hostedOAuth'),
						v.literal('pipes'),
						v.literal('vault'),
						v.literal('none'),
					),
					vaultSecretId: v.optional(v.string()),
				}),
			),
		),

		updatedAt: v.number(),
	}).index('by_tenant', ['tenantId']),
})
```

**Patterns to follow:** rebuild-architecture.md §1 field-by-field spec is canonical (verified to match this sketch exactly). Do not add fields not in the spec (no `createdAt` — `_creationTime` covers it).

**Test scenarios:**

- **Happy:** `bunx convex dev` accepts the schema; `convex/_generated/dataModel.d.ts` exports `Doc<'tenant'>` with all expected fields.
- **Edge:** A `widgets` entry missing a required field (e.g. `isActive`) — the mutation arg validator (Unit 6) must reject before `db.insert`; `defineTable` validates whole-doc shape on insert but partial `patch` does not re-validate omitted nested fields.
- **Error:** A second `tenant` row for the same `tenantId` — prevented by the upsert in Unit 6 (not a DB constraint); a test confirms one row after two `ensure` calls.

**Verification:**

- Outcome: `DataModel['tenant']` compiles; `convex/_generated/dataModel.d.ts` contains the `tenant` table type.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/schema.ts`.
- Run: `node_modules/.bin/biome check --write convex/schema.ts`.

---

### Unit 3 — RLS spine: extend `authQuery`/`authMutation` + wrap `ctx.db`

**Goal:** Surface `ctx.tenantId` (= `org.organizationId`) in every auth'd handler; wrap `ctx.db` with `wrapDatabaseReader` (queries) / `wrapDatabaseWriter` (mutations) so ad-hoc reads/writes are tenant-scoped by per-document predicate.

**Requirements:** R3, R4

**Dependencies:** Unit 2 (schema must be defined so `DataModel` is non-empty and RLS rule types resolve table names).

**Files:**

- `convex/utils.ts` — Modify (extend `authQuery`/`authMutation` `input`; add `rlsRules`; export the `tenantId` alias via ctx; preserve all existing exports)

**Approach:**
`convex/utils.ts` already exports `authQuery`/`authMutation` whose `input` fn calls `getAuthUser` and spreads `...user` (the `{user, org}` object) into ctx. The change is contained to that `input` fn:

1. After `getAuthUser`, read `const tenantId = org.organizationId` (the input destructures `{ user, org }` from `getAuthUser`, or reads `user.org`/`user.user` — match the actual return; `getAuthUser` returns `{ user, org }`).
2. Wrap `ctx.db`: queries → `wrapDatabaseReader({ tenantId }, ctx.db, rlsRules)`; mutations → `wrapDatabaseWriter({ tenantId }, ctx.db, rlsRules)`. Return the wrapped db in the new ctx.
3. Add `tenantId` to the returned ctx. Keep `ctx.org` / `ctx.user` for role/permission checks.

`rlsRules` is a `Rules<{ tenantId: string }, DataModel>` map: each table provides `read`/`modify`/`insert` predicates that assert `doc.tenantId === ctx.tenantId`. For `tenant`, the field that holds the org id is itself `tenantId`, so the same predicate applies.

**Technical design (directional — corrected to the verified `wrapDatabaseReader(ctx, db, rules)` signature):**

```ts
// convex/utils.ts — extension; preserve existing `includes`, `query`, `mutation`, AuthCtx, getAuthUser, getOrgFromJwt
import {
	type Rules,
	wrapDatabaseReader,
	wrapDatabaseWriter,
} from 'convex-helpers/server/rowLevelSecurity'
// ...existing imports (NoOp, zCustom*, DataModel, convexQuery/Mutation, authKit)...

type RlsCtx = { tenantId: string }

// One rule per table; all assert the doc belongs to the calling tenant.
// Add a new entry whenever a table is added in a later plan.
const rlsRules: Rules<RlsCtx, DataModel> = {
	tenant: {
		read: async ({ tenantId }, doc) => doc.tenantId === tenantId,
		modify: async ({ tenantId }, doc) => doc.tenantId === tenantId,
		insert: async ({ tenantId }, doc) => doc.tenantId === tenantId,
	},
	// threads, calls, messages, contacts, etc. added in 002+
}

export const authQuery = zCustomQuery(convexQuery, {
	args: {},
	input: async (ctx) => {
		const { user, org } = await getAuthUser(ctx)
		const tenantId = org.organizationId
		const db = wrapDatabaseReader({ tenantId }, ctx.db, rlsRules)
		return { ctx: { ...ctx, user, org, tenantId, db }, args: {} }
	},
})

export const authMutation = zCustomMutation(convexMutation, {
	args: {},
	input: async (ctx) => {
		const { user, org } = await getAuthUser(ctx)
		const tenantId = org.organizationId
		const db = wrapDatabaseWriter({ tenantId }, ctx.db, rlsRules)
		return { ctx: { ...ctx, user, org, tenantId, db }, args: {} }
	},
})
```

> Composition note: Unit 4 introduces Triggers. The auth'd **mutation** that needs triggers must compose the trigger-wrapped writer with the RLS-wrapped writer. Triggers wrap the innermost real writer (`triggers.wrapDB` expects `ctx.db` to be a real `GenericDatabaseWriter`); RLS wraps the result. See Unit 4 + the "VERIFY: RLS + Triggers + zCustom composition" open question — prototype the order before 002 relies on it.

**Patterns to follow:** existing `convex/utils.ts` (preserve `NoOp`, `query`/`mutation` unguarded exports, `includes`, `AuthCtx`, `getAuthUser`, `getOrgFromJwt`). RLS API per installed `rowLevelSecurity.d.ts`.

**Test scenarios:**

- **Happy:** An `authQuery` handler accesses `ctx.tenantId` and `ctx.db.query('tenant').unique()` — returns only the calling org's row (other rows filtered by the `read` predicate).
- **Happy:** TS type of `ctx.tenantId` in an `authQuery` handler is `string` (not `string | undefined`).
- **Edge:** A handler that calls `ctx.db.query('tenant').collect()` without a filter — RLS filters out other tenants' rows; result contains only the tenant's own row.
- **Error:** An `authMutation` attempting `ctx.db.patch` on another tenant's row — the `modify` predicate returns false, RLS throws a write-access error (atomic rollback).
- **Error:** Unauthenticated call — `getAuthUser` throws `Unauthorized: …`; caller receives a Convex error, not a silent empty result.
- **Error:** JWT missing org claims — `getOrgFromJwt` throws with the WorkOS-JWT-template guidance.

**Verification:**

- Outcome: `AuthCtx<'query'>` / `AuthCtx<'mutation'>` include `tenantId: string` and a wrapped `db`.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/utils.ts`.
- Run: `node_modules/.bin/biome check --write convex/utils.ts`.
- Manual smoke: a throwaway `authQuery` returning `ctx.tenantId`, invoked via `bunx convex run` with a valid WorkOS token, returns the org id.

---

### Unit 4 — Triggers infrastructure (`convex/triggers.ts`)

**Goal:** Establish a single Triggers singleton and a `customMutation(rawMutation, customCtx(triggers.wrapDB))` factory so domain mutations (002+) can register derived-counter and cascade-delete callbacks that fire atomically with the write.

**Requirements:** R5

**Dependencies:** Unit 2 (schema defines at least `tenant` so `DataModel` is importable); Unit 3 (RLS-aware `authMutation` finalized before composing it with Triggers).

**Files:**

- `convex/triggers.ts` — Create

**Approach:**
Create a module-level `Triggers<DataModel>` singleton (registrations are cold-start side-effects, so it must not be re-created per call). Export:

- `triggers` — the singleton; 002 calls `triggers.register('messages', cb)` from the feature file that owns the table.
- `mutationWithTriggers` — `customMutation(rawMutation, customCtx(triggers.wrapDB))` for internal/scheduler mutations that need triggers without auth.
- The auth-aware variant is composed in `utils.ts` (or here) by combining the RLS-wrapped writer (Unit 3) with `triggers.wrapDB`. Triggers wrap the innermost real writer.

Trigger registrations themselves (e.g. `threads.messageCount` increment) live in the feature file that owns the table (e.g. `convex/threads.ts` in 002), not in `triggers.ts`, to keep `triggers.ts` a thin registry and avoid circular imports.

**Technical design (directional — corrected: `customCtx(triggers.wrapDB)`, no `.middleware()`):**

```ts
// convex/triggers.ts
import {
	customCtx,
	customMutation,
} from 'convex-helpers/server/customFunctions'
import { Triggers } from 'convex-helpers/server/triggers'
import type { DataModel } from './_generated/dataModel'
import { mutation as rawMutation } from './_generated/server'

// Module-level singleton — trigger registrations are cold-start side effects (see 002)
export const triggers = new Triggers<DataModel>()

// Internal mutation with triggers (scheduler-called fns — no auth needed)
export const mutationWithTriggers = customMutation(
	rawMutation,
	customCtx(triggers.wrapDB),
)

// A registered trigger receives ctx.innerDb (untriggered writer) + a Change:
//   change.operation: 'insert' | 'update' | 'delete'
//   change.oldDoc / change.newDoc  (typed per operation)
// Example (registered in 002, shown here only for the API shape):
//   triggers.register('messages', async (ctx, change) => {
//     if (change.operation === 'insert') {
//       const m = change.newDoc
//       const thread = await ctx.innerDb.get(m.threadId)
//       if (thread) await ctx.innerDb.patch(thread._id, {
//         messageCount: (thread.messageCount ?? 0) + 1,
//         lastMessageAt: m._creationTime,
//       })
//     }
//   })
```

> The auth-aware mutation factory: compose `triggers.wrapDB` (innermost) with `wrapDatabaseWriter` (outermost) inside the `zCustomMutation` `input` in `utils.ts`. Exact order to be confirmed in the "VERIFY: RLS + Triggers + zCustom composition" item — prototype before 002.

**Patterns to follow:** convex-helpers `triggers.ts` doc-comment example (`customMutation(rawMutation, customCtx(triggers.wrapDB))`), verified in installed `.d.ts`. The `messages` counter trigger lives in 002.

**Test scenarios:**

- **Happy:** A `mutationWithTriggers` that inserts a `messages` row (002) fires the trigger synchronously in the same transaction; the parent thread's `messageCount` increments — no second round-trip.
- **Happy:** `triggers.ts` imports successfully (no circular dependency through `_generated/api`; it only imports `_generated/server` + `_generated/dataModel`).
- **Edge:** Two triggers for the same table — both fire (VERIFY ordering before 002).
- **Error:** A trigger callback that throws — the wrapping mutation fails too (atomicity); DB not left partial.

**Verification:**

- Outcome: `triggers.ts` exports `triggers`, `mutationWithTriggers`; no circular import.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/triggers.ts`.
- Run: `node_modules/.bin/biome check --write convex/triggers.ts`.
- Test placeholder: `convex/triggers.test.ts` verifying the module loads (full trigger behaviour tested in 002 once `messages` exists). NOTE: a runtime-behaviour test needs `convex-test` (not installed) or the live dev deployment — see Open Questions.

---

### Unit 5 — Zod validation seam (`convex/validators.ts`)

**Goal:** A shared validators file that (a) exports `tenantIdValidator` (canonical Zod schema for a WorkOS org id), (b) re-exports `zodToConvex` (and `zid`) from `convex-helpers/server/zod4` so downstream files have a single import point on the zod4 variant, and (c) exports a base args object and a metadata-validator helper for per-kind metadata (threads-model.md §4).

**Requirements:** R6

**Dependencies:** Unit 2 (schema exists so `DataModel` is available for typed `zid()` usage downstream). No hard dep on Units 3–4.

**Files:**

- `convex/validators.ts` — Create

**Approach:**
Thin utility file — Zod schemas + re-exports, no Convex functions.

- `tenantIdValidator` — `z.string().min(4).startsWith('org_')` (WorkOS org ids start with `org_`; format guard catches swapped-arg bugs).
- `zodToConvex`, `zid` — re-exported from `convex-helpers/server/zod4` (single import point; zod4 variant always used; `zid` is needed for the typed-FK option in 002).
- `makeMetadataValidator(schema)` — pairs a Zod schema with a loose `v.any()` Convex storage validator plus a runtime `parse`, the per-kind metadata seam.

**Technical design (directional):**

```ts
// convex/validators.ts
import { zid, zodToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'

export { zodToConvex, zid }

// Canonical WorkOS org id validator — catches swapped args early
export const tenantIdValidator = z.string().min(4).startsWith('org_')

// Standard base args for internal/admin functions that take tenantId explicitly.
// (Most external mutations DON'T take tenantId as an arg — they read ctx.tenantId.)
export const tenantArgs = { tenantId: tenantIdValidator }

// Metadata seam: pair a Zod schema with v.any() for loose Convex storage.
// Usage in 002+: const { convexValidator, parse } = makeMetadataValidator(MyMetaSchema)
export function makeMetadataValidator<T extends z.ZodTypeAny>(schema: T) {
	return {
		convexValidator: v.any(), // stored loosely — no schema migration on metadata change
		parse: (raw: unknown) => schema.parse(raw), // parse at edge (mutation arg / webhook ingress)
	}
}
```

**Patterns to follow:** threads-model.md §4 (`zodToConvex` discriminated-union metadata seam); convex-helpers zod4 API already used in `convex/utils.ts`.

**Test scenarios:**

- **Happy:** `tenantIdValidator.parse('org_01H...')` succeeds; `tenantIdValidator.safeParse('user_01H...')` → `success: false`.
- **Happy:** `makeMetadataValidator(someSchema).parse({...})` returns the typed result.
- **Edge:** `tenantIdValidator.parse('')` throws — caught at mutation arg validation before any DB write.
- **Error:** metadata not matching the kind schema — `parse()` throws a Zod error with a field-level message; the calling mutation surfaces it as a typed oRPC error.

**Verification:**

- Outcome: `convex/validators.ts` exports `tenantIdValidator`, `tenantArgs`, `zodToConvex`, `zid`, `makeMetadataValidator`.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/validators.ts`.
- Run: `node_modules/.bin/vp test run convex/validators.test.ts` (pure-Zod unit test — needs no Convex runtime, so no `convex-test` dependency).
- Run: `node_modules/.bin/biome check --write convex/validators.ts`.

---

### Unit 6 — `tenant` CRUD mutations and query (foundation fns)

**Goal:** The minimal Convex functions that domain code (002+) and the oRPC layer call to read/write the `tenant` config row: `tenant.ensure` (internal upsert, called on org provision), `tenant.get` (authQuery), `tenant.patch` (authMutation, partial update + `updatedAt` stamp).

**Requirements:** R2, R3 (exercises the full tenant-scoped RLS path end-to-end)

**Dependencies:** Units 2, 3, 4, 5.

**Files:**

- `convex/tenant.ts` — Create
- `convex/tenant.test.ts` — Create (integration test stubs)

**Approach:**
`get`/`patch` use `authQuery`/`authMutation` and read `tenantId` from `ctx.tenantId` — never from client args. `ensure` is an `internalMutation` called from the WorkOS org lifecycle webhook and receives `organizationId` as a trusted internal arg (it runs **before** any tenant row exists, so it uses the raw `internalMutation` `ctx.db`, not the RLS-wrapped one).

Upsert: `ctx.db.query('tenant').withIndex('by_tenant', q => q.eq('tenantId', organizationId)).unique()` — if null insert, else return existing `_id`. Enforces one-row-per-tenant.

`ensure` uses zod args via the project's `internalMutation` pattern. NOTE: `convex/utils.ts` exports `mutation`/`query` (zod-customized, non-auth) but not an `internalMutation`/`internalQuery` zod variant — either import `internalMutation` from `_generated/server` with plain `v.*` args, or define a zod internal variant. Use `mutationWithTriggers` from `convex/triggers.ts` if `ensure` should fire triggers (it doesn't need to here).

**Technical design (directional):**

```ts
// convex/tenant.ts
import { internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { z } from 'zod'
import { authMutation, authQuery } from './utils'

// Called by the WorkOS org.created webhook (internal — not exposed to client).
// Uses raw internalMutation ctx.db: runs before the tenant row / RLS context exists.
export const ensure = internalMutation({
	args: { organizationId: v.string() },
	handler: async (ctx, { organizationId }) => {
		const existing = await ctx.db
			.query('tenant')
			.withIndex('by_tenant', (q) => q.eq('tenantId', organizationId))
			.unique()
		if (existing) return existing._id
		return ctx.db.insert('tenant', {
			tenantId: organizationId,
			updatedAt: Date.now(),
		})
	},
})

// Public read — calling org's config row (or null if not yet provisioned).
// ctx.db is RLS-wrapped, so .unique() already only sees this tenant's row.
export const get = authQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query('tenant')
			.withIndex('by_tenant', (q) => q.eq('tenantId', ctx.tenantId))
			.unique(),
})

// Partial update — only the calling org's row; updatedAt always stamped.
export const patch = authMutation({
	args: {
		timezone: z.string().optional(),
		branding: z.any().optional(),
		aiSettings: z.any().optional(),
		defaults: z
			.object({
				phone: z.string().optional(),
				sms: z.string().optional(),
				whatsapp: z.string().optional(),
				elevenlabs: z.string().optional(),
			})
			.optional(),
		// phones/whatsapps/widgets/mcpServers updated via dedicated mutations in later plans
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('tenant')
			.withIndex('by_tenant', (q) => q.eq('tenantId', ctx.tenantId))
			.unique()
		if (!row)
			throw new Error(
				`Tenant ${ctx.tenantId} not provisioned — call ensure first`,
			)
		await ctx.db.patch(row._id, { ...args, updatedAt: Date.now() })
	},
})
```

Wire `internal.tenant.ensure` into the WorkOS `organization.created` lifecycle handler in `convex/auth.ts` (alongside the existing org-creation side effects). VERIFY the exact event hook name in `convex/auth.ts` during implementation (the original plan referenced `internal.workos.ensureCustomerRoleOnOrg`; confirm the actual handler/scheduler call site before editing).

**Patterns to follow:** convex-helpers `zCustomMutation` arg validation (Zod schemas in `args`); `authQuery` pattern from `convex/utils.ts`; internal-mutation pattern from the existing org-lifecycle code in `convex/auth.ts`.

**Test scenarios:**

- **Happy (ensure):** org.created fires → `ensure` inserts one row → a second `ensure` with the same `organizationId` returns the existing `_id` without inserting a duplicate.
- **Happy (get):** valid WorkOS JWT returns the tenant config; a second org's token returns null (RLS scope).
- **Happy (patch):** `patch({ timezone: 'America/New_York' })` updates only `timezone` + stamps `updatedAt`.
- **Edge (patch):** `patch` before `ensure` — throws a clear error rather than creating a partial row.
- **Error:** unauthenticated `get` — `authQuery` throws before any DB access.
- **Integration:** the `organization.created` handler in `convex/auth.ts` calls `ensure`; `get` immediately after returns the provisioned row.

**Verification:**

- Outcome: `tenant.get` returns `Doc<'tenant'> | null`; `tenant.patch` is type-safe against `DataModel['tenant']` fields.
- Run: `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/tenant.ts`.
- Run: `node_modules/.bin/vp test run convex/tenant.test.ts`. NOTE: runtime tests need a Convex test harness. `convex-test` is NOT installed — either `bun add -d convex-test` first, or write the integration check as a `bunx convex run` smoke against the dev deployment. Keep `tenant.test.ts` a stub (module-loads + type assertions) if the harness is deferred.
- Run: `node_modules/.bin/biome check --write convex/tenant.ts`.

---

## System-Wide Impact

- **All subsequent plans (002–010) depend on this plan being merged and deployed first.** The components in `convex/convex.config.ts` are referenced by name in 002–009; absent them, codegen fails.
- **`ctx.tenantId` becomes the universal discriminator.** Every domain function across 002–009 reads `ctx.tenantId` from the RLS-aware ctx, never from client args.
- **RLS rules registry grows per plan.** Every new table in 002+ must add a `read`/`modify`/`insert` entry to `rlsRules` in `convex/utils.ts` (or the registry will default-allow that table — consider `defaultPolicy: 'deny'` once all tables carry `tenantId`; VERIFY no helper/component table without a `tenantId` field breaks under `deny`).
- **Triggers infrastructure gates 002.** The `messages` trigger registers against the singleton in `convex/triggers.ts`. If Unit 4 is incomplete, 002's registration has nowhere to land.
- **oRPC layer:** the `org` middleware in `src/server/rpc/init.ts` reads `organizationId` from the session and gates on it. Convex domain fns re-derive it from the JWT independently — both agree by construction. No oRPC change required here; future tenant CRUD routes call `api.tenant.get` / `api.tenant.patch` via the Convex client.
- **WorkOS `organization.created`:** Unit 6 adds `internal.tenant.ensure` to the org-creation handler in `convex/auth.ts` — a small additive change.
- **`convex/_generated/`:** every unit touching `schema.ts` / `convex.config.ts` needs a `bunx convex dev` codegen run; do not commit generated files.

## Risks & Dependencies

| Risk                                                                                  | Likelihood | Impact                          | Mitigation                                                                                                             |
| ------------------------------------------------------------------------------------- | ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A `@convex-dev/*` component version is incompatible with `convex@1.41.0`              | Medium     | High — codegen fails            | Check each component's `peerDependencies` before `bun add`; pin to a compatible version                                |
| RLS rule semantics misunderstood (predicate filter vs query rewrite)                  | Medium     | High — false sense of isolation | Rules are per-doc predicates: reads filter, writes throw. Confirm with the read/modify/insert test scenarios in Unit 3 |
| Triggers + RLS + `zCustomMutation` composition order breaks types or transactionality | Medium     | Medium — Unit 4/3 rework        | Prototype `wrapDatabaseWriter` ∘ `customCtx(triggers.wrapDB)` in `bunx convex dev` before 002 (see VERIFY item)        |
| `convex-test` not installed → integration tests can't run                             | Medium     | Low                             | `bun add -d convex-test`, or smoke via `bunx convex run`; keep test files as stubs until then                          |
| `tenantId` missing in WorkOS JWT for some SSO tokens                                  | Low        | High — every authQuery throws   | Already handled: `getOrgFromJwt` throws with clear JWT-template guidance; test in staging                              |
| Circular import in `triggers.ts`                                                      | Low        | Medium — build fails            | Import only `_generated/server` + `_generated/dataModel`; never `_generated/api`                                       |
| Polymorphic-FK decision deferred creates friction in 002                              | Medium     | Low                             | Document the tradeoff in 002; flagged in Open Questions                                                                |
| Pre-existing baseline TypeScript errors grow                                          | Low        | Medium                          | Run `node_modules/.bin/tsc --noEmit` before/after each unit; diff the error count                                      |

## Documentation & References

**Install commands (verified package names; pin at install time to the latest `^` compatible with `convex@1.41.0`):**

```bash
bun add @convex-dev/workflow @convex-dev/workpool @convex-dev/rate-limiter \
        @convex-dev/aggregate @convex-dev/action-cache @convex-dev/migrations
# Already installed (do NOT re-add): convex@1.41.0, convex-helpers@0.1.119,
#   @convex-dev/workos-authkit@0.2.7, @convex-dev/resend, zod@^4
# Test harness, if running runtime integration tests:
bun add -d convex-test     # NOT currently installed
```

**Convex components (canonical docs verified 2026-06):**

- `@convex-dev/workflow` — https://www.npmjs.com/package/@convex-dev/workflow · https://github.com/get-convex/workflow · https://www.convex.dev/components/workflow · https://docs.convex.dev/understanding/workflow
- `@convex-dev/workpool` — https://www.npmjs.com/package/@convex-dev/workpool · https://github.com/get-convex/workpool · https://www.convex.dev/components/workpool (registered as named instances: `app.use(workpool, { name })`)
- `@convex-dev/rate-limiter` — https://www.npmjs.com/package/@convex-dev/rate-limiter · https://github.com/get-convex/rate-limiter · https://www.convex.dev/components/rate-limiter
- `@convex-dev/aggregate` — https://www.npmjs.com/package/@convex-dev/aggregate · https://github.com/get-convex/aggregate · https://www.convex.dev/components/aggregate (`{ name }` required only for multiple instances)
- `@convex-dev/action-cache` — https://www.npmjs.com/package/@convex-dev/action-cache · https://github.com/get-convex/action-cache · https://www.convex.dev/components/action-cache
- `@convex-dev/migrations` — https://www.npmjs.com/package/@convex-dev/migrations · https://github.com/get-convex/migrations · https://www.convex.dev/components/migrations

**Convex core / components general:**

- Defining components & `defineApp`/`app.use` — https://docs.convex.dev/components
- Schemas & validators (`defineTable`, `v.*`) — https://docs.convex.dev/database/schemas · https://docs.convex.dev/api/modules/values

**convex-helpers (installed 0.1.119 — APIs confirmed against installed `.d.ts`):**

- Package — https://www.npmjs.com/package/convex-helpers · https://github.com/get-convex/convex-helpers/tree/main/packages/convex-helpers
- Row-Level Security (`wrapDatabaseReader`/`wrapDatabaseWriter`, `Rules` with `read`/`modify`/`insert`) — https://github.com/get-convex/convex-helpers#row-level-security — also: installed `node_modules/convex-helpers/server/rowLevelSecurity.d.ts`
- Triggers (`new Triggers<DataModel>()`, `triggers.register`, `customMutation(rawMutation, customCtx(triggers.wrapDB))`) — https://stack.convex.dev/triggers · https://github.com/get-convex/convex-helpers#triggers — installed `node_modules/convex-helpers/server/triggers.d.ts`
- Custom functions (`customCtx`, `customMutation`, `NoOp`) — https://github.com/get-convex/convex-helpers#custom-functions — installed `node_modules/convex-helpers/server/customFunctions.d.ts`
- Zod (zod4 variant: `zCustomQuery`/`zCustomMutation`, `zodToConvex`, `zid`) — https://github.com/get-convex/convex-helpers#zod-validation — installed `node_modules/convex-helpers/server/zod4.d.ts`

**WorkOS (auth context — reference only, no change in this plan):**

- AuthKit + Convex — https://workos.com/docs · `@convex-dev/workos-authkit@0.2.7` (installed) · https://github.com/get-convex/workos-authkit
- JWT template (must include `organization.organizationId`) — https://workos.com/docs/user-management/sessions/jwt-templates

**Design docs (authoritative WHAT):**

- `docs/rebuild-architecture.md` §1 tenant table (lines 43–119), components list (`@convex-dev/rate-limiter` ~line 249), RLS rationale, Pipes/Vault credential model.
- `docs/threads-model.md` §2 (messages polymorphic FK), §4 (zodToConvex metadata seam), §6 (trigger sketch for messageCount/lastMessageAt).

**agent.io baseline files (verified current state):**

- `convex/convex.config.ts`, `convex/schema.ts`, `convex/utils.ts`, `convex/auth.config.ts`, `convex/auth.ts`.

**Sibling plans (cross-reference):**

- `2026-06-17-002-*` — conversation substrate (threads/calls/messages); consumes `tenant.get`, the Triggers singleton, RLS-aware ctx; settles the polymorphic-FK decision; adds `rlsRules` entries.
- `2026-06-17-006-*` — batch dialing (workflow/workpool/rate-limiter runtime usage).
- `2026-06-17-007-*` — billing (`@convex-dev/polar` component; not registered here).
- `2026-06-17-009-*` — analytics (aggregate/action-cache runtime usage).
- `2026-06-17-010-*` — data migration (`@convex-dev/migrations` runtime usage).

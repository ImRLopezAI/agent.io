---
title: 'feat: Per-tenant data migration from the legacy Convex app'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §8, docs/threads-model.md §5
---

# feat: Per-tenant data migration from the legacy Convex app

## Overview

Migrate each tenant independently from the legacy Convex deployment (the
`/Users/angel/dev/agentio` app) into the new agent.io platform. Migration is
executed per-tenant — no big bang. The legacy app remains live and is the
fallback until a tenant is fully verified on the new platform.

> **CRITICAL ARCHITECTURE NOTE (corrected):** `@convex-dev/migrations` walks
> tables **in the deployment it runs in** — its `migrateOne(ctx, doc)` reads
> documents from the _current_ deployment's own schema (`_generated/schema`).
> The legacy tables (`companies`, `calls`, `contacts`, …) live in a **separate
> Convex deployment** (the legacy app) and **do not exist in the new
> deployment's schema**. Therefore the cross-deployment read is the primary
> mechanism: legacy data is pulled into the new deployment via a read-only
> `ConvexHttpClient` (initialized with `LEGACY_CONVEX_URL` + a deploy key)
> inside Convex actions, then written with idempotent `insert`/`patch`
> mutations. `@convex-dev/migrations` is used for **post-import transforms that
> operate on the NEW tables** (e.g. backfilling `sequence`, repointing FKs,
> dropping the scratch map), NOT for walking legacy tables directly. Every code
> sketch below uses cross-deployment fetch + idempotent insert; the
> `migrations.define({ table, migrateOne })` form is reserved for new-table
> passes.

Six concerns drive the full cutover:

1. Provision the tenant in WorkOS and create its `tenant` config row.
2. Map legacy domain data (companies → tenant, contacts, calls/widgetSessions/
   messages → threads/calls/messages, surveys, KB) into the new schema.
3. Move secrets into WorkOS Vault/Pipes — never copy tokens as plaintext.
4. Reconnect channels (per-tenant webhook routes + Meta per-WABA override).
5. Verify the tenant end-to-end on the new platform.
6. Decommission the tenant on the legacy app.

## Problem Frame

The legacy app carries ~50 Convex tables, plaintext provider tokens embedded in
company documents, scattered conversation data across seven storage locations,
and a `calls.messages[]` hot-array that hits OCC and the 1 MiB doc limit
(threads-model.md §1). None of these can be migrated as-is; they must be mapped
to the new schema's clean shapes. Simultaneously, secrets (HubSpot
`hubspot.accessToken`, Gmail `gmail.refreshToken`, Twilio `twilio.authToken`,
WhatsApp `managementToken`/`messagingToken`) must move into Vault/Pipes before
the legacy rows are decommissioned — this is the highest-risk step.

## Requirements Trace

- **R1** — Per-tenant WorkOS provisioning (org, members, roles, module feature
  flags) must complete before any domain data migration starts for that tenant.
- **R2** — `companies` → `tenant` config row; embedded channel arrays
  (`phones[]`, `whatsapps[]`, `widgets[]`) from legacy normalized tables.
  `companyId` → `tenantId` (WorkOS org id) mapping is the universal key.
- **R3** — `contacts` migrated with `tenantId`; `companyId` FK replaced by
  `tenantId` string; custom field metadata preserved.
- **R4** — Legacy call/conversation data mapped: voice `calls` (type=voice) →
  new `calls`; `calls` (type=chat, WhatsApp) → `threads`; `calls.messages[]` +
  `transcripts` + `widgetSessions.transcript[]` → `messages` rows;
  `smsMessages`/`whatsappMessages` delivery status merged onto `messages`.
- **R5** — Surveys and `surveyResponses` migrated; `callId` FK repointed to new
  `calls._id`; `threadId` added where the source was a chat call.
- **R6** — `knowledgeBaseDocs` + `knowledgeBaseHistory` migrated;
  `elevenLabsDocId` (externalId) preserved; `companyId` → `tenantId`.
- **R7** — All plaintext secrets (Twilio creds, Meta tokens, HubSpot tokens,
  Gmail refresh tokens) moved to WorkOS Vault or Pipes; the `tenant` row stores
  only Vault object IDs (or nothing, for Pipes-managed connections).
- **R8** — Per-tenant webhook routes registered; Meta per-WABA callback override
  (`override_callback_uri`) set to `/webhooks/whatsapp/{tenantId}` for each
  WhatsApp account.
- **R9** — Cutover verified (round-trip inbound message, ElevenLabs agent
  resolves, Polar subscription visible) before decommission.
- **R10** — Migration is idempotent per tenant; safe to re-run without
  duplicating rows. Idempotency is enforced by existence-checks on stable keys
  before every `insert`, plus `@convex-dev/migrations` cursor checkpointing for
  new-table transform passes.

## Scope Boundaries

In scope:

- WorkOS org + member + role provisioning for each tenant.
- WorkOS Feature Flag targeting for module access (maps from `companyModules`).
- All legacy domain data listed in threads-model.md §5 migration mapping.
- Vault/Pipes migration of every plaintext credential in `companies` /
  `companyWhatsAppAccounts`.
- Channel reconnection (webhook routes + Meta WABA override).
- Verification checklist and decommission steps per tenant.
- Cross-deployment legacy read client + import actions in `convex/migrations/`.
- `@convex-dev/migrations` runner for new-table transform passes.

### Deferred to Separate Tasks

- Polar customer/subscription creation for the migrated tenant (phase 007 owns
  billing bootstrap; this plan creates the `tenant` row and signals readiness).
- ElevenLabs agent re-sync after migration (phase 005 owns agent CRUD).
- Aggregate component seeding for historical analytics (phase 009 owns
  `@convex-dev/aggregate` setup; this plan migrates raw records only).
- `stagedContacts` (import-in-progress rows) — not migrated; tenants re-import
  after cutover.
- `dailyAnalytics` / `widgetDailyAnalytics` / `analyticsCache` / `companyStats`
  — derived data; phase 009 will re-derive from migrated raw records.
- `notifications` / `logs` — operational noise; not migrated.
- `metaUserEvents` — Meta deauthorize/data-deletion audit trail; migrate only
  open/in-progress rows if needed; deferred by default.

## Context & Research

### Relevant Code and Patterns

**Legacy source** (read-only via cross-deployment client during migration):

- `convex/schema.ts` (legacy, `/Users/angel/dev/agentio/convex/schema.ts`) —
  full table definitions; VERIFIED key legacy shapes used below:
  - `companies` — `apiKey`, `timezone`, `branding`, `hubspot.accessToken`,
    `gmail.refreshToken`, `twilio.{accountSid,authToken}`, `status`.
  - `companyPhoneNumbers` — `phoneNumberId`, `phoneNumber`, `label`, `isDefault`
    (NO `capabilities`/`telephonyMode` — those are new-schema defaults). Index:
    `by_company`.
  - `companyWhatsAppAccounts` — `accountId` (Meta phone_number_id), `wabaId`,
    `managementToken`, `messagingToken`, `phoneNumber`, `name`, `label`,
    `isDefault`, `metaUserId`, `tokenStatus`. Index: `by_company`.
  - `widgetConfigs` — `token`, `enabledAgentIds`, `allowVoice`, `allowText`,
    `allowWhatsApp`, `branding`, `welcomeMessage`, `isActive`. Index:
    `by_company`.
  - `contacts` — `companyId` (optional!), `phone`, `name`, `tags`, `archived`,
    `groupName`, `metadata`, `createdAt`.
  - `calls` — `conversationId`, `platform` (`twilio|whatsapp`), `type`
    (`voice|chat`), `serviceType`, `mediaFiles[]`, `messages[]` (hot array),
    `batchId`, `contactId`, `companyId` (optional).
  - `widgetSessions` — `widgetConfigId`, `companyId`, `agentId`, `mode`
    (`voice|text`), `conversationId`, `transcript[]`.
  - `transcripts`, `smsMessages` (`twilioMessageSid`), `whatsappMessages`
    (`metaMessageId`, indexed `by_meta_message_id`), `toolCalls`,
    `knowledgeBaseDocs` (`elevenLabsDocId`), `knowledgeBaseHistory`, `surveys`,
    `surveyResponses` (`callId`), `batches` (`callType`: `normal|whatsapp|sms`),
    `scripts`, `smsTemplates`, `batchConfigurations`.
- `convex/sync.ts` (legacy) — the 7-step lookup chain and `callDedup` logic the
  new schema eliminates; reference for understanding legacy call/message shapes.

**New app substrate** (migration writes into these):

- `convex/schema.ts` (agent.io) — filled by phases 001–009.
- `convex/utils.ts` (agent.io) — VERIFIED: exports `authQuery`/`authMutation`
  (convex-helpers `zCustomQuery`/`zCustomMutation` from
  `convex-helpers/server/zod4`, injecting `{ user, org }`), and the internal
  `getOrgFromJwt` (reads `identity.organization.organizationId` ?? `org_id`).
  Migration mutations follow the `tenantId = organizationId` pattern; note
  migration internal functions are `internalMutation`/`internalAction` (NOT
  `authMutation`, which requires a signed-in user identity).
- `convex/auth.ts` (agent.io) — VERIFIED exists; exports `authKit`
  (`@convex-dev/workos-authkit`). Not directly used by migration code.
- `convex/convex.config.ts` (agent.io) — VERIFIED currently registers
  `@convex-dev/workos-authkit` + `@convex-dev/resend`. `@convex-dev/migrations`
  is added in this phase.
- `convex/auth.config.ts` (agent.io) — VERIFIED two `customJwt` providers (SSO
  issuer `https://api.workos.com/` + user_management issuer
  `https://api.workos.com/user_management/${clientId}`).

**Design doc sections**:

- `docs/rebuild-architecture.md §1` — WorkOS is the system of record; no
  `orgs`/`members` mirror; `tenant` table is app config only.
- `docs/rebuild-architecture.md §2` — Pipes (OAuth) vs Vault (static/PII): OAuth
  → Pipes, static credential → Vault.
- `docs/rebuild-architecture.md §5` — webhook ingress: tenant from the route,
  not a lookup table; Meta WABA per-tenant callback override.
- `docs/rebuild-architecture.md §8` — per-tenant cutover strategy; phases.
- `docs/threads-model.md §1` — legacy pain: 7-step lookup, dedup cron, OCC.
- `docs/threads-model.md §2` — new `threads`/`calls`/`messages` schema (exact
  field shapes and indexes used in Unit 4).
- `docs/threads-model.md §5` — migration mapping table (the canonical map).
- `docs/threads-model.md §7` — surveys over threads & calls (Unit 5 mapping).
- `docs/domain-erd.md` — OBSOLETE legacy snapshot; the as-was reference for all
  legacy table shapes (kept only for this migration).

**oRPC layer** (agent.io, VERIFIED — contract-first):

- `src/server/rpc/init.ts` —
  `os = implement(contract).$context<RpcContextType>()`; middleware ladder
  `auth` → `admin` (checks `context.session.role === 'admin'`, throws
  `errors.NO_ADMIN_ROLE()`) → `org` (adds `organizationId`). Context carries
  `workOs` (the `@/lib/work-os` client) and `session` (from
  `@workos/authkit-tanstack-react-start` `getAuth()`).
- `src/server/rpc/contracts/{base.ts,errors.ts,*.contract.ts,index.ts}` and
  `src/server/rpc/routes/*.router.ts` — naming convention is `*.contract.ts`
  (contract) + `*.router.ts` (implementation), assembled in `contracts/index.ts`
  and the router index. Migration routes follow this convention.
- `src/lib/work-os.ts` — VERIFIED exports `workOs = new WorkOS({ ... })`.

### WorkOS Management API (VERIFIED against `@workos-inc/node` 8.13.0)

> **Runtime correction:** `@workos-inc/node` ships a dedicated **`convex` export
> condition** (`package.json` `exports["."].convex → ./lib/index.worker.mjs`).
> The SDK therefore runs in the **Convex V8 runtime** — WorkOS Management API
> calls do **NOT** require a `"use node"` action. Use plain `internalAction`
> (V8). (The `"use node"` requirement applies only to genuinely Node-only deps,
> e.g. the AI SDK / MCP-stdio — not here. Keep the V8-runtime spike + fallback
> noted in Risks as a safety net for the cross-deployment `ConvexHttpClient`,
> which is the real runtime unknown.)

Migration uses the `WorkOS` client (`@/lib/work-os` in oRPC, or
`new WorkOS(process.env.WORKOS_API_KEY!)` in Convex actions) for — VERIFIED
method names/signatures:

- `organizations.createOrganization({ name })` → `Promise<Organization>`
  (`org.id` is the `tenantId`).
- `userManagement.createOrganizationMembership({ organizationId, userId, roleSlug })`
  — adds an **existing** WorkOS user to the org.
- `userManagement.sendInvitation({ email, organizationId, roleSlug })` — invites
  a user who does not yet exist (triggers a WorkOS invitation email).
- `userManagement.listOrganizationMemberships({ organizationId })` — verify
  members present.
- `featureFlags.addFlagTarget({ slug, targetId })` / `removeFlagTarget` /
  `enableFeatureFlag(slug)` / `disableFeatureFlag(slug)` /
  `getFeatureFlag(slug)` — per-org module access. **NOTE:** there is **NO**
  `createFeatureFlagVariation`; the flag _slug_ is created once in the WorkOS
  Dashboard, then targeted per-org via
  `addFlagTarget({ slug, targetId: orgId })`.
- Vault: `vault.createObject({ name, value, context })` → `ObjectMetadata`
  (`.id` is the Vault object id); read via `vault.readObjectByName(name)` or
  `vault.readObject({ id })`; update via `vault.updateObject(...)`. **NOTE:**
  there is **NO** `vault.createSecret(orgId, {...})` — the legacy method name in
  the original plan was wrong. `context` is a `KeyContext` (key-value object,
  e.g. `{ tenantId }`) used for envelope-encryption scoping.
- Pipes: `pipes.getAccessToken({ provider, ... })` — fetch a fresh OAuth access
  token for a connected provider. **NOTE:** there is **NO**
  `pipes.listConnections(orgId)`; Pipes connections are managed in the WorkOS
  Dashboard / via the Pipes widget. "Connection exists" is confirmed by
  attempting `getAccessToken` (success = connected) or surfaced as a manual
  cutover-checklist item.

### @convex-dev/migrations component pattern (VERIFIED against the component README)

> Used ONLY for transform passes over **new** tables (FK repoint, sequence
> backfill, scratch-map cleanup) — NOT for walking legacy tables (those live in
> a different deployment; see the Overview note).

```ts
// convex/convex.config.ts (add)
import { defineApp } from 'convex/server'
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config'
import resend from '@convex-dev/resend/convex.config'
import migrations from '@convex-dev/migrations/convex.config' // add
const app = defineApp()
app.use(workOSAuthKit)
app.use(resend)
app.use(migrations) // add
export default app

// convex/migrations.ts (the Migrations instance + runner)
import { Migrations } from '@convex-dev/migrations'
import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
export const migrations = new Migrations<DataModel>(components.migrations)
export const run = migrations.runner()

// a transform pass over a NEW table:
export const backfillThreadCounts = migrations.define({
	table: 'threads',
	batchSize: 50,
	migrateOne: async (ctx, thread) => {
		// ctx.db reads/writes the CURRENT deployment's tables only
	},
})
```

Run via CLI
`bunx convex run migrations:run '{fn: "migrations:backfillThreadCounts"}'` (or
the named export directly: `bunx convex run migrations:backfillThreadCounts`),
or programmatically
`await migrations.runSerially(ctx, [internal.migrations.backfillThreadCounts])`.
The component stores a cursor in its own table, runs in batches, and resumes
from the last checkpoint on re-run. Supports `{dryRun: true}` and
`{reset: true}`.

## Key Technical Decisions

**Decision: Cross-deployment read + idempotent insert is the primary import
mechanism; `@convex-dev/migrations` is used for new-table transform passes
only.** Rationale (corrected): the legacy tables do not exist in the new
deployment's schema, so `migrations.define({ table: 'companies' })` cannot walk
them. Each import action pages legacy rows via a read-only `ConvexHttpClient`
(`LEGACY_CONVEX_URL` + deploy key) and writes them with existence-checked
inserts. `@convex-dev/migrations` then runs _over the new tables_ for FK
repoints (e.g. `surveyResponses.callId/threadId`), `sequence` backfills, and the
scratch-map drop.

**Decision: Build a `companyId → tenantId` lookup map as part of Unit 1; store
it in a transient `_migrationMap` table (dropped by a final cleanup migration
after all tenants migrate).** Rationale: import actions need to rewrite every
`companyId` FK to a `tenantId` string. A pre-built in-Convex map avoids per-row
WorkOS API calls during the hot import loop. Populated by Unit 1, consumed by
Units 2–5.

**Decision: Secrets move to Vault/Pipes in a dedicated Convex action BEFORE the
legacy company data is written; the `tenant` row stores only Vault object IDs
(or nothing for Pipes-managed tokens).** Rationale: the design doc (§2) names
plaintext tokens in `companies` as "the single worst property of the legacy
schema." The Vault write (`vault.createObject`) is auditable; if it fails, the
migration aborts for that tenant before secrets land anywhere in plaintext.

**Decision: `calls` (type=chat) and `widgetSessions` (mode=text) migrate to
`threads`; `calls` (type=voice) and `widgetSessions` (mode=voice) migrate to
`calls`; `calls.messages[]` + `transcripts` + `widgetSessions.transcript[]`
migrate to `messages` rows with `sequence` assigned from array index / turn
order.** Rationale: this follows threads-model.md §5 exactly. Sequence numbers
derived from array index are monotonic within each parent and sufficient for
ordered render (`by_parent_sequence` index).

**Decision: `smsMessages` / `whatsappMessages` delivery rows are NOT migrated as
separate `messages` inserts; delivery status is merged onto the corresponding
`messages` row (matched by `providerMessageId`) during the messages pass.**
Rationale: avoids duplicate rows. New `messages.deliveryStatus`
(`by_provider_message` index) is the correct home. Legacy match keys:
`smsMessages.twilioMessageSid` and `whatsappMessages.metaMessageId`.

**Decision: Meta per-WABA callback override is set programmatically via the Meta
Graph API inside a Convex action during channel reconnection.** Rationale: per
rebuild-architecture.md §5, each WhatsApp account needs its own callback.
Override is `POST /<WABA_ID>/subscribed_apps` with body
`{ override_callback_uri, verify_token }` (CORRECTED key name — was
`callback_url`), using a token with `whatsapp_business_management` scope (legacy
`managementToken`, now fetched from Vault).

## Open Questions

**Resolved:**

- WorkOS `customJwt` providers — already in `convex/auth.config.ts` (two
  providers, VERIFIED).
- Org claims pattern — `getOrgFromJwt` in `convex/utils.ts` is the canonical
  extraction; migration internal fns use `internalMutation`/`internalAction`
  (not `authMutation`) since there is no signed-in identity in a server job.
- Convex runtime for WorkOS SDK — runs in **V8** via the SDK's `convex` export
  condition; no `"use node"` needed for WorkOS/Meta-fetch calls.

**Deferred to Implementation:**

- VERIFY: exact WorkOS Feature Flag **slugs** for each legacy
  `companyModules.module` value (e.g. `"whatsapp"`, `"analytics"`, `"surveys"`)
  — flags must be created in the WorkOS Dashboard before `addFlagTarget` runs;
  confirm slug strings.
- VERIFY: whether legacy `companies.apiKey` moves to Vault or is regenerated
  fresh (recommend regenerate; surface as a cutover-checklist step).
- VERIFY: WorkOS Management API rate limits during bulk org provisioning; add
  `@convex-dev/rate-limiter` if needed (already installed —
  `node_modules/ @convex-dev/rate-limiter` present).
- VERIFY: cross-deployment read mechanism — confirm a read-only Convex deploy
  key for the legacy deployment + that `ConvexHttpClient` from `convex/browser`
  runs inside a V8 `internalAction` (it makes outbound HTTPS; if blocked, fall
  back to a `"use node"` action). This is the real runtime unknown for this
  phase.
- VERIFY: whether `hubspotBookings` / `gmailEmails` migrate as `messages`
  (side-record referencing thread/call) or are archived as JSON in Convex
  Storage. Default: HubSpot booking data as `messages` metadata; Gmail emails as
  `messages` with `contentType: 'text'` + `metadata.kind: 'email'` (note: the
  `messages.contentType` union in threads-model.md §2 has NO `"email"` member —
  use `"text"` + `metadata.kind="email"`, matching §4's email metadata shape).
- VERIFY: exact `override_callback_uri` request shape against the live Meta doc
  (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/override) —
  WebFetch returned only nav chrome; the key name `override_callback_uri` and
  endpoint `POST /<WABA_ID>/subscribed_apps` are confirmed by secondary sources
  but confirm the token scope and any `verify_token` requirement at impl time.

## Output Structure

```
convex/
  convex.config.ts           Modify — add @convex-dev/migrations
  migrations.ts              Create — Migrations instance + runner (new-table passes)
  migrations/
    _legacyClient.ts         Create — read-only ConvexHttpClient(LEGACY_CONVEX_URL)
    _migrationMap.ts         Create — transient companyId→tenantId map (table + helpers)
    index.ts                 Create — runTenantMigration orchestration action
    workos.ts                Create — WorkOS provisioning action (Unit 1)
    tenant.ts                Create — companies → tenant + channel embeds (Unit 2)
    secrets.ts               Create — Vault/Pipes secret migration action (Unit 3)
    contacts.ts              Create — contacts import (companyId → tenantId)
    conversations.ts         Create — calls+widgetSessions → threads+calls
    messages.ts              Create — messages[] + transcripts → messages rows
    surveys.ts               Create — surveys + surveyResponses
    kb.ts                    Create — knowledgeBaseDocs + knowledgeBaseHistory
    documents.ts             Create — scripts, smsTemplates, batchConfigurations
    channels.ts              Create — webhook route registration + Meta override
    verify.ts                Create — verification checklist action
schema.ts                    Modify — add _migrationMap table (transient)
src/server/rpc/
  contracts/migration.contract.ts   Create — start/status/verify/decommission contract
  routes/migration.router.ts        Create — admin-gated oRPC implementation
```

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────┐
│  Owner triggers per-tenant migration via oRPC (admin middleware) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ ctx.runAction(internal.migrations.index.runTenantMigration)
              convex/migrations/index.ts
              runTenantMigration (V8 internalAction)
                            │ reads legacy via _legacyClient (ConvexHttpClient)
        ┌───────────────────┼────────────────────┐
        │                   │                    │
   Unit 1: WorkOS      Unit 3: secrets       Unit 2: tenant +
   provision org +     → Vault/Pipes         channel embeds
   feature flags +     (before data          (idempotent insert)
   _migrationMap       writes)                    │
                                       ┌───────────┤
                                       │     │     │
                                  contacts convs surveys
                                  (U4)    +msgs   +KB (U5)
                                            │
                                    Unit 6: channels
                                    reconnect + Meta override
                                            │
                                    Unit 7: verify + decommission
```

## Implementation Units

---

### Unit 1 — WorkOS Tenant Provisioning + Migration Map

**Goal:** For a given legacy `companyId`, create a WorkOS organization (or
confirm an existing one), invite/sync members with roles, target module feature
flags, and write a `_migrationMap` entry mapping `companyId → workosOrgId`.
Prerequisite for all other units.

**Requirements:** R1, R2 (WorkOS side only).

**Dependencies:** `convex/auth.config.ts` (WorkOS providers wired);
`@workos-inc/node` already a dep (8.13.0) via existing WorkOS auth; cross-
deployment legacy read client (`_legacyClient.ts`). No prior phase dependency.

**Files:**

- `convex/convex.config.ts` — Modify: add `app.use(migrations)`.
- `convex/migrations.ts` — Create: `Migrations` instance + `runner()`.
- `convex/migrations/_legacyClient.ts` — Create: read-only `ConvexHttpClient`.
- `convex/migrations/_migrationMap.ts` — Create: scratch table + helpers.
- `convex/migrations/workos.ts` — Create: provisioning action.
- `convex/migrations/index.ts` — Create: orchestrator (skeleton, grow per unit).
- `schema.ts` — Modify: register the `_migrationMap` table.

**Approach:**

1. Add `@convex-dev/migrations` to `convex.config.ts` and create the
   `migrations.ts` instance (`new Migrations(components.migrations)` +
   `migrations.runner()`).
2. Define `_migrationMap` table:
   `{ companyId, tenantId, provisionedAt, status, notes? }` with `by_company`
   (unique) and `by_status` indexes. Scratch table; dropped by a final cleanup
   migration after all tenants are `'decommissioned'`.
3. The provisioning action (V8 `internalAction`) reads the legacy `companies`
   doc via `_legacyClient`, calls
   `wos.organizations.createOrganization({ name })`
   (https://workos.com/docs/reference/organization), then:
   - For each legacy `companyUsers` member resolved to a WorkOS user → either
     `userManagement.createOrganizationMembership({ organizationId, userId, roleSlug })`
     (existing user) or
     `userManagement.sendInvitation({ email, organizationId, roleSlug })` (new
     user). Map legacy role `admin|agent|viewer` → WorkOS `roleSlug`.
   - For each enabled `companyModules` row →
     `featureFlags.addFlagTarget({ slug, targetId: org.id })` (slug = the
     module's flag; see VERIFY in Open Questions). NO
     `createFeatureFlagVariation`.
   - Write the `_migrationMap` entry via an `internalMutation`.
4. Idempotent: if `_migrationMap` has a `companyId` row with
   `status: 'provisioned'` (or later), return its `tenantId` and skip
   re-provisioning.

**Technical design (directional, not implementation spec):**

```ts
// convex/migrations/_legacyClient.ts
import { ConvexHttpClient } from 'convex/browser'
// read-only client against the LEGACY deployment
export function legacyClient() {
	const url = process.env.LEGACY_CONVEX_URL
	if (!url) throw new Error('LEGACY_CONVEX_URL not set')
	const client = new ConvexHttpClient(url)
	// auth via a read-only deploy key if the legacy app exposes internal reads
	if (process.env.LEGACY_CONVEX_ADMIN_KEY)
		client.setAdminAuth(process.env.LEGACY_CONVEX_ADMIN_KEY)
	return client
}
// VERIFY: ConvexHttpClient runs in V8 internalAction (outbound HTTPS). If the
// V8 runtime blocks the legacy fetch, move callers to a "use node" action.
```

```ts
// convex/migrations/workos.ts  (V8 internalAction — WorkOS SDK uses convex export)
import { WorkOS } from '@workos-inc/node'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { legacyClient } from './_legacyClient'

export const provisionTenant = internalAction({
	args: { companyId: v.string() },
	handler: async (ctx, { companyId }) => {
		const wos = new WorkOS(process.env.WORKOS_API_KEY!)

		const existing = await ctx.runQuery(internal.migrations._migrationMap.get, {
			companyId,
		})
		if (existing?.status === 'provisioned')
			return { tenantId: existing.tenantId }

		const legacy = legacyClient()
		const company = await legacy.query(
			/* legacy internal getCompany */ 'companies:get' as any,
			{
				id: companyId,
			},
		)

		const org = await wos.organizations.createOrganization({
			name: company.name,
		})
		// invite members → createOrganizationMembership / sendInvitation per role
		// target module flags → featureFlags.addFlagTarget({ slug, targetId: org.id })

		await ctx.runMutation(internal.migrations._migrationMap.write, {
			companyId,
			tenantId: org.id,
			status: 'provisioned',
			provisionedAt: Date.now(),
		})
		return { tenantId: org.id }
	},
})
```

```ts
// convex/migrations/_migrationMap.ts (table goes into schema.ts; helpers here)
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const migrationMapTable = defineTable({
	companyId: v.string(), // legacy companies._id (string form)
	tenantId: v.string(), // WorkOS org id
	provisionedAt: v.number(),
	status: v.string(), // provisioned | secrets_migrated | data_migrated | verified | decommissioned
	notes: v.optional(v.string()),
})
	.index('by_company', ['companyId'])
	.index('by_status', ['status'])
// registered as `_migrationMap` in schema.ts: { _migrationMap: migrationMapTable }
```

**Patterns to follow:**

- `convex/utils.ts` — `getOrgFromJwt` pattern (`organizationId = tenantId`).
- `@workos-inc/node` 8.13.0 — `organizations.createOrganization`,
  `userManagement.{createOrganizationMembership,sendInvitation}`,
  `featureFlags.addFlagTarget`. V8 runtime (convex export condition).

**Test scenarios:**

- `provisionTenant(companyId)` → WorkOS org created, `_migrationMap` row with
  status `provisioned`.
- Re-run same `companyId` → returns existing `tenantId`, no second org.
- Company with `companyModules` enabled → `addFlagTarget` called per slug.
- Company with `companyUsers` → existing users get
  `createOrganizationMembership`, new emails get `sendInvitation`, role mapping
  correct (`admin|agent|viewer`).
- Missing `WORKOS_API_KEY` → action throws early; no partial state.

**Verification:**

- Outcome: `_migrationMap` row `status: 'provisioned'`; org visible in WorkOS
  dashboard.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors in touched files.
- `bunx biome check --write` (tabs, single quotes, no semicolons).

---

### Unit 2 — Tenant Config + Channel Embedding

**Goal:** Migrate each legacy `companies` document (app-config fields only) into
a new `tenant` row; embed `companyPhoneNumbers` → `tenant.phones[]`,
`companyWhatsAppAccounts` → `tenant.whatsapps[]` (without tokens — Unit 3), and
`widgetConfigs` → `tenant.widgets[]`.

**Requirements:** R2.

**Dependencies:** Unit 1 (`_migrationMap`); phase 001 (`tenant` table defined in
`schema.ts`).

**Files:**

- `convex/migrations/tenant.ts` — Create: import action (cross-deployment read +
  idempotent insert; NOT a `migrations.define` legacy walk).
- `schema.ts` — Modify: confirm `tenant` table exists (phase 001).

**Approach:**

1. The import action reads the legacy `companies` row + its
   `companyPhoneNumbers` / `companyWhatsAppAccounts` / `widgetConfigs` (legacy
   `by_company` index) via `_legacyClient`.
2. Look up `tenantId` from `_migrationMap` by `companyId`.
3. Map `companyPhoneNumbers` → `phones[]` (drop `isDefault`; set
   `tenant.defaults.phone` to the default's `phoneNumberId`).
4. Map `companyWhatsAppAccounts` → `whatsapps[]`, stripping `managementToken`/
   `messagingToken` (→ Vault, Unit 3).
5. Map `widgetConfigs` → `widgets[]`.
6. Insert the `tenant` doc with `tenantId`, `timezone`, `branding`,
   `loginStyle`, `aiSettings`, `customContactFields`, `defaults`, `phones`,
   `whatsapps`, `widgets`. `mcpServers` starts empty (no legacy equivalent).
7. Idempotent: skip if a `tenant` row already exists for this `tenantId`.

> VERIFY: confirm the exact `tenant` table field names (`loginStyle`,
> `aiSettings`, `customContactFields`, `defaults`, `mcpServers`) against the
> phase-001 schema before coding; legacy `companies` has `branding`/`timezone`/
> `apiKey` confirmed but not every new-schema field has a 1:1 legacy source.

**Technical design (directional):**

```ts
// convex/migrations/tenant.ts (V8 internalAction)
export const importTenant = internalAction({
	args: { companyId: v.string(), tenantId: v.string() },
	handler: async (ctx, { companyId, tenantId }) => {
		const legacy = legacyClient()
		const { company, phones, whatsapps, widgets } = await legacy.query(
			'migrationExports:tenantBundle' as any, // a legacy read fn returning the bundle
			{ companyId },
		)
		await ctx.runMutation(internal.migrations.tenant.upsert, {
			tenantId,
			timezone: company.timezone,
			branding: company.branding,
			defaults: {
				phone: phones.find((p: any) => p.isDefault)?.phoneNumberId,
				whatsapp: whatsapps.find((w: any) => w.isDefault)?.accountId,
			},
			phones: phones.map((p: any) => ({
				phoneNumberId: p.phoneNumberId,
				phoneNumber: p.phoneNumber,
				label: p.label,
				capabilities: ['voice'], // legacy phones are voice-only
				telephonyMode: 'managed', // new-schema default
			})),
			whatsapps: whatsapps.map((w: any) => ({
				accountId: w.accountId,
				wabaId: w.wabaId,
				phoneNumber: w.phoneNumber,
				label: w.label,
				metaUserId: w.metaUserId,
				// managementToken/messagingToken intentionally omitted → Vault (Unit 3)
			})),
			widgets: widgets.map((w: any) => ({
				token: w.token,
				enabledAgentIds: w.enabledAgentIds,
				allowVoice: w.allowVoice,
				allowText: w.allowText,
				allowWhatsApp: w.allowWhatsApp ?? false,
				branding: w.branding,
				welcomeMessage: w.welcomeMessage,
				isActive: w.isActive,
			})),
			mcpServers: [],
		})
	},
})
// internal.migrations.tenant.upsert is an internalMutation: existence-check on
// `tenant` by_tenant index, then insert (idempotent).
```

**Patterns to follow:**

- `docs/rebuild-architecture.md §1` — tenant schema with embedded arrays.
- Existence-check before insert in the `upsert` mutation (idempotency).

**Test scenarios:**

- Company with 2 phones / 1 whatsapp / 1 widget → `tenant` row with correctly
  shaped arrays; no tokens in `whatsapps[]`.
- `isDefault: true` phone → `tenant.defaults.phone` set to its `phoneNumberId`.
- Re-run → no duplicate `tenant` row.
- Missing `_migrationMap` entry → orchestrator throws before calling import.

**Verification:**

- Outcome: one `tenant` row per migrated company; no plaintext tokens anywhere.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.

---

### Unit 3 — Secrets Migration to WorkOS Vault / Pipes

**Goal:** Extract plaintext credentials from the legacy `companies` doc +
`companyWhatsAppAccounts` and move them to WorkOS Vault (static secrets) or
confirm Pipes (OAuth). Write Vault object IDs back onto the `tenant` row; never
write plaintext to a new table.

**Requirements:** R7.

**Dependencies:** Unit 2 (tenant row exists); WorkOS Vault via
`@workos-inc/node` (V8 runtime); `_legacyClient` for the legacy reads.

**Files:**

- `convex/migrations/secrets.ts` — Create: V8 `internalAction`.

**Approach:**

Legacy plaintext credentials (VERIFIED field paths):

- `companies.twilio.{accountSid,authToken}` → Vault object `twilio:{tenantId}`
  (JSON value).
- `companies.hubspot.accessToken` → Vault object `hubspot:{tenantId}`.
- `companies.gmail.refreshToken` → **OAuth** → per §2 should be **Pipes**, not
  Vault. Do NOT copy the refresh token. Confirm a Gmail Pipes connection
  (attempt `pipes.getAccessToken({ provider: 'google', organizationId })`); if
  not connected, record `gmailReauthRequired: true` in `_migrationMap.notes`
  (tenant re-authorizes via the Pipes widget post-cutover). Vault is a
  last-resort fallback only.
- `companyWhatsAppAccounts.{managementToken,messagingToken}` → Vault object
  `whatsapp:{tenantId}:{accountId}` (JSON value).
- `companies.apiKey` → regenerate fresh on the new platform (recommended);
  record decision in the decommission checklist. Vault is the alternative.

Use `vault.createObject({ name, value, context })` (CORRECTED — not
`createSecret`). `context` is a `KeyContext` for encryption scoping, e.g.
`{ tenantId }`. Returns `ObjectMetadata` with `.id`. Patch the `tenant` row's
`vaultRefs` (or the relevant `whatsapps[].vaultObjectId`) with the returned id.

**Technical design (directional):**

```ts
// convex/migrations/secrets.ts (V8 internalAction)
export const migrateSecrets = internalAction({
	args: { tenantId: v.string(), companyId: v.string() },
	handler: async (ctx, { tenantId, companyId }) => {
		const wos = new WorkOS(process.env.WORKOS_API_KEY!)
		const legacy = legacyClient()
		const { company, whatsapps } = await legacy.query(
			'migrationExports:secretsBundle' as any,
			{ companyId },
		)
		const keyContext = { tenantId }

		if (company.twilio?.authToken) {
			const obj = await wos.vault.createObject({
				name: `twilio:${tenantId}`,
				value: JSON.stringify({
					accountSid: company.twilio.accountSid,
					authToken: company.twilio.authToken,
				}),
				context: keyContext,
			})
			await ctx.runMutation(internal.migrations.tenant.patchVaultRef, {
				tenantId,
				key: 'twilio',
				vaultObjectId: obj.id,
			})
		}

		for (const wa of whatsapps) {
			if (wa.managementToken || wa.messagingToken) {
				const obj = await wos.vault.createObject({
					name: `whatsapp:${tenantId}:${wa.accountId}`,
					value: JSON.stringify({
						managementToken: wa.managementToken,
						messagingToken: wa.messagingToken,
					}),
					context: keyContext,
				})
				await ctx.runMutation(
					internal.migrations.tenant.patchWhatsAppVaultRef,
					{
						tenantId,
						accountId: wa.accountId,
						vaultObjectId: obj.id,
					},
				)
			}
		}

		if (company.hubspot?.accessToken) {
			const obj = await wos.vault.createObject({
				name: `hubspot:${tenantId}`,
				value: company.hubspot.accessToken,
				context: keyContext,
			})
			await ctx.runMutation(internal.migrations.tenant.patchVaultRef, {
				tenantId,
				key: 'hubspot',
				vaultObjectId: obj.id,
			})
		}
		// Gmail: OAuth → Pipes. Do NOT copy refreshToken. Confirm/record re-auth.
		await ctx.runMutation(internal.migrations._migrationMap.setStatus, {
			companyId,
			status: 'secrets_migrated',
		})
	},
})
```

**Patterns to follow:**

- `docs/rebuild-architecture.md §2` — OAuth → Pipes, static → Vault.
- `@workos-inc/node` Vault: `createObject`/`readObjectByName` (VERIFIED).

**Test scenarios:**

- Twilio creds present → Vault object created; `tenant.vaultRefs.twilio` set;
  `authToken` never written to a new table.
- No Twilio → no Vault write; no error.
- Two WhatsApp accounts → two Vault objects; both `whatsapps[]` entries patched
  with their `vaultObjectId`.
- Gmail refresh token present → NOT copied; `gmailReauthRequired` noted.
- Vault API failure → action throws; `_migrationMap.status` stays at
  `'data_migrated'` (or prior); safe to retry.

**Verification:**

- Outcome: no plaintext credential field exists anywhere in the new Convex DB.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.

---

### Unit 4 — Conversation Data Migration (Contacts, Threads, Calls, Messages)

**Goal:** The core domain migration. Map legacy `calls` (type=voice) → new
`calls`; legacy `calls` (type=chat) + `widgetSessions` (mode=text) → `threads`;
all message/transcript arrays → `messages` rows. Merge `smsMessages` /
`whatsappMessages` delivery status onto the corresponding `messages` row.

**Requirements:** R3 (contacts), R4 (calls/threads/messages).

**Dependencies:** Unit 2 (tenant row + `_migrationMap`); phases 001 + 002
(`contacts`, `threads`, `calls`, `messages` tables — exact shapes in
threads-model.md §2).

**Files:**

- `convex/migrations/contacts.ts` — Create.
- `convex/migrations/conversations.ts` — Create: calls → new calls + threads.
- `convex/migrations/messages.ts` — Create: message arrays → messages rows.

**Approach:**

All passes are cross-deployment read (page legacy rows via `_legacyClient`) +
existence-checked `insert` mutations. A trailing `@convex-dev/migrations` pass
over the NEW `messages` table can backfill `sequence` if any parent ends up with
gaps.

**Contacts (`contacts.ts`):** Page legacy `contacts`; skip rows with
`companyId === undefined` (legacy `companyId` is optional — these are orphans,
threads-model/domain-erd finding #1). Look up `tenantId` from `_migrationMap`.
Insert into new `contacts` with `tenantId`, preserving `metadata`. Idempotent:
skip if a contact with the same `(tenantId, phone)` exists (`by_tenant_phone`
index — VERIFY exact index name in phase-001 schema).

**Voice calls (`conversations.ts`):** Page legacy `calls` where
`type === 'voice'` (or null). Insert into new `calls`:

- `tenantId` from map.
- `kind` from `platform`/`serviceType`: `voice_call` | `whatsapp_voice` |
  `widget_voice` (threads-model.md §2 — `calls.kind` union).
- `conversationId`, `status`, `durationMs`, `audioUrl`, `providerCostUsd`,
  `failureReason` copied directly.
- `contactId` → resolved new contact `_id` by `(tenantId, phone)`.
- `batchId` → resolved new batch `_id` (batch import below).
- `metadata.legacyCallId = legacy._id` for cross-reference.
- Idempotent: skip if a `calls` row with the same `conversationId` exists
  (`by_conversation` index).

**Chat calls / widgetSessions → threads:** Page legacy `calls` where
`type === 'chat'` AND `widgetSessions` where `mode === 'text'`. Insert into new
`threads`:

- `channel` from `platform`/source (`whatsapp` | `widget` | …).
- `kind` (threads-model.md §2 union): `whatsapp_chat` | `widget_text` | …
- `contactId` → resolved.
- `channelExternalId` → `agentId` or widget `token` (the endpoint).
- `status` mapped: `completed` | `active` | `abandoned`.
- `messageCount` set after the message pass (or via a trigger; see §6).
- `metadata.legacyId = legacy._id`.

**Widget voice:** `widgetSessions` (mode=voice) → new `calls`
`{ kind: 'widget_voice' }`.

**Messages (`messages.ts`):**

- For each new `calls` row with `metadata.legacyCallId`: load legacy
  `calls.messages[]` → one `messages` row per element (`sequence` = array index,
  `parentType: 'call'`, `parentId: newCall._id`, `role` mapped from legacy
  `user|agent`); plus the legacy `transcripts` row for that call → one
  `messages` row (`contentType: 'text'`, `role: 'system'`, `parentType: 'call'`)
  per threads-model.md §5.
- For each new `threads` row with `metadata.legacyId`: if source was a chat
  `call`, load `calls.messages[]`; if source was a `widgetSession`, load
  `widgetSessions.transcript[]` → `messages` rows (`parentType: 'thread'`).
- Idempotency for messages: insert keyed on
  `(parentType, parentId, providerMessageId)` where available; otherwise
  `(parentType, parentId, sequence)`.

**Delivery-status merge:** Page `smsMessages` → find new `messages` by
`by_provider_message` (`providerMessageId === smsMessages.twilioMessageSid`);
patch `deliveryStatus`. Same for `whatsappMessages` using `metaMessageId`
(VERIFIED legacy fields). For messages that have a delivery row but no inline
content (template-only sends), insert a `messages` row first, then patch.

**Tool calls → messages:** Page legacy `toolCalls` → new `messages`
(`contentType: 'tool_call'`/`'tool_result'`, `role: 'tool'`,
`metadata.kind: 'tool'` per threads-model.md §4); `parentId` resolved from
`conversationId` → new call/thread `_id`. (threads-model.md §5: `toolCalls` may
also remain a derived analytics view — out of scope here.)

**Attachments:** legacy `calls.mediaFiles[]` → `messages.attachments[]`
(threads-model.md §5).

**Batches (included here):** Page legacy `batches` → new `batches`. Map
`companyId` → `tenantId`; map legacy `callType` (`normal|whatsapp|sms`, VERIFIED
— NOT `channel`/`voice`) to the new batch channel field (VERIFY exact new field
name in phase-006 schema); `workflowRunId` is null (terminal-state import;
restart on new platform if needed). Only `completed`/`cancelled` batches
migrate; `draft`/`running` handled in the cutover window.

**Technical design (directional — contacts only for brevity):**

```ts
// convex/migrations/contacts.ts — internalMutation invoked per page
export const importContacts = internalMutation({
	args: { tenantId: v.string(), contacts: v.array(v.any()) },
	handler: async (ctx, { tenantId, contacts }) => {
		for (const c of contacts) {
			if (!c.companyId) continue // skip orphaned legacy rows
			const existing = await ctx.db
				.query('contacts')
				.withIndex('by_tenant_phone', (q) =>
					q.eq('tenantId', tenantId).eq('phone', c.phone),
				)
				.unique()
			if (existing) continue // idempotent
			await ctx.db.insert('contacts', {
				tenantId,
				name: c.name,
				phone: c.phone,
				tags: c.tags,
				archived: c.archived,
				groupName: c.groupName,
				metadata: c.metadata,
				createdAt: c.createdAt,
			})
		}
	},
})
// The driving V8 internalAction pages legacy `contacts` via _legacyClient and
// calls importContacts per batch.
```

**Patterns to follow:**

- `docs/threads-model.md §5` — migration mapping (canonical).
- `docs/threads-model.md §2` — `threads`/`calls`/`messages` field shapes, `kind`
  unions, `by_parent_sequence` / `by_conversation` / `by_provider_message`
  indexes.
- `docs/threads-model.md §6` — counters (`messageCount`, `lastMessageAt`) are
  best maintained by a convex-helpers Trigger; for migration, set them after the
  message pass or let the trigger fire on insert.

**Test scenarios:**

- Voice call (type=voice) → new `calls`; `conversationId` preserved;
  `metadata.legacyCallId` set.
- Chat call (type=chat, platform=whatsapp) → new `thread`
  `{ kind: 'whatsapp_chat' }`; `messages` rows with sequential `sequence`.
- `calls.messages[]` with 5 elements → 5 `messages` rows, `sequence` 0–4,
  correct `parentType`.
- `smsMessages` with `twilioMessageSid` → matched `messages` row gets
  `deliveryStatus: 'delivered'`.
- `widgetSession` (mode=voice) → `calls { kind: 'widget_voice' }`.
- Re-run → no dupes (contacts by `(tenantId, phone)`, calls by `conversationId`,
  messages by `(parentType, parentId, providerMessageId|seq)`).

**Verification:**

- Outcome: new `threads`/`calls`/`messages` counts match legacy source counts
  for the test tenant (spot-check via `bunx convex dashboard`).
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.
- `node_modules/.bin/vp test run convex/migrations/conversations.test.ts`.

---

### Unit 5 — Surveys, KB, and Supporting Documents

**Goal:** Migrate `surveys` + `surveyResponses`, `knowledgeBaseDocs` +
`knowledgeBaseHistory`, `scripts`, `smsTemplates`, `batchConfigurations`.

**Requirements:** R5, R6.

**Dependencies:** Unit 4 (needs new `calls._id`/`threads._id` for FK repoint);
phases 001 + 009 (`surveys`, `surveyResponses`, `knowledgeBaseDocs` schema).

**Files:**

- `convex/migrations/surveys.ts` — Create.
- `convex/migrations/kb.ts` — Create.
- `convex/migrations/documents.ts` — Create: scripts, smsTemplates,
  batchConfigurations.

**Approach:**

**Surveys (threads-model.md §7):** Page legacy `surveys` → insert with
`tenantId`, preserve `questions` array (embedded conditional DAG). Page
`surveyResponses`: each has a legacy `callId`. Resolve whether that legacy call
became a new `calls` row or `threads` row (look up new doc with matching
`metadata.legacyCallId` / `metadata.legacyId`). Set `callId` (voice) or
`threadId` (text) accordingly — the new `surveyResponses` schema (§7) has both
optional + `batchId`, `fromSequence`/`toSequence`, and a `source` union.
`source` defaults: `'voice_data_collection'` for voice, `'llm_extraction'` for
text (per §7 table).

> CORRECTION: the original plan said `source` defaults to `'llm_extraction'`
> "for chat"; §7's `source` union is
> `voice_data_collection | chat_data_collection | llm_extraction | manual`.
> ElevenLabs chat agents map to `chat_data_collection`; only our own text-agent
> extraction is `llm_extraction`. Map by the legacy call's `serviceType`/agent
> origin; default text to `chat_data_collection` if it came from an ElevenLabs
> chat agent, else `llm_extraction`.

**KB docs:** Page legacy `knowledgeBaseDocs` → insert with `tenantId`, preserve
`elevenLabsDocId` as the new `externalId`. Copy `archived`, `ragStatus`,
`sourceStorageId` (Convex Storage IDs are stable across deployments only if the
file blobs are re-uploaded; VERIFY whether `_storage` IDs survive a cross-
deployment move — if not, re-upload via `ctx.storage` and remap IDs). Page
`knowledgeBaseHistory` → insert with `tenantId`, repoint `docId` to the new
`knowledgeBaseDocs._id`.

> VERIFY: Convex `_storage` IDs are **per-deployment**. A `sourceStorageId` from
> the legacy deployment is NOT valid in the new deployment. Re-upload the blob
> (download from legacy via signed URL, `ctx.storage.store` in new) and store
> the new storage id. Flag this in Risks.

**Scripts / smsTemplates / batchConfigurations:** Straight copy with
`companyId → tenantId`. `batchConfigurations.webhookSecret` → Vault object
(reuse Unit 3 `vault.createObject` pattern).

**Test scenarios:**

- `surveyResponse` with `callId` → voice call → new `surveyResponse`
  `{ callId: newCall._id, threadId: undefined }`.
- `surveyResponse` with `callId` → chat call → new `surveyResponse`
  `{ threadId: newThread._id, callId: undefined }`.
- KB doc with `sourceStorageId` → blob re-uploaded; new storage id stored (per
  VERIFY above).
- `knowledgeBaseHistory` with 3 versions → 3 new rows, `docId` repointed.
- Re-run → idempotent.

**Verification:**

- Outcome: survey-response counts match per tenant; KB doc count matches.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.

---

### Unit 6 — Channel Reconnection + Meta WABA Override

**Goal:** Register per-tenant webhook routes on the new platform and
programmatically set the Meta per-WABA callback override
(`override_callback_uri`) for each WhatsApp account to
`/webhooks/whatsapp/{tenantId}`, routing inbound traffic to the new app.

**Requirements:** R8.

**Dependencies:** Unit 2 (tenant row with `whatsapps[]`); Unit 3 (WhatsApp
`managementToken` now in Vault); phase 003 (channel adapters + webhook routes).

**Files:**

- `convex/migrations/channels.ts` — Create: channel reconnection V8 action.
- `src/server/rpc/contracts/migration.contract.ts` — Create: oRPC contract.
- `src/server/rpc/routes/migration.router.ts` — Create: admin-gated router.

**Approach:**

The reconnection action (V8 `internalAction`) updates each provider's webhook:

- **Twilio**: `client.incomingPhoneNumbers(sid).update({ smsUrl, voiceUrl })`
  pointing at `https://{deployment}/webhooks/twilio/{tenantId}` (creds from
  Vault). VERIFY: Twilio Node SDK is Node-only (no `convex` export) — if so this
  specific call goes in a `"use node"` action; WorkOS/Meta-fetch parts stay V8.
- **Meta/WhatsApp**: Graph API `POST /{waba-id}/subscribed_apps` with body
  `{ override_callback_uri: "https://{deployment}/webhooks/whatsapp/{tenantId}", verify_token: <tenant verify token> }`
  (CORRECTED key — was `callback_url`),
  `Authorization: Bearer <managementToken>` (from Vault), scope
  `whatsapp_business_management`. (rebuild-architecture.md §5;
  https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/override)

Idempotent: read the current override (GET `/{waba-id}/subscribed_apps`) and
skip if it already points to the new platform.

**oRPC routes** (contract-first, `migration.contract.ts` +
`migration.router.ts`, all `.use(admin)`):

- `migration.start({ companyId })` —
  `ctx.runAction(internal.migrations.index.runTenantMigration, { companyId })`.
- `migration.status({ companyId })` — returns `_migrationMap.status`.
- `migration.verify({ companyId })` — runs the Unit-7 checklist.
- `migration.decommission({ companyId })` — sets
  `_migrationMap.status: 'decommissioned'` after a passing verify.

Admin gating uses the existing `admin` middleware in `src/server/rpc/init.ts`
(`admin = auth.use(...)`, throws `errors.NO_ADMIN_ROLE()`); the WorkOS client is
on `context.workOs`.

**Technical design (directional — Meta override):**

```ts
// convex/migrations/channels.ts (V8 internalAction for the Meta fetch part)
export const reconnectWhatsApp = internalAction({
	args: { tenantId: v.string() },
	handler: async (ctx, { tenantId }) => {
		const wos = new WorkOS(process.env.WORKOS_API_KEY!)
		const tenant = await ctx.runQuery(internal.tenant.getByTenantId, {
			tenantId,
		})
		const deployment = process.env.CONVEX_SITE_URL!
		for (const wa of tenant.whatsapps ?? []) {
			const obj = await wos.vault.readObjectByName(
				`whatsapp:${tenantId}:${wa.accountId}`,
			)
			const { managementToken } = JSON.parse(obj.value)
			const overrideUri = `${deployment}/webhooks/whatsapp/${tenantId}`
			await fetch(
				`https://graph.facebook.com/v21.0/${wa.wabaId}/subscribed_apps`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${managementToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						override_callback_uri: overrideUri, // CORRECTED key
						verify_token: tenantId,
					}),
				},
			)
		}
	},
})
```

**Patterns to follow:**

- `docs/rebuild-architecture.md §5` — webhook routing; tenant from route; Meta
  per-WABA override.
- `src/server/rpc/init.ts` — `admin` middleware; `context.workOs`.
- `src/server/rpc/contracts/*.contract.ts` + `routes/*.router.ts` naming.

**Test scenarios:**

- Tenant with 1 WhatsApp account → Graph API called with correct WABA id +
  `override_callback_uri`; no error.
- Token missing from Vault → action throws; `_migrationMap.status` not advanced.
- `migration.status({ companyId })` → returns current status string.
- `migration.start()` twice → second call is a no-op (status check).

**Verification:**

- Outcome: Meta webhook config shows the new override URI per WABA.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.

---

### Unit 7 — Cutover Verification + Decommission

**Goal:** Verify each tenant end-to-end before decommissioning the legacy app.
Provide a structured checklist action and a `decommission` mutation.

**Requirements:** R9, R10.

**Dependencies:** All prior units (1–6 complete); phase 002 (agent turn runs);
phase 005 (ElevenLabs agent resolves); phase 007 (Polar subscription visible).

**Files:**

- `convex/migrations/verify.ts` — Create: verification checklist action.
- `src/server/rpc/contracts/migration.contract.ts` — Modify: add `verify` +
  `decommission`.
- `src/server/rpc/routes/migration.router.ts` — Modify: implement them.

**Approach:**

`verifyTenant` (V8 `internalAction`) runs read-only checks + lightweight
external health checks and returns:

```ts
type VerificationResult = {
	tenantId: string
	checks: {
		tenantRowExists: boolean
		contactsCount: number
		threadsCount: number
		callsCount: number
		messagesCount: number
		surveysCount: number
		kbDocsCount: number
		secretsInVault: boolean // vault.readObjectByName(`twilio:${tenantId}`) etc. resolves
		webhookRouteActive: boolean // test inbound event creates a threads row
		polarSubscriptionVisible: boolean
		elevenLabsAgentResolvable: boolean
	}
	allPassed: boolean
	notes: string[]
}
```

External checks: Vault existence via `vault.readObjectByName` (or
`listObjects`); Polar subscription via the phase-007 Polar component / raw
`@polar-sh/sdk` `customers.getStateExternal` (phase 007 owns this — verify only
surfaces it); ElevenLabs `agents.get(externalId)` via the phase-005 client.

If `allPassed`, the oRPC `decommission` route:

1. Sets `_migrationMap.status: 'decommissioned'`.
2. Calls a legacy-app action (via `_legacyClient.mutation` / legacy HTTP action)
   to set `companies.status: 'disabled'`.
3. Optionally leaves the `_migrationMap` row for audit (cleanup migration drops
   the table only after ALL tenants are decommissioned).

**Patterns to follow:**

- `src/server/rpc/contracts/*.contract.ts` — define contract types before the
  router; `errors.ts` for typed errors (use `PRECONDITION_FAILED` / a contract
  error for "verify not passed").
- `src/server/rpc/init.ts` — `admin` middleware.

**Test scenarios:**

- All data + external checks pass → `allPassed: true`.
- Missing Polar subscription → `polarSubscriptionVisible: false`,
  `allPassed: false`, actionable `notes`.
- `decommission` before `allPassed` → router rejects with the typed precondition
  error.
- `decommission` after pass → `_migrationMap.status: 'decommissioned'`; legacy
  `companies.status: 'disabled'`.
- Re-run `verifyTenant` after decommission → returns current state, no error.

**Verification:**

- Outcome: test tenant passes all checks; `decommission` succeeds; legacy tenant
  inaccessible on the old app.
- `node_modules/.bin/tsc --noEmit` — zero net-new errors.
- `bunx biome check --write`.
- `node_modules/.bin/vp test run convex/migrations/verify.test.ts`.

---

## System-Wide Impact

- **`schema.ts`**: adds the transient `_migrationMap` table; depends on all
  domain tables from phases 001–009 being present before the relevant pass runs.
- **`convex/convex.config.ts`**: adds `@convex-dev/migrations` (alongside
  existing `@convex-dev/workos-authkit` + `@convex-dev/resend`).
- **Cross-deployment read**: a read-only `ConvexHttpClient` against
  `LEGACY_CONVEX_URL` is the import source; requires a legacy deploy key and
  legacy read functions (`migrationExports:*`) that return the bundles.
- **All new domain tables**: import passes write into them; schema must be
  stable before each pass. Gate each pass behind its phase deploy.
- **WorkOS**: each migrated tenant becomes a new org; `sendInvitation` triggers
  welcome emails — coordinate timing.
- **Meta Graph API**: `override_callback_uri` switches inbound WhatsApp traffic
  per WABA; instant + per-account. Test in staging first.
- **Polar**: this plan does NOT create subscriptions (phase 007); `verifyTenant`
  surfaces a missing subscription as a warning.
- **ElevenLabs**: `externalId` fields preserved; no agent created here (phase
  005).
- **Convex `_storage`**: storage IDs are per-deployment; KB blobs must be
  re-uploaded (Unit 5 VERIFY).

## Risks & Dependencies

| Risk                                                                                                             | Severity              | Mitigation                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legacy tables don't exist in the new deployment's schema; `migrations.define({table:'companies'})` is impossible | High                  | Import via cross-deployment `ConvexHttpClient` + idempotent inserts; reserve `@convex-dev/migrations` for new-table transform passes (corrected throughout). |
| `@convex-dev/migrations` not yet installed                                                                       | High                  | `bun add @convex-dev/migrations`; register in `convex.config.ts`; create `convex/migrations.ts` instance + `runner()` (Unit 1).                              |
| Cross-deployment `ConvexHttpClient` runtime in a V8 internalAction (outbound HTTPS)                              | Medium-High           | VERIFY in a spike; fall back to a `"use node"` action if the V8 runtime blocks the legacy fetch. WorkOS SDK itself is V8-safe (convex export condition).     |
| WorkOS Vault API name `createSecret` does not exist                                                              | High (was a hard bug) | Use `vault.createObject({name,value,context})` / `readObjectByName`; store `.id` (corrected).                                                                |
| WorkOS Feature Flag `createFeatureFlagVariation` does not exist                                                  | High (was a hard bug) | Create flag slugs in the Dashboard once; target per-org via `featureFlags.addFlagTarget({slug,targetId:orgId})` (corrected).                                 |
| Meta override key `callback_url` is wrong                                                                        | High (was a hard bug) | Use `override_callback_uri` in the `POST /<WABA_ID>/subscribed_apps` body (corrected).                                                                       |
| Convex `_storage` IDs are per-deployment                                                                         | Medium                | Re-upload KB blobs in Unit 5; remap `sourceStorageId` (VERIFY).                                                                                              |
| `calls.messages[]` OCC during legacy read                                                                        | Low                   | Reads happen via the legacy client (read-once, no write-back); no OCC on reads.                                                                              |
| Meta override switches traffic instantly per WABA                                                                | Medium                | Run in a per-tenant maintenance window; test inbound on new platform first.                                                                                  |
| WorkOS `sendInvitation` triggers welcome emails                                                                  | Low-Medium            | Coordinate tenant timing; prefer `createOrganizationMembership` for already-synced users (no email).                                                         |
| WorkOS Management API rate limits on bulk provisioning                                                           | Low                   | `@convex-dev/rate-limiter` already installed; throttle if needed (VERIFY limits).                                                                            |
| Legacy `surveyResponses.callId` may point to a call that became a thread                                         | Medium                | Unit 5 resolves via `metadata.legacyCallId`/`metadata.legacyId`; test explicitly.                                                                            |
| `_migrationMap` persists in schema indefinitely                                                                  | Low                   | `dropMigrationMap` cleanup migration after all tenants `'decommissioned'`.                                                                                   |

## Documentation & References

**Dependencies introduced by this plan (install + canonical docs):**

- `@convex-dev/migrations` — NOT yet installed. Install:
  `bun add @convex-dev/migrations`. Register:
  `import migrations from '@convex-dev/migrations/convex.config'` +
  `app.use(migrations)`. API:
  `new Migrations(components.migrations[, {schema}])`,
  `migrations.define({ table, migrateOne, batchSize?, customRange? })`,
  `migrations.runner([...])`, `migrations.runSerially(ctx, [...])`,
  `migrations.runOne(ctx, fn)`. CLI:
  `bunx convex run migrations:<name> '{dryRun:true}'`. Docs:
  https://www.convex.dev/components/migrations ·
  https://github.com/get-convex/migrations#readme

**Dependencies already installed (verified versions/locations):**

- `@workos-inc/node` 8.13.0
  (`/Users/angel/dev/agent.io/node_modules/ @workos-inc/node`) — runs in Convex
  **V8** via the package's `convex` export condition (`./lib/index.worker.mjs`).
  Verified methods: `organizations.createOrganization({name})`;
  `userManagement.createOrganizationMembership({organizationId,userId,roleSlug})`,
  `userManagement.sendInvitation({email,organizationId,roleSlug})`,
  `userManagement.listOrganizationMemberships({organizationId})`;
  `featureFlags.addFlagTarget({slug,targetId})` / `enableFeatureFlag(slug)` /
  `getFeatureFlag(slug)`; `vault.createObject({name,value,context})` /
  `vault.readObjectByName(name)` / `vault.readObject({id})` /
  `vault.updateObject(...)`; `pipes.getAccessToken({provider,...})`. Docs:
  https://workos.com/docs/reference/organization ·
  https://workos.com/docs/reference/user-management ·
  https://workos.com/docs/reference/feature-flags ·
  https://workos.com/docs/vault · https://workos.com/docs/pipes
- `convex` 1.41 — `ConvexHttpClient` from `convex/browser`
  (`client.setAdminAuth(key)`, `.query()`, `.mutation()`) for cross-deployment
  legacy reads. Docs:
  https://docs.convex.dev/api/classes/browser.ConvexHttpClient
- `convex-helpers` 0.1.119 — `zCustomQuery`/`zCustomMutation`
  (`convex-helpers/server/zod4`) already used in `convex/utils.ts`; Triggers for
  `messageCount`/`lastMessageAt` (threads-model.md §6). Docs:
  https://github.com/get-convex/convex-helpers
- `@convex-dev/rate-limiter` (installed at
  `node_modules/@convex-dev/ rate-limiter`) — optional throttle for bulk WorkOS
  provisioning.
- `@orpc/server` — contract-first oRPC (`implement(contract).$context<...>()`,
  `os.use(...)` middleware). Docs: https://orpc.unnoq.com

**External APIs (no SDK in this plan; raw fetch):**

- WhatsApp Cloud API — per-WABA webhook override:
  `POST https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps` with body
  `{ override_callback_uri, verify_token }`, token scope
  `whatsapp_business_management`. Docs:
  https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/override
  (VERIFY exact body at impl time — see Open Questions).
- Twilio — `incomingPhoneNumbers(sid).update({smsUrl,voiceUrl})` (the `twilio`
  Node SDK is Node-only; that call belongs in a `"use node"` action). Docs:
  https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource

**Design docs & legacy reference:**

- `docs/rebuild-architecture.md` §1 (WorkOS system-of-record / `tenant` config),
  §2 (Vault vs Pipes), §5 (webhook routing + Meta override), §8 (cutover).
- `docs/threads-model.md` §1 (legacy pain), §2 (new `threads`/`calls`/`messages`
  schema + indexes), §5 (migration mapping table), §6 (ingestion + counters), §7
  (surveys over threads & calls).
- `docs/domain-erd.md` — OBSOLETE legacy snapshot; the as-was reference for all
  legacy table shapes (used to verify field names in this plan).
- `convex/schema.ts` (legacy, `/Users/angel/dev/agentio/convex/schema.ts`) —
  verified legacy field names.
- `convex/utils.ts`, `convex/auth.ts`, `convex/auth.config.ts`,
  `convex/convex.config.ts` (agent.io) — `authQuery`/`authMutation`,
  `getOrgFromJwt`, component registration.
- `src/server/rpc/{init.ts,contracts,routes}` (agent.io) — oRPC `admin`
  middleware + `*.contract.ts`/`*.router.ts` convention; `src/lib/work-os.ts`.

- Sibling plans (dependencies):
  - `2026-06-17-001-feat-convex-foundations-plan.md` — schema base, `tenant`.
  - `2026-06-17-002-feat-conversation-substrate-plan.md` —
    threads/calls/messages.
  - `2026-06-17-003-feat-channel-adapters-plan.md` — webhook routes.
  - `2026-06-17-004-feat-agent-tools-plan.md` — Composio + BYO MCP.
  - `2026-06-17-005-feat-voice-runtime-plan.md` — ElevenLabs agent sync.
  - `2026-06-17-006-feat-batch-dialing-plan.md` — batch + workflow schema.
  - `2026-06-17-007-feat-billing-plan.md` — Polar subscription bootstrap.
  - `2026-06-17-008-feat-secrets-plan.md` — WorkOS Vault/Pipes setup.
  - `2026-06-17-009-feat-surveys-sentiment-analytics-plan.md` — surveys,
    sentiment, aggregate seeding.

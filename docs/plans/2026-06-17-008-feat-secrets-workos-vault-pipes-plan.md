---
title: 'feat: Secrets — WorkOS Vault + Pipes'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §2
---

# feat: Secrets — WorkOS Vault + Pipes

## Overview

Phase 008 establishes the secrets layer that every channel and voice runtime
depends on before it can make a real provider call. It wires WorkOS Vault
(static credentials and PII, per-context envelope encryption) and WorkOS Pipes
(OAuth provider connections — Gmail/Google, Outlook/Microsoft, Slack, HubSpot)
into the Convex action runtime and the oRPC layer. No credentials ever land in
Convex tables. Accessor actions expose a clean contract for channels (003),
voice (005), and any other consumer.

Depends on **001** (schema base, `tenant` table, authQuery/authMutation). Must
land before **003** (channel adapters), **005** (voice runtime), and **004**
(Composio/BYO MCP wiring).

> **CRITICAL CORRECTION (verified against installed `@workos-inc/node` 8.13.0
> `.d.ts` + current WorkOS docs, 2026-06-18):** The original plan's SDK surface
> was wrong on both halves.
>
> - **Vault** is an **object** API, not a `getSecret/createOrUpdateSecret` API.
>   Real methods: `workos.vault.createObject`, `readObject`, `readObjectByName`,
>   `updateObject`, `deleteObject`, `listObjects`, `listObjectVersions`. There
>   is **no `organizationId` parameter** — isolation is via a
>   `context: KeyContext` (an arbitrary `Record<string, any>`); we put
>   `{ organizationId: tenantId }` (and optionally `provider`) there.
> - **Pipes** exposes **exactly one** method:
>   `workos.pipes.getAccessToken({ provider, userId, organizationId? })`. There
>   is **no `listConnections`** and **no `getAuthorizationUrl`** on
>   `workos.pipes`. Connection initiation is done via the **Pipes Widget**,
>   whose token is minted server-side with
>   `workos.widgets.getToken({ userId, organizationId })`.
> - **Pipes is keyed by `userId` (WorkOS user id), with `organizationId` as an
>   optional scope** — NOT by `tenantId` alone. This invalidates the original
>   "tenantId is the sole lookup key" rule for Pipes. Vault can be keyed by org
>   context; Pipes needs the acting user.

## Problem Frame

The legacy `companies` document stores Twilio auth tokens, Meta system-user
tokens, Gmail refresh tokens, and a raw `apiKey` in plaintext Convex rows. A DB
read or backup exposes every tenant's provider credentials. The new platform
never writes any of these to Convex. Instead:

- **Static credentials and PII** (Twilio Account SID + auth token, Meta
  system-user token, ElevenLabs API key, outbound `apiKey`, SIP trunk creds,
  future PII fields) → **WorkOS Vault**, per-context envelope-encrypted objects.
- **OAuth provider connections** (Gmail/Google, Microsoft Outlook, Slack,
  HubSpot) → **WorkOS Pipes**, which owns the full OAuth lifecycle (connect via
  widget, token storage, transparent refresh).

Rule: **OAuth provider → Pipes; static credential or PII → Vault.**

## Requirements Trace

| ID  | Requirement                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Static provider credentials (Twilio, Meta, ElevenLabs, SIP, outbound apiKey) are stored in WorkOS Vault objects, isolated by a `KeyContext` carrying `organizationId` — never in Convex.                                                                                     |
| R2  | OAuth connections (Gmail/Google, Outlook/Microsoft, Slack, HubSpot) are managed by WorkOS Pipes — no `connections` table in Convex.                                                                                                                                          |
| R3  | HubSpot is treated as a Pipes provider (resolved open question from §9). **Verified:** HubSpot is an officially supported Pipes provider (WorkOS changelog, 2026-01-12).                                                                                                     |
| R4  | Convex actions expose `vault.getSecret(tenantId, secretName)` and `pipes.getFreshToken({ userId, organizationId, provider })` accessors usable by 003, 004, 005.                                                                                                             |
| R5  | Vault lookup is keyed by Vault object **name** (deterministic, derived from `tenantId` + provider) read via `readObjectByName`. Pipes lookup is keyed by **`userId`** (acting WorkOS user) plus optional `organizationId` scope. No local FK / connections table for either. |
| R6  | `tenant.mcpServers[].vaultSecretId` holds an opaque reference to a Vault object (its `name` or `id`) for BYO MCP static creds; never inline.                                                                                                                                 |
| R7  | oRPC routes (admin-gated) let the dashboard mint a **Pipes Widget token** (`workos.widgets.getToken`) so the frontend can render the widget and let the user connect/manage providers. (Pipes has no list/authorization-URL SDK method — see Unit 6.)                        |
| R8  | oRPC routes (admin-gated) allow the dashboard to write/rotate named Vault objects for an org.                                                                                                                                                                                |
| R9  | Env vars for WorkOS are declared in `src/lib/env.ts` (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID` already exist; reused for Vault/Pipes). Convex actions read `process.env.WORKOS_API_KEY` directly (set in the Convex dashboard Environment Variables).                            |
| R10 | No Convex component is registered for Vault/Pipes — the integration is via the `@workos-inc/node` SDK inside Convex `"use node"` actions and TanStack/oRPC server handlers.                                                                                                  |

## Scope Boundaries

**In scope:**

- Convex action module `convex/secrets/vault.ts` — `getSecret`, `putSecret`,
  `rotateSecret` (internal actions)
- Convex action module `convex/secrets/pipes.ts` — `getFreshToken` (internal
  action). **No `listConnections`** — the SDK has no such method; the dashboard
  uses the Pipes Widget to show/manage connections.
- oRPC contract + route for Vault object management (admin only)
- oRPC contract + route for Pipes: mint a **widget token** (admin only) for the
  frontend Pipes Widget
- `convex/secrets/_workos.ts` SDK factory + `convex/secrets/index.ts` barrel
  re-exporting shared types
- Test scenarios for accessor actions + oRPC routes

### Deferred to Separate Tasks

- Composio per-tenant session creation (phase 004)
- ElevenLabs API key consumption in voice runtime (phase 005)
- Twilio credential consumption in SMS/voice channel adapters (phase 003)
- Meta system-user token consumption in WhatsApp adapter (phase 003)
- Per-tenant data migration of legacy credentials into Vault (phase 010)
- WorkOS Pipes Widget rendering in the dashboard frontend (UI work; the oRPC
  route provides the widget token via `workos.widgets.getToken` — the
  `@workos-inc/widgets` React component rendering is a frontend concern outside
  this plan)
- Polar hard-cap guardrail reads (phase 007)

## Context & Research

### Relevant Code and Patterns

| Path                        | Role                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/auth.config.ts`     | Two `customJwt` providers already configured — `tenantId` comes off the verified token; `org.organizationId` is the tenantId                                                                                                                                                                                                                                                                          |
| `convex/utils.ts`           | `authQuery` / `authMutation` (convex-helpers `zCustomQuery`/`zCustomMutation`, zod4) inject `{user, org}`; `org.organizationId` is the tenantId                                                                                                                                                                                                                                                       |
| `convex/workos.ts`          | Existing pattern: an `internalAction` that calls `authKit.workos.authorization.*`. **Note:** `authKit.workos` is the AuthKit component's SDK and does **not** expose Vault/Pipes — Unit 1 creates a fresh `new WorkOS(...)` from `process.env.WORKOS_API_KEY` instead.                                                                                                                                |
| `src/lib/work-os.ts`        | `export const workOs = new WorkOS({ apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID })` — SDK singleton for the TanStack/oRPC layer. The oRPC routes receive it via `context.workOs` (see `src/server/rpc/init.ts`).                                                                                                                                                                       |
| `src/lib/env.ts`            | Zod-validated env, `.parse(process.env)`. `WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/`BASE_URL` already declared. No new vars strictly required.                                                                                                                                                                                                                                                             |
| `src/server/rpc/init.ts`    | Contract-first oRPC: `os = implement(contract).$context<RpcContextType>()`; middleware implementers `auth` / `admin` / `org` / `adminOrg` built via `os.use(...)`. Context exposes `session` (`session.user.id`, `session.organizationId`, `session.role`), `organizationId` (added by `org`/`adminOrg`), and `workOs`. WorkOS SDK errors are remapped to typed oRPC errors in the `auth` middleware. |
| `src/server/rpc/contracts/` | `base.ts` (`oc.errors(baseErrors)`), `*.contract.ts` files, assembled in `index.ts` as `contract = { health, workOs }`.                                                                                                                                                                                                                                                                               |
| `src/server/rpc/routes/`    | `*.router.ts` files; routers walk the middleware-prefixed implementer path, e.g. `adminOrg.workOs.organization.update.handler(...)`; assembled in `src/server/rpc/index.ts` via `os.router({ ... })`.                                                                                                                                                                                                 |

### Design-Doc References

- `docs/rebuild-architecture.md §2` — Vault/Pipes split, no `connections` table,
  the "OAuth → Pipes; static → Vault" rule, per-org isolation, HubSpot open
  question (§9 resolved: HubSpot is a Pipes provider)
- `docs/rebuild-architecture.md §1` — `tenant.mcpServers[].vaultSecretId` is an
  opaque Vault reference, never inline cred
- `docs/threads-model.md` — consumers (channels, voice) that call these
  accessors

### Sunday / Ontology Reference Paths

No direct AI-routing equivalence — this is infrastructure. The closest in-repo
pattern is `convex/workos.ts` (existing `internalAction` calling the WorkOS SDK)
and `src/server/rpc/routes/work-os.router.ts` (existing `adminOrg.*.handler`
calling `context.workOs.*`). Vault/Pipes accessors and routes follow those exact
shapes.

## Key Technical Decisions

| Decision                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Convex component for Vault/Pipes**                               | WorkOS Vault and Pipes are called via the `@workos-inc/node` SDK. There is no `@convex-dev/workos-vault` component — integration is direct SDK calls inside Convex `"use node"` actions and TanStack/oRPC handlers.                                                                                                                                                                                      |
| **All Convex accessor actions are `internalAction` and `"use node"`** | Vault objects and Pipes tokens must never be reachable from client-exposed queries/mutations. The WorkOS SDK uses Node crypto (Vault does client-side envelope decryption), so the modules must declare `"use node"` to run in Convex's Node.js runtime, not the V8 runtime. The oRPC layer (TanStack Node process) calls `context.workOs.*` directly for dashboard operations.                          |
| **HubSpot → Pipes (not Vault)**                                       | HubSpot uses standard OAuth 2.0. **Verified** HubSpot is a supported Pipes provider (WorkOS changelog "Nine new providers in WorkOS Pipes", 2026-01-12). Connections are made via the Pipes Widget; tokens fetched at call time with `getAccessToken({ provider: 'hubspot', userId, organizationId })`. No stored tokens in Convex.                                                                      |
| **Pipes is keyed by `userId`, not `tenantId`**                        | The SDK's `getAccessToken` requires `userId` and takes `organizationId` only as an optional scope. Pipes connections are per acting WorkOS user. Callers (003/004/005) must thread the acting user's WorkOS id through to `getFreshToken`. For automation with no human in the loop, a designated "service" user id per org must be chosen — **VERIFY** the org-service-user strategy at implementation. |
| **Vault is keyed by object name**                                     | WorkOS Vault has no `organizationId` param; objects are addressed by `id` or `name` (`readObjectByName`). We derive a deterministic name `{provider}/{tenantId}` and additionally stamp `context: { organizationId: tenantId, provider }` (a `KeyContext`) so the envelope encryption is cryptographically isolated per org.                                                                             |
| **Vault object naming convention: `{provider}/{tenantId}`**           | e.g. `twilio_auth_token/org_01H…`, `meta_system_user_token/org_01H…`. `readObjectByName` resolves it. The convention is app-level.                                                                                                                                                                                                                                                                       |
| **oRPC Vault write routes are admin-only (`adminOrg`)**               | Writing or rotating objects is a destructive org-admin action. Reads of secret _values_ are never surfaced to the client (no oRPC read-value route).                                                                                                                                                                                                                                                     |
| **Pipes connect flow = widget token, not authorization URL**          | The SDK has no `getAuthorizationUrl`/`listConnections`. The oRPC route mints `workos.widgets.getToken({ userId, organizationId })` and returns it; the frontend renders the `@workos-inc/widgets` Pipes component, which handles connect/list/manage.                                                                                                                                                    |

## Open Questions

### Resolved

- **HubSpot provider coverage in Pipes** — Confirmed supported (WorkOS changelog
  2026-01-12, [providers docs](https://workos.com/docs/pipes/providers)). Use
  Pipes for HubSpot CRM tokens.
- **Meta/WhatsApp system-user tokens** — Not OAuth; manually issued long-lived
  tokens → Vault. Confirmed in §2.
- **SIP trunk credentials** — Static; `tenant.phones[].sipTrunkId` +
  `telephonyMode: byo_sip` → creds in Vault, referenced by
  `tenant.mcpServers[].vaultSecretId` or a dedicated Vault object name.
- **Vault runtime** — `@workos-inc/node` Vault methods do client-side envelope
  crypto (Node `crypto`). They run in a Convex **`"use node"`** `internalAction`
  (Node.js runtime), NOT the V8/HTTP runtime. Mark the modules `"use node"`.
  (The Convex V8-runtime risk note in the brief is about AI-SDK streaming, not
  WorkOS SDK calls — but Vault's crypto means `"use node"` is mandatory here
  regardless.)
- **SDK method names** — Verified against installed `@workos-inc/node@8.13.0`
  `.d.ts`: Vault = `createObject/readObjectByName/updateObject/deleteObject`;
  Pipes = `getAccessToken` only; widget = `workos.widgets.getToken`.

### Deferred to Implementation

- **VERIFY: Pipes per-org service-user strategy.** `getAccessToken` requires a
  `userId`. For agent/automation calls with no live human session, decide which
  WorkOS user id owns the org's provider connections (a dedicated service user,
  or the admin who connected it). Document the chosen id source before
  003/004/005 consume `getFreshToken`.
- **VERIFY: SDK version for production.** Installed is
  `@workos-inc/node@8.13.0`; latest is `10.4.0` (npm, 2026-06). Confirm 8.13.0
  already exposes `vault.*`, `pipes.getAccessToken`, and `widgets.getToken` at
  runtime (the `.d.ts` confirms the types). If upgrading to 10.x, re-verify no
  breaking changes to these three surfaces. `src/lib/work-os.ts` and Convex
  bundle from the same `node_modules`.
- **VERIFY: Pipes Widget token scope.** `workos.widgets.getToken` accepts an
  optional `scopes?: WidgetScope[]`, and the installed (and current `main`)
  `WidgetScope` union does **not** include a `widgets:pipes:*` value. The GitHub
  Pipes tutorial calls `getToken({ userId, organizationId })` with **no
  `scopes`**. Confirm at implementation whether Pipes needs a scope arg (it
  appears not) or a newer SDK.
- **VERIFY: exact Pipes provider slugs** (e.g. `hubspot`, `google`/`gmail`,
  `microsoft`/`outlook`, `slack`) in the WorkOS dashboard Pipes config — the
  GitHub tutorial uses `'github'`; confirm each consumer slug.
- **VERIFY: Vault `updateObject` version check / `listObjectVersions`** for
  audit trail — `updateObject({ id, value, versionCheck? })` returns a
  `VaultObject` with `metadata.versionId`; `rotateSecret` surfaces that.
- Whether WorkOS Vault supports per-org custom KMS (BYOK) at the current plan
  tier — check before enterprise onboarding (WorkOS Portal `BringYourOwnKey`
  intent exists in the SDK).
- Rate limits on Vault read/decrypt calls per org per minute — add a local TTL
  cache in the accessor if needed for high-frequency channel sends.

## Output Structure

```
convex/
  secrets/
    _workos.ts        # "use node" — getWorkOS() factory (new WorkOS from process.env)
    vault.ts          # "use node" internalAction accessors: getSecret, putSecret, rotateSecret
    pipes.ts          # "use node" internalAction accessor: getFreshToken
    index.ts          # barrel: shared TS types only (no Convex objects)

src/
  server/
    rpc/
      contracts/
        secrets.contract.ts   # CREATE: oRPC contract for vault + pipes dashboard ops
      routes/
        secrets.router.ts     # CREATE: oRPC route implementations (adminOrg-gated)
      contracts/index.ts      # MODIFY: add `secrets` to the contract object
      index.ts                # MODIFY: register secretsRouter in os.router({...})
```

No new Convex tables. No schema changes in this phase. No
`convex/convex.config.ts` changes. No new env vars required (existing
`WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/`BASE_URL` are sufficient).

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard (TanStack)                                    │
│   oRPC call → secrets contract (adminOrg-gated)          │
│     vault routes: write/rotate object                    │
│     pipes route: mint widget token (getToken)            │
└──────────────────┬──────────────────────────────────────┘
                   │ context.workOs SDK (src/lib/work-os.ts)
                   ▼
            WorkOS API
         ┌────────────────────────────────────────┐
         │  Vault  (objects, KeyContext isolation) │
         │  Pipes  (per-user OAuth, getAccessToken)│
         │  Widgets (getToken → Pipes Widget)      │
         └────────────────────────────────────────┘
                   ▲
                   │ new WorkOS(process.env.WORKOS_API_KEY)
     ┌─────────────┴──────────────────────────────┐
     │  Convex internalAction ("use node")         │
     │    convex/secrets/vault.ts                  │
     │      getSecret(tenantId, secretName)        │
     │      putSecret(tenantId, secretName, value) │
     │      rotateSecret(tenantId, secretName, v)  │
     │    convex/secrets/pipes.ts                  │
     │      getFreshToken({userId, organizationId, │
     │                     provider})              │
     └────────────────────────────────────────────┘
          ▲                    ▲
          │                    │
   003 channels          005 voice / 004 tools
   (Twilio, Meta,        (ElevenLabs key,
    Resend, etc.)         SIP creds; Pipes tokens)
```

## Implementation Units

---

### Unit 1 — WorkOS SDK factory for Convex actions (`convex/secrets/_workos.ts`)

**Goal:** Provide one place that constructs a `WorkOS` SDK instance inside the
Convex Node.js runtime from `process.env.WORKOS_API_KEY`, and confirm the SDK
exposes `vault`, `pipes`, and `widgets`.

**Requirements:** R9, R10

**Dependencies:** None (pre-requisite for all other Convex units)

**Files:**

- `convex/secrets/_workos.ts` — Create (`"use node"`)

**Approach:**

`@workos-inc/node` is already a dependency (used by `src/lib/work-os.ts`).
Convex bundles from the same `node_modules`, so no install is needed. Vault's
decrypt path uses Node `crypto`, so the module MUST start with `'use node'` to
run in Convex's Node runtime. `WORKOS_API_KEY` must be set in the Convex
dashboard → Settings → Environment Variables (not via Vite/`src/lib/env.ts`,
which only validates the TanStack process env).

The `WorkOS` constructor accepts either a string key or `{ apiKey, clientId }`
(verified in the SDK `.d.ts` constructor JSDoc). `clientId` is not needed for
Vault/Pipes/widget-token calls (those are API-key authed), so a bare
`{ apiKey }` is sufficient; include `clientId` if a later call needs it.

**Technical design:**

```ts
// convex/secrets/_workos.ts
'use node'

import { WorkOS } from '@workos-inc/node'

// Convex "use node" actions run in Node.js — process.env is available.
// WORKOS_API_KEY must be set in the Convex dashboard Environment Variables.
export function getWorkOS(): WorkOS {
	const apiKey = process.env.WORKOS_API_KEY
	if (!apiKey) throw new Error('WORKOS_API_KEY not set in Convex env')
	return new WorkOS({ apiKey })
}
```

**Test scenarios:**

- `env var present → getWorkOS() returns a WorkOS with .vault/.pipes/.widgets` —
  happy path
- `WORKOS_API_KEY missing → getWorkOS() throws descriptive error` — error path

**Verification:**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in touched files
- `node_modules/.bin/biome check --write convex/secrets/_workos.ts` passes
- (Convex `'use node'` directive is parsed at deploy; `bunx convex dev` should
  bundle the module without error.)

---

### Unit 2 — Vault accessor actions (`convex/secrets/vault.ts`)

**Goal:** Implement three `"use node"` `internalAction`s — `getSecret`,
`putSecret`, `rotateSecret` — over the WorkOS **Vault object** API. These are
the sole touch points for static credentials throughout the codebase.

**Requirements:** R1, R4, R5, R6

**Dependencies:** Unit 1, Phase 001 (`tenant` table exists; `tenantId` =
`org.organizationId`)

**Files:**

- `convex/secrets/vault.ts` — Create (`"use node"`)

**Approach (verified Vault API):**

WorkOS Vault stores **objects** addressed by `name` or `id`, isolated by a
`context: KeyContext` (`Record<string, any>`). Verified method signatures
(`@workos-inc/node@8.13.0` `.d.ts`):

- `workos.vault.createObject({ name: string, value: string, context: KeyContext }): Promise<ObjectMetadata>`
- `workos.vault.readObjectByName(name: string): Promise<VaultObject>` —
  `VaultObject.value?: string` is the decrypted plaintext
- `workos.vault.readObject({ id }): Promise<VaultObject>`
- `workos.vault.updateObject({ id, value, versionCheck? }): Promise<VaultObject>`
- `workos.vault.deleteObject({ id }): Promise<void>`
- `workos.vault.listObjects(options?): Promise<List<ObjectDigest>>`
- `workos.vault.listObjectVersions({ id }): Promise<ObjectVersion[]>`

`ObjectMetadata` includes
`{ id, versionId, keyId, context, environmentId, updatedAt, updatedBy }`.
`VaultObject` is `{ id, name, value?, metadata }`. There is **no `getSecret`**
and **no `createOrUpdateSecret`** — `putSecret`/`rotateSecret` must branch on
"exists" using `readObjectByName` (catch not-found → `createObject`, else
`updateObject`).

We derive the object name as `{provider}/{tenantId}` and stamp
`context: { organizationId: tenantId }` for cryptographic per-org isolation.

Docs: WorkOS Vault — KeyContext / org isolation: https://workos.com/docs/vault

**Technical design:**

```ts
// convex/secrets/vault.ts
'use node'

import { v } from 'convex/values'

import { internalAction } from '../_generated/server'
import { getWorkOS } from './_workos'

// getSecret: read decrypted value by deterministic object name.
export const getSecret = internalAction({
	args: { tenantId: v.string(), secretName: v.string() },
	handler: async (_ctx, { tenantId, secretName }) => {
		const workos = getWorkOS()
		const obj = await workos.vault
			.readObjectByName(secretName)
			.catch(() => null)
		if (!obj?.value) {
			throw new Error(
				`Vault: object '${secretName}' not found for org ${tenantId}`,
			)
		}
		return obj.value // decrypted plaintext string
	},
})

// putSecret: create if absent, otherwise update (no upsert method exists).
export const putSecret = internalAction({
	args: { tenantId: v.string(), secretName: v.string(), value: v.string() },
	handler: async (_ctx, { tenantId, secretName, value }) => {
		const workos = getWorkOS()
		const existing = await workos.vault
			.readObjectByName(secretName)
			.catch(() => null)
		if (existing) {
			const updated = await workos.vault.updateObject({
				id: existing.id,
				value,
			})
			return { ok: true as const, versionId: updated.metadata.versionId }
		}
		const created = await workos.vault.createObject({
			name: secretName,
			value,
			context: { organizationId: tenantId },
		})
		return { ok: true as const, versionId: created.versionId }
	},
})

// rotateSecret: replace value; surface new versionId for audit.
export const rotateSecret = internalAction({
	args: { tenantId: v.string(), secretName: v.string(), newValue: v.string() },
	handler: async (_ctx, { tenantId, secretName, newValue }) => {
		const workos = getWorkOS()
		const existing = await workos.vault.readObjectByName(secretName)
		const updated = await workos.vault.updateObject({
			id: existing.id,
			value: newValue,
		})
		return { ok: true as const, versionId: updated.metadata.versionId }
	},
})
```

Naming convention for callers (enforced by consumers, not this module):

| Provider               | Vault object name                   |
| ---------------------- | ----------------------------------- |
| Twilio Account SID     | `twilio_account_sid/{tenantId}`     |
| Twilio Auth Token      | `twilio_auth_token/{tenantId}`      |
| Meta System-User Token | `meta_system_user_token/{tenantId}` |
| ElevenLabs API Key     | `elevenlabs_api_key/{tenantId}`     |
| Outbound API Key       | `apikey/{tenantId}`                 |
| SIP trunk credentials  | `sip_trunk_creds/{tenantId}`        |

**Patterns to follow:** `convex/workos.ts` (`internalAction` + WorkOS SDK +
per-call error handling).

**Test scenarios:**

- `valid name → getSecret returns decrypted string` — happy path
- `unknown name → getSecret throws descriptive error` — error path
- `putSecret (new) → createObject called; returns versionId` — happy path
- `putSecret (existing) → updateObject called; returns new versionId` — branch
- `rotateSecret → getSecret returns new value` — integration (Vault sandbox or
  mock)

**Verification:**

- Outcome: `getSecret`/`putSecret`/`rotateSecret` exported as `"use node"`
  `internalAction`s
- `node_modules/.bin/tsc --noEmit` — zero net-new errors in touched files
- `node_modules/.bin/biome check --write convex/secrets/vault.ts`

---

### Unit 3 — Pipes accessor action (`convex/secrets/pipes.ts`)

**Goal:** Implement one `"use node"` `internalAction` — `getFreshToken` — over
the WorkOS **Pipes** API. This is the primary accessor used by channel adapters
(003) and agent tool building (004) to get a live OAuth access token for a
provider, without ever storing it.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**

- `convex/secrets/pipes.ts` — Create (`"use node"`)

**Approach (verified Pipes API):**

The Pipes class exposes **exactly one** method (verified
`@workos-inc/node@8.13.0` `.d.ts`):

```ts
workos.pipes.getAccessToken({
	provider: string,
	userId: string,
	organizationId?: string | null,
}): Promise<GetAccessTokenResponse>
```

where the response is a discriminated union:

```ts
// active === true
{ active: true, accessToken: { object: 'access_token', accessToken: string, expiresAt: Date | null, scopes: string[], missingScopes: string[] } }
// active === false
{ active: false, error: 'not_installed' | 'needs_reauthorization' }
```

There is **no `listConnections`** and **no `getAuthorizationUrl`**. The caller
MUST pass the acting WorkOS `userId` (Pipes connections are per-user;
`organizationId` is an optional scope). On `active: false` we throw a typed
error the UI can map to a "connect / reauthorize this integration" prompt
(rendered via the Pipes Widget — Unit 6). Pipes refreshes the token
transparently when active.

Docs: WorkOS Pipes — https://workos.com/docs/pipes ; tutorial showing
`getAccessToken({ provider, userId, organizationId })`:
https://workos.com/blog/github-with-pipes-tutorial

**Technical design:**

```ts
// convex/secrets/pipes.ts
'use node'

import { v } from 'convex/values'

import { internalAction } from '../_generated/server'
import { getWorkOS } from './_workos'

// Provider slugs we support — VERIFY exact slugs in the WorkOS dashboard.
// (tutorial uses 'github'; confirm 'hubspot' | 'google'/'gmail' | 'microsoft'/'outlook' | 'slack')
export const getFreshToken = internalAction({
	args: {
		userId: v.string(),
		organizationId: v.optional(v.string()),
		provider: v.string(),
	},
	handler: async (_ctx, { userId, organizationId, provider }) => {
		const workos = getWorkOS()
		const result = await workos.pipes.getAccessToken({
			provider,
			userId,
			organizationId: organizationId ?? null,
		})
		if (!result.active) {
			// result.error is 'not_installed' | 'needs_reauthorization'
			throw new Error(
				`PIPES_${result.error.toUpperCase()}: ${provider} for user ${userId}`,
			)
		}
		return {
			accessToken: result.accessToken.accessToken,
			expiresAt: result.accessToken.expiresAt?.toISOString() ?? null,
			scopes: result.accessToken.scopes,
			missingScopes: result.accessToken.missingScopes,
		}
	},
})
```

> **Removed from the original plan:** `listConnections` (no SDK method).
> Connection listing/management is the Pipes Widget's job — surfaced via the
> widget-token route (Unit 6).

**Patterns to follow:** Same `internalAction` + WorkOS SDK pattern as Unit 2.

**Test scenarios:**

- `user with active Gmail connection → getFreshToken returns access token string`
  — happy path
- `user with no HubSpot connection → throws PIPES_NOT_INSTALLED` — error path
- `expired/revoked connection → throws PIPES_NEEDS_REAUTHORIZATION` — error path
- `hubspot connection active → returns token` — HubSpot-as-Pipes (R3)
- `token near expiry → Pipes refreshes transparently, returns valid token` —
  integration

**Verification:**

- Outcome: `getFreshToken` exported as a `"use node"` `internalAction`
- `node_modules/.bin/tsc --noEmit` — zero net-new errors
- `node_modules/.bin/biome check --write convex/secrets/pipes.ts`

---

### Unit 4 — `convex/secrets/index.ts` barrel + shared types

**Goal:** Provide a single import surface for shared TS types so other Convex
modules consume `getSecret`/`getFreshToken` results without re-declaring shapes.
Convex `internal.*` references are auto-generated from the file tree; the barrel
exports types only (never the action objects, to avoid pulling `"use node"`
modules into V8 callers).

**Requirements:** R4

**Dependencies:** Units 2, 3

**Files:**

- `convex/secrets/index.ts` — Create

**Approach:**

Callers invoke `ctx.runAction(internal.secrets.vault.getSecret, …)` /
`internal.secrets.pipes.getFreshToken` directly from the generated `internal`
tree — no barrel needed for the calls themselves. The barrel only shares result
types.

**Technical design:**

```ts
// convex/secrets/index.ts — shared types only (no Convex action exports)
export type VaultSecretResult = string // decrypted plaintext
export type VaultWriteResult = { ok: true; versionId: string }
export type PipesTokenResult = {
	accessToken: string
	expiresAt: string | null
	scopes: string[]
	missingScopes: string[]
}

// Usage (phase 003/005 — directional):
// const token = await ctx.runAction(internal.secrets.pipes.getFreshToken, {
//   userId, organizationId: tenantId, provider: 'gmail',
// })
// const creds = await ctx.runAction(internal.secrets.vault.getSecret, {
//   tenantId, secretName: `twilio_auth_token/${tenantId}`,
// })
```

**Test scenarios:**

- `import shared types → available without pulling "use node" code into a V8 module`
  — static

**Verification:**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors

---

### Unit 5 — oRPC contract + route for Vault object management

**Goal:** Expose admin-gated dashboard endpoints to write/rotate named Vault
objects for an org (e.g. onboarding where an admin pastes their Twilio auth
token). Secret _values_ are never read back to the client.

**Requirements:** R8

**Dependencies:** Phase 001 (`org`/`adminOrg` middleware in
`src/server/rpc/init.ts`)

**Files:**

- `src/server/rpc/contracts/secrets.contract.ts` — Create
- `src/server/rpc/routes/secrets.router.ts` — Create
- `src/server/rpc/contracts/index.ts` — Modify: add `secrets` to `contract`
- `src/server/rpc/index.ts` — Modify: register `secretsRouter` in
  `os.router({...})`

**Approach:**

Contracts are built from `base` (`oc.errors(baseErrors)`) per
`src/server/rpc/contracts/base.ts`. Routers walk the middleware-prefixed
implementer path (`adminOrg.secrets.vault.putSecret.handler(...)`), matching
`src/server/rpc/routes/work-os.router.ts`. `organizationId` always comes from
`context.organizationId` (set by `org`/`adminOrg`) — never from input —
preventing cross-tenant writes.

The route calls `context.workOs.vault.*` directly from the TanStack/Node process
(the same `workOs` singleton from `src/lib/work-os.ts`), keeping the credential
value off the Convex HTTP layer. WorkOS SDK errors are remapped to typed oRPC
errors by the `auth` middleware (see `init.ts`).

The object name is derived server-side as `{secretName}/{organizationId}` so
clients pass only a logical `secretName` (e.g. `twilio_auth_token`) and cannot
address another org's object.

**Technical design:**

```ts
// src/server/rpc/contracts/secrets.contract.ts
import { z } from 'zod'

import { base } from './base'

export const secretsContract = {
	vault: {
		putSecret: base
			.input(
				z.object({ secretName: z.string().min(1), value: z.string().min(1) }),
			)
			.output(z.object({ ok: z.literal(true), versionId: z.string() })),
		rotateSecret: base
			.input(
				z.object({
					secretName: z.string().min(1),
					newValue: z.string().min(1),
				}),
			)
			.output(z.object({ ok: z.literal(true), versionId: z.string() })),
	},
}
```

```ts
// src/server/rpc/routes/secrets.router.ts
import { adminOrg, os } from '@server/rpc/init'

const objectName = (secretName: string, organizationId: string) =>
	`${secretName}/${organizationId}`

export const secretsRouter = os.secrets.router({
	vault: {
		putSecret: adminOrg.secrets.vault.putSecret.handler(
			async ({ context, input }) => {
				const { organizationId } = context // from adminOrg — never from input
				const name = objectName(input.secretName, organizationId)
				const existing = await context.workOs.vault
					.readObjectByName(name)
					.catch(() => null)
				if (existing) {
					const updated = await context.workOs.vault.updateObject({
						id: existing.id,
						value: input.value,
					})
					return { ok: true as const, versionId: updated.metadata.versionId }
				}
				const created = await context.workOs.vault.createObject({
					name,
					value: input.value,
					context: { organizationId },
				})
				return { ok: true as const, versionId: created.versionId }
			},
		),
		rotateSecret: adminOrg.secrets.vault.rotateSecret.handler(
			async ({ context, input }) => {
				const { organizationId } = context
				const name = objectName(input.secretName, organizationId)
				const existing = await context.workOs.vault.readObjectByName(name)
				const updated = await context.workOs.vault.updateObject({
					id: existing.id,
					value: input.newValue,
				})
				return { ok: true as const, versionId: updated.metadata.versionId }
			},
		),
	},
})
```

```ts
// src/server/rpc/contracts/index.ts — MODIFY
import { healthContract } from './health.contract'
import { secretsContract } from './secrets.contract'
import { workOsContract } from './work-os.contract'

export const contract = {
	health: healthContract,
	workOs: workOsContract,
	secrets: secretsContract,
}
```

```ts
// src/server/rpc/index.ts — MODIFY (add import + registration)
import { secretsRouter } from './routes/secrets.router'

const router = os.router({
	health: healthRouter,
	workOs: workOsRouter,
	secrets: secretsRouter,
})
```

**Patterns to follow:** `src/server/rpc/routes/work-os.router.ts`
(`adminOrg.workOs.organization.update.handler` + `context.workOs.*` +
`context.organizationId`).

**Test scenarios:**

- `admin putSecret (new) → 200, ok:true, versionId present` — happy path
- `admin putSecret (existing name) → updateObject path, new versionId` — branch
- `non-admin putSecret → NO_ADMIN_ROLE` — error path
- `no active org → NO_ACTIVE_ORGANIZATION` — error path
- `client cannot address another org (name namespaced by organizationId)` —
  isolation
- `rotateSecret unknown name → NOT_FOUND (remapped from WorkOS 404)` — error
  path

**Verification:**

- Outcome: `secretsRouter` registered; `contract.secrets` present; TypeScript
  resolves the implementer path
- `node_modules/.bin/tsc --noEmit` — zero net-new errors
- `node_modules/.bin/biome check --write` on modified files
- Manual: call `secrets.vault.putSecret` as admin via the oRPC dev client →
  WorkOS Vault stores the object

---

### Unit 6 — oRPC contract + route for Pipes widget token

**Goal:** Expose an admin-gated dashboard endpoint that mints a **Pipes Widget
token** (`workos.widgets.getToken`) so the frontend `@workos-inc/widgets` Pipes
component can render and let the user connect/list/manage providers. (The SDK
has no `pipes.listConnections`/`getAuthorizationUrl`; the widget owns that UX.)

**Requirements:** R7

**Dependencies:** Phase 001 (`adminOrg` middleware)

**Files:**

- `src/server/rpc/contracts/secrets.contract.ts` — Modify: add `pipes`
  sub-contract
- `src/server/rpc/routes/secrets.router.ts` — Modify: add `pipes` sub-router

**Approach (verified):**

`workos.widgets.getToken({ userId, organizationId, scopes? })` returns a
`Promise<string>` (verified `.d.ts`). The Pipes tutorial calls it with
`{ userId, organizationId }` and **no `scopes`** (the installed `WidgetScope`
union has no Pipes value). The route mints the token for the acting user
(`context.session.user.id`) + active org (`context.organizationId`) and returns
it. The frontend renders the widget with this token; the widget shows available
providers (Gmail, Outlook, Slack, HubSpot, …) and drives connect/reauthorize.
There is no server-side "list connections" — the widget reflects connection
state live, and runtime token availability is observed via `pipes.getFreshToken`
(Unit 3) returning `active:false`.

Docs: widget token generation —
https://workos.com/blog/github-with-pipes-tutorial ; Pipes Widget —
https://workos.com/docs/widgets/pipes

**Technical design:**

```ts
// addition to src/server/rpc/contracts/secrets.contract.ts
import { z } from 'zod'
import { base } from './base'

// inside secretsContract:
	pipes: {
		getWidgetToken: base
			.input(z.object({}).optional())
			.output(z.object({ token: z.string() })),
	},
```

```ts
// addition to src/server/rpc/routes/secrets.router.ts (inside os.secrets.router({...}))
	pipes: {
		getWidgetToken: adminOrg.secrets.pipes.getWidgetToken.handler(
			async ({ context }) => {
				const token = await context.workOs.widgets.getToken({
					userId: context.session.user.id,
					organizationId: context.organizationId,
					// scopes intentionally omitted — installed WidgetScope has no pipes value.
					// VERIFY whether a Pipes scope is required on the target SDK version.
				})
				return { token }
			},
		),
	},
```

> **Removed from the original plan:** `pipes.listConnections` and
> `pipes.getAuthorizationUrl` oRPC routes — neither maps to a real SDK method.
> Replaced with the widget-token route, which is the supported
> connect/list/manage path.

**Patterns to follow:** Same `adminOrg.*.handler` + `context.workOs.*` +
`context.session.user.id` pattern as `work-os.router.ts` (`listMyMemberships`
reads `context.user.id`).

**Test scenarios:**

- `admin getWidgetToken → returns non-empty token string` — happy path
- `non-admin getWidgetToken → NO_ADMIN_ROLE` — error path
- `unauthenticated → UNAUTHORIZED` — error path
- `no active org → NO_ACTIVE_ORGANIZATION` — error path

**Verification:**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors
- `node_modules/.bin/biome check --write` on modified files
- Manual: call `secrets.pipes.getWidgetToken` as admin → returns a token
  consumable by the Pipes Widget

---

### Unit 7 — Convenience accessor wrappers for 003/004/005

**Goal:** Provide concrete, tested convenience wrappers inside `convex/secrets/`
so channel adapters (003), tools (004), and voice (005) call typed accessors
without hard-coding naming conventions or provider slugs.

**Requirements:** R4, R1, R2

**Dependencies:** Units 2, 3, 4

**Files:**

- `convex/secrets/vault.ts` — Modify: add `getTwilioCredentials`,
  `getElevenLabsKey`, `getMetaSystemUserToken` wrappers
- `convex/secrets/pipes.ts` — Modify: add `getGmailToken`, `getHubSpotToken`
  wrappers

**Approach:**

Vault wrappers call `getSecret` with the conventional `{provider}/{tenantId}`
object name. Pipes wrappers call `getFreshToken` with the fixed provider slug,
threading the acting `userId` (+ org). Callers import from the generated
`internal.secrets.*` tree.

> **Pipes wrappers require `userId`** (Pipes is per-user). The wrappers take
> `{ userId, organizationId }`; they cannot derive a user from `tenantId` alone.
> **VERIFY** the org-service-user strategy (see Open Questions) before 004 uses
> these in autonomous agent runs.

**Technical design:**

```ts
// convex/secrets/vault.ts — convenience wrappers (append; module already "use node")
import { internal } from '../_generated/api'

export const getTwilioCredentials = internalAction({
	args: { tenantId: v.string() },
	handler: async (ctx, { tenantId }) => {
		const [accountSid, authToken] = await Promise.all([
			ctx.runAction(internal.secrets.vault.getSecret, {
				tenantId,
				secretName: `twilio_account_sid/${tenantId}`,
			}),
			ctx.runAction(internal.secrets.vault.getSecret, {
				tenantId,
				secretName: `twilio_auth_token/${tenantId}`,
			}),
		])
		return { accountSid, authToken }
	},
})

export const getElevenLabsKey = internalAction({
	args: { tenantId: v.string() },
	handler: async (ctx, { tenantId }) =>
		ctx.runAction(internal.secrets.vault.getSecret, {
			tenantId,
			secretName: `elevenlabs_api_key/${tenantId}`,
		}),
})

export const getMetaSystemUserToken = internalAction({
	args: { tenantId: v.string() },
	handler: async (ctx, { tenantId }) =>
		ctx.runAction(internal.secrets.vault.getSecret, {
			tenantId,
			secretName: `meta_system_user_token/${tenantId}`,
		}),
})
```

```ts
// convex/secrets/pipes.ts — convenience wrappers (append; module already "use node")
import { internal } from '../_generated/api'

export const getGmailToken = internalAction({
	args: { userId: v.string(), organizationId: v.optional(v.string()) },
	handler: async (ctx, { userId, organizationId }) =>
		ctx.runAction(internal.secrets.pipes.getFreshToken, {
			userId,
			organizationId,
			provider: 'google', // VERIFY slug: 'google' vs 'gmail'
		}),
})

export const getHubSpotToken = internalAction({
	args: { userId: v.string(), organizationId: v.optional(v.string()) },
	handler: async (ctx, { userId, organizationId }) =>
		ctx.runAction(internal.secrets.pipes.getFreshToken, {
			userId,
			organizationId,
			provider: 'hubspot', // VERIFY slug in WorkOS dashboard
		}),
})
```

Usage example for 003 (SMS adapter — directional cross-reference):

```ts
// convex/channels/sms.ts (phase 003) — directional
import { internal } from '../_generated/api'

const { accountSid, authToken } = await ctx.runAction(
	internal.secrets.vault.getTwilioCredentials,
	{ tenantId },
)
// instantiate Twilio with accountSid + authToken — never stored
```

**Patterns to follow:** Convex internal action composition
(`ctx.runAction(internal.*)`).

**Test scenarios:**

- `getTwilioCredentials → { accountSid, authToken } both non-empty` — happy path
- `getElevenLabsKey → non-empty string` — happy path
- `getGmailToken (user with Google connected) → { accessToken, expiresAt, scopes }`
  — happy path
- `getHubSpotToken (user with HubSpot connected) → valid token` —
  HubSpot-as-Pipes validation
- `getHubSpotToken (no connection) → PIPES_NOT_INSTALLED` — error path

**Verification:**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in
  `convex/secrets/*.ts`
- `node_modules/.bin/biome check --write` on modified files
- `node_modules/.bin/vp test run convex/secrets/` if unit tests are added;
  otherwise type-check is the primary gate

---

## System-Wide Impact

- **No Convex schema changes** — no new tables, no modified tables.
- **No `convex/convex.config.ts` changes** — no new components.
- **`src/server/rpc/contracts/index.ts`** gains `secrets` in the `contract`
  object; **`src/server/rpc/index.ts`** gains `secretsRouter` in `os.router`.
- **Phase 003 (channels)** unblocked:
  `internal.secrets.vault.getTwilioCredentials` / `getMetaSystemUserToken`
  ready.
- **Phase 005 (voice)** unblocked: `internal.secrets.vault.getElevenLabsKey`
  ready; SIP creds follow the same `getSecret` pattern.
- **Phase 004 (tools)** partially unblocked: Pipes tokens via
  `internal.secrets.pipes.getHubSpotToken`/`getGmailToken` — but only once the
  **per-org service-user id** strategy is decided (Pipes needs `userId`).
- **Phase 010 (migration)** depends on `putSecret` to move legacy plaintext
  credentials into Vault during tenant cutover.
- **Security posture**: provider credentials never cross Convex DB reads/writes;
  Vault's per-context envelope keys mean a single-tenant secret exposure cannot
  cascade.

## Risks & Dependencies

| Risk                                                                                                | Severity | Mitigation                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipes requires `userId`** but autonomous agent runs (004) have no live human session              | High     | Decide a per-org service-user id (Open Questions). Without it, agent-initiated Pipes calls have no `userId` and will fail. Resolve before 004.                |
| Installed `@workos-inc/node@8.13.0` lags latest `10.4.0`                                            | Medium   | `.d.ts` confirms `vault.*`, `pipes.getAccessToken`, `widgets.getToken` exist at 8.13.0. If upgrading, re-verify these three surfaces (Open Questions VERIFY). |
| Vault uses Node `crypto` (envelope decryption) — fails in Convex V8 runtime                         | High     | All Convex secrets modules declare `'use node'`. Verified mandatory, not optional.                                                                            |
| Pipes provider slugs differ from guesses (`google` vs `gmail`, `microsoft` vs `outlook`, `hubspot`) | Medium   | Confirm each slug in the WorkOS dashboard Pipes config before wiring consumers (Open Questions).                                                              |
| Widget token scope: installed `WidgetScope` has no Pipes value                                      | Low      | Tutorial calls `getToken({ userId, organizationId })` with no `scopes`; follow that. VERIFY on target SDK version.                                            |
| Vault decrypt call volume hits rate limits for high-throughput tenants                              | Medium   | Add an in-memory TTL cache (~60s) inside `getSecret`. Defer until observed.                                                                                   |

**Sibling plan dependencies:**

| Phase | Plan file                                              | Relationship                                                                    |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 001   | `2026-06-17-001-feat-convex-foundations-plan.md`       | Hard dependency — `tenant` table + `authQuery`/`authMutation` + oRPC middleware |
| 003   | `2026-06-17-003-feat-channel-adapters-plan.md`         | Consumer of `internal.secrets.vault.*`                                          |
| 004   | `2026-06-17-004-feat-agent-tools-composio-mcp-plan.md` | Consumer of `internal.secrets.pipes.*` (needs service-user id)                  |
| 005   | `2026-06-17-005-feat-voice-runtime-elevenlabs-plan.md` | Consumer of `internal.secrets.vault.getElevenLabsKey`                           |
| 010   | `2026-06-17-010-feat-data-migration-plan.md`           | Uses `putSecret` to migrate legacy plaintext creds into Vault                   |

## Documentation & References

### External dependencies (no new installs — all already present)

- **`@workos-inc/node`** — installed `8.13.0`; latest `10.4.0` (npm). Already a
  dependency (`src/lib/work-os.ts`). No install needed; Convex bundles from the
  same `node_modules`.
  - If a deliberate upgrade is desired: `bun add @workos-inc/node@^10.4.0` (then
    re-verify `vault.*`, `pipes.getAccessToken`, `widgets.getToken`).
  - Vault docs: https://workos.com/docs/vault
  - Pipes docs: https://workos.com/docs/pipes
  - Pipes providers (HubSpot confirmed): https://workos.com/docs/pipes/providers
  - Pipes Widget: https://workos.com/docs/widgets/pipes
  - Pipes integration tutorial (`widgets.getToken` + `pipes.getAccessToken`):
    https://workos.com/blog/github-with-pipes-tutorial
  - SDK source (verify scopes/methods on upgrade):
    https://github.com/workos/workos-node
  - Node SDK changelog:
    https://www.mintlify.com/workos/workos-node/resources/changelog
  - Verified method surface (installed `.d.ts`):
    - `workos.vault.createObject({ name, value, context })`,
      `readObjectByName(name)`, `readObject({ id })`,
      `updateObject({ id, value, versionCheck? })`, `deleteObject({ id })`,
      `listObjects(opts?)`, `listObjectVersions({ id })`
    - `workos.pipes.getAccessToken({ provider, userId, organizationId? }) → { active:true, accessToken } | { active:false, error }`
    - `workos.widgets.getToken({ userId, organizationId, scopes? }) → Promise<string>`

- **`@workos-inc/widgets`** (frontend only — deferred to UI task, listed for
  completeness) — latest `1.14.1` (npm). Pipes Widget React component consumes
  the token from Unit 6.
  - Install (when the UI task lands): `bun add @workos-inc/widgets@^1.14.1`
  - Docs: https://workos.com/docs/widgets/pipes

### Design-doc sections

- `docs/rebuild-architecture.md §2` — Vault/Pipes split, no-connections-table
  rule, static-vs-OAuth split, per-org isolation
- `docs/rebuild-architecture.md §1` — `tenant.mcpServers[].vaultSecretId` opaque
  Vault reference
- `docs/rebuild-architecture.md §9` — HubSpot open question (resolved: Pipes
  provider)

### Reference-repo / in-repo patterns

- `convex/workos.ts` — `internalAction` calling the WorkOS SDK
- `src/lib/work-os.ts` — `workOs` SDK singleton for the TanStack/oRPC layer
- `src/server/rpc/init.ts` — `os = implement(contract)`,
  `auth`/`admin`/`org`/`adminOrg` middleware, `context.workOs`,
  `context.session.user.id`, WorkOS-error → typed-oRPC-error remapping
- `src/server/rpc/contracts/work-os.contract.ts` +
  `src/server/rpc/routes/work-os.router.ts` — exact contract (`base`) + router
  (`adminOrg.*.handler` + `context.workOs.*`) pattern this plan mirrors
- `src/server/rpc/contracts/base.ts`, `errors.ts`, `index.ts` — contract
  assembly

### Conventions

- Bun; Biome (tabs, single quotes, no semicolons)
- Type-check: `node_modules/.bin/tsc --noEmit` (NOT `npx tsc`)
- Lint: `node_modules/.bin/biome check --write <files>`
- Tests: `node_modules/.bin/vp test run`

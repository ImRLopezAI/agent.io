---
title: 'feat: Agent tools — Composio (per-tenant) + BYO MCP'
type: feat
status: active
date: 2026-06-17
origin: docs/rebuild-architecture.md §2 (Agent tools) + §4b (Text agent runtime)
---

# feat: Agent tools — Composio (per-tenant) + BYO MCP

## Overview

Wire real, per-tenant tool execution into the existing AI SDK v7 orchestrator.
Two sources: **Composio** (`@composio/core` + `@composio/vercel`) for day-one
managed toolkits (200+ providers, OAuth + token refresh handled by Composio,
`user_id = organizationId` for isolation), and **bring-your-own MCP** via
`tenant.mcpServers[]` for tenants running their own servers. The key invariant
is that tools are **never flat-merged into a global bag**: each specialist
`ToolLoopAgent` gets only the toolkits and MCP keys its config declares,
preventing name collisions and keeping the orchestrator's tool surface small
(one routing-tool per specialist). The orchestrator already exists in
`src/server/ai/index.ts`; this plan adds the `agents` schema, specialist config
resolution, and the tool-hydration pipeline.

> **Naming note:** the rebuild uses the WorkOS organization id as the tenant
> key. In agent.io code this is `ctx.org.organizationId` (Convex, from
> `convex/utils.ts`) or `context.organizationId` (oRPC, from the `org`
> middleware in `src/server/rpc/init.ts`). Composio's per-user isolation key
> (`user_id`) is set to this `organizationId`. The plan uses `tenantId` as the
> conceptual name for this value; the literal field everywhere is
> `organizationId`.

## Problem Frame

The current orchestrator in `src/server/ai/index.ts` is scaffolded (no real
tools, model defaulted to `anthropic/claude-haiku-4.5`, no `tenantId`). The
Convex schema is empty (`defineSchema({})` in `convex/schema.ts`). The `agents`
table needs definition, specialist configs need a home, and the plumbing to turn
`agents.specialists[].toolkits` + `agents.specialists[].mcpServerKeys` into
typed AI SDK tools per specialist does not yet exist. Two sub-problems compound
this:

1. **Composio session isolation**: a single `Composio` instance is reused per
   process, but tool resolution must be per-tenant (`user_id = organizationId`),
   with toolkits filtered **at session creation**
   (`composio.create(userId, { toolkits })`) or via the direct
   `composio.tools.get(userId, { toolkits })` call — not globally fetched then
   sliced.
2. **Convex V8 runtime incompatibility**: the AI SDK tool loop, Composio HTTP
   I/O, and MCP stdio transport need a Node.js environment, not Convex's V8 HTTP
   runtime. Agent turns that use tools must execute in a **Node.js Convex
   action** (flagged via `'use node'`) or — if invoked from a TanStack server
   route — in the TanStack HTTP layer directly. This is a **REAL** risk; the
   spike + fallback below stay in scope.

## Requirements Trace

- **R1** — `agents` table in Convex schema: `tenantId` (= WorkOS org id),
  `provider` (elevenlabs | internal), `externalId`, `model`, `instructions`
  (orchestrator prompt), `knowledgeBaseIds[]`, `specialists[]` (each: `key`,
  `instructions`, `model`, `toolkits[]`, `mcpServerKeys[]`). Indexed by
  `tenantId`.
- **R2** — Composio tools are resolved per-invocation with
  `user_id = organizationId`; toolkits filtered **at session creation** via
  `composio.create(userId, { toolkits })` (then `session.tools()`), or via
  `composio.tools.get(userId, { toolkits })`. Verified correction (brief):
  filter at session creation, **NOT** `session.tools({ toolkits })`.
- **R3** — BYO MCP clients opened via `createMCPClient` from **`@ai-sdk/mcp`**
  (NOT from `ai` — MCP moved out of core in v7-beta), transport resolved from
  `tenant.mcpServers[]` (sse/http via `MCPTransportConfig`; stdio via
  `StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio`), credentials resolved from
  WorkOS Vault for `backedBy: vault`.
- **R4** — Each specialist `ToolLoopAgent` receives only tools scoped to its own
  toolkits + mcpServerKeys. No shared tool bag across specialists.
- **R5** — The orchestrator receives exactly one routing-tool per specialist
  (using the existing `routing()`/`customRouting()` helpers in
  `src/server/ai/agents/routing.ts`). Orchestrator prompt stays small.
- **R6** — All MCP clients opened in a turn are closed (`client.close()`) in
  `finally` before the action returns (stateless: no open connections between
  turns).
- **R7** — Composio SDK pinned at an exact pre-1.0 version
  (`@composio/core@0.6.7`, `@composio/vercel@0.6.3` at time of writing; SDK is
  preview/pre-1.0 and unstable — pin exact, no `^`).
- **R8** — oRPC procedures (CRUD on `agents`) scoped to authenticated org;
  `organizationId` always from the `org`/`adminOrg` middleware context, never
  client input.
- **R9** — Convex V8 runtime risk: action handler that runs tool-using
  specialists is in a `'use node'` action file (or TanStack server route). Run
  the spike verifying `@ai-sdk/mcp` + Composio in a Node action context before
  committing to the runtime.
- **R10** — Verification: zero net-new TypeScript errors in touched files
  (`node_modules/.bin/tsc --noEmit` — NOT `npx tsc`); format via
  `node_modules/.bin/biome check --write` (Biome: tabs, single quotes, no
  semicolons); tests via `node_modules/.bin/vp test run <path>`.

## Scope Boundaries

**In scope:**

- `agents` Convex table schema + indexes + authQuery/authMutation accessors.
- Composio tool factory (per-tenant isolation, per-specialist toolkit filter at
  session creation).
- AI SDK MCP client factory (transport resolver, credential resolution via Vault
  action stub).
- Specialist builder: composes Composio tools + BYO MCP tools into one scoped
  `ToolSet`.
- Orchestrator wiring: routing-tools array from resolved specialist configs.
- Convex `runAgentTurn` action (`'use node'`).
- oRPC CRUD for agents (list/get/upsert/delete).
- Unit tests for specialist builder and tool isolation.

### Deferred to Separate Tasks

- ElevenLabs agent sync from `agents` table config → plan
  `2026-06-17-005-feat-voice-runtime-elevenlabs-plan.md`.
- Post-call webhook → `toolCalls` ledger → plan 005.
- Polar LLM-strategy metering wrapping the model → plan
  `2026-06-17-007-feat-billing-polar-plan.md` (meter wrapping plugs in at
  `runAgentTurn`; placeholder comment left in the action).
- WorkOS Vault credential fetch (full Vault SDK integration) → plan
  `2026-06-17-008-feat-secrets-vault-pipes-plan.md` (this plan stubs
  `resolveVaultSecret` as a Convex action interface).
- Channel adapters (inbound parse, outbound send) that invoke `runAgentTurn` →
  plan `2026-06-17-002-feat-conversation-substrate-plan.md` +
  `2026-06-17-003-feat-channel-adapters-plan.md`.
- Convex foundations (tenant table, RLS custom functions, triggers) → plan
  `2026-06-17-001-feat-convex-foundations-plan.md` (agents table depends on
  tenant existing).
- UI for agent configuration (specialists, toolkit selection).
- Composio OAuth connection flow (user connects HubSpot/Slack etc.) — out of
  text-runtime scope.

## Context & Research

### Relevant Code and Patterns

**Existing AI layer (agent.io):**

- `src/server/ai/index.ts` — `agentRequestHandler`: bare orchestrator with no
  tools; `new ToolLoopAgent({ id, model, reasoning, instructions })` +
  `createAgentUIStreamResponse({ agent, uiMessages, sendStart, sendFinish, sendReasoning, headers, abortSignal })`
  wired to `gateway(model)` from `@ai-sdk/gateway`. Default model
  `'anthropic/claude-haiku-4.5'`.
- `src/server/ai/agents/routing.ts` — `routing({ description, agent })` and
  `customRouting({ description, agent, overrideTool })` helpers. Both build a
  `tool({ description, inputSchema, execute })` whose async-generator `execute`
  runs the sub-agent via `opts.agent.stream({ prompt, abortSignal })` and yields
  UIMessages through
  `readUIMessageStream({ stream: toUIMessageStream({ stream: result.stream }) })`
  — the **top-level** `toUIMessageStream`, because the result method
  `result.toUIMessageStream()` was removed in `ai@7.0.0-beta.178`.
- `src/server/ai/__tests__/chat-handler.test.ts` — test pattern:
  `MockLanguageModelV*`, `simulateReadableStream`, mock `@ai-sdk/gateway`,
  import handler, assert SSE response. (VERIFY: exact mock class name in this
  repo — `MockLanguageModelV2`/`V4`; check at test time.)
- `convex/utils.ts` — `authQuery`/`authMutation` via
  `zCustomQuery`/`zCustomMutation` from `convex-helpers/server/zod4`; the
  `input` hook calls `getAuthUser(ctx)` and injects `{ user, org }`.
  `org.organizationId` is the tenant key. `query`/`mutation` (no-auth) also
  exported.
- `convex/schema.ts` — currently `defineSchema({})` (empty, ready to add
  `agents`; `tenant` arrives via phase 001).
- `convex/convex.config.ts` — `defineApp()` with `app.use(workOSAuthKit)` +
  `app.use(resend)`. New components register here.
- `src/server/rpc/init.ts` — contract-first oRPC:
  `os = implement(contract).$context<RpcContextType>()`; middleware `auth`,
  `admin`, `org`, `adminOrg`. `org` adds `context.organizationId` from
  `context.session.organizationId`; `adminOrg` layers the admin-role gate on
  top. Typed errors: `UNAUTHORIZED`, `FORBIDDEN`, `NO_ACTIVE_ORGANIZATION`,
  `NO_ADMIN_ROLE` (from `contracts/errors.ts`).
- `src/server/rpc/contracts/work-os.contract.ts` — contract pattern: import
  `base` from `./base` (`base = oc.errors(baseErrors)`), then
  `base.route({...}).input(zodSchema).output(zodSchema)` using **plain `zod`**
  (NOT `@orpc/zod`'s `oz.schema`). Procedures grouped in a plain object exported
  as `workOsContract`.
- `src/server/rpc/contracts/index.ts` — assembles
  `contract = { health, workOs }`; new contracts added here.
- `src/server/rpc/contracts/base.ts` —
  `export const base = oc.errors(baseErrors)` (from `@orpc/contract`).
- `src/server/rpc/routes/work-os.router.ts` — router pattern:
  `os.workOs.router({ ... })`; handlers walk the middleware + contract path,
  e.g. `org.workOs.organization.getActive.handler(async ({ context }) => ...)`.
  `context.organizationId` is always from the middleware, never input.
- `src/server/rpc/index.ts` — `os.router({ health, workOs })`; new routers
  registered here. Uses `@orpc/zod/zod4`'s `ZodToJsonSchemaConverter` for the
  OpenAPI handler.
- `convex/http.ts` — V8 HTTP runtime (Hono via `convex-helpers/server/hono`),
  hosts `agentRequestHandler`. This is the V8 boundary the Node action must NOT
  collapse into.

**Reference repos:**

- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai` — clean
  `ToolLoopAgent` factory + `tools()` helper pattern:
  `(model) => new ToolLoopAgent({ instructions, model, tools: tools() })`. The
  agent.io specialist follows this exact shape but adds Composio + MCP hydration
  (async).
- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/index.ts` —
  `createAgentUIStreamResponse` + routing-tool composition pattern.
- `/Users/angel/dev/ontology/src/server/ai/agents` — heavier special-case
  sub-agents (JSON-render renderer, db-doctor) — the intent `customRouting()`
  exists to serve.

**Design-doc sections (docs/rebuild-architecture.md):**

- §2 "Agent tools" — Composio day-one, `user_id = organizationId`,
  toolkit-filter at session creation, no flat merge, BYO MCP via
  `tenant.mcpServers[]`.
- §4b "Text agent runtime" — orchestrator + specialist flow diagram; code sketch
  (adapt from Next.js `after()` → TanStack server route + Convex action;
  `createMCPClient` import).
- §1 `tenant.mcpServers[]` schema — `key`, `transport`, `url`, `command`,
  `backedBy`, `vaultSecretId`.
- §5 ERD — `agents` table fields.

### Verified Corrections (against installed packages + current docs, 2026-06-18)

1. **Composio toolkit filter** — filter at SESSION creation:
   `composio.create(userId, { toolkits })` then `session.tools()`, OR the direct
   `composio.tools.get(userId, { toolkits })`. The plan's previous
   `session.tools({ toolkits })` form is **WRONG** (brief-verified). `user_id`
   (renamed from `entity_id` in the next-gen SDK) = `organizationId` for
   isolation. Docs: https://docs.composio.dev/docs/providers/vercel ,
   https://docs.composio.dev/docs/tools-direct/executing-tools ,
   https://docs.composio.dev/docs/migration-guide/new-sdk .
2. **AI SDK MCP client import** — `createMCPClient` (and
   `experimental_createMCPClient` alias) is exported from **`@ai-sdk/mcp`**
   (installed: `2.0.0-beta.66`), **NOT** from `ai@7.0.0-beta.178` (confirmed:
   `ai`'s `index.d.ts` has zero MCP exports). `MCPTransportConfig` =
   `{ type: 'sse' | 'http', url, headers?, redirect? }` (`redirect` defaults to
   `'error'` — set `'follow'` only if a server redirects). stdio is a **separate
   import**: `StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio`. Docs:
   https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client .
3. **AI SDK step control** — there is **no `maxSteps` parameter**. Use
   `stopWhen: isStepCount(n)` (the default loop cap is `isStepCount(20)` for
   `ToolLoopAgent`). `isStepCount` is exported from `ai` (also aliased as
   `stepCountIs`). The plan's `maxSteps: 6` is **WRONG** →
   `stopWhen: isStepCount(6)`.
4. **oRPC contract** — use `base.route(...).input(zodSchema).output(zodSchema)`
   with **raw `zod`**, NOT `@orpc/contract`'s `oc` directly per-procedure nor
   `@orpc/zod`'s `oz.schema(...)`. `oc` is only used once in `base.ts`
   (`oc.errors(baseErrors)`); `@orpc/zod/zod4` is used only by the OpenAPI
   handler in `rpc/index.ts`. The plan's `oc.input(oz.schema(...))` sketch is
   **WRONG**.
5. **Convex internal action** — `internalAction` IS exported from
   `convex/_generated/server`. `'use node'` is a file-top directive (string
   literal, first statement).

## Key Technical Decisions

| Decision                                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Composio tools resolved per-specialist invocation, scoped at session creation**                         | `composio.create(organizationId, { toolkits: spec.toolkits })` (or `composio.tools.get(organizationId, { toolkits })`) inside the specialist's routing-tool `execute`; each specialist gets exactly its declared toolkits. Reuses Composio's server-side token storage per tenant (`user_id`). Filtering at creation (not post-fetch slicing) is the verified-correct API.                                    |
| **Process-level singleton `Composio` instance**                                                           | `new Composio({ provider: new VercelProvider() })` is constructed once at module scope; only `composio.create(...)`/`composio.tools.get(...)` do I/O. (VERIFY at spike: confirm the singleton is safe to reuse across Node-action invocations — Composio constructor reads `COMPOSIO_API_KEY` from env.)                                                                                                      |
| **`'use node'` Convex action for `runAgentTurn`**                                                         | Composio SDK, `@ai-sdk/mcp` `createMCPClient` (esp. stdio), and the AI SDK tool loop require Node.js. Convex V8 HTTP actions (`convex/http.ts`) cannot run these safely. Node actions run in a separate runtime and call back via `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`. The TanStack server route (phase 002/003) ACKs then `ctx.scheduler.runAfter(0, internal.agentRuntime.runAgentTurn, ...)`. |
| **BYO MCP transport is per-server config from `tenant.mcpServers[]`**                                     | Never hardcode transport. `sse`/`http` → `MCPTransportConfig { type, url, headers }`; `stdio` → `new StdioMCPTransport({ command, args })` from `@ai-sdk/mcp/mcp-stdio`. Credentials come from the Vault action stub (phase 008).                                                                                                                                                                             |
| **`agents.specialists[]` embedded in the agents doc**                                                     | Specialists are bounded per agent (typically 3-8); embedding avoids an extra table + join. Agent config is read once per turn (resolved from `organizationId`).                                                                                                                                                                                                                                               |
| **oRPC `org`/`adminOrg` middleware enforces `organizationId` from session**                               | Never accept `organizationId` from client input. Matches the existing middleware in `src/server/rpc/init.ts`. Reads use `org`; mutations use `adminOrg`.                                                                                                                                                                                                                                                      |
| **Composio + `@ai-sdk/mcp` imported in agent.io `src/server/ai/...`, called from the Convex Node action** | The Convex Node runtime shares the project root `node_modules`. The action file imports the builder from `../../src/server/ai/agents/specialist`. (VERIFY at spike: relative import across the convex↔src boundary resolves under the Convex bundler; if not, colocate the builder under `convex/` or expose via a path alias.)                                                                               |

## Open Questions

### Resolved

- **Composio toolkit filter at session vs. global?** → Resolved: at session
  creation — `composio.create(userId, { toolkits })` then `session.tools()`, or
  `composio.tools.get(userId, { toolkits })`. NOT `session.tools({ toolkits })`.
  (Verified: brief + current docs.)
- **Convex V8 or Node runtime for tool agents?** → Resolved: `'use node'`
  action. Spike still required to confirm `@ai-sdk/mcp` + Composio run there.
  (Verified correction from brief.)
- **AI SDK MCP import path** → Resolved: `createMCPClient` from `@ai-sdk/mcp`
  (installed `2.0.0-beta.66`), NOT from `ai`. stdio via
  `@ai-sdk/mcp/mcp-stdio`'s `StdioMCPTransport`.
- **Step cap API** → Resolved: `stopWhen: isStepCount(6)`, not `maxSteps`.
- **`routing()` shape compatible with a dynamically-built specialist?** → Yes
  for eager construction. For LAZY construction, `customRouting()` with a custom
  `overrideTool` generator is the seam (see Unit 4) — but note `customRouting`
  as currently typed still requires an `agent` for its description string; this
  is handled below.

### Deferred to Implementation

- **VERIFY: Composio process-singleton reuse across Node-action invocations** —
  confirm `new Composio(...)` at module scope is safe in the Convex Node runtime
  (env read timing, no per-request state). Fallback: construct per-invocation
  (cheap; only `create`/`tools.get` do I/O).
- **VERIFY: relative import `convex/funcs/agentRuntime.ts` →
  `src/server/ai/agents/specialist`** resolves under the Convex bundler. If not,
  colocate under `convex/ai/` or add a tsconfig path the Convex bundler honors.
- **VERIFY: exact Composio `composio.create(userId, { toolkits })` return type**
  exposes `.tools()` returning an AI SDK `ToolSet` under `VercelProvider`, AND
  whether `composio.tools.get(userId, { toolkits })` returns the same `ToolSet`
  shape. Pin the chosen call at spike. Docs:
  https://docs.composio.dev/docs/providers/vercel .
- **VERIFY: `StdioMCPTransport` constructor signature** in
  `@ai-sdk/mcp@2.0.0-beta.66` (`{ command, args, env, cwd }`?). Read
  `node_modules/@ai-sdk/mcp/dist/mcp-stdio/index.d.ts` at implementation.
- **VERIFY: `customRouting`/`routing` typing for lazy agent construction** —
  current `customRouting` requires a real `agent` (for the description's tool
  list). Either (a) add a `lazyRouting` variant to `routing.ts` taking
  `() => Promise<{ agent, close }>`, or (b) build the routing-tool inline with
  the `ai` `tool()` primitive (Option B in Unit 4). Tracked as tech debt below.
- **VERIFY: `ToolLoopAgent.generate({ messages })` accepts a `ModelMessage[]`
  array** (not UIMessages). If the runtime holds UIMessages, call
  `await convertToModelMessages(uiMessages)` first (it is **async** — await it).
- **WorkOS Vault `resolveVaultSecret`** — stubbed as `internal.vault.resolve` in
  this plan; full implementation in phase 008.
- **Composio `session.mcp.url`** — for voice (ElevenLabs native MCP pointing at
  Composio's remote MCP endpoint), used in phase 005. Not needed here.

## Output Structure

```
convex/
  schema.ts                          Modify — add agents table (+ tenant via phase 001)
  funcs/
    agents.ts                        Create — authQuery/authMutation CRUD + resolveForTurn internalQuery
    agentRuntime.ts                  Create — runAgentTurn 'use node' internalAction
  _generated/                        Auto-generated (do not edit)

src/
  server/
    ai/
      agents/
        specialist/
          composio.ts                Create — Composio tool factory (per-tenant, session-creation filter)
          mcp.ts                     Create — BYO MCP client factory (@ai-sdk/mcp transport resolver)
          builder.ts                 Create — buildSpecialist: compose Composio + MCP tools
          index.ts                   Create — buildOrchestratorTools: specialist configs → routing-tools
      __tests__/
        specialist-builder.test.ts   Create — unit tests for tool isolation
    rpc/
      contracts/
        agents.contract.ts           Create — oRPC contract (base.route().input().output())
        index.ts                     Modify — add agents to the contract object
      routes/
        agents.router.ts             Create — oRPC route implementations (org/adminOrg)
      index.ts                       Modify — register agents router in os.router({...})
```

## High-Level Technical Design

```
Inbound turn (phase 002/003 → this plan)
  │
  ▼
TanStack server route (POST /webhooks/{provider}/{tenantId})
  │  ACK 200; then ctx.scheduler.runAfter(0, internal.agentRuntime.runAgentTurn, {...})
  ▼
Convex Node action: convex/funcs/agentRuntime.ts  ('use node')
  │
  ├─ ctx.runQuery(internal.agents.resolveForTurn, { tenantId, threadId })
  │    └─ returns { model, instructions, specialists[], tenantMcpServers[] }
  │
  ├─ ctx.runQuery(internal.messages.history, { threadId, limit: 50 })   (phase 002)
  │
  ├─ buildOrchestratorTools(tenantId, specialists[], mcpServers, model)
  │    └─ per specialist → lazy routing-tool (tool() with async-generator execute)
  │         └─ specialist ToolLoopAgent built lazily inside execute()
  │              ├─ composio.ts: composio.create(tenantId, { toolkits }) → session.tools()
  │              │               (or composio.tools.get(tenantId, { toolkits }))
  │              └─ mcp.ts: createMCPClient({ transport }) × mcpServerKeys → client.tools()
  │                         (@ai-sdk/mcp; stdio via StdioMCPTransport)
  │
  ├─ new ToolLoopAgent({ model: gateway(cfg.model), instructions, tools: orchestratorTools })
  │
  ├─ orchestrator.generate({ messages, stopWhen: isStepCount(6) })
  │    └─ [phase 007 seam] wrap gateway(cfg.model) in Polar LLM-strategy meter
  │
  ├─ ctx.runMutation(internal.messages.append, { role: 'agent', text, usage })   (phase 002)
  └─ ctx.runAction(internal.channels.send, { threadId, text })                   (phase 003)
       └─ every MCP client closed in finally within each specialist's execute
```

## Implementation Units

---

### Unit 1 — `agents` Convex schema

**Goal:** Define the `agents` table in `convex/schema.ts` with the specialist
config embedded array, plus indexes. This is the data substrate everything else
reads from.

**Requirements:** R1

**Dependencies:** Phase 001 plan
(`2026-06-17-001-feat-convex-foundations-plan.md`) — the `tenant` table (with
`mcpServers[]`) must exist in the same schema. The `agents` table can be added
in the same schema commit.

**Files:**

- `convex/schema.ts` — Modify (add `agents` table definition)

**Approach:** Add the `agents` table to the `defineSchema({})` call. Embed
`specialists[]` as `v.array(v.object({...}))` — bounded per agent, resolved in
one read. Each specialist carries its own `toolkits` and `mcpServerKeys` so the
runtime never infers them. `tenantId` holds the WorkOS organization id.

**Technical design (directional):**

```ts
// convex/schema.ts — directional, not implementation spec
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
	agents: defineTable({
		tenantId: v.string(), // WorkOS org id (= ctx.org.organizationId)
		name: v.string(),
		provider: v.union(v.literal('elevenlabs'), v.literal('internal')),
		externalId: v.optional(v.string()), // ElevenLabs agent id (voice path, phase 005)
		model: v.string(), // gateway model id e.g. 'anthropic/claude-haiku-4.5'
		instructions: v.string(), // orchestrator prompt
		knowledgeBaseIds: v.optional(v.array(v.string())),
		specialists: v.array(
			v.object({
				key: v.string(), // routing key — unique within this agent
				instructions: v.string(), // specialist system prompt
				model: v.optional(v.string()), // override orchestrator model
				toolkits: v.array(v.string()), // Composio toolkit slugs e.g. ['HUBSPOT', 'GMAIL']
				mcpServerKeys: v.optional(v.array(v.string())), // → tenant.mcpServers[].key
			}),
		),
		isActive: v.boolean(),
		updatedAt: v.number(),
	})
		.index('by_tenant', ['tenantId'])
		.index('by_tenant_active', ['tenantId', 'isActive']),
})
```

**Patterns to follow:** Design-doc §5 ERD `agents` fields; `tenant` table shape
in design-doc §1 + phase-001 plan (same `tenantId: v.string()` pattern, no FK
mirror).

**Test scenarios:**

- Schema compiles without Convex type errors.
- `specialists` array accepts empty `[]` (agent with no tools).
- `specialists[].toolkits: []` is valid (specialist registered for BYO MCP
  only).

**Verification:**

- `node_modules/.bin/tsc --noEmit` — zero net-new errors in `convex/schema.ts`
  and `convex/_generated/`.
- `bunx convex dev --once` (or codegen) regenerates `_generated/` without error.
- `node_modules/.bin/biome check --write convex/schema.ts`.

---

### Unit 2 — Composio tool factory (`src/server/ai/agents/specialist/composio.ts`)

**Goal:** A thin, testable function that resolves per-tenant Composio tools
scoped to a specialist's toolkits. Wraps `@composio/core` + `@composio/vercel`
so the specialist builder (Unit 4) never touches the SDK directly.

**Requirements:** R2, R7

**Dependencies:** Composio packages installed at exact versions
(`bun add @composio/core@0.6.7 @composio/vercel@0.6.3`).

**Files:**

- `src/server/ai/agents/specialist/composio.ts` — Create

**Approach:** Export an async
`buildComposioTools(tenantId: string, toolkits: string[]): Promise<ToolSet>`
that:

1. Reuses a module-level `Composio` singleton
   (`new Composio({ provider: new VercelProvider() })` — constructor only reads
   `COMPOSIO_API_KEY`; I/O happens in `create`/`tools.get`). (VERIFY singleton
   reuse at spike; fallback = construct per call.)
2. Returns `{}` immediately if `toolkits` is empty (no Composio call).
3. Resolves toolkit-scoped tools with the **session-creation** filter
   (verified-correct API):
   - Primary:
     `const session = await composio.create(tenantId, { toolkits }); return session.tools()`.
   - Equivalent direct form:
     `return composio.tools.get(tenantId, { toolkits })`.
   - Pick ONE at spike based on the verified `VercelProvider` return type (R2
     VERIFY item). `user_id = tenantId` is the isolation key.

**Technical design (directional):**

```ts
// src/server/ai/agents/specialist/composio.ts
import { Composio } from '@composio/core'
import { VercelProvider } from '@composio/vercel'
import type { ToolSet } from 'ai'

// Process-level singleton: constructor reads COMPOSIO_API_KEY; create()/tools.get() do the I/O.
// VERIFY (spike): safe to reuse across Convex Node-action invocations; else construct per call.
const composio = new Composio({ provider: new VercelProvider() })

export async function buildComposioTools(
	tenantId: string,
	toolkits: string[],
): Promise<ToolSet> {
	if (toolkits.length === 0) return {}
	// Verified-correct: filter toolkits AT SESSION CREATION (NOT session.tools({ toolkits })).
	const session = await composio.create(tenantId, { toolkits }) // user_id = tenantId
	return session.tools() as ToolSet
	// Equivalent direct form (no session object):
	//   return (await composio.tools.get(tenantId, { toolkits })) as ToolSet
}
```

**Patterns to follow:** Design-doc §2; brief-verified correction (filter at
session creation). Reference:
`/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai` — `tools()`
helper shape (sync there; async here for network I/O). Docs:
https://docs.composio.dev/docs/providers/vercel ,
https://docs.composio.dev/docs/tools-direct/executing-tools .

**Test scenarios:**

- `buildComposioTools(tenantId, [])` → returns `{}` without calling Composio.
- `buildComposioTools(tenantId, ['HUBSPOT'])` → calls `composio.create` with
  `(tenantId, { toolkits: ['HUBSPOT'] })`, returns the tool set.
- Two calls with different `tenantId` → same singleton, distinct sessions
  (isolation — assert `create` called twice with distinct ids).
- Network error from Composio propagates (no silent swallow).

**Verification:**

- `node_modules/.bin/vp test run src/server/ai/agents/specialist/composio.test.ts`
  (mock `@composio/core` + `@composio/vercel`).
- `node_modules/.bin/tsc --noEmit`.
- `node_modules/.bin/biome check --write src/server/ai/agents/specialist/composio.ts`.

---

### Unit 3 — BYO MCP client factory (`src/server/ai/agents/specialist/mcp.ts`)

**Goal:** Resolve `mcpServerKeys` from `tenant.mcpServers[]` to live AI SDK MCP
clients (via `@ai-sdk/mcp`), expose `.tools()` per client, and close all clients
in `finally`. Includes the Convex V8 / stdio transport risk callout.

**Requirements:** R3, R6, R9

**Dependencies:** Unit 1 (schema for the `McpServer` shape); Phase 008 stub
(`resolveVaultSecret`); `@ai-sdk/mcp` (installed `2.0.0-beta.66`).

**Files:**

- `src/server/ai/agents/specialist/mcp.ts` — Create

**Approach:** Export `buildMcpClients(mcpServerKeys, mcpServers)` that:

1. Returns empty + no-op `close` if `mcpServerKeys` is empty.
2. Filters `mcpServers` by `key ∈ mcpServerKeys`.
3. Resolves transport per server:
   - `sse`/`http`: `MCPTransportConfig` `{ type, url, headers }`. `redirect`
     defaults to `'error'` — leave default unless a server requires `'follow'`.
   - `stdio`: `new StdioMCPTransport({ command, args })` from
     `@ai-sdk/mcp/mcp-stdio`. **Convex V8 risk**: stdio only works in Node —
     valid because `runAgentTurn` is `'use node'`; never call from a V8 action.
   - Credentials: if `backedBy: 'vault'` and `vaultSecretId`, inject
     `Authorization: Bearer <secret>` from `resolveVaultSecret` (phase-008
     stub).
4. Opens each via `createMCPClient({ transport })` from `@ai-sdk/mcp`.
5. Returns `{ toolSets, close }` where `close()` calls `client.close()` on all
   (idempotent).

**Technical design (directional):**

```ts
// src/server/ai/agents/specialist/mcp.ts
import { createMCPClient, type MCPTransportConfig } from '@ai-sdk/mcp'
import { StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import type { ToolSet } from 'ai'

export interface McpServerConfig {
	key: string
	transport: 'sse' | 'http' | 'stdio'
	url?: string
	command?: string
	args?: string[]
	backedBy: 'hostedOAuth' | 'pipes' | 'vault' | 'none'
	vaultSecretId?: string
}

/** Stub — full implementation in phase 008 (WorkOS Vault). */
async function resolveVaultSecret(_vaultSecretId: string): Promise<string> {
	// Phase 008 wires this to internal.vault.resolve (Convex action)
	throw new Error('resolveVaultSecret not yet implemented (phase 008)')
}

export async function buildMcpClients(
	mcpServerKeys: string[],
	mcpServers: McpServerConfig[],
): Promise<{ toolSets: ToolSet[]; close: () => Promise<void> }> {
	if (mcpServerKeys.length === 0) {
		return { toolSets: [], close: async () => {} }
	}

	const matched = mcpServers.filter((s) => mcpServerKeys.includes(s.key))
	const clients = await Promise.all(
		matched.map(async (s) => {
			let headers: Record<string, string> = {}
			if (s.backedBy === 'vault' && s.vaultSecretId) {
				const secret = await resolveVaultSecret(s.vaultSecretId)
				headers = { Authorization: `Bearer ${secret}` }
			}
			// stdio: only valid in 'use node' (Node action) — NEVER from V8 HTTP.
			if (s.transport === 'stdio' && s.command) {
				return createMCPClient({
					transport: new StdioMCPTransport({
						command: s.command,
						args: s.args,
					}),
				})
			}
			const transport: MCPTransportConfig = {
				type: s.transport === 'sse' ? 'sse' : 'http',
				url: s.url ?? '',
				headers,
			}
			return createMCPClient({ transport })
		}),
	)

	const toolSets = (await Promise.all(
		clients.map((c) => c.tools()),
	)) as ToolSet[]
	let closed = false
	const close = async () => {
		if (closed) return
		closed = true
		await Promise.all(clients.map((c) => c.close()))
	}
	return { toolSets, close }
}
```

**Patterns to follow:** Design-doc §4b (`createMCPClient`), §1
`tenant.mcpServers[]` schema; `src/server/ai/agents/routing.ts` close-in-finally
discipline. Docs:
https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client . VERIFY
`StdioMCPTransport` constructor signature in
`node_modules/@ai-sdk/mcp/dist/mcp-stdio/index.d.ts`.

**Test scenarios:**

- `buildMcpClients([], mcpServers)` → empty toolSets + no-op close, no client
  opened.
- `buildMcpClients(['search'], [{ key: 'search', transport: 'sse', url: 'https://...', backedBy: 'none' }])`
  → opens one SSE client (`createMCPClient` from `@ai-sdk/mcp`), returns its
  tools.
- `backedBy: 'vault'` → calls `resolveVaultSecret`, injects `Authorization`
  header.
- `close()` idempotent — second call no-ops, does not throw.
- `stdio` transport → builds `StdioMCPTransport`; documented as Node-only
  (lint/doc note, not a runtime guard).

**Verification:**

- `node_modules/.bin/vp test run src/server/ai/agents/specialist/mcp.test.ts`
  (mock `@ai-sdk/mcp` `createMCPClient` + `@ai-sdk/mcp/mcp-stdio`).
- `node_modules/.bin/tsc --noEmit`.
- `node_modules/.bin/biome check --write src/server/ai/agents/specialist/mcp.ts`.

---

### Unit 4 — Specialist builder + orchestrator tool assembly

**Goal:** Compose Composio tools and BYO MCP tools into one `ToolSet` per
specialist, then wrap each specialist as a routing-tool for the orchestrator
(lazily, so unused specialists open no sessions). This is the integration point
the orchestrator calls.

**Requirements:** R4, R5, R6

**Dependencies:** Units 2, 3; `src/server/ai/agents/routing.ts`
(`routing`/`customRouting`).

**Files:**

- `src/server/ai/agents/specialist/builder.ts` — Create (builds one specialist
  `ToolLoopAgent` + its `close`)
- `src/server/ai/agents/specialist/index.ts` — Create (exports
  `buildOrchestratorTools`)

**Approach:**

`builder.ts` — `buildSpecialist(tenantId, spec, mcpServers, defaultModel)`:

1. `buildComposioTools(tenantId, spec.toolkits)` → `composioTools`.
2. `buildMcpClients(spec.mcpServerKeys ?? [], mcpServers)` →
   `{ toolSets, close }`.
3. Merge into one scoped bag: `Object.assign({}, composioTools, ...toolSets)`.
4. Return
   `{ agent: new ToolLoopAgent({ model: gateway(spec.model ?? defaultModel), instructions: spec.instructions, tools }), close }`.

`index.ts` —
`buildOrchestratorTools(tenantId, specialists, mcpServers, defaultModel)`:

- Maps each spec to a routing-tool keyed by `spec.key`.
- Specialist is built **lazily inside `execute`** so Composio sessions + MCP
  clients open only when the orchestrator routes to that specialist, and
  `close()` runs in `finally`.
- Returns `Record<string, ReturnType<typeof tool>>` keyed by `spec.key`.

**Lazy seam — important correction:** the existing `routing()` takes a
_pre-built_ `ToolLoopAgent` (eager — wrong for laziness). `customRouting()`
exists for special-case sub-agents, but as currently typed it _also_ requires a
real `agent` (it reads `opts.agent.tools` for the description). Two clean
options — pick at implementation:

- **Option A (preferred): add a `lazyRouting` helper to `routing.ts`** that
  takes `description`, an explicit `toolNames: string[]` (for the description
  text, sourced from `spec` without opening a session), and a
  `factory: () => Promise<{ agent, close }>`. Its `execute` async-generator
  builds the specialist, streams via
  `readUIMessageStream({ stream: toUIMessageStream({ stream: result.stream }) })`,
  and `close()`s in `finally`. This avoids the `agent: null as never` hack
  entirely.
- **Option B (interim, no routing.ts change): build the routing-tool inline**
  with the `ai` `tool()` primitive directly in `index.ts`, mirroring
  `routing.ts`'s `execute` body (shown below).

**Technical design (directional):**

```ts
// src/server/ai/agents/specialist/builder.ts
import { gateway } from '@ai-sdk/gateway'
import { ToolLoopAgent } from 'ai'
import { buildComposioTools } from './composio'
import { buildMcpClients, type McpServerConfig } from './mcp'

export interface SpecialistConfig {
	key: string
	instructions: string
	model?: string
	toolkits: string[]
	mcpServerKeys?: string[]
}

export async function buildSpecialist(
	tenantId: string,
	spec: SpecialistConfig,
	mcpServers: McpServerConfig[],
	defaultModel: string,
) {
	const [composioTools, { toolSets, close }] = await Promise.all([
		buildComposioTools(tenantId, spec.toolkits),
		buildMcpClients(spec.mcpServerKeys ?? [], mcpServers),
	])
	const tools = Object.assign({}, composioTools, ...toolSets)
	const agent = new ToolLoopAgent({
		model: gateway(spec.model ?? defaultModel),
		instructions: spec.instructions,
		tools,
	})
	return { agent, close }
}
```

```ts
// src/server/ai/agents/specialist/index.ts — Option B (inline tool, no routing.ts change)
import { readUIMessageStream, tool, toUIMessageStream } from 'ai'
import { z } from 'zod'
import { buildSpecialist, type SpecialistConfig } from './builder'
import type { McpServerConfig } from './mcp'

export function buildOrchestratorTools(
	tenantId: string,
	specialists: SpecialistConfig[],
	mcpServers: McpServerConfig[],
	defaultModel: string,
) {
	return Object.fromEntries(
		specialists.map((spec) => [
			spec.key,
			tool({
				// description uses spec data only — no session opened to build it
				description: `${spec.instructions.split('\n')[0]}\n\nToolkits: ${spec.toolkits.join(', ') || 'none'}`,
				inputSchema: z.object({ prompt: z.string().min(1) }),
				execute: async function* ({ prompt }, { abortSignal }) {
					// Lazy: Composio session + MCP clients open ONLY when routed here.
					const { agent, close } = await buildSpecialist(
						tenantId,
						spec,
						mcpServers,
						defaultModel,
					)
					try {
						const result = await agent.stream({ prompt, abortSignal })
						for await (const message of readUIMessageStream({
							// top-level toUIMessageStream — result.toUIMessageStream() removed in beta.178
							stream: toUIMessageStream({ stream: result.stream }),
						})) {
							yield message
						}
					} finally {
						await close() // R6: every MCP client closed before returning
					}
				},
			}),
		]),
	)
}
```

> The inline `execute` mirrors `routing.ts` exactly (same
> `readUIMessageStream(toUIMessageStream({ stream: result.stream }))` shape), so
> it stays consistent with the existing helper while adding the lazy build +
> `close()`-in-`finally`. If Option A is chosen, move this body into
> `lazyRouting` in `routing.ts` and have `index.ts` call it.

**Patterns to follow:** `src/server/ai/agents/routing.ts` (`execute` body,
top-level `toUIMessageStream`);
`/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/index.ts`
(orchestrator routing-tool composition).

**Test scenarios:**

- `buildOrchestratorTools` with 2 specialists → object with 2 entries, keys =
  `spec.key`.
- Routing-tool for specialist A, when its `execute` runs, opens a Composio
  session only for A's toolkits (assert `buildComposioTools` called with A's
  toolkits, never B's).
- Routing-tool `execute` calls `close()` in `finally` even when the specialist
  stream throws.
- `buildOrchestratorTools` with `specialists: []` → `{}` (orchestrator acts
  directly, no routing tools).
- Tool-name collision: two specialists each with a `search` tool → no collision
  at orchestrator level (orchestrator sees only `spec.key` routing-tools; each
  `search` is scoped inside its own specialist `ToolLoopAgent`).

**Verification:**

- `node_modules/.bin/vp test run src/server/ai/agents/specialist/builder.test.ts`.
- `node_modules/.bin/tsc --noEmit`.
- `node_modules/.bin/biome check --write src/server/ai/agents/specialist/`.

---

### Unit 5 — Convex `runAgentTurn` Node action

**Goal:** A `'use node'` Convex `internalAction` that resolves agent config,
assembles the orchestrator with routing-tools, runs one turn, persists the
result, and dispatches the outbound send. Runtime entry point called by the
channel webhook (phase 002/003) via `ctx.scheduler.runAfter(0, ...)`.

**Requirements:** R4, R5, R6, R9

**Dependencies:** Units 1, 4; `convex/funcs/agents.ts` `resolveForTurn` (Unit
6); Phase 002/003 (`internal.messages.*`, `internal.channels.send` — stubbed).

**Files:**

- `convex/funcs/agentRuntime.ts` — Create (`'use node'` `internalAction`)

**Approach:** Read agent config + history, call `buildOrchestratorTools`,
instantiate the orchestrator `ToolLoopAgent`, call
`orchestrator.generate({ messages, stopWhen: isStepCount(6) })`, persist the
result with usage (phase-007 metering seam), dispatch the outbound send. MCP
clients close inside each specialist's `execute` `finally` (no top-level close
needed). The model wrapping for Polar metering is marked with a seam comment.

**Technical design (directional):**

```ts
// convex/funcs/agentRuntime.ts
'use node'
import { gateway } from '@ai-sdk/gateway'
import { isStepCount, ToolLoopAgent } from 'ai'
import { v } from 'convex/values'
import { buildOrchestratorTools } from '../../src/server/ai/agents/specialist' // VERIFY import resolves under Convex bundler
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'

export const runAgentTurn = internalAction({
	args: {
		tenantId: v.string(),
		threadId: v.id('threads'),
		inboundText: v.string(),
	},
	handler: async (ctx, { tenantId, threadId, inboundText }) => {
		const [cfg, history] = await Promise.all([
			ctx.runQuery(internal.agents.resolveForTurn, { tenantId, threadId }),
			ctx.runQuery(internal.messages.history, { threadId, limit: 50 }), // phase 002
		])
		if (!cfg) throw new Error(`No active agent for tenant ${tenantId}`)

		const mcpServers = cfg.tenantMcpServers ?? []
		const orchestratorTools = buildOrchestratorTools(
			tenantId,
			cfg.specialists,
			mcpServers,
			cfg.model,
		)

		// PHASE 007 SEAM: wrap gateway(cfg.model) with the Polar LLM-strategy meter here.
		const model = gateway(cfg.model)

		const orchestrator = new ToolLoopAgent({
			model,
			instructions: cfg.instructions,
			tools: orchestratorTools,
		})

		// NOTE: pass ModelMessage[]. If `history` holds UIMessages, first:
		//   const modelMessages = await convertToModelMessages(uiMessages)  // convertToModelMessages is ASYNC
		const result = await orchestrator.generate({
			messages: [
				...history.map((m: { role: string; text: string }) => ({
					role: m.role as 'user' | 'assistant',
					content: m.text,
				})),
				{ role: 'user' as const, content: inboundText },
			],
			stopWhen: isStepCount(6), // NOT maxSteps — that param does not exist
		})

		await ctx.runMutation(internal.messages.append, {
			threadId,
			tenantId,
			role: 'agent',
			text: result.text,
			usage: result.usage, // persisted for Polar metering (phase 007)
		}) // phase 002

		await ctx.runAction(internal.channels.send, { threadId, text: result.text }) // phase 003
	},
})
```

**Patterns to follow:** Design-doc §4b `runAgentTurn` sketch (adapted Next.js →
Convex `internalAction`); `convex/utils.ts` (this is _internal_ — no auth at
this layer; the public TanStack server route authenticates before scheduling).
`'use node'` must be the first statement in the file.

**Test scenarios:**

- Happy path: resolves config, builds orchestrator, persists message, calls
  `channels.send` (Convex test harness with a seeded agent).
- Config not found: `resolveForTurn` returns null → action throws before
  persisting.
- Generate throws: `messages.append` not called; error propagates to the Convex
  action handler.
- `stopWhen: isStepCount(6)` caps the loop (no infinite tool loop).

**Verification:**

- `node_modules/.bin/tsc --noEmit` (zero net-new errors in
  `convex/funcs/agentRuntime.ts`).
- `node_modules/.bin/biome check --write convex/funcs/agentRuntime.ts`.
- Integration: schedule `runAgentTurn` in a dev deployment with a seeded agent
  config; confirm Node runtime + `@ai-sdk/mcp`/Composio load (this IS the R9
  spike).

---

### Unit 6 — Convex `agents` CRUD functions

**Goal:** Authed queries/mutations for the oRPC layer + an internal
`resolveForTurn` query for `runAgentTurn`. Enforces `tenantId` scoping via
`authQuery`/`authMutation` (`convex/utils.ts`), which inject `{ user, org }`;
`ctx.org.organizationId` is the tenant key.

**Requirements:** R1, R8

**Dependencies:** Unit 1 (schema); `convex/utils.ts` (`authQuery`,
`authMutation`); phase 001 (`tenant` table for the join in `resolveForTurn`).

**Files:**

- `convex/funcs/agents.ts` — Create

**Approach:** Use `authQuery`/`authMutation` from `convex/utils.ts` — they
inject `{ user, org }`; `ctx.org.organizationId` is the tenant. Note these are
built on `convex-helpers/server/zod4` (`zCustomQuery`/`zCustomMutation`), so
`args` are **zod** schemas, not `convex/values` validators. Add an
`internalQuery` `resolveForTurn` that joins `tenant.mcpServers` in one pass.

**Technical design (directional):**

```ts
// convex/funcs/agents.ts — directional
import { z } from 'zod'
import { v } from 'convex/values'
import { internalQuery } from '../_generated/server'
import { authMutation, authQuery } from '../utils'

// Public (authed) — tenantId is ctx.org.organizationId, never from input.
export const list = authQuery({
	args: {},
	handler: async (ctx) => {
		const tenantId = ctx.org.organizationId
		return ctx.db
			.query('agents')
			.withIndex('by_tenant', (q) => q.eq('tenantId', tenantId))
			.collect()
	},
})

export const get = authQuery({
	args: { agentId: z.string() }, // zod (zCustomQuery) — cast to Id in handler
	handler: async (ctx, { agentId }) => {
		const agent = await ctx.db.get(agentId as never)
		if (!agent || agent.tenantId !== ctx.org.organizationId) return null
		return agent
	},
})

export const upsert = authMutation({
	args: {
		/* agent fields as zod — OMIT tenantId; injected from ctx.org.organizationId */
	},
	handler: async (ctx, args) => {
		const tenantId = ctx.org.organizationId
		// insert or patch by id; always set tenantId = ctx.org.organizationId, updatedAt = Date.now()
	},
})

// Internal — used by runAgentTurn; NOT exposed to clients (convex/values validators).
export const resolveForTurn = internalQuery({
	args: { tenantId: v.string(), threadId: v.id('threads') },
	handler: async (ctx, { tenantId }) => {
		const [agent, tenant] = await Promise.all([
			ctx.db
				.query('agents')
				.withIndex('by_tenant_active', (q) =>
					q.eq('tenantId', tenantId).eq('isActive', true),
				)
				.first(),
			ctx.db
				.query('tenant')
				.withIndex('by_tenant', (q) => q.eq('tenantId', tenantId))
				.first(),
		])
		if (!agent) return null
		return { ...agent, tenantMcpServers: tenant?.mcpServers ?? [] }
	},
})
```

**Patterns to follow:** `convex/utils.ts` `authQuery`/`authMutation` (zod4-based
— args are zod schemas, ctx has `{ user, org }`); `convex/workos.ts` for WorkOS
access; design-doc §7.1 "RLS enforced by the framework." VERIFY the `tenant`
table index name (`by_tenant`) against the phase-001 plan.

**Test scenarios:**

- `list` for `org_A` never returns `org_B` documents.
- `get` for an agentId in another org → `null`.
- `resolveForTurn` returns `tenantMcpServers: []` when the tenant doc is missing
  (graceful).
- `upsert` sets `tenantId` from `ctx.org.organizationId`, ignores any `tenantId`
  in args.

**Verification:**

- `node_modules/.bin/tsc --noEmit`.
- `node_modules/.bin/biome check --write convex/funcs/agents.ts`.
- Manual: `bunx convex run agents:list` in a dev deployment with a seeded
  tenant.

---

### Unit 7 — oRPC agents contract + router

**Goal:** Expose agent CRUD as typed oRPC procedures so the React UI calls
`list`/`get`/`upsert`/`delete` with end-to-end types. Reads use `org`; mutations
use `adminOrg`. `organizationId` is always from middleware context, never input.

**Requirements:** R8

**Dependencies:** Unit 6 (Convex functions); `src/server/rpc/init.ts` (`os`,
`org`, `adminOrg`); `src/server/rpc/contracts/{base.ts,index.ts}`,
`src/server/rpc/index.ts`.

**Files:**

- `src/server/rpc/contracts/agents.contract.ts` — Create
- `src/server/rpc/routes/agents.router.ts` — Create
- `src/server/rpc/contracts/index.ts` — Modify (add `agents` to the `contract`
  object)
- `src/server/rpc/index.ts` — Modify (register `agentsRouter` in
  `os.router({...})`)

**Approach:** Mirror `work-os.contract.ts` + `work-os.router.ts`. The contract
imports `base` from `./base` and chains
`base.route({...}).input(zodSchema).output(zodSchema)` with **plain `zod`** —
NOT `@orpc/contract`'s bare `oc` per procedure, and NOT `@orpc/zod`'s
`oz.schema(...)`. Procedures are grouped in a plain object `agentsContract`. The
router uses `os.agents.router({...})`; handlers walk the middleware + contract
path (`org.agents.list.handler(...)`, `adminOrg.agents.upsert.handler(...)`).
Handlers call Convex via the server-side Convex client (match the existing
work-os router's Convex access pattern). `organizationId` comes from
`context.organizationId`.

**Technical design (directional):**

```ts
// src/server/rpc/contracts/agents.contract.ts
import { z } from 'zod'
import { base } from './base'

const specialistSchema = z.object({
	key: z.string(),
	instructions: z.string(),
	model: z.string().optional(),
	toolkits: z.array(z.string()),
	mcpServerKeys: z.array(z.string()).optional(),
})

const agentSchema = z.object({
	_id: z.string(),
	tenantId: z.string(),
	name: z.string(),
	provider: z.enum(['elevenlabs', 'internal']),
	externalId: z.string().optional(),
	model: z.string(),
	instructions: z.string(),
	specialists: z.array(specialistSchema),
	isActive: z.boolean(),
	updatedAt: z.number(),
})

// tenantId/_id/updatedAt are server-derived — excluded from write input.
export const upsertAgentInput = agentSchema
	.omit({ _id: true, tenantId: true, updatedAt: true })
	.partial({ provider: true, externalId: true })

export const agentsContract = {
	list: base
		.route({ method: 'GET', path: '/agents', tags: ['Agents'] })
		.output(z.array(agentSchema)),
	get: base
		.route({ method: 'GET', path: '/agents/{agentId}', tags: ['Agents'] })
		.input(z.object({ agentId: z.string() }))
		.output(agentSchema.nullable()),
	upsert: base
		.route({ method: 'POST', path: '/agents', tags: ['Agents'] })
		.input(upsertAgentInput)
		.output(z.object({ agentId: z.string() })),
	delete: base
		.route({ method: 'DELETE', path: '/agents/{agentId}', tags: ['Agents'] })
		.input(z.object({ agentId: z.string() }))
		.output(z.object({ ok: z.boolean() })),
}
```

```ts
// src/server/rpc/routes/agents.router.ts — directional
import { adminOrg, org, os } from '@server/rpc/init'

export const agentsRouter = os.agents.router({
	list: org.agents.list.handler(async ({ context }) => {
		// call Convex agents:list scoped to context.organizationId
	}),
	get: org.agents.get.handler(async ({ context, input }) => {
		// Convex enforces org scoping (Unit 6); returns null if cross-org
	}),
	upsert: adminOrg.agents.upsert.handler(async ({ context, input }) => {
		// organizationId = context.organizationId; never from input
	}),
	delete: adminOrg.agents.delete.handler(async ({ context, input }) => {}),
})
```

**Patterns to follow:** `src/server/rpc/contracts/work-os.contract.ts`
(base.route().input().output() with raw zod; named input schemas exported for
client form reuse); `src/server/rpc/routes/work-os.router.ts` (`os.<ns>.router`,
`org`/`adminOrg` handlers, Convex access); `src/server/rpc/init.ts` middleware.
VERIFY the Convex server-client access pattern actually used in the work-os
router at implementation.

**Test scenarios:**

- `agents.list` without auth → `UNAUTHORIZED` (from `auth` under `org`).
- `agents.list` authed but no active org → `NO_ACTIVE_ORGANIZATION`.
- `agents.upsert` by a non-admin → `NO_ADMIN_ROLE` (from `adminOrg`).
- `agents.get` with an id in another org → `null` (Convex-level, Unit 6).
- Type inference: `organizationId` is absent from `upsert` input (enforced by
  `upsertAgentInput` omit).

**Verification:**

- `node_modules/.bin/tsc --noEmit` (zero net-new errors in `src/server/rpc/`).
- `node_modules/.bin/biome check --write src/server/rpc/contracts/agents.contract.ts src/server/rpc/routes/agents.router.ts`.
- Manual: call `agents.list` from a TanStack route in dev; assert typed `[]`.

---

## System-Wide Impact

- **`convex/schema.ts`** — adding `agents` changes the generated `DataModel`;
  all Convex functions get updated inference automatically. No breaking change
  until a function reads `agents`.
- **`src/server/ai/index.ts`** — `agentRequestHandler` currently has no tools
  and no `tenantId`. After Unit 4, it can accept a `tenantId` and call
  `buildOrchestratorTools`; the existing test (`__tests__/chat-handler.test.ts`)
  must then mock `@composio/core`, `@composio/vercel`, and `@ai-sdk/mcp`. Until
  wired, the handler stays as-is (no regression).
- **Node runtime** — `convex/funcs/agentRuntime.ts` with `'use node'` adds a
  Node action to the deployment surface. `convex/http.ts` stays V8.
- **Package additions** — `@composio/core@0.6.7`, `@composio/vercel@0.6.3`
  (exact pins). `@ai-sdk/mcp@2.0.0-beta.66` and `@ai-sdk/gateway` are already
  installed. Run `bun add @composio/core@0.6.7 @composio/vercel@0.6.3`; commit
  the lockfile.
- **Phase 002/003 dependency** — `runAgentTurn` calls
  `internal.messages.history`/`internal.messages.append`/`internal.channels.send`,
  which do not exist yet. They typecheck only once added (as placeholder
  exports) by phases 002/003; until then the action references undefined
  `internal.*` paths and will not typecheck — land this plan's Unit 5 behind
  those stubs or after 002/003.

## Risks & Dependencies

| Risk                                                                                            | Severity | Mitigation                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex Node action cannot load `@ai-sdk/mcp` (esp. stdio) or Composio                           | High     | R9 spike (Unit 5 integration test): schedule `runAgentTurn` in dev, confirm imports resolve + a real MCP/Composio call works. Fallback: run the tool loop in the TanStack server route (Node) and write results back to Convex. |
| Composio SDK pre-1.0 (preview) API churn between patch versions                                 | High     | Pin exact (`@composio/core@0.6.7`, `@composio/vercel@0.6.3`); review the Composio changelog (https://docs.composio.dev/docs/changelog) at pin time; the `entity_id → user_id` rename already landed.                            |
| Relative import `convex/funcs/... → src/server/ai/...` may not resolve under the Convex bundler | Medium   | VERIFY at spike; fallback colocate the builder under `convex/ai/` or add a bundler-honored path alias.                                                                                                                          |
| `customRouting`/`routing` cannot express lazy specialist construction without an `agent`        | Low      | Use Option B (inline `tool()` in `index.ts`) now, or add `lazyRouting` to `routing.ts` (Option A). Tracked as tech debt; both avoid the `agent: null as never` hack.                                                            |
| Convex Node cold-start + Composio/MCP I/O per turn                                              | Medium   | Measure P95 in staging; if > 2s, cache Composio tool resolution in a short-lived cache (phase 007 action-cache component).                                                                                                      |
| Phase 001 `tenant` table not committed when this lands                                          | Medium   | Build Units 1-7 in a branch; merge after phase-001 schema commit. `resolveForTurn` degrades gracefully (`mcpServers: []`).                                                                                                      |
| WorkOS Vault `resolveVaultSecret` stub always throws                                            | Low      | Only affects `backedBy: 'vault'` MCP servers. Phase 008 implements it; until then those servers return a descriptive error.                                                                                                     |

## Documentation & References

### External dependencies — install commands + canonical docs

- **`@composio/core@0.6.7`** + **`@composio/vercel@0.6.3`** (exact pins; pre-1.0
  preview SDK)
  - Install: `bun add @composio/core@0.6.7 @composio/vercel@0.6.3`
  - Vercel AI SDK provider (init + session + `session.tools()`):
    https://docs.composio.dev/docs/providers/vercel
  - Fetching tools by toolkit (`composio.tools.get(userId, { toolkits })`):
    https://docs.composio.dev/docs/tools-direct/executing-tools
  - Next-gen SDK + `entity_id → user_id` migration:
    https://docs.composio.dev/docs/migration-guide/new-sdk
  - Toolkit versioning migration:
    https://docs.composio.dev/docs/migration-guide/toolkit-versioning
  - Changelog (check at pin time): https://docs.composio.dev/docs/changelog
  - npm: https://www.npmjs.com/package/@composio/core ,
    https://www.npmjs.com/package/@composio/vercel
- **`@ai-sdk/mcp@2.0.0-beta.66`** (already installed; MCP client lives here, NOT
  in `ai`)
  - `createMCPClient` reference:
    https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client
  - Installed types: `node_modules/@ai-sdk/mcp/dist/index.d.ts`
    (`createMCPClient`, `MCPTransportConfig`, `MCPClientConfig`); stdio:
    `node_modules/@ai-sdk/mcp/dist/mcp-stdio/index.d.ts` (`StdioMCPTransport`)
- **`ai@7.0.0-beta.178`** (installed) — `ToolLoopAgent`, `tool`,
  `readUIMessageStream`, top-level `toUIMessageStream`,
  `isStepCount`/`stepCountIs`, `convertToModelMessages` (async),
  `createAgentUIStreamResponse`
  - https://ai-sdk.dev/docs/agents/overview ,
    https://ai-sdk.dev/docs/reference/ai-sdk-core
  - Installed types: `node_modules/ai/dist/index.d.ts`
- **`@ai-sdk/gateway`** (installed) — `gateway(modelId)`:
  https://ai-sdk.dev/docs/ai-sdk-core/provider-management
- **`convex@1.41`** + **`convex-helpers@0.1.119`** —
  `internalAction`/`internalQuery`/`internalMutation`, `'use node'` actions,
  `zCustomQuery`/`zCustomMutation` (zod4)
  - Node actions: https://docs.convex.dev/functions/runtimes
  - Scheduling: https://docs.convex.dev/scheduling/scheduled-functions
  - convex-helpers custom functions:
    https://github.com/get-convex/convex-helpers
- **`@orpc/*`** (installed) — contract-first `implement(contract)`,
  `base.route().input().output()` with raw zod, `os.<ns>.router(...)`
  - https://orpc.unnoq.com/docs/contract-first/define-contract ,
    https://orpc.unnoq.com/docs/middleware
- **WorkOS Vault** (phase 008 — `resolveVaultSecret` stub here):
  https://workos.com/docs/vault

### Design-doc sections (docs/rebuild-architecture.md)

- §2 "Agent tools" — Composio day-one, `user_id = organizationId`, toolkit
  filter at session creation, no flat merge, BYO MCP via `tenant.mcpServers[]`
  (Units 2-4).
- §4b "Text agent runtime" — orchestrator + specialist flow; `createMCPClient` +
  `runAgentTurn` sketch (Units 3, 5).
- §1 `tenant.mcpServers[]` schema — `key`, `transport`, `url`, `command`,
  `backedBy`, `vaultSecretId` (Unit 3).
- §5 ERD — `agents` table fields (Unit 1).
- §7.1 "RLS enforced by the framework" (Units 6, 7).

### Reference-repo paths

- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai` — clean
  `ToolLoopAgent` factory + `tools()` helper (Units 2, 4).
- `/Users/angel/dev/sunday/sunday-ontology/apps/sunday/src/server/ai/index.ts` —
  `createAgentUIStreamResponse` + routing-tool composition (Unit 4).
- `/Users/angel/dev/ontology/src/server/ai/agents` — heavy special-case
  sub-agents (the `customRouting` intent; Unit 4).

### agent.io code anchors

- `src/server/ai/index.ts`, `src/server/ai/agents/routing.ts` (Unit 4)
- `src/server/rpc/init.ts`,
  `src/server/rpc/contracts/{base.ts,index.ts,work-os.contract.ts}`,
  `src/server/rpc/routes/work-os.router.ts`, `src/server/rpc/index.ts` (Unit 7)
- `convex/utils.ts`, `convex/convex.config.ts`, `convex/schema.ts`,
  `convex/http.ts` (Units 1, 5, 6)

### Sibling plans

- `2026-06-17-001-feat-convex-foundations-plan.md` (tenant schema +
  `mcpServers[]`, RLS substrate)
- `2026-06-17-002-feat-conversation-substrate-plan.md`
  (`messages.history`/`append` stubs)
- `2026-06-17-003-feat-channel-adapters-plan.md` (`channels.send` stub)
- `2026-06-17-005-feat-voice-runtime-elevenlabs-plan.md` (uses
  `agents.externalId` + `specialists[].toolkits`)
- `2026-06-17-007-feat-billing-polar-plan.md` (Polar LLM-strategy meter wraps
  the model in `runAgentTurn`)
- `2026-06-17-008-feat-secrets-vault-pipes-plan.md` (implements
  `resolveVaultSecret`)

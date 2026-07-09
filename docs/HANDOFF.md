# Session Handoff — agent.io platform build

Date: 2026-07-09 · Branch: `main` (all work committed & pushed through `e219ebf`;
user has since added back-office routes + env config scaffolding)

## Where to orient first (do not duplicate — read these)

| Artifact | What it holds |
|---|---|
| `README.md` | Full architecture map, tenancy model, key concepts, dev workflow |
| `CONTEXT.md` | **Binding glossary** (Tenant, Agent Draft/Version, System Tool, MCP Connection, KB, Tenant Settings) |
| `docs/adr/0001-…` | No auth tables; `tenant` = WorkOS org id; derive-don't-pass on machine paths |
| `docs/plans/2026-07-05-001-…-plan.md` | The domain-layer plan — **all 14 units executed** (checkboxes reflect reality) |
| `docs/reference/erd-calls-agents.md` | ERD + procedures/MCP/KB schema specs + runtime flows |
| `docs/voice-provider-adapter.md` | Realtime layer design, SDK-verified (contracts, quirk tables, MCP lifecycle) |
| `docs/.references/` | Fetched vendor docs (EL, OpenAI, xAI, Composio, Convex) — gitignored, regenerable |

## State of the build

- **`packages/domain`** — 14 zod tables (`tenantTable`), const-array enums,
  discriminated-union value objects. 29 tests.
- **`packages/convex`** — schema (indexes chained at definition site),
  tenant/machine builders (RLS + Triggers), two-tier functions
  (`api/internals/*` generated CRUD ← business modules delegate via
  `ctx.runMutation`), KB ingestion/search (`ai` SDK embeddings), conversation
  substrate. 20 tests incl. the cross-package contract suite.
- **`packages/agent`** — `VoiceProvider` contract implemented by
  `OpenAIDialectProvider` (sessions + client secrets + SIP telephony via the
  official `openai` client; xAI = baseURL swap + quirks). MCP servers are a
  separate channel (`MCPServerStreamableHttp` + connect/close lifecycle, never
  in `tools`). Composio: platform `COMPOSIO_API_KEY` (lazy), tenant binding via
  `composioClient(tenant)`. Procedure engine (code-gated Ask), transcript
  recorder (injected `ConvexIngest`). 27 tests.
- **Apps are still skeletons** (user just started back-office agent routes).
  Nothing constructs `ResolverDeps` yet — binding `composioClient`,
  `ConvexIngest`, `SessionCache` to real infra is app-plan work.

## Conventions the user enforces (violating these gets code rejected)

1. **Use the real SDK surface, never hand-rolled fetch** — `openai` client for
   REST (`realtime.clientSecrets`, `realtime.calls.*`), `@openai/agents-realtime`
   for sessions, `@composio/core` for Composio, `ai` for embeddings.
2. **Don't mix concepts**: MCP servers ≠ tools (own channel + lifecycle);
   business logic ≠ plumbing (business modules validate/assert, then delegate
   writes to `internal.api.internals.*`).
3. **Domain style**: lowerCamelCase table exports; enums as exported
   `as const` arrays; `z.discriminatedUnion` wherever a discriminator exists;
   helpers stay single-purpose (indexes belong in `convex/src/schema.ts`).
4. **Clients are bindings**: platform holds API keys (env); tenant identity
   enters at the client level (`composioClient(tenant)`), never as a call arg.
5. **Validate mermaid before shipping docs** (headless `mermaid.parse` harness
   exists in the previous session's scratchpad — rebuild if needed).
6. Tests green + `tsc --noEmit` clean per package before any commit
   (`vp test run`, hooks run `vp staged` — keep `docs/.references` out of
   staging-heavy commits).

## NEXT STEP (user-requested): per-app env config via discriminated union

The user scaffolded `packages/domain/src/config/`:
`shared.ts` (filled: NODE_ENV, AI_GATEWAY_API_KEY, WORKOS_*, REDIS_*),
`back-office.ts`, `v-inbound.ts`, `v-outboubnd.ts` (filename typo — rename),
`message.ts` (empty). `.env.local` files exist in `apps/back-office` and
`packages/convex` (gitignored — never read values into docs/commits).

Intended design (agreed direction — implement this):

```ts
// packages/domain/src/config/index.ts — directional sketch
import { z } from 'zod'
import { config as shared } from './shared'

export const APPS = ['back-office', 'v-inbound', 'v-outbound', 'messages'] as const
export type AppName = (typeof APPS)[number]

// per-app schemas extend shared with an APP literal discriminator
const backOffice = shared.extend({
  APP: z.literal('back-office'),
  CONVEX_URL: z.string(),
  // widget token minting happens here later (OPENAI/XAI keys NOT needed yet)
})
const vInbound = shared.extend({
  APP: z.literal('v-inbound'),
  OPENAI_API_KEY: z.string(),
  XAI_API_KEY: z.string(),
  COMPOSIO_API_KEY: z.string(),
  CONVEX_URL: z.string(),
  CONVEX_SERVICE_TOKEN: z.string(), // machine-path auth (plan Key Decisions)
})
const vOutbound = vInbound.extend({ APP: z.literal('v-outbound') /* + telephony leg creds */ })
const messages = shared.extend({ APP: z.literal('messages') /* + WhatsApp/SMS creds */ })

export const envSchema = z.discriminatedUnion('APP', [backOffice, vInbound, vOutbound, messages])
export type Env = z.infer<typeof envSchema>

/** Each app calls loadEnv('v-inbound') at boot → narrowed, validated env. */
export const loadEnv = <A extends AppName>(app: A) =>
  envSchema.parse({ ...process.env, APP: app }) as Extract<Env, { APP: A }>
```

Implementation notes:
- Follow the house style: const-array `APPS`, discriminated union on `APP`,
  the literal injected by `loadEnv` (apps shouldn't have to set APP in .env).
- Replace the per-file `z.object({}).parse(process.env)` stubs with per-app
  schema exports; `index.ts` holds the union + `loadEnv`; barrel-export from
  domain (`./config` package export, mirroring `./schemas`).
- Convex functions do NOT use this (Convex env is `convex.config.ts` typed
  env); this is for the Bun/Hono apps + back-office server.
- Decide with the user which vars each service app actually needs (the
  v-inbound list above is inferred from the adapter design, not confirmed).
- Add tests mirroring `schemas/__tests__` style (missing var fails with a
  clear error; wrong-app vars don't leak into the narrowed type).

## Remaining backlog (in rough order)

1. Env config union (above) + rename `v-outboubnd.ts`.
2. App plans (follow-ups named in the domain plan's "Deferred to Separate
   Tasks"): v-inbound webhook + acceptCall flow → v-outbound dial/batch →
   back-office editor surfaces (user has started routes) → messages.
3. Service→Convex auth: expose machine mutations through token-authenticated
   HTTP actions in `packages/convex/src/http.ts` (decision recorded in the
   plan; not yet implemented).
4. Deferred infra: `tenantSecrets` store (BYO MCP headers gated until then),
   retention enforcement job, post-call analysis jobs.
5. Docs still wanted: OpenAI `realtime.call.incoming` webhook payload ref;
   xAI `/voice-realtime.ws.json`.

## Suggested skills

- `plan-loop` — for executing the next app plan end-to-end once written.
- `compound-engineering:ce-plan` — to write the v-inbound (or env-config)
  plan; it auto-runs doc review.
- `grill-with-docs` — the user likes being interviewed on design decisions
  (used for the tenancy/domain model); good for the env/app plans.
- `code-review` — run before committing substantial changes; the user
  reviews closely and rejects corner-cutting.

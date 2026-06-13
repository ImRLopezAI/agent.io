---
title: "refactor: TanStack AI orchestration + Vercel AI SDK removal"
type: refactor
status: active
date: 2026-06-13
origin: docs/plans/2026-06-13-002-refactor-migrate-vercel-ai-to-tanstack-plan.md
---

# refactor: TanStack AI orchestration + Vercel AI SDK removal

> **Execution note for codex:rescue agents.** Verify TypeScript ONLY with
> `node_modules/.bin/tsc --noEmit` — `npx tsc` resolves a stub package in this
> repo and reports nothing. Run tests with `bunx vitest run <path>`. Format with
> `bunx biome check --write <files>`. The repo has a pre-existing ~46-error tsc
> baseline (convex/, components/evilcharts, media-chrome, etc.) and one
> pre-existing failing test (`orchestrator-message-filter.test.ts`, wrong import
> path) — your bar is **zero net-new** tsc errors in files you touch and green
> tests for units you implement. The branch is `feat/gateway-tanstack-ai-adapter`.

## Overview

Finish the Vercel AI SDK → `@tanstack/ai` migration by redesigning the
multi-agent orchestration on AG-UI primitives and removing `ai` + `@ai-sdk/react`.
This refines Units 3/6/7/8/9 of the origin plan
(see origin: `docs/plans/2026-06-13-002-refactor-migrate-vercel-ai-to-tanstack-plan.md`).

The origin plan's deferred question — *how to forward a sub-agent `chat()`
stream into the parent AG-UI stream* — is **resolved**: a `@tanstack/ai` server
tool's execute context exposes `emitCustomEvent(name, value)`, which streams
AG-UI `CUSTOM` events to the client in real time. So the sub-agent routing tools
emit `agent.boundary` / `agent.step` / `agent.text` / `agent.spec` custom events
while running their sub-agent and return the accumulated prose for the loop. The
client consumes them via `useChat({ onCustomEvent })`. No middleware hack, no
manual stream merge, no `UIMessageStreamWriter`.

Already shipped (origin plan Phase 1): the gateway adapter (`gatewayText`), the
server handler (`chat()` + SSE), the client hooks (`@tanstack/ai-react`), and the
message-parts rewiring. This plan closes the remaining work.

## Problem Frame

`src/server/ai/agents/lib/routing.ts` still runs sub-agents on `ToolLoopAgent` +
`tool({execute})` + `UIMessageStreamWriter` drain with `data-agent-boundary` /
`data-agent-step` parts, a db-doctor chunk cache, and renderer `pipeJsonRender`
spec lifting. The three stream-transform helpers
(`prefix-text-part-ids`, `rewrite-renderer-parts`, `strip-renderer-tool-parts`)
and `src/lib/editor/markdown-joiner-transform.ts` still import from `ai`, which is
why `ai` / `@ai-sdk/react` can't be removed yet. The client renders agent
boundaries by walking `data-agent-*` message parts
(`src/components/ai/segment-parts.ts`), which no longer arrive under `chat()`.

## Requirements Trace

- R1. Sub-agent (`db-doctor`, `renderer`) output streams to the client **live**
  via AG-UI `CUSTOM` events emitted from the tool execute context, with paired
  start/end agent boundaries.
- R2. Routing tools are `toolDefinition().server()` registered on the handler's
  `chat({ tools })`; the orchestrator composes follow-up turns from sub-agent
  text (db-doctor digest → renderer prompt).
- R3. db-doctor request-scoped cache replays a prior sub-agent run (re-emits its
  recorded events) with a visible "from cache" badge.
- R4. Renderer `pipeJsonRender` spec lifting is preserved (```spec → an
  `agent.spec` custom event the artifact UI renders).
- R5. The client renders agent boundaries/steps/spec from `onCustomEvent`
  state, matching the pre-migration collapsible agent UX.
- R6. Tool approval works through `addToolApprovalResponse` (origin Unit 6).
- R7. `ai` and `@ai-sdk/react` are removed from `package.json`; no app file
  imports them. `@ai-sdk/gateway` (+ `@ai-sdk/provider*`, `@vercel/oidc`) remain.
- R8. Real `node_modules/.bin/tsc` shows zero net-new errors; a live gateway
  chat round-trip (text + one orchestrated sub-agent turn) passes.

## Scope Boundaries

- **Not** changing the gateway adapter, the server handler shell, the client
  hooks, or the message-parts rewiring already shipped in the origin plan.
- **Not** adding per-provider TanStack adapters — everything routes through
  `gatewayText`.
- **Not** redesigning the agent UI visually — same collapsible components, new
  data source (custom events instead of `data-agent-*` parts).
- **Not** building image/audio/video generation UIs.

### Deferred to Separate Tasks

- Attachment `file` → `ContentPart` mapping in `use-ai.ts` (origin plan gap;
  independent of orchestration).
- Convex persisted-message backfill, if any historical chats exist in the old
  wire shape (origin plan Unit 2 audit).

## Context & Research

### Relevant Code and Patterns

- `src/server/ai/agents/lib/routing.ts` — `dbDoctorRoutingTool` /
  `rendererRoutingTool` (the `tool({execute})` + `UIMessageStreamWriter` drain to
  replace), `DbDoctorCache`, `drainIntoWriter`, `extractTextFromChunks`.
- `src/server/ai/index.ts` — shipped `chat()` handler; add `tools: [...]`.
- `src/server/ai/gateway/text/adapter.ts` — `gatewayText` (sub-agent adapter).
- `src/server/ai/agents/lib/{prefix-text-part-ids,rewrite-renderer-parts,strip-renderer-tool-parts}.ts`
  — `UIMessageChunk`/`UIMessage` transforms to delete or retype.
- `src/components/ai/segment-parts.ts` — agent-boundary part walker to rewrite
  onto the custom-event model.
- `src/components/ai/messages.tsx`, `src/components/ui/ai-elements/agent.tsx` —
  agent-segment rendering.
- `src/components/ui/ai/use-ai.ts` — shipped `useChat`; add `onCustomEvent`.
- `src/components/ui/ai-elements/confirmation.tsx` — approval UI (Unit 6).
- `src/lib/editor/markdown-joiner-transform.ts` — `TextStreamPart`/`ToolSet`
  from `ai` (editor-only).
- `src/server/ai/gateway/__tests__/text-adapter.live.test.ts` — the live-gateway
  test harness to reuse (env-gated on `AI_GATEWAY_API_KEY` from `.env.local`).
- `pipeJsonRender` from `@json-render/core` — used by the renderer sub-agent.

### Resolved Contracts (verified in installed packages)

- `ToolExecutionContext = { toolCallId?, abortSignal?, context, emitCustomEvent:
  (eventName: string, value: Record<string, any>) => void }`
  (`@tanstack/ai` types.d.ts). `toolDefinition({...}).server(async (args, ctx) =>
  result)` receives it. Custom events stream to the client as AG-UI `CUSTOM`.
- `@tanstack/ai-client` `ChatClientOptions.onCustomEvent?: (eventType: string,
  data: unknown, context: {...}) => void` — surfaced through `useChat` options.
- `chat({ adapter, messages|prompt, systemPrompts, tools, stream })` — sub-agent
  runs via `chat({ adapter: gatewayText(subModel), stream: false })` (collect
  text) or streaming (iterate `StreamChunk`s to emit per-delta).
- `gatewayText(modelId)` adapter; `StreamChunk` = AG-UI events (`EventType`).

### Institutional Learnings

- `docs/solutions/` has no entry yet; the custom-event sub-agent-forwarding
  pattern is novel and reusable — capture it after Unit 1 (see Documentation).
- Real-tsc-only verification and `docs/ref/**` tsconfig exclusion (origin plan).

## Key Technical Decisions

- **Sub-agent forwarding via `emitCustomEvent`** (resolves the origin deferred
  question). The routing tool's execute context emits `agent.boundary`
  (start/end), `agent.text` (prose deltas), `agent.step` (sub-tool lifecycle),
  and `agent.spec` (renderer spec) custom events; returns `{ ok, text }`.
  *Rationale:* first-class, ordered, real-time; no `UIMessageStreamWriter`
  equivalent needed; the engine already serializes custom events into the SSE
  stream in order.
- **Client renders from `onCustomEvent` state, not message parts.** The old
  `data-agent-*` part-walking in `segment-parts.ts` is replaced by accumulating
  custom events into a per-run structure keyed by `toolCallId`.
  *Rationale:* custom events are the new transport; parts no longer carry agent
  boundaries under `chat()`.
- **db-doctor cache records emitted events, replays by re-emitting.** Mirrors
  the prior chunk-record/replay, adapted to custom events.
- **Delete the UIMessageChunk transforms** (`prefix-text-part-ids`,
  `rewrite-renderer-parts`) rather than retype — they existed to massage the old
  writer drain, which no longer exists. Keep only what the new model needs.

## Open Questions

### Resolved During Planning

- How to forward a sub-agent stream? → tool `emitCustomEvent` → AG-UI CUSTOM →
  client `onCustomEvent` (verified in package types).
- Where do routing tools register? → `chat({ tools })` in `src/server/ai/index.ts`.
- Keep `@ai-sdk/gateway`? → Yes (connector); remove `ai` + `@ai-sdk/react`.

### Deferred to Implementation

- Exact custom-event payload schema (`agent.step` fields) — settle in Unit 1
  against what the agent UI needs; keep names stable (`agent.*`).
- Whether `pipeJsonRender` consumes the sub-agent text stream directly or needs a
  small adapter to feed it line/delta text — Unit 2 confirms against
  `@json-render/core`'s actual input type.
- Whether `useChat`'s `onCustomEvent` fires before/after the owning assistant
  message exists in `messages` (affects how state is keyed) — Unit 5 verifies.
- `markdown-joiner-transform.ts` editor coupling — Unit 4 confirms it's
  type-only and swappable with local types.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant Loop as chat() orchestrator loop
    participant Tool as dbDoctor/renderer .server(args, ctx)
    participant Sub as sub-agent chat()
    participant SSE as AG-UI SSE
    participant UI as useChat onCustomEvent
    Loop->>Tool: tool call (prompt)
    Tool->>SSE: ctx.emitCustomEvent('agent.boundary', {phase:'start'})
    Tool->>Sub: chat({ adapter: gatewayText(sub) })
    Sub-->>Tool: StreamChunk (text/tool deltas)
    Tool->>SSE: ctx.emitCustomEvent('agent.text'|'agent.step', {...})
    Tool->>SSE: ctx.emitCustomEvent('agent.boundary', {phase:'end'})
    Tool-->>Loop: { ok:true, text }  (loop composes next turn)
    SSE-->>UI: CUSTOM events (in order)
    UI->>UI: accumulate by toolCallId -> render collapsible agent run
```

Custom-event vocabulary (directional):

| Event name | Payload | Replaces |
|---|---|---|
| `agent.boundary` | `{ agent, toolCallId, phase: 'start'｜'end' }` | `data-agent-boundary` |
| `agent.text` | `{ toolCallId, delta }` | sub-agent text deltas |
| `agent.step` | `{ toolCallId, toolName, state, input?, cached? }` | `data-agent-step` |
| `agent.spec` | `{ toolCallId, spec }` | `data-spec` (renderer) |

## Implementation Units

### Phase A — Server orchestration

- [ ] **Unit 1: Sub-agent stream forwarder**

**Goal:** A reusable server helper that runs a sub-agent `chat()` stream and
forwards it to the parent via `emitCustomEvent`, accumulating prose to return.

**Requirements:** R1

**Dependencies:** None (gateway adapter shipped)

**Files:**
- Create: `src/server/ai/agents/lib/forward-subagent.ts`
- Test: `src/server/ai/agents/lib/__tests__/forward-subagent.test.ts`

**Approach:**
- `forwardSubAgentStream({ agent, toolCallId, stream, emit, signal })`: emit
  `agent.boundary` start; iterate the sub-agent `StreamChunk`s; map
  `TEXT_MESSAGE_CONTENT` → `agent.text` deltas (accumulate into `text`),
  `TOOL_CALL_*` → `agent.step`, `RUN_ERROR` → boundary end + rethrow/return error;
  finally emit `agent.boundary` end. Return `{ ok, text }`.
- `emit` is the tool context's `emitCustomEvent` (inject for testability).
- Honor `signal` (abort) — stop iterating, close the boundary.

**Execution note:** Test-first — pure function over a synthetic `StreamChunk`
async iterable with a mock `emit`.

**Patterns to follow:** `extractTextFromChunks` / `drainIntoWriter` ordering
discipline in `routing.ts` (await end-of-stream before the closing boundary);
`stream-to-agui.ts` event mapping in the gateway adapter.

**Test scenarios:**
- Happy path: a sub-agent stream of text deltas emits boundary-start, N
  `agent.text`, boundary-end (in order) and returns concatenated `text`.
- Integration: a sub-agent tool-call sequence emits `agent.step` events between
  the boundaries.
- Edge case: empty sub-agent stream emits start+end and returns `''`.
- Error path: a `RUN_ERROR` chunk closes the boundary and surfaces an error
  result (no dangling open boundary).
- Edge case: abort signal mid-stream stops emission and closes the boundary.

**Verification:** Given a synthetic sub-agent stream + mock emit, the emitted
custom-event sequence is ordered and well-formed and the returned text matches.

- [ ] **Unit 2: Migrate routing tools to toolDefinition().server()**

**Goal:** Re-express `dbDoctorRoutingTool` / `rendererRoutingTool` as TanStack
server tools using the Unit 1 forwarder; preserve db-doctor cache + renderer
spec lifting.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/server/ai/agents/lib/routing.ts`
- Test: `src/server/ai/agents/lib/__tests__/routing.test.ts`

**Approach:**
- Each tool: `toolDefinition({ name, description, inputSchema, outputSchema })
  .server(async ({ prompt }, ctx) => { ... })`.
- Run the sub-agent: `chat({ adapter: gatewayText(subModel), systemPrompts,
  messages|prompt })` → pass its `StreamChunk` iterable to
  `forwardSubAgentStream({ emit: ctx.emitCustomEvent, signal: ctx.abortSignal })`.
- db-doctor cache: record the emitted events per normalized prompt; on hit,
  re-emit recorded events with an `agent.step { cached: true }` badge marker,
  return cached text.
- renderer: feed the sub-agent text through `pipeJsonRender`; emit lifted spec as
  `agent.spec`.
- Delete the dead `tool()`/`ToolLoopAgent`/`UIMessageStreamWriter` code paths.

**Patterns to follow:** existing `routing.ts` cache + renderer logic (port the
behavior, change the transport from writer-drain to `emitCustomEvent`).

**Test scenarios:**
- Happy path: db-doctor tool runs, emits agent.* events, returns `{ ok, text }`.
- Edge case: db-doctor cache hit re-emits recorded events with `cached:true` and
  skips re-running the sub-agent.
- Integration: renderer ```spec output lifts to an `agent.spec` event; prose
  lands as `agent.text`.
- Error path: sub-agent failure closes the boundary and returns an error result
  the loop can read.

**Verification:** Both tools run as TanStack server tools, emit ordered agent.*
events (mock `emitCustomEvent`), and preserve cache + spec behavior; no
`UIMessageStreamWriter`/`ToolLoopAgent` remain in `routing.ts`.

- [ ] **Unit 3: Register routing tools on the handler**

**Goal:** Wire the migrated tools into the live `chat()` handler with an agent
loop budget.

**Requirements:** R2

**Dependencies:** Unit 2

**Files:**
- Modify: `src/server/ai/index.ts`
- Modify: `src/server/ai/__tests__/chat-handler.test.ts`

**Approach:**
- `chat({ adapter: gatewayText(model), systemPrompts, messages, tools:
  [dbDoctorTool, rendererTool], agentLoopStrategy: maxIterations(N) })`.
- Confirm the orchestrator's instruction prompt still routes to the tools.

**Test scenarios:**
- Integration: a handler request that triggers a tool call streams the tool's
  agent.* custom events through the SSE response (mock the sub-agent).
- Happy path: a no-tool text request still streams normally (regression).

**Verification:** `/api/chat` streams orchestrated sub-agent custom events
end-to-end through `chat()`.

- [ ] **Unit 4: Delete/retype the `ai`-coupled stream helpers**

**Goal:** Remove the obsolete `UIMessageChunk` transforms and retype the
remaining `ai` importers so nothing on the app path imports `ai`.

**Requirements:** R7

**Dependencies:** Unit 2 (confirms the transforms are dead)

**Files:**
- Delete (if unused after Unit 2): `src/server/ai/agents/lib/prefix-text-part-ids.ts`,
  `src/server/ai/agents/lib/rewrite-renderer-parts.ts`
- Modify or delete: `src/server/ai/agents/lib/strip-renderer-tool-parts.ts`
- Modify: `src/server/ai/__tests__/orchestrator-message-filter.test.ts` (fix the
  broken import path; retype off `ai`, or delete if its subject is gone)
- Modify: `src/lib/editor/markdown-joiner-transform.ts` (replace `TextStreamPart`
  /`ToolSet` from `ai` with local types)
- Test: existing tests for the retyped helpers

**Approach:**
- `grep -rl "from 'ai'"` over `src/` must reduce to zero app files (gateway and
  `@ai-sdk/*` connector files are fine).
- For `markdown-joiner-transform.ts`, define minimal local `TextStreamPart`/
  `ToolSet` shapes (it's an `import type` only) or drop if the editor path is
  unused.

**Test scenarios:**
- Happy path: `orchestrator-message-filter` test imports resolve and pass (or the
  test is removed with its dead subject).
- Edge case: editor markdown transform compiles + behaves without `ai`.

**Verification:** No `src/` app file imports `ai`; real tsc clean for touched
files.

### Phase B — Client rendering

- [ ] **Unit 5: Render agent runs from `onCustomEvent`**

**Goal:** Consume `agent.*` custom events on the client and render the
collapsible agent UI (boundaries, steps, spec, cache badge) from that state
instead of `data-agent-*` message parts.

**Requirements:** R1, R3, R4, R5

**Dependencies:** Unit 3 (server emits the events)

**Files:**
- Modify: `src/components/ui/ai/use-ai.ts` (add `onCustomEvent`, accumulate state)
- Rewrite: `src/components/ai/segment-parts.ts` (consume agent-run state, not
  `data-agent-*` parts)
- Modify: `src/components/ai/messages.tsx`, `src/components/ui/ai-elements/agent.tsx`
- Test: `src/components/ai/__tests__/segment-parts.test.ts`

**Approach:**
- `useChat({ ..., onCustomEvent: (name, data) => accumulate })`: build a
  per-`toolCallId` agent-run record (`{ agent, started, ended, text, reasoning,
  steps, spec, cached }`) in jotai/local state, keyed so it renders within the
  owning assistant message.
- `segment-parts.ts` now segments from agent-run state + plain message parts
  (text/thinking/tool), producing the same `Segment[]` the UI already renders.
- Re-add the "Returned from cache" badge (from `agent.step { cached:true }`) and
  the renderer spec rendering (from `agent.spec`).

**Execution note:** Verify when `onCustomEvent` fires relative to the assistant
message lifecycle (Open Question) before choosing the state key.

**Test scenarios:**
- Happy path: a sequence of agent.boundary/text/step events produces one
  collapsible agent segment with prose + steps.
- Edge case: `agent.step { cached:true }` renders the "from cache" badge.
- Integration: `agent.spec` renders the spec in the artifact UI.
- Edge case: two sub-agent runs in one turn don't merge (keyed by toolCallId).

**Verification:** Orchestrated turns render the same collapsible agent UX as
pre-migration, sourced from custom events.

- [ ] **Unit 6: Tool approval flow**

**Goal:** Approve/Deny tool calls through `addToolApprovalResponse`.

**Requirements:** R6

**Dependencies:** Unit 3

**Files:**
- Modify: `src/components/ui/ai-elements/confirmation.tsx`
- Modify: `src/components/ui/ai/use-ai.ts` (expose `addToolApprovalResponse`)
- Modify: `src/server/ai/agents/lib/routing.ts` (set `needsApproval` where required)
- Test: `src/components/ui/ai-elements/__tests__/confirmation.test.tsx`

**Approach:**
- Render approval UI on `tool-call` parts with `state === 'approval-requested'`;
  Approve/Deny call `addToolApprovalResponse({ id: part.approval.id, approved })`.
  TanStack auto-resumes the loop.

**Test scenarios:**
- Happy path: Approve → `addToolApprovalResponse({approved:true})`.
- Happy path: Deny → `{approved:false}`.
- Edge case: non-approval tool-call renders no approval UI.

**Verification:** Approve/Deny resumes/cancels the tool via TanStack.

### Phase C — Cleanup

- [ ] **Unit 7: Remove `ai` + `@ai-sdk/react`**

**Goal:** Drop the Vercel AI SDK packages; prove the migration end-to-end.

**Requirements:** R7, R8

**Dependencies:** Units 1–6

**Files:**
- Modify: `package.json`, `bun.lock`
- Test: full chat suite + a live gateway round-trip

**Approach:**
- After `grep -rl "from 'ai'\|@ai-sdk/react" src/` returns only connector files,
  remove the two deps.
- Reuse `gateway/__tests__/text-adapter.live.test.ts`'s env-gated pattern for a
  real `/api/chat` round-trip incl. one orchestrated sub-agent turn.

**Test scenarios:**
- Happy path: `ai` / `@ai-sdk/react` absent from `package.json`;
  `@ai-sdk/gateway` present.
- Integration (gated, real network): a real orchestrated turn streams text +
  agent.* custom events + finishes.
- Edge case: full `bunx vitest run` green (modulo the documented pre-existing
  failure if its subject still exists).

**Verification:** No Vercel AI SDK in the dep tree; real tsc clean for touched
files; live orchestrated chat works.

## System-Wide Impact

- **Interaction graph:** `chat()` loop → routing tools (`emitCustomEvent`) → SSE
  → `useChat onCustomEvent` → agent UI. The handler, hooks, and message-parts
  rendering shipped earlier are the fixed substrate.
- **Error propagation:** sub-agent errors close their `agent.boundary` and
  surface as a tool error the loop reads + a client-visible state; never a
  dangling open boundary or dropped stream.
- **State lifecycle risks:** custom-event accumulation must key by `toolCallId`
  and reset per run; cache replay must not double-emit.
- **API surface parity:** `/api/chat` and `/api/agents` share the handler — one
  change covers both.
- **Unchanged invariants:** gateway adapter, server handler shell, client hooks,
  message-parts rendering, jotai chat state, Convex/Hono.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `onCustomEvent` timing vs message lifecycle unclear | Unit 5 verifies firing order before choosing the state key; spike in-unit if needed |
| `pipeJsonRender` input type may not match a delta text stream | Unit 2 confirms against `@json-render/core`; add a thin text-feed adapter if needed |
| Custom-event ordering vs tool-result ordering in the SSE stream | Unit 1 awaits sub-stream end before the closing boundary (mirror the old drain discipline); assert order in tests |
| Deleting the transforms removes approval-resume history reconstruction | Confirm in Unit 2 that `chat()` reconstructs tool-call history from messages natively (no manual rewrite needed) before deleting |
| `npx tsc` stub masks errors | Verify only with `node_modules/.bin/tsc` |
| Codex agents drift on the union-typed client return | Unit 5 note: `useAi` return is a union — use `type` aliases, not `interface extends` |

## Phased Delivery

### Phase A — Server orchestration (Units 1–4)
Sub-agent forwarder → migrate routing tools → register on handler → delete
`ai`-coupled helpers. Server speaks the new custom-event model.

### Phase B — Client rendering (Units 5–6)
Consume `onCustomEvent` → render agent runs + approvals. UX parity restored.

### Phase C — Cleanup (Unit 7)
Remove `ai` + `@ai-sdk/react`; prove end-to-end live.

## Documentation / Operational Notes

- After Unit 1, add a `docs/solutions/` note: "Forwarding a sub-agent chat()
  stream to the client via tool `emitCustomEvent` (AG-UI CUSTOM events)" — the
  reusable pattern this plan establishes.
- Update `src/server/ai/gateway/CONTEXT.md` if orchestration terms shift.
- Deploy server + client together (the custom-event contract spans both).

## Codex Delegation Notes

- **Sequencing:** Units 1→2→3→4 (Phase A) are serial. Unit 5 depends on Unit 3.
  Unit 6 depends on Unit 3 and can run parallel to Unit 5. Unit 7 is last.
- **Each unit is self-contained:** exact files, the resolved contracts above, and
  outcome-based verification. Dispatch one codex:rescue agent per unit; give it
  this plan path + the unit block.
- **Hard gates for every agent:** `node_modules/.bin/tsc --noEmit` (zero net-new
  errors in touched files), `bunx vitest run <unit test>` green, `bunx biome
  check --write` on changed files. Never `npx tsc`.
- **Do not touch** the shipped substrate (gateway adapter, handler shell, hooks,
  message-parts) except the explicit modify-points listed per unit.

## Sources & References

- **Origin document:** [docs/plans/2026-06-13-002-refactor-migrate-vercel-ai-to-tanstack-plan.md](docs/plans/2026-06-13-002-refactor-migrate-vercel-ai-to-tanstack-plan.md)
- Gateway adapter plan: `docs/plans/2026-06-13-001-feat-gateway-tanstack-ai-adapter-plan.md`
- Resolved contracts: `@tanstack/ai` `ToolExecutionContext.emitCustomEvent`;
  `@tanstack/ai-client` `onCustomEvent`
- Related code: `src/server/ai/agents/lib/routing.ts`,
  `src/components/ai/segment-parts.ts`, `src/server/ai/index.ts`

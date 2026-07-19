---
title: 'fix: Harden machine API and deployment routing (review follow-ups)'
type: fix
status: active
date: 2026-07-18
origin: docs/plans/2026-07-16-001-feat-agent-variants-workflows-call-routing-plan.md#deferred--open-questions
---

# Harden Machine API and Deployment Routing (Review Follow-ups)

## Overview

Resolve all 11 open questions recorded by the 2026-07-18 document review of the
implemented deployment-routing backend: four security gaps (service-token
lifecycle, override authorization, append/finish binding, PII lifecycle), six
design gaps (idempotency fingerprint, caller stickiness, merge signal, publish
rollback, failed-dial lifecycle, caller-ID ownership), and one documentation
scoping item (non-voice workflow attribution). The routing backend itself is
complete and verified (153 tests green); this plan hardens its contracts before
`v-inbound` / `v-outbound` consume them.

## Problem Frame

The machine HTTP surface authenticates every caller with one flat shared token,
binds conversation mutations to token validity alone, accepts per-call variant
overrides from any token holder, and has no PII retention story. Separately, the
idempotency fingerprint is a `JSON.stringify` over unsorted args, a bad Main
publish has no rollback, failed dials leave phantom attributed Conversations,
and merge decisions have no quantitative signal. All items originate from the
review findings appended to the origin plan's `Deferred / Open Questions`
section.

## Requirements Trace

- R1. Each machine service authenticates with its own token; a single service
  can be rotated (zero-downtime overlap) or revoked without touching others.
- R2. Idempotency fingerprints are canonical and built only from durable
  caller-supplied identity; a conflict response names the existing Conversation
  so callers can recover.
- R3. Append and finish require proof of conversation ownership
  (`conversationKey`), not just a valid service token.
- R4. Outbound variant overrides are honored only when persisted server-side by
  a tenant-administrator mutation that records the authorizing principal and
  reason; the machine request body carries no free-form override.
- R5. Conversations and messages have a defined retention/deletion lifecycle and
  machine request bodies containing transcripts or phone numbers are never
  logged raw.
- R6. A dial that never happens transitions its Conversation to a distinct
  terminal state and its batch recipient to `failed`; re-dial key semantics are
  defined.
- R7. A bad Main publish or merge is recoverable by repointing the Variant to a
  prior immutable Version in one operation.
- R8. Read models expose per-Variant conversation counts and terminal-status
  breakdowns sufficient to inform a merge decision.
- R9. Per-call allocation (no caller stickiness) is documented as the accepted
  trade-off; caller-ID policy ownership and non-voice workflow attribution are
  documented unambiguously.

## Scope Boundaries

- No back-office UI; this is backend contract + documentation work.
- No provider SDK calls or webhook signature verification in Convex (KTD9 of the
  origin plan stands).
- No caller-sticky allocation (decision: accepted per-call trade-off).
- No experiment statistics beyond the minimal counters in R8.

### Deferred to Separate Tasks

- `tenantSecrets` store for MCP header secret material:
  `mcpConnections.requestHeaders` currently allows inline plaintext strings
  (`packages/domain/src/schemas/mcp-connections.ts`,
  `headerValue = string | {secretRef}`); migrating inline strings to secret refs
  is the existing backlog item and out of scope here.
- Rate limiting on machine endpoints: low-likelihood cost vector, revisit with
  first production traffic.
- Campaign scheduling/pacing and the convex-mq dial-queue decision: owned by the
  upcoming v-outbound app plan.

## Context & Research

### Relevant Code and Patterns

- `packages/convex/src/api/internals/machineAuth.ts` — `serviceTokensMatch`
  (constant-work compare), `hasValidMachineAuthorization`; applied as middleware
  in `packages/convex/src/http.ts` (`/api/machine/*`, reads
  `env.CONVEX_SERVICE_TOKEN`).
- `packages/convex/src/api/conversations.ts` — `fingerprint()` is
  `JSON.stringify` (key-order sensitive); `existingConversation()` throws
  `idempotency_conflict` on fingerprint mismatch with no recovery payload;
  `startOutboundFromRecipient` accepts a per-call `agentVariantOverrideId` arg
  with precedence over the batch-level override; `appendMessage` derives
  `sequence` from `messageCount + 1` while its comment claims read-max+1;
  `finish` handles terminal idempotency via `terminal_state_conflict`.
- `packages/convex/src/api/internals/agentRouting.ts` — `resolveAgentDeployment`
  override path validates tenant/agent/published/ non-archived.
- `packages/convex/src/api/agentVariants.ts` — `publishVariantForContext`,
  `setTrafficAllocation` (bumps `allocationRevision`), `mergeToMain`.
- `packages/domain/src/schemas/batch-calls.ts` —
  `batchCallJobs.agentVariantOverrideId` exists; recipients have no override
  field and no `by_conversation` index.
- `packages/domain/src/schemas/conversations.ts` — `CONVERSATION_STATUSES`
  includes unused `processing`; terminal statuses are `done`/`failed`.
- `packages/convex/src/convex.config.ts` — typed env map; no cron file exists
  anywhere in `packages/convex/src` (retention job is greenfield).
- Machine error mapping: `packages/convex/src/api/internals/machineErrors.ts`
  - `app.onError` in `http.ts`.

### Institutional Learnings

- No `docs/solutions/` directory exists; review findings in the origin plan's
  `Deferred / Open Questions` section serve as the institutional record.

## Key Technical Decisions

- **Per-service tokens via one env var (user-approved):** replace
  `CONVEX_SERVICE_TOKEN` with `CONVEX_SERVICE_TOKENS`, a comma-separated list of
  `<service>:<token>` entries (`v-inbound`, `v-outbound`, `back-office`,
  `runtime`). Rotation = temporarily listing two entries for the same service;
  revocation = removing that service's entries. Middleware resolves the service
  identity and exposes it to handlers for audit stamping. One typed env var
  keeps `convex.config.ts` stable while allowing N tokens.
- **Fingerprint canonicalization:** a shared domain helper serializes a fixed,
  sorted field set of durable caller-supplied identity only (direction, ownerId,
  provider, channel where applicable). `providerSessionId` and `externalNumber`
  drop out of the fingerprint — they are stored but not conflict-triggering,
  since provider redeliveries may vary them. Conflict responses include the
  existing `conversationId`.
- **`conversationKey` is random and stored, never derived:** because U3 uses the
  key as ownership proof, it must be unforgeable by other token holders — it is
  a high-entropy random value (UUID v4 or stronger) that the calling service
  generates once and persists on its durable attempt record (webhook event row,
  batch recipient attempt), re-sending the stored value on retry. Retry
  stability comes from storage, not derivation. This supersedes the origin
  plan's KTD6 amendment wording ("deterministically derived from durable
  provider identity") — U9 revises that passage. Because stateless webhook
  callers cannot guarantee key persistence before a crash, Convex additionally
  dedupes server-side: a new `by_tenant_provider_session` conversations index
  lets start routes treat a matching `providerSessionId` (same tenant +
  provider) as the same attempt and return the stored Conversation and its key
  instead of inserting a duplicate. The key is secret material: excluded from
  logs and read DTOs on both sides (same handling class as service tokens),
  inert once the Conversation is terminal, and nulled by the U8 purge. Caller
  services own symmetric retention for their attempt stores (U9 documents this).
- **Override is server-side state (user decision honored from review):** the
  machine outbound start loses its per-call `agentVariantOverrideId` arg; only
  `batchCallJobs.agentVariantOverrideId` is honored, set by a public
  tenant-admin mutation that persists `overrideAuthorizedBy` and
  `overrideReason`.
- **Rollback is pointer repointing (user-approved):** `republishVersion`
  validates the target Version belongs to the same tenant/agent/variant and
  patches `publishedVersionId` only; immutable history is untouched.
- **Merge signal via denormalized counters:** per-Variant `conversationCount` /
  `doneCount` / `failedCount` maintained at Conversation insert and finish,
  avoiding unbounded scans; exposed on the existing Variant summary DTO.
- **Per-call allocation accepted (user-approved):** no caller-stable hashing;
  documented as a product trade-off in the reference doc.
- **Caller-ID single owner:** `batchCallJobs.callerIdPolicy` + the phoneRouting
  selector are the sole caller-ID authority; the workflow config carries runtime
  options only. Documentation-level resolution — no schema change required.

## Open Questions

### Origin-Question Coverage Map

| Origin question                | Resolution                                        |
| ------------------------------ | ------------------------------------------------- |
| Service token lifecycle (P1)   | Unit 1                                            |
| Idempotency fingerprint (P1)   | Unit 2                                            |
| Override authorization         | Unit 4                                            |
| PII lifecycle                  | Unit 8                                            |
| Append/finish binding          | Unit 3                                            |
| Caller stickiness              | Decision: per-call accepted; documented in Unit 9 |
| Merge decision signal          | Unit 7                                            |
| Main publish rollback          | Unit 6                                            |
| Failed-dial lifecycle          | Unit 5                                            |
| Caller-ID policy ownership     | Decision: doc-level single owner; Unit 9          |
| Non-voice workflow attribution | Unit 9                                            |

### Resolved During Planning

- Token model: per-service tokens with overlap (user choice).
- Caller stickiness: per-call allocation accepted (user choice).
- Rollback: republish-prior-Version operation (user choice).
- Append/finish binding mechanism: re-present `conversationKey` (already
  returned by start routes) rather than minting a per-conversation secret — no
  new secret distribution needed. The key is therefore random and stored, never
  derivable (see Key Technical Decisions).
- Failed-dial terminal shape: reuse `status: failed` plus new termination
  reasons (`dial_failed`, `never_dialed`) rather than a new status value.
- Caller-ID ownership enforcement: documentation-level only — the workflow
  config schema carries runtime options and no caller-ID fields today, so there
  is nothing to strip; Unit 9 states the boundary.
- Merge-signal granularity: counters are per-Variant, not per-Version — a
  deliberate narrowing of the origin question's "breakdown by Version" (empty
  product; republish changes interpretation; richer per-Version stats belong to
  the deferred analytics iteration).

### Deferred to Implementation

- Exact retention window defaults (days) and whether they live in
  `tenantSettings` or platform config — decide when wiring the cron; the
  mutation surface is designed either way.

## Implementation Units

- [ ] **Unit 1: Per-service machine tokens**

**Goal:** Replace the single shared token with per-service tokens supporting
rotation overlap and single-service revocation. (R1)

**Dependencies:** None.

**Files:**

- Modify: `packages/convex/src/api/internals/machineAuth.ts`
- Modify: `packages/convex/src/http.ts`
- Modify: `packages/convex/src/convex.config.ts`
- Test: `packages/convex/src/__tests__/machineHttp.test.ts`

**Approach:**

- Parse `CONVEX_SERVICE_TOKENS` (`service:token` comma-separated) once per
  request; validate the presented bearer against every entry with the existing
  constant-work compare; on match, resolve the service name. If a token value
  appears under more than one service name, only requests presenting that
  duplicated value are rejected (config error) — entries with unique values keep
  authenticating, so a rotation-window paste mistake cannot lock out the whole
  machine surface. The rotation procedure (U9) includes a deploy-time env shape
  check to catch the misconfiguration before traffic.
- The resolved service identity is scoped to HTTP-layer logging/auditing only.
  Hono context state does not cross into Convex mutations (handlers call
  `c.env.runMutation` with explicit args) — no mutation gains a service-identity
  arg in this plan; keep 401 semantics and the machine error envelope unchanged.
- Remove `CONVEX_SERVICE_TOKEN` from the typed env map (empty product, no
  compatibility shim per origin KTD1).

**Test scenarios:**

- Happy path: each service's token authenticates and resolves its identity.
- Happy path: two concurrent entries for one service (rotation window) both
  authenticate.
- Error path: removed service entry, malformed env entry, empty token, wrong
  token → 401 without invoking a mutation.
- Error path: same token value under two service names → requests with that
  value rejected; other services unaffected.
- Edge case: token containing a colon; entry-order independence.

**Verification:** Machine HTTP tests pass with per-service tokens; no route
authenticates against a token absent from the env list.

- [ ] **Unit 2: Canonical idempotency fingerprint and conflict recovery**

**Goal:** Make retry fingerprints canonical, durable-identity-only, and
recoverable on conflict. (R2)

**Dependencies:** None.

**Files:**

- Create: `packages/domain/src/routing/idempotency.ts`
- Create: `packages/domain/src/routing/__tests__/idempotency.test.ts`
- Modify: `packages/convex/src/api/conversations.ts`
- Modify: `packages/convex/src/api/internals/machineErrors.ts`
- Test: `packages/convex/src/api/__tests__/api.test.ts`

**Approach:**

- Domain helper builds the fingerprint from an explicit sorted field list per
  start channel (inbound: direction, ownerId, provider; outbound adds
  destination codes; direct adds channel, direction) — replacing raw
  `JSON.stringify(args)`.
- Add the `by_tenant_provider_session` conversations index and the server-side
  redelivery dedupe path: a start whose `providerSessionId` matches an existing
  same-tenant/provider Conversation returns that row (and its stored key) even
  when the caller minted a fresh key — closing the stateless-webhook crash
  window.
- `idempotency_conflict` error payload includes the existing `conversationId` so
  a conflicted caller can fetch rather than dead-end (envelope-shape change in
  `machineErrors.ts`: structured `{error, conversationId}` — a contract change
  for all machine callers).

**Test scenarios:**

- Happy path: same durable identity, different `providerSessionId` → returns the
  existing Conversation (no conflict).
- Edge case: field-order variations produce identical fingerprints.
- Error path: same key, different `ownerId` → conflict carrying the existing
  `conversationId`.
- Integration: concurrent same-key starts create exactly one Conversation.

**Verification:** A retry after a mid-flight routing change (e.g., number
reassignment) returns the original Conversation instead of a conflict.

- [ ] **Unit 3: Bind append/finish to the conversation**

**Goal:** Mutating lifecycle calls prove conversation ownership. (R3)

**Dependencies:** None (coordinates with Unit 2's error payloads).

**Files:**

- Modify: `packages/convex/src/api/conversations.ts`
- Modify: `packages/convex/src/api/internals/machineErrors.ts`
- Modify: `packages/convex/src/http.ts`
- Modify: `packages/agent/src/types.ts` (ingest client contract)
- Test: `packages/convex/src/__tests__/machineHttp.test.ts`

**Approach:**

- `appendMessage` and `finish` require `conversationKey` in the body and
  validate it against the stored row using the constant-work compare
  (`serviceTokensMatch`) before mutating; mismatch returns a stable machine
  error code. Start routes validate key shape server-side (UUID pattern /
  minimum entropy) and reject weak keys — unforgeability must not rest on caller
  discipline alone. Register the new code in `machineErrors.ts` and widen the
  `onError` status union in `http.ts` (currently cast as `409 | 422 | 500`) to
  carry the new 4xx status — codes must flow through the envelope, not raw
  throws.
- Fold in the incidental `appendMessage` sequence fix: Convex OCC serializes the
  mutation, so the `messageCount + 1` counter is transactionally safe — correct
  the stale read-max+1 comment and add a concurrent-append test proving strictly
  increasing sequences under retry.
- Update the Agent runtime ingest interface accordingly.

**Test scenarios:**

- Happy path: correct key appends/finishes.
- Error path: valid token + wrong key → rejected, nothing mutated.
- Error path: key from a different tenant's conversation → indistinguishable
  from wrong key.

**Verification:** No lifecycle mutation succeeds with token-only auth.

- [ ] **Unit 4: Server-side override authorization**

**Goal:** Variant overrides originate only from persisted, attributed
tenant-admin state. (R4)

**Dependencies:** None.

**Files:**

- Modify: `packages/domain/src/schemas/batch-calls.ts`
- Modify: `packages/convex/src/api/conversations.ts`
- Create: `packages/convex/src/api/batchCalls.ts` (greenfield — no public
  batch-job mutation surface exists today; only `internals/batchCallJobs.ts`
  internal helpers)
- Test: `packages/convex/src/api/__tests__/api.test.ts`,
  `packages/convex/src/__tests__/tenancy.test.ts`

**Approach:**

- Add `overrideAuthorizedBy` and `overrideReason` to `batchCallJobs`, required
  whenever `agentVariantOverrideId` is set. `overrideAuthorizedBy` is the
  authenticated user identity inside the `tenantMutation` (as in
  `setTrafficAllocation` in `packages/convex/src/api/agentVariants.ts`) — not a
  machine service identity.
- `batchCalls.ts` hosts only the override set/clear `tenantMutation` (mirroring
  the tenantMutation pattern in `api/agentVariants.ts`) with same-tenant,
  same-agent, published, non-archived validation (mirroring
  `resolveAgentDeployment`'s override checks). Full batch CRUD remains deferred
  to the v-outbound plan.
- Remove the per-call `agentVariantOverrideId` arg from
  `startOutboundFromRecipient`; the machine body can no longer carry an
  override.

**Test scenarios:**

- Happy path: batch with persisted authorized override routes to the zero-weight
  published Variant; `allocationMode: override` persisted.
- Error path: machine request attempting to smuggle an override field is
  rejected by schema validation.
- Error path: admin mutation with foreign-tenant/unpublished/archived Variant
  fails; override without reason/principal fails.

**Verification:** Grep-level check: no machine-accepted schema contains an
override field; override state is only writable via the tenant-admin path.

- [ ] **Unit 5: Failed-dial lifecycle**

**Goal:** Dials that never happen produce distinct, queryable terminal state.
(R6)

**Dependencies:** Unit 3 (finish binding).

**Files:**

- Modify: `packages/domain/src/schemas/conversations.ts`
- Modify: `packages/convex/src/api/conversations.ts`
- Test: `packages/convex/src/api/__tests__/api.test.ts`

**Approach:**

- Add termination reasons for `dial_failed` / `never_dialed`; `finish` with
  `status: failed` + one of these is valid from `initiated` (call never
  progressed) and patches the linked batch recipient to `failed` directly via
  the conversation's stored `batchCallRecipientId` — no new index needed.
- Define re-dial semantics in the reference doc: a re-attempt is a new recipient
  dispatch with a new random `conversationKey` persisted on the attempt record
  (see the conversationKey decision — keys are stored, never derived); each
  attempt is a distinct allocation exposure by design. Recipient
  attempt-tracking schema (`attemptCount` or similar) is deferred to the
  v-outbound plan that owns dial dispatch.

**Test scenarios:**

- Happy path: finish(`failed`, `dial_failed`) from `initiated` marks the
  conversation and recipient failed.
- Edge case: retrying the same failure finish is idempotent
  (`already_finished`).
- Error path: `dial_failed` on an `in_progress` conversation (call actually
  started) is rejected.

**Verification:** Phantom `initiated` rows are eliminable by the outbound
service; recipient status reflects dial outcomes.

- [ ] **Unit 6: Republish prior Version (rollback)**

**Goal:** One-operation recovery from a bad publish or merge. (R7)

**Dependencies:** None.

**Files:**

- Modify: `packages/convex/src/api/agentVariants.ts`
- Test: `packages/convex/src/api/__tests__/api.test.ts`,
  `packages/convex/src/__tests__/agent-contract.test.ts`

**Approach:**

- `republishVersion({agentVariantId, versionId})` (naming per domain schema
  convention): validate same tenant, same agent, version belongs to the variant;
  patch `publishedVersionId` only. No new Version row, no draft mutation, no
  allocation change.

**Test scenarios:**

- Happy path: repointing to a prior Version changes routing resolution for new
  conversationKeys immediately.
- Error path: foreign-variant or foreign-tenant versionId fails.
- Edge case: repointing Main mid-allocation leaves weights and
  `allocationRevision` untouched; existing Conversations keep their original
  attribution.

**Verification:** After a bad merge, one mutation restores the prior Main
Version; history is unchanged.

- [ ] **Unit 7: Per-Variant outcome counters**

**Goal:** Minimal quantitative merge signal in read models. (R8)

**Dependencies:** Unit 5 (terminal semantics settled).

**Files:**

- Modify: `packages/domain/src/schemas/agents.ts`
- Modify: `packages/convex/src/api/conversations.ts`
- Modify: `packages/convex/src/api/agentVariantDtos.ts`
- Test: `packages/convex/src/api/__tests__/dataServiceContracts.test.ts`

**Approach:**

- Add `conversationCount`, `doneCount`, `failedCount` to `agentVariants`
  (default 0); increment `conversationCount` at start insert and the terminal
  counter at first `finish`.
- Known contention ceiling: every concurrent call to one Variant writes the same
  `agentVariants` row inside its start/finish transaction, so Convex OCC
  serializes them — acceptable at current (zero) volume; the documented scale
  path is the sharded-counter component, not relaxing the same-transaction rule.
  Counters are cumulative per Variant across republish events (accepted for the
  minimal signal).
- Expose on the Variant summary DTO alongside existing publish/allocation state.
  Counters are informational, not invariants — no backfill (empty product).

**Test scenarios:**

- Happy path: start + finish(done) increments the right counters exactly once,
  including under finish retries.
- Integration: counters appear in the paginated Variant summary without
  additional queries.

**Verification:** A merge decision can cite per-Variant volume and
success/failure split from the existing back-office read path.

- [ ] **Unit 8: PII retention and deletion**

**Goal:** Defined lifecycle for transcripts and phone numbers. (R5)

**Dependencies:** None.

**Files:**

- Create: `packages/convex/src/crons.ts`
- Modify: `packages/convex/src/api/conversations.ts` (or a new
  `api/internals/retention.ts`)
- Modify: `packages/convex/src/schema.ts` (endedAt-oriented index for paged
  purge)
- Modify: `packages/domain/src/schemas/batch-calls.ts` (if recipient redaction
  needs field-shape changes)
- Modify: `packages/convex/src/http.ts` (logging policy enforcement point)
- Test: `packages/convex/src/api/__tests__/api.test.ts`

**Approach:**

- Internal `purgeExpiredConversationData` deletes/redacts messages, audio
  storage refs, `externalNumber`, and `phoneNumberSnapshot.number` past the
  retention window. The daily cron triggers a self-rescheduling internal
  mutation (or driving action) that pages expired conversations in bounded
  batches via a new endedAt-oriented index — a single unbounded mutation would
  hit Convex read/write document limits as messages accumulate and retention
  would silently stop. Add the index in `packages/convex/src/schema.ts`.
  `endedAt` is an ISO string — normalize to fixed-width UTC before range paging.
- Second sweep in the same cron: non-terminal conversations older than the
  window are paged by `_creationTime` (built-in, no new index), transitioned to
  `failed` (abandoned), then redacted — an endedAt-only purge would never reach
  conversations whose caller crashed before `finish`.
- Never-dialed recipient fallback pages jobs by `_creationTime` and fans out via
  the existing `by_batch` index — no new batch index.
- Tenant-scoped `deleteConversationData` internal mutation as the GDPR/CCPA
  erasure primitive (full message + audio + participant-number redaction for a
  conversation set).
- Extend both primitives to batch-call data: recipient `phoneNumber` fields (and
  any stored caller-ID policy numbers) are redacted for recipients past the
  window or named in an erasure request — including never-dialed recipients that
  have no Conversation, via a job-age fallback. Without this, an erasure request
  for a phone number is not satisfiable by the documented mutation.
- Codify the logging rule: machine handlers never log request bodies; the
  machine error envelope already excludes internals — add a test asserting error
  responses contain no transcript/phone fields.

**Execution note:** Decide the retention-window source (tenantSettings vs
platform default) at implementation time; design the mutation to accept the
window as an argument so the decision is config-only.

**Test scenarios:**

- Happy path: conversations past the window lose message bodies, audio, and raw
  numbers; attribution fields (agent/variant/version/allocation) survive for
  analytics.
- Edge case: conversation exactly at the boundary is untouched.
- Error path: erasure of a foreign-tenant conversation is indistinguishable from
  missing.
- Integration: error responses and 4xx paths carry no phone/transcript data.

**Verification:** A deletion request is satisfiable by one documented mutation;
retention runs unattended.

- [ ] **Unit 9: Documentation reconciliation**

**Goal:** Close the three documentation-level questions and document the new
contracts. (R9)

**Dependencies:** Units 1-8 (documents what they implement).

**Files:**

- Modify: `docs/reference/agent-deployment-routing.md`
- Modify:
  `docs/plans/2026-07-16-001-feat-agent-variants-workflows-call-routing-plan.md`
  (mark open questions resolved)
- Modify:
  `docs/adr/0003-separate-agent-variants-channel-workflows-and-phone-routing.md`
  (only if override wording needs the persisted-authorization nuance)

**Approach:**

- Document: per-service token scheme and rotation procedure; conversationKey
  requirement on append/finish; conflict-recovery payload; failed-dial and
  re-dial semantics; republish operation; counters; retention policy.
- Revise the origin plan's KTD6 amendment ("deterministically derived from
  durable provider identity") to the superseding rule: keys are random,
  persisted on the caller's attempt record, and re-sent on retry — stored, never
  derived.
- Record the accepted per-call allocation trade-off (no caller stickiness).
- State caller-ID single ownership (batch `callerIdPolicy` + phoneRouting
  selector; workflow config carries runtime options only).
- Scope R12's workflow attribution to voice directions explicitly
  (`workflow: none` for non-voice, as implemented).

**Test scenarios:**

- Test expectation: none — documentation unit; verification is link and
  contract-example accuracy against the implemented surface.

**Verification:** Reference doc matches the post-hardening machine API; the
origin plan's open-questions section shows each item's resolution.

## System-Wide Impact

- **Interaction graph:** every machine caller (v-inbound, v-outbound,
  back-office, agent runtime) must adopt per-service tokens and the
  `conversationKey`-bearing append/finish bodies — apps are still skeletons, so
  this is contract-setting, not migration.
- **Error propagation:** new machine error codes (ownership mismatch,
  conflict-with-id payload) flow through the existing `machineErrors.ts` +
  `onError` envelope; codes must be added there, not thrown raw.
- **State lifecycle risks:** counter increments (U7) and recipient patch-backs
  (U5) piggyback on existing mutations — keep them in the same transaction as
  the triggering write to avoid drift.
- **API surface parity:** the whatsapp and direct start routes get the same
  fingerprint canonicalization and (for direct) the same append/finish binding;
  do not harden only the voice routes.
- **Integration coverage:** concurrent same-key start, concurrent append, and
  rotation-window auth are the scenarios unit mocks won't prove.
- **Unchanged invariants:** allocation determinism, immutable Versions, tenant
  derivation from owning resources, and the DTO secret-exclusion rules (origin
  R17) are untouched.

## Risks & Dependencies

| Risk                                                           | Mitigation                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fingerprint change alters conflict behavior for in-flight keys | Empty product, no live traffic; land U2 before any service integrates                                                          |
| Per-service env parsing errors lock out all services           | Fail-closed with a distinct 500-class config error + test for malformed env; document the format in the reference              |
| Counter drift under retries                                    | Increment terminal counters only on the first `finish` (guarded by the existing terminal-idempotency branch); test retry paths |
| Retention deletes data analytics later needs                   | Redact PII fields but preserve attribution/rollup fields; document exactly what survives                                       |
| `republishVersion` used as a de facto publish bypass           | It only repoints among existing immutable Versions of the same Variant — no new content can enter through it; assert in tests  |

## Sources & References

- **Origin document:**
  [docs/plans/2026-07-16-001-feat-agent-variants-workflows-call-routing-plan.md](docs/plans/2026-07-16-001-feat-agent-variants-workflows-call-routing-plan.md)
  — `Deferred / Open Questions` (2026-07-18 review)
- Reference contract: `docs/reference/agent-deployment-routing.md`
- ADR:
  `docs/adr/0003-separate-agent-variants-channel-workflows-and-phone-routing.md`
- Key code: `packages/convex/src/api/internals/machineAuth.ts`,
  `packages/convex/src/api/conversations.ts`,
  `packages/convex/src/api/agentVariants.ts`,
  `packages/domain/src/schemas/batch-calls.ts`

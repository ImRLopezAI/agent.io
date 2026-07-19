# Context

Glossary of canonical terms for agent.io. Terms are binding: code, schemas, and
docs use these words with exactly these meanings.

## Tenant

The unit of data isolation for the platform. A tenant **is** a WorkOS
Organization — the value is the WorkOS `org_…` id, taken from the authenticated
JWT. Every user acts within an organization; personal (org-less) accounts do not
exist on this platform.

- Field name on every Convex table: `tenant` (not `tenantId`, not `orgId`).
- WorkOS is the external system of record for users, organizations, sessions,
  roles, and permissions. Convex stores **no** auth tables; the only identity
  artifact in our schemas is the `tenant` field.
- Tenant-scoped tables are declared with the `tenantTable` helper
  (`packages/domain/src/schemas/helper.ts`); plain `zodTable` means the table is
  deliberately not tenant-scoped.
- Machine writers (webhooks, v-inbound/v-outbound/messages) never receive
  `tenant` as input — they derive it from the owning resource already in Convex
  (phone number → tenant, agent → tenant, batch job → tenant).

## Agent Draft

The mutable, editable configuration owned by one Agent Variant. Back-office
edits operate on the selected variant's draft. Drafts are never executed by
calls; publishing snapshots the draft into a new Agent Version for that variant.

## System Tool

A platform built-in capability that modifies conversation state without any
external call — end_call, language_detection, transfer_to_agent,
transfer_to_number, skip_turn, play_keypad_touch_tone, voicemail_detection.
Implemented inside our session engine; toggled and configured per agent (and
snapshotted with the Agent Version). Not rows in a table.

## MCP Connection

A tenant's link to external tools, via either **Composio** (customer connects
and manages integrations from Composio's toolkit catalog themselves) or a
**bring-your-own MCP server** (url + auth). Stored in the `mcpConnections`
table; agents reference connections by id. There is no generic "tools" registry
table — external tooling is always MCP.

## Agent Version

An immutable snapshot written when a draft is published, including the full
agent configuration and its procedures. Every version records the Agent Variant
that produced it. Calls always run a published Agent Version; rollback means
moving that variant's published-version pointer back to an older version.

## Agent Variant

A deployment lane such as Main, Variant A, or Variant B that points traffic to
an experimental agent configuration. Each variant owns an independent Agent
Draft and current published Agent Version. Active variant weights total exactly
100 percent, and normal selection is deterministic from the conversation id. An
Agent Variant is independent of call direction and must not be used to route
inbound calls differently from outbound calls. Outbound test calls or pinned
campaigns may explicitly override weighted selection. A published variant may
have zero weight, making it directly testable without receiving normal traffic.

## Workflow Condition Branch

A conditional path inside an inbound or outbound workflow. It selects the next
workflow step from runtime conditions. It is not an Agent Variant and does not
participate in percentage-based traffic allocation.

## Phone Number

A first-class tenant-owned voice number stored as one `phoneNumbers` row. It
owns E.164 identity, provider metadata, geography, capabilities, lifecycle, and
an optional default inbound Agent assignment. Phone numbers never live in
`tenantSettings` or Agent configuration. Outbound workflows select eligible
tenant numbers independently from Agent Variant allocation.

## Telephony Connection

A tenant's provider-account boundary for Twilio or SIP trunking. It stores
provider identity and secret references shared by one or more Phone Numbers. Raw
provider credentials never live on Phone Number rows or enter agent session
context.

## Agent Version Health

The live readiness of an immutable Agent Version's external or mutable
dependencies, such as attached Knowledge Base documents and MCP connections.
Health is derived rather than stored in the version snapshot, so warnings can
appear and clear without republishing or mutating the Agent Version. A warning
degrades only the unavailable dependency; it does not prevent the version from
running.

## Knowledge Base

First-class platform capability — defines what an agent _knows_, on the same
tier as personality/system prompt. A minimal `kbDocuments` registry provides
stable identity while the Convex RAG component owns content, metadata, chunks,
embeddings, and retrieval. The platform injects knowledge into sessions; it is
not delegated to MCP.

## Knowledge Base Attachment

An Agent Draft or Agent Version reference to a Knowledge Base document. The
attachment owns `usageMode`: `prompt` appends the document after the base agent
prompt, while `auto` makes it available through retrieval. The document itself
does not own a usage mode, so different agents may consume the same document in
different ways.

## RAG Key

The deterministic replacement key used when adding or refreshing content in the
Convex RAG component. The backend derives it as `kb:{kbDocumentId}` from the
stable Knowledge Base registry id. It is not stored and is never supplied by a
user or model.

## Tenant Settings

Per-tenant product configuration (recording, transcript retention, defaults,
caps) in the `tenantSettings` table, keyed by `tenant`. This is product config,
NOT an identity/org record — who the tenant is lives in WorkOS. Absence of a row
means platform defaults; agent-level overrides win.

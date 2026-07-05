# Context

Glossary of canonical terms for agent.io. Terms are binding: code, schemas,
and docs use these words with exactly these meanings.

## Tenant

The unit of data isolation for the platform. A tenant **is** a WorkOS
Organization — the value is the WorkOS `org_…` id, taken from the
authenticated JWT. Every user acts within an organization; personal
(org-less) accounts do not exist on this platform.

- Field name on every Convex table: `tenant` (not `tenantId`, not `orgId`).
- WorkOS is the external system of record for users, organizations,
  sessions, roles, and permissions. Convex stores **no** auth tables; the
  only identity artifact in our schemas is the `tenant` field.
- Tenant-scoped tables are declared with the `tenantTable` helper
  (`packages/domain/src/schemas/helper.ts`); plain `zodTable` means the
  table is deliberately not tenant-scoped.
- Machine writers (webhooks, v-inbound/v-outbound/messages) never receive
  `tenant` as input — they derive it from the owning resource already in
  Convex (phone number → tenant, agent → tenant, batch job → tenant).

## Agent Draft

The mutable, editable state of an agent — the `agents` row itself.
Back-office edits operate on the draft. Drafts are never executed by calls.

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
table; agents reference connections by id. There is no generic "tools"
registry table — external tooling is always MCP.

## Agent Version

An immutable snapshot written when a draft is published, including the full
agent configuration and its procedures. Calls always run a published Agent
Version; rollback means pointing back to an older version. (Branches/merge
are deliberately out of the v1 language.)

## Knowledge Base

First-class platform capability — defines what an agent *knows*, on the same
tier as personality/system prompt. Native to our stack: `kbDocuments` +
`kbChunks` with Convex vector indexes; retrieval is injected into sessions by
the platform, not delegated to MCP.

## Tenant Settings

Per-tenant product configuration (recording, transcript retention, defaults,
caps) in the `tenantSettings` table, keyed by `tenant`. This is product
config, NOT an identity/org record — who the tenant is lives in WorkOS.
Absence of a row means platform defaults; agent-level overrides win.

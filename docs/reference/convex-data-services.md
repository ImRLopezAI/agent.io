# Convex Data Services Reference

This document is the client contract for tenant configuration and investigation
data. These functions are authenticated facades over Convex storage and the RAG
component. They are not provider command APIs and do not connect an Agent to a
runtime session.

## Shared Contract

- Every public read and write derives the tenant from the WorkOS organization
  claim. Caller-supplied resource ids are resolved through tenant-scoped reads;
  absent, malformed, and cross-tenant ids use the same not-found response.
- Growth-facing lists accept `paginationOpts`. Native lists accept
  `{ cursor, numItems }`; Phone Number composed-filter lists additionally accept
  `endCursor`. `numItems` is limited to 100.
- Cursors are opaque and belong to one function, filter set, and sort. Clients
  must reset pagination when arguments change.
- List results preserve Convex pagination metadata and replace only `page` with
  explicit DTOs. Phone Number composed filters also preserve QueryStream
  `pageStatus` and `splitCursor` metadata.
- Public DTOs exclude `tenant`, credential/secret references, provider account
  identifiers, literal request-header values, raw tool arguments/results,
  retrieval payloads, audio storage ids, and unmasked participant numbers.

## Configuration Services

| Resource        | Reads                                                | Writes                                                                         | Authorization                    | Order and filters                                                           |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| Agents          | `list`, `get`                                        | `create`, `update`, `remove`, `publish`                                        | `prompts:read` / `prompts:write` | Newest first; active or archived; includes bounded Main summary             |
| Agent Variants  | `listByAgent`, `get`                                 | `create`, `update`, `remove`, `publish`, `setTrafficAllocation`, `mergeToMain` | `prompts:read` / `prompts:write` | Stable allocation ordinal within one validated Agent                        |
| Procedures      | `listByVariant`, `get`                               | `create`, `update`, `remove`                                                   | `prompts:read` / `prompts:write` | Newest first within a validated Agent Variant; optional status              |
| MCP Connections | `list`, `get`                                        | `create`, `update`, `remove`                                                   | Members read; admin/owner writes | Newest first; kind and status                                               |
| Knowledge Base  | `listDocuments`, `getDocument`, `listDocumentChunks` | `createDocument`, `upsertKnowledgeContent`, `archiveDocument`                  | `prompts:read` / `prompts:write` | Documents newest first; active or archived; chunks use component pagination |

Agent attachments validate that every Knowledge Base document and MCP Connection
belongs to the same tenant. Procedure references validate their target type.
Public MCP writes accept non-secret metadata only; secret provisioning belongs
to a later trusted back-office server path.

Knowledge content is component-owned. The minimal `kbDocuments` registry stores
identity, lifecycle, and the active RAG entry pointer. Inventory reads enrich a
bounded registry page from `@convex-dev/rag`; a missing component entry degrades
that row to unavailable without failing or shrinking the page. Agent attachment
`usageMode` (`prompt` or `auto`) remains attachment metadata and is not a RAG
filter.

## Telephony Inventory

| Resource              | Reads         | Writes                                                  | Authorization                    | Order and filters                                                  |
| --------------------- | ------------- | ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Telephony Connections | `list`, `get` | `create`, `update`, `setStatus`, `archive`              | Members read; admin/owner writes | Newest first; provider and status                                  |
| Phone Numbers         | `list`, `get` | `updateConfiguration`, `assign`, `setStatus`, `archive` | Members read; admin/owner writes | Newest first; status, Agent, country, region, provider, connection |

Exact Phone Number filter paths use native tenant-leading indexes. Composed
filters use `convex-helpers` QueryStream pagination capped at 2,000 rows and 4
MB per request. Consumers of that path must use the `convex-helpers/react`
pagination hook so `endCursor`, `SplitRequired`, and `splitCursor` continuation
are handled without holes.

Convex owns normalized inventory persistence through the internal
`upsertImportedNumber` and `markMissingAfterRefresh` mutations. The back-office
server owns provider SDK and network operations, including purchase, import or
refresh orchestration, port, and release. It authenticates to Twilio or another
provider, normalizes the result, and invokes the trusted persistence path. No
public Convex function performs provider HTTP requests.

## Conversation Investigation

Conversation reads require `conversations:read`:

| Function            | Contract                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`              | Native pagination, newest first; filters by status, Agent, channel, and direction; returns masked numbers plus Variant/Version allocation and workflow attribution          |
| `get`               | Safe detail with routing attribution, caller-ID reason, usage, audio availability, termination reason, and summary; never returns raw media ids or full participant numbers |
| `messages`          | Native pagination by validated Conversation and ascending sequence; returns transcript text and summarized tool execution only                                              |
| `searchTranscripts` | Search-index pagination with tenant plus optional Conversation, Agent, and role filters; returns the same safe message DTO                                                  |

The internal `startFromPhoneNumber`, `startFromWhatsappAccount`,
`startOutboundFromRecipient`, `startFromVersion`, `appendMessage`, and `finish`
mutations remain machine writers. They derive tenant from an owning resource and
maintain immutable conversation attribution and `messageCount`; they are not
back-office CRUD. The authenticated request DTOs and deployment rules are
defined in [Agent Deployment and Routing](./agent-deployment-routing.md).

## Lifecycle Rules

- Agent, Variant, and Procedure removal archives; archived Agents and Variants
  cannot publish.
- MCP removal disables while preserving Agent attachment history.
- Knowledge Base archive removes component content and preserves the registry
  tombstone for historical identity and health resolution.
- Telephony Connection and Phone Number archive are non-destructive.
- Provider refresh may mark omitted numbers `provider_missing`; it does not
  hard-delete them.
- Conversation and message records are immutable from the public user path.

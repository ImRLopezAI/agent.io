# 0002 - Use the Convex RAG component for knowledge retrieval

Date: 2026-07-09 Status: accepted

## Context

The platform needs tenant-scoped Knowledge Base content for live agents. The
repository contains an unused custom scaffold with `kbDocuments`, `kbChunks`,
and `kbEmbeddings`, plus custom chunking, embedding, vector search, filtering,
and result formatting. There is no production Knowledge Base flow or data to
migrate.

The Convex RAG component already owns content ingestion, chunking, embeddings,
typed filters, similarity thresholds, context expansion, replacement by key,
entry status, and formatted search output. Reimplementing those capabilities in
Agent.io would duplicate the component and create a second retrieval model.

## Decision

Integrate `@convex-dev/rag` as the Knowledge Base content and retrieval engine.
Remove the unused custom chunk and embedding substrate when this integration is
implemented. This is an integration, not a data migration: no backfill, dual
write, compatibility period, or migration script is required.

Agent.io retains a minimal tenant-scoped `kbDocuments` registry only for stable
product identity and replacement coordination. A registry row contains:

- `_id`
- `tenant` and standard timestamps supplied by `tenantTable`
- `activeEntryId?`
- `lastError?`
- `archivedAt?`

The registry does not duplicate component-owned title, source metadata, text,
chunks, embeddings, filters, or entry status. Agent Drafts and Agent Versions
attach the stable registry `_id`, while component `entryId` values identify
individual content revisions.

The component replacement key is derived as `kb:${kbDocumentId}` and is never
stored or accepted from a client. `upsertKnowledgeContent` calls synchronous
`rag.add(...)` with text and that key. The component owns its internal
`pending`, `ready`, and `replaced` lifecycle and keeps the previous keyed entry
searchable while replacement runs. Agent.io updates `activeEntryId` only after
`rag.add` returns a ready result; a failed call leaves the previous pointer
unchanged.

Define typed component filters with `documentId` as the required v1 filter.
Product metadata needed for display or inspection, including title and source
information, belongs to the component entry metadata rather than the registry.

Tenant isolation is expressed through component namespaces. The default
namespace is the WorkOS tenant id, allowing documents to be shared across that
tenant's agents while search is constrained by Agent Version document scope. Use
`{tenant}:{agentId}` only for an explicitly agent-private corpus.

The backend exposes two wrapper operations:

- `upsertKnowledgeContent(documentId, text, metadata?)` derives the namespace
  and replacement key, sends text through the component's default chunker, and
  records the ready entry without duplicating component lifecycle state.
- `searchKnowledge(conversationId, query, options)` derives tenant and allowed
  document ids from the conversation and its Agent Version, applies the
  `documentId` filter and configured threshold/context options, and calls the
  component.

App and runtime code do not call the component directly. Neither clients nor
models may supply a tenant namespace or widen document scope.

`searchKnowledge` returns the component result directly. Its formatted `text` is
the canonical retrieval context passed to the model; v1 does not define a
parallel normalized result contract. The conversation tool event records the
retrieval text and component entry ids used so the served content revision is
auditable without custom chunk versioning.

`usageMode` belongs to an Agent Draft or Agent Version attachment, not to a
Knowledge Base document. `prompt` content is loaded from the active component
entry's ordered chunks and appended after the Agent Version base prompt. `auto`
content is eligible for `searchKnowledge`. All active documents are ingested
eagerly regardless of current attachments or usage modes.

Prompt-mode Knowledge Base instructions supplement the base prompt and cannot
override agent identity, safety constraints, or tool authorization. Session
assembly delimits each prompt-mode document and states this precedence.

Agent Versions snapshot attachments, not content revisions. Successful content
replacement is immediately visible to published agents without republishing.
Changing attachments or usage modes still requires publishing a new version.

The previous ready entry remains active while a replacement runs. A failed
refresh records `lastError` while keeping the previous active entry available.
An initial ingestion failure leaves the document unavailable.

Publishing with an attached unavailable document is allowed with a warning.
Sessions skip unavailable prompt documents and searches return no context for
unavailable auto documents. Agent Version Health derives this warning from the
current registry/component state and clears it automatically when content is
ready.

Deleting a Knowledge Base document is an archive operation. Archiving removes
its component content, prevents new attachments, and retains the registry
tombstone so historical Agent Versions and audit views can resolve the stable
identity. Published versions that reference it remain runnable with a live
health warning.

## Consequences

- `kbDocuments` is a minimal identity and coordination registry, not a content
  library or retrieval index.
- The Convex RAG component owns content, product metadata, chunks, embeddings,
  filters, entry lifecycle, search semantics, and formatted output.
- Custom `kbChunks`, `kbEmbeddings`, embedding helpers, vector indexes, hybrid
  search, and custom chunk revision history are removed from the target design.
- Agent attachments remain `knowledgeBase: [{ documentId, usageMode }]`.
- Component `entryId` is the content revision; the stable registry id is the
  attachment identity.
- Retrieval and prompt expansion degrade per unavailable document rather than
  failing the whole session.
- Backend tests must prove tenant namespace isolation, Agent Version document
  scope, threshold behavior, replacement cutover/failure behavior, prompt
  precedence, archive behavior, and direct component-result passthrough.

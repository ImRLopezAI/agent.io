# 0001 — No auth tables; tenant isolation via a `tenant` field bound to the WorkOS organization

Date: 2026-07-05
Status: accepted

## Context

The platform is multi-tenant. Authentication and organization management run
on WorkOS (AuthKit via `@convex-dev/workos-authkit`); Convex validates WorkOS
JWTs directly (`auth.config.ts`) and roles/permissions are provisioned *into*
WorkOS (`packages/convex/src/workos.ts`), not stored locally.

The conventional pattern — and the default most code generators and LLMs
reach for — is to define local `users`, `organizations`, and `sessions`
tables and sync them from the identity provider. That duplicates WorkOS
state, requires webhook-driven sync for data we never query on its own, and
creates a second source of truth for identity.

## Decision

- Convex defines **no** auth/identity tables: no `users`, no
  `organizations`, no `sessions`.
- Every tenant-scoped table carries a `tenant: z.string()` field holding the
  WorkOS organization id (`org_…`), injected by the `tenantTable` helper in
  `packages/domain/src/schemas/helper.ts` (which also owns the `by_tenant`
  index). Plain `zodTable` marks a deliberately non-tenant table.
- A tenant **is** a WorkOS Organization; users always act within one
  (no personal/org-less accounts).
- User-context reads/writes take `tenant` from the JWT's org claim via
  AuthKit. Machine writers (provider webhooks, v-inbound, v-outbound,
  messages) never accept `tenant` as input — they derive it from the owning
  resource already in Convex (phone number → tenant, agent → tenant,
  batch job → tenant).
- Per-tenant product configuration lives in `tenantSettings` (product
  config, not identity).

## Consequences

- No identity sync jobs, no duplicated user/org state, one source of truth.
- Anything needing user display data (names, avatars) fetches it from WorkOS
  at read time or denormalizes tiny display snapshots onto owning rows
  (e.g. `createdByEmail`) — never into an identity table.
- Cross-tenant leak prevention concentrates in two choke points: the
  `tenantTable` helper and the tenant-scoped query/mutation builders in
  `packages/convex` — reviews focus there.
- If the platform ever needs org-less personal accounts, that is a breaking
  model change (new tenant id shape), deliberately out of scope now.

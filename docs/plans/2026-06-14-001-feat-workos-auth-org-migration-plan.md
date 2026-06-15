---
title: 'feat: Migrate auth/organization (+ settings) from better-auth-ui to WorkOS via contract-first oRPC'
type: feat
status: active
date: 2026-06-14
---

# feat: Migrate auth/organization (+ settings) from better-auth-ui to WorkOS via contract-first oRPC

## Overview

The `src/app/_shell/modules/components/auth/**` tree was scaffolded from a `@better-auth-ui/react` template and binds to better-auth hooks (`useListOrganizations`, `useInviteMember`, `useUpdateOrganization`, …) plus a missing `@/lib/auth/organization-plugin`. The app's real auth provider is **WorkOS AuthKit**, and the app already has a contract-first **oRPC** layer (`$rpc`/`$api`). This plan migrates the **organization** components off better-auth onto WorkOS, driven through new `$rpc.workOs.*` procedures, `useRouteContext` for session scalars, `useAuth()` for action methods, and the existing `useCreateForm` + `sonner` UI primitives — building the **full** WorkOS org surface (some procedures/components dormant-but-built for later) with **optimistic** mutations.

The **settings** subtree (`auth/settings/**`: password, email, sessions, linked accounts, avatar) is a distinct surface (WorkOS _user management_ / WorkOS Widgets, not the org router) and is handled in a separate, lightly-specified phase that follows the same client patterns — see Phase 3 and `### Deferred to Separate Tasks`.

This migration encodes 12 architectural decisions already settled in a design session (see **Key Technical Decisions**); the plan builds on them rather than re-deriving them.

## Problem Frame

- Components import `@better-auth-ui/react`, `@better-auth-ui/core`, `better-auth/client`, and a non-existent `@/lib/auth/organization-plugin` → the tree is `tsc`-red and unusable. (vite build still succeeds — esbuild doesn't typecheck — so this is latent, not a hard block.)
- WorkOS is the source of truth for orgs/members/invitations/roles, reachable only via the **Management API** (server-side, using the app's API key). That API does **not** authorize by the caller's role — so the `$rpc` middleware is the _only_ authorization boundary.
- The org/role/active-org state lives in the **WorkOS session** (`getAuth()`), surfaced to the client through `useRouteContext({ from: '/_shell' })` and the reactive `useAuth()` hook. Session-changing actions (switch/leave/delete) must reconcile both the router context snapshot and the TanStack Query cache.
- There is exactly **one** existing `$rpc` consumer (`src/app/_shell/_base/index.tsx`, a health query) and **zero** existing `useMutation`/`useCreateForm` consumers — this plan establishes those patterns for the codebase.

## Requirements Trace

- **R1.** Replace all `@better-auth-ui/*` / `better-auth/client` / `@/lib/auth/organization-plugin` imports in `auth/organization/**` with WorkOS-backed equivalents.
- **R2.** Expose the full WorkOS org surface as `$rpc.workOs.*` contract procedures: organization {getActive, listMyMemberships, create·, update, delete·}, members {list, updateRole, remove}, invitations {list, send, revoke, resend}, roles {list}. (· = built but dormant.)
- **R3.** Authorization: reads gated by `org` middleware (any active member); mutations gated by `admin` (built-in `admin` role). `organizationId` is **never** accepted from the client — always derived from the session.
- **R4.** UI reads session scalars (role, permissions, organizationId, user) from `useRouteContext({ from: '/_shell' })`; `useAuth()` is used only for action methods (`switchToOrganization`, `refreshAuth`, `signOut`).
- **R5.** Reads use client `useQuery($rpc.workOs.…queryOptions())` + existing `*-skeleton.tsx`; no loader prefetch.
- **R6.** Mutations are optimistic where list-scoped, via a per-module options layer (`*.mut-opts.ts` + `useOrgOpts()`); session-scoped mutations use the `onOrgChanged()` reconciliation path instead.
- **R7.** Forms reuse each procedure's contract input zod schema as the `useCreateForm` resolver; errors surface through a shared `mapOrpcError` (toast by typed code + `form.setError` for field-bound codes).
- **R8.** Query cache is org-aware: the active orgId (from route context) is folded into the **query key** only, never the network input.
- **R9.** Session reconciliation: `onOrgChanged()` = `useRouter().invalidate()` + `queryClient.invalidateQueries()`, fired after every session-changing action.
- **R10.** Logo/slug components are removed (no WorkOS backing); `create`/`leave`/`delete` org procedures + UI are built but not surfaced.
- **R11.** No net-new `tsc` errors in touched files (verified via `node_modules/.bin/tsc --noEmit`); no server code leaks into the client bundle (contracts stay pure).

## Scope Boundaries

- **No new auth provider work** — WorkOS AuthKit is already wired (`__root.tsx`, `_shell.tsx`, `provider/index.tsx`). This plan consumes it, it does not configure it.
- **No org `logo` or `slug`** — WorkOS `Organization` has neither field. `change-organization-logo.tsx`, `organization-logo.tsx` (logo upload path), `slug-field.tsx`, and `useCheckSlug` usage are removed, not ported.
- **No client-supplied `organizationId`** on any procedure — active org comes from the session only.
- **No loader/SSR prefetch** for these views — client `useQuery` + skeletons.
- **Routing/surfacing of dormant features** (create-org screen, leave/delete actions) is out — they are built and wired to `$rpc` but not mounted in navigation yet.

### Deferred to Separate Tasks

- **Deep `auth/settings` security flows** (`change-password`, `active-sessions`, `linked-accounts`, MFA, `change-email`): WorkOS-recommended path is **WorkOS Widgets** (already used in `user-profile.tsx`) or hosted flows, not hand-rolled `$rpc`. Phase 3 covers the _account/profile_ slice and adopts Widgets for security-sensitive flows; the full security build (if custom) needs its own design pass: **future plan**.
- **Org `logo`/`slug` via a Convex `organizations` profile table** (logo in Convex file storage, slug + custom fields): **future plan**, only if the product needs them.
- **Seeding `docs/solutions/`** with the WorkOS+AuthKit+oRPC patterns this migration establishes: **follow-up** (the store does not exist yet).

## Context & Research

### Relevant Code and Patterns

| Concern                    | Path                                                | Notes                                                                                                                                                  |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract root              | `src/server/rpc/contracts/index.ts`                 | `contract = { health, workOs }`; add procedures to `workOsContract`                                                                                    |
| WorkOS contract            | `src/server/rpc/contracts/work-os.contract.ts`      | currently only `getOrganization`/`listOrganizations` (`z.custom<Organization>()`)                                                                      |
| Base builder / errors      | `src/server/rpc/contracts/base.ts`, `errors.ts`     | `base = oc.errors(baseErrors)`; errors: `UNAUTHORIZED`, `FORBIDDEN`, `NO_ADMIN_ROLE`, `NO_ACTIVE_ORGANIZATION`, `CONFLICT`, `NOT_FOUND`, `BAD_REQUEST` |
| Implementer + middleware   | `src/server/rpc/init.ts`                            | `os` / `auth` / `admin` (`role==='admin'`) / `org` (adds `organizationId`); `RpcContextType` carries `session`, `cvx`, `workOs`                        |
| WorkOS router              | `src/server/rpc/routes/work-os.router.ts`           | leaf handlers built from `org.*`/`admin.*`; structure from `os.workOs.router({...})`                                                                   |
| Root router + OpenAPI      | `src/server/rpc/index.ts`                           | `os.router({ health, workOs })` → `OpenAPIHandler` (docs strings still say "Clerk/Sunday" — stale, fix opportunistically)                              |
| Isomorphic client / `$rpc` | `src/lib/rpc/client.ts`                             | `caller` + `$api = createTanstackQueryUtils(caller)`; client branch links only `contract` (server tree-shaken)                                         |
| Route context (`$rpc`)     | `src/lib/rpc/context.ts`                            | `getContext()` exposes `$rpc` (=`$api`), `queryClient`, `cvx`                                                                                          |
| Root auth context          | `src/app/__root.tsx`                                | `fetchWorkosAuth` (`createServerFn` → `getAuth()`); `beforeLoad` sets `context.auth`; **not memoized** → `router.invalidate()` re-derives it           |
| `/_shell` gate             | `src/app/_shell.tsx`                                | `beforeLoad` returns `{ userId, token, auth }`; source for `useRouteContext({ from: '/_shell' })`                                                      |
| AuthKitProvider            | `src/components/provider/index.tsx`                 | mounts `<AuthKitProvider>` above the query client                                                                                                      |
| `$rpc` query example       | `src/app/_shell/_base/index.tsx`                    | `const { $rpc } = Route.useRouteContext(); useQuery($rpc.health.queryOptions({}))`                                                                     |
| Compound form API          | `src/components/ui/form.tsx`, `form-components.tsx` | `useCreateForm` (render-prop `Form` + statics: `.Field/.Input/.Select/.Submit/…`); **zero current consumers**                                          |
| Toasts                     | `src/components/ui/sonner.tsx`                      | `import { toast } from 'sonner'`                                                                                                                       |
| Jotai dialog pattern       | `src/app/_shell/modules/components/ui/dialog.tsx`   | `ResponsiveDialog` derived-atom + scoped-store; use for dialog open state (CLAUDE.md: Jotai for UI state)                                              |
| Roles/permissions seed     | `src/lib/work-os.ts`, `convex/auth.ts`              | webhook seeds `reader`/`writer` + permissions on `organization.created`; built-in `member`/`admin` always present                                      |

### WorkOS SDK facts (from installed `@workos-inc/node@8.13.0` — bake into handlers)

- **Memberships** (`workos.userManagement`): `listOrganizationMemberships({ organizationId? , userId?, statuses?, limit?, after? })` → `AutoPaginatable<OrganizationMembership>` (must pass `organizationId` **or** `userId`). `createOrganizationMembership({ organizationId, userId, roleSlug })`, `updateOrganizationMembership(id, { roleSlug })`, `deleteOrganizationMembership(id)`, `getUser(userId) → User`.
- **`OrganizationMembership`** carries `organizationId`, **`organizationName`**, `userId`, `status` (`active|inactive|pending`), `role: { slug }` **only** — no user fields, no role name/permissions.
  - → **Members list enrichment (N+1):** for each membership, `getUser(userId)` for email/name/avatar, and cross-ref `role.slug` against `listOrganizationRoles` for the display name. Fan out server-side (`Promise.all`).
  - → **Switcher (my orgs):** `listOrganizationMemberships({ userId })` already returns `organizationName` — **no `getOrganization` fan-out needed.**
- **Invitations** (`workos.userManagement`): `sendInvitation({ email, organizationId, roleSlug, expiresInDays? })`, `listInvitations({ organizationId })` → `AutoPaginatable<Invitation>`, `revokeInvitation(id) → Invitation`, `resendInvitation(id) → Invitation`. **`Invitation.state`** = `pending|accepted|expired|revoked` (field is `state`, not `status`).
- **Roles**: `workos.organizations.listOrganizationRoles({ organizationId }) → RoleList` (flat `{ object, data }`, **not** paginated). `OrganizationRole` = `{ id, slug, name, description, permissions[], … }`.
- **Organizations**: `getOrganization(id)`, `updateOrganization({ organization: id, name?, metadata? })` (**id under `organization:`**, not positional), `createOrganization({ name, … })`, `deleteOrganization(id)`, `listOrganizations() → AutoPaginatable<Organization>`.
- **`AutoPaginatable`**: use `.data` (first page) + `.listMetadata.after` (cursor), or `await result.autoPagination()` (all pages).

### AuthKit client facts (`@workos/authkit-tanstack-react-start@0.8.6`)

- `useAuth()` (from `…/client`) → `{ user, organizationId, role, roles, permissions, …, switchToOrganization(id), refreshAuth({ organizationId? }), signOut({ returnTo? }) }`.
- `switchToOrganization`/`refreshAuth` resolve to **`void | { error: string }`** — they do **not** throw; check `res?.error`. They run server functions that re-seal the session cookie server-side.

### Institutional Learnings

- **`npx tsc` is a false-green stub in this repo** — always verify with `node_modules/.bin/tsc --noEmit`. There is a known pre-existing error baseline (convex, evilcharts, etc.); the bar is **zero net-new errors in touched files**. (Source: `docs/plans/2026-06-13-003-…-plan.md`.)
- Tooling: tests `bunx vitest run <path>`; format/lint `bunx biome check --write <files>` (**tabs**, single quotes, no semicolons, sorted tailwind classes).
- **Posture precedent:** plan 003 deleted dead scaffolding rather than migrating it. If a better-auth component turns out unused/over-scoped (e.g. logo/slug), prefer deletion over faithful porting.
- No `docs/solutions/` store exists — these domains are greenfield; ground everything in the actual code.

### External References

- WorkOS Node SDK (memberships/invitations/roles/organizations) — signatures confirmed against installed `@workos-inc/node@8.13.0` d.cts.
- TanStack Query v5 optimistic-update canonical pattern (`onMutate` → `cancelQueries` → `getQueryData` snapshot → `setQueryData` → `onError` rollback → `onSettled` `invalidateQueries`); v5 uses the `{ queryKey }` filter object form.
- oRPC `@orpc/tanstack-query@1.14.6`: key shape `[path, { type, input }]`; `queryOptions`/`mutationOptions`/`key()`; `queryKey` override accepted in `queryOptions`.
- `@hookform/resolvers@5.4.0` `zodResolver` natively supports zod v4 (`zod@4.4.3`) — no shim.

## Key Technical Decisions

The 12 settled decisions (do not re-litigate), plus three surfaced by research:

1. **Logo/slug: out** — no WorkOS backing. Remove the components; Convex org-profile table is a future option.
2. **Active org is server-derived** — `organizationId` never sent from the client; `org` middleware reads `session.organizationId`. A client can only ever touch its active org.
3. **Authorization predicate** — reads gate on `org` (any active member); org-management mutations gate on `admin` (built-in `admin` role, `session.role === 'admin'`). Permissions reserved for feature modules; "system manager" is a future tier.
4. **UI gating source** — `useRouteContext({ from: '/_shell' })` for session scalars (role/permissions/organizationId/user), no fetch. `useAuth()` only for action methods. Server enforces regardless (defense in depth).
5. **Session reconciliation** — `onOrgChanged()` = `useRouter().invalidate()` (re-runs root `beforeLoad` → fresh `getAuth`, verified not memoized) + `queryClient.invalidateQueries()`.
6. **Reads** — pure client `useQuery(...queryOptions())` + existing `*-skeleton.tsx`. No loader prefetch.
7. **Forms** — share each procedure's contract input zod schema as the `useCreateForm` resolver (per-procedure exports from the pure contract files). `zodResolver` (zod v4 native).
8. **Mutations** — optimistic-from-start via per-module `*.mut-opts.ts` + `useOrgOpts()` (closes over `useQueryClient`, built on `$api`). Errors via shared `mapOrpcError` (toast by typed `ORPCError` code + `form.setError` for field-bound codes like `CONFLICT`).
9. **Cache org-awareness** — `useOrgOpts` folds the active orgId (from route context) into the query **key** only (a trailing path segment), never the network input.
10. **Optimistic boundary (two classes)** — list-scoped (members/invitations) → full optimistic; session-scoped (switch/leave/delete/create) → `await → onOrgChanged() → close`, never optimistic on route-context values.
11. **Scope** — build the full surface; dormant-but-built: create/leave/delete org + their UI. Out: logo/slug. Delete `@better-auth-ui/*` + `@/lib/auth/organization-plugin` per component as it migrates.
12. **Leave/delete active org (when surfaced)** — auto-switch to next membership (`switchToOrganization`); if none remain → `signOut()`. No picker route.

**Research-surfaced decisions:**

13. **Members-list enrichment** — the members query handler enriches each `OrganizationMembership` with `getUser(userId)` (email/name/avatar) and the role display name from `listOrganizationRoles` (server-side `Promise.all`). The contract `output` is the enriched shape, so the client gets typed rows. (Switcher needs **no** enrichment — `organizationName` is on the membership.)
14. **Settings approach** — `auth/settings` security-sensitive flows (password/sessions/linked-accounts/MFA) adopt **WorkOS Widgets** (as `user-profile.tsx` already does), _not_ custom `$rpc`. Only profile/name/account-level fields that map cleanly to `userManagement.updateUser` get `$rpc` procedures. Deep custom security build is deferred.
15. **Dialog open-state → Jotai**, per CLAUDE.md, following the `ResponsiveDialog` derived-atom/scoped-store pattern — replacing the template's `useState` open flags.

## Open Questions

### Resolved During Planning

- **Switcher org names without N+1?** → Resolved: `OrganizationMembership.organizationName` is present; `listOrganizationMemberships({ userId })` is sufficient.
- **Does `router.invalidate()` actually refresh `context.auth`?** → Resolved: `context.auth` is set in `__root.tsx` `beforeLoad` from a `createServerFn` `getAuth()` call, not memoized; `router.invalidate()` re-runs it. Order: `await switchToOrganization(id)` (and check `res?.error`) **before** `invalidate()`.
- **role vs permission gate for org admin?** → Resolved: built-in `admin` role now; permissions later for feature modules.

### Deferred to Implementation

- **Members-list `getUser` fan-out batching** — start with `Promise.all` over the first page (`limit` ~100). If member counts grow large, add pagination/caching at execution time. Not a planning blocker.
- **Exact org-aware query-key construction** — fold `organizationId` as a trailing element of the oRPC key's path array (keeps prefix-match invalidation working); verify against `@orpc/tanstack-query` matching at execution time.
- **Whether `listOrganizationRoles` is fetched per members-list request or cached** — decide when wiring the role dropdown; roles change rarely, so a short `staleTime` is likely fine.
- **`create`/`leave`/`delete` UI mount points** — built and `$rpc`-wired but not routed; final placement decided when surfaced.

## Output Structure

New and modified files (org phase; `·` dormant-but-built):

    src/server/rpc/contracts/
      work-os.contract.ts          # MODIFY: full org/member/invitation/role procedures + exported input schemas
      index.ts                     # unchanged (workOsContract already wired)
    src/server/rpc/routes/
      work-os.router.ts            # MODIFY: handlers under org/admin, membership enrichment
    src/server/rpc/init.ts         # unchanged (auth/admin/org middleware already present)

    src/app/_shell/modules/utils/
      org.mut-opts.ts              # CREATE: per-module query+mutation option factories (optimistic)
      use-org-opts.ts              # CREATE: useOrgOpts() hook (closes over useQueryClient + route context)
      use-on-org-changed.ts        # CREATE: onOrgChanged() reconciliation helper (useRouter + queryClient)
      map-orpc-error.ts            # CREATE: typed ORPCError -> toast / form.setError
      org-dialogs.atoms.ts         # CREATE: Jotai atoms for dialog open-state

    src/app/_shell/modules/components/auth/organization/   # MODIFY ~22, DELETE 3 (logo/slug)
    src/app/_shell/modules/components/auth/__tests__/      # CREATE: option-layer + handler tests

## High-Level Technical Design

> _These sketches illustrate the intended approach and are directional guidance for review, not implementation specification. The implementing agent should treat them as context, not code to reproduce verbatim — names, exact generics, and edge handling will be settled in code._

### Data-flow overview

```
Component (client)
  ├─ reads session scalars ── useRouteContext({from:'/_shell'})  → role, organizationId, user   (no fetch)
  ├─ reads lists ─────────── useQuery( useOrgOpts().members.list )  → $rpc.workOs.members.list   (GET)
  ├─ list mutations ──────── useMutation( useOrgOpts().members.updateRole )  (optimistic onMutate/rollback)
  └─ session actions ─────── useAuth().switchToOrganization()  →  onOrgChanged()  (router.invalidate + invalidateQueries)

$rpc.workOs.*  (OpenAPILink → /api/rpc)
  └─ server: org/admin middleware → context.workOs (Management API, app key)   ← only authz boundary
       organizationId ALWAYS from context.session, never from input
```

### Contract procedure + exported input schema (`work-os.contract.ts`)

```ts
// pure layer — zod + type-only WorkOS imports only
export const inviteMemberInput = z.object({
	email: z.string().email(),
	roleSlug: z.string().min(1),
})

export const workOsContract = {
	organization: {
		getActive: base
			.route({ method: 'GET', path: '/workos/org', tags: ['WorkOS'] })
			.output(z.custom<Organization>()),
		listMyMemberships: base
			.route({
				method: 'GET',
				path: '/workos/org/memberships',
				tags: ['WorkOS'],
			})
			.output(z.custom<MyMembership[]>()), // {organizationId, organizationName, roleSlug}
		update: base
			.route({ method: 'PATCH', path: '/workos/org', tags: ['WorkOS'] })
			.input(z.object({ name: z.string().min(1) }))
			.output(z.custom<Organization>()),
		// create·/delete· — built, dormant
	},
	members: {
		list: base
			.route({ method: 'GET', path: '/workos/org/members', tags: ['WorkOS'] })
			.output(z.custom<MemberRow[]>()), // enriched: user + roleName
		updateRole: base
			.route({
				method: 'PATCH',
				path: '/workos/org/members/{membershipId}',
				tags: ['WorkOS'],
			})
			.input(
				z.object({ membershipId: z.string(), roleSlug: z.string().min(1) }),
			)
			.output(z.custom<MemberRow>()),
		remove: base
			.route({
				method: 'DELETE',
				path: '/workos/org/members/{membershipId}',
				tags: ['WorkOS'],
			})
			.input(z.object({ membershipId: z.string() }))
			.output(z.object({ membershipId: z.string() })),
	},
	invitations: { list, send /*inviteMemberInput*/, revoke, resend },
	roles: {
		list: base
			.route({ method: 'GET', path: '/workos/org/roles' })
			.output(z.custom<OrgRole[]>()),
	},
}
```

### Router handler with enrichment + active-org-from-session (`work-os.router.ts`)

```ts
members: {
  // read → `org` middleware (any active member); orgId from session, NOT input
  list: org.workOs.members.list.handler(async ({ context }) => {
    const orgId = context.organizationId
    const memberships = (await context.workOs.userManagement
      .listOrganizationMemberships({ organizationId: orgId, limit: 100 })).data
    const roles = (await context.workOs.organizations.listOrganizationRoles({ organizationId: orgId })).data
    return Promise.all(memberships.map(async (m) => {
      const user = await context.workOs.userManagement.getUser(m.userId)
      return { membershipId: m.id, userId: m.userId, email: user.email, name: ..., status: m.status,
               roleSlug: m.role.slug, roleName: roles.find(r => r.slug === m.role.slug)?.name }
    }))
  }),
  // mutate → `admin` middleware (built-in admin role)
  updateRole: admin.workOs.members.updateRole.handler(async ({ context, input }) => {
    await context.workOs.userManagement
      .updateOrganizationMembership(input.membershipId, { roleSlug: input.roleSlug })
    /* re-read + enrich the one row, return MemberRow */
  }),
}
```

### Option layer + optimistic mutation (`use-org-opts.ts` / `org.mut-opts.ts`)

```ts
export function useOrgOpts() {
	const qc = useQueryClient()
	const { organizationId } = useRouteContext({ from: '/_shell' }).auth // org-aware key discriminator
	const membersKey = [
		['workOs', 'members', 'list', organizationId],
		{ type: 'query' },
	] // orgId in KEY only

	return {
		members: {
			list: () =>
				$rpc.workOs.members.list.queryOptions({
					input: {},
					queryKey: membersKey,
				}),
			updateRole: () => ({
				...$rpc.workOs.members.updateRole.mutationOptions(),
				onMutate: async (vars) => {
					await qc.cancelQueries({ queryKey: membersKey })
					const previous = qc.getQueryData(membersKey)
					qc.setQueryData(membersKey, (rows) =>
						rows?.map((r) =>
							r.membershipId === vars.membershipId
								? { ...r, roleSlug: vars.roleSlug }
								: r,
						),
					)
					return { previous }
				},
				onError: (_e, _v, ctx) =>
					ctx && qc.setQueryData(membersKey, ctx.previous),
				onSettled: () => qc.invalidateQueries({ queryKey: membersKey }),
			}),
			// remove: same optimistic shape (filter out the row)
		},
	}
}
```

### Reconciliation + error mapping (`use-on-org-changed.ts` / `map-orpc-error.ts`)

```ts
export function useOnOrgChanged() {
	const router = useRouter()
	const qc = useQueryClient()
	return async () => {
		await router.invalidate()
		await qc.invalidateQueries()
	}
}

export function mapOrpcError(err: unknown, form?: UseFormReturn<any>) {
	if (isDefinedError(err)) {
		// typed ORPCError from the contract error map
		if (err.code === 'CONFLICT' && form) {
			form.setError('email', { type: 'server', message: err.message })
			return
		}
		toast.error(err.message) // NO_ACTIVE_ORGANIZATION, NO_ADMIN_ROLE, …
		return
	}
	toast.error('Something went wrong')
}
```

### A migrated component (invite dialog — query + optimistic mutation + form)

```tsx
function InviteMemberDialog() {
	const { role } = useRouteContext({ from: '/_shell' }).auth // gate UI: only admins see invite
	const { invitations } = useOrgOpts()
	const send = useMutation(invitations.send()) // optimistic add to the invitations list
	const [Form, form] = useCreateForm<InviteForm>(() => ({
		resolver: zodResolver(inviteMemberInput), // SAME schema as the contract input
		defaultValues: { email: '', roleSlug: 'member' },
		onSubmit: async (values, f) => {
			try {
				await send.mutateAsync(values) /* close dialog (Jotai atom) */
			} catch (e) {
				mapOrpcError(e, f)
			}
		},
	}))
	return (
		<Form>
			{() => (
				<>
					<Form.Field name='email'>
						<Form.Input />
					</Form.Field>
					<Form.Field name='roleSlug'>
						<Form.Select />
					</Form.Field>
					<Form.Submit>Invite</Form.Submit>
				</>
			)}
		</Form>
	)
}
```

## Implementation Units

Grouped into phases. Phase 1 builds shared infra; Phase 2 migrates organizations (the two reference slices first, then fan-out); Phase 3 handles settings separately.

### Phase 1 — Server + client foundations

- [ ] **Unit 1: Expand the WorkOS contract**

**Goal:** Define every org/member/invitation/role procedure in the contract with exported, reusable input zod schemas.

**Requirements:** R2, R3 (paths only — no orgId input), R7, R10.

**Dependencies:** none (builds on existing `base`/`workOsContract`).

**Files:**

- Modify: `src/server/rpc/contracts/work-os.contract.ts`
- Modify (if needed): `src/server/rpc/contracts/index.ts`
- Test: `src/server/rpc/contracts/__tests__/work-os.contract.test.ts`

**Approach:**

- Procedures per R2; **no `organizationId` in any input** (server derives it). Member/invitation targets use path-id inputs (`membershipId`, `invitationId`) only.
- Export each mutating procedure's input as a named schema (`inviteMemberInput`, `updateMemberRoleInput`, `updateOrgInput`, …) for form reuse (R7).
- Outputs: enriched shapes (`MemberRow`, `MyMembership`, `OrgRole`) via `z.custom<…>()` (typed client, loose OpenAPI body) — tighten to real zod later if runtime validation is wanted.
- Keep the module **pure** (zod + type-only WorkOS imports) so it stays client-safe.

**Patterns to follow:** existing `work-os.contract.ts` (`base.route(...).input(...).output(...)`), `errors.ts` error map.

**Test scenarios:**

- Happy path: contract type-checks; `inviteMemberInput.parse({ email, roleSlug })` accepts valid input and rejects a bad email (`CONFLICT`/validation boundary).
- Edge case: exported schemas reject empty `roleSlug`.
- Integration: importing the contract from a client-side module pulls in no server code (assert via the existing bundle-purity expectation — contract has no `@server`/SDK-runtime imports).

**Verification:** `node_modules/.bin/tsc --noEmit` clean for the contract; schemas importable from both the contract and a component.

- [ ] **Unit 2: Implement the WorkOS router handlers**

**Goal:** Implement all procedures against the WorkOS Management API, gated `org` (read) / `admin` (mutate), with members-list enrichment.

**Requirements:** R2, R3, R13 (enrichment).

**Dependencies:** Unit 1.

**Files:**

- Modify: `src/server/rpc/routes/work-os.router.ts`
- Test: `src/server/rpc/routes/__tests__/work-os.router.test.ts`

**Approach:**

- Reads built from `org.*`, mutations from `admin.*`. Always use `context.organizationId` (from `org` middleware) — never input.
- `members.list`: `listOrganizationMemberships({ organizationId, limit: 100 }).data` → enrich each with `getUser(userId)` + role name from `listOrganizationRoles({ organizationId }).data` (`Promise.all`).
- `organization.listMyMemberships`: `listOrganizationMemberships({ userId: context.user.id }).data` mapped to `{ organizationId, organizationName, roleSlug }` (no fan-out).
- `organization.update`: `updateOrganization({ organization: context.organizationId, name })` (id under `organization:`).
- Invitations: `sendInvitation({ email, organizationId, roleSlug })`, `listInvitations({ organizationId }).data`, `revokeInvitation(id)`, `resendInvitation(id)`. Surface `Invitation.state`.
- `roles.list`: `listOrganizationRoles({ organizationId }).data` (flat list).
- `create`·/`delete`· implemented but unreferenced by UI yet.
- Map WorkOS failure modes to typed contract errors where useful (e.g. duplicate invite → `CONFLICT`).

**Patterns to follow:** existing `work-os.router.ts` (`org.workOs.x.handler`), `context.workOs` usage.

**Test scenarios:**

- Happy path: `members.list` returns enriched rows (email + roleName) for a stubbed org with 2 members + 2 roles.
- Edge case: empty membership list → `[]`; a membership whose `role.slug` has no matching role → `roleName` undefined, not a throw.
- Error path: a read without an active org → `NO_ACTIVE_ORGANIZATION` (via `org` middleware); a mutation as a non-admin → `NO_ADMIN_ROLE` (via `admin`).
- Error path: `organizationId` is read from `context`, **not** input — a handler given a spoofed input field ignores it (assert it calls WorkOS with the session org).
- Integration: `updateRole` calls `updateOrganizationMembership(id, { roleSlug })` then re-reads and returns an enriched `MemberRow`.

**Execution note:** Start with a failing handler test for the `members.list` enrichment contract (it's the riskiest shape).

**Verification:** handlers type-check against the contract; `os.router({...})` in `src/server/rpc/index.ts` still composes; OpenAPI handler builds.

- [ ] **Unit 3: Client option layer + reconciliation + error mapping**

**Goal:** Build the per-module options hook, optimistic mutation factories, the `onOrgChanged` helper, the `mapOrpcError` helper, and dialog atoms — the reusable spine every component consumes.

**Requirements:** R5, R6, R7, R8, R9, decision 15.

**Dependencies:** Units 1–2.

**Files:**

- Create: `src/app/_shell/modules/utils/org.mut-opts.ts`
- Create: `src/app/_shell/modules/utils/use-org-opts.ts`
- Create: `src/app/_shell/modules/utils/use-on-org-changed.ts`
- Create: `src/app/_shell/modules/utils/map-orpc-error.ts`
- Create: `src/app/_shell/modules/utils/org-dialogs.atoms.ts`
- Test: `src/app/_shell/modules/utils/__tests__/org-opts.test.ts`, `map-orpc-error.test.ts`

**Approach:**

- `useOrgOpts()` reads `$rpc` + `organizationId` from route context, closes over `useQueryClient`, and returns query-option and mutation-option factories per module (members, invitations, organization).
- **Org-aware key (R8):** fold `organizationId` into the query key only (trailing path segment), never the input. Use the same key for `queryOptions`, optimistic `setQueryData`, and `invalidateQueries`.
- **Optimistic (R6/R10):** list-scoped factories implement `onMutate` (cancel → snapshot → `setQueryData`) / `onError` (rollback from context) / `onSettled` (`invalidateQueries`).
- `useOnOrgChanged()` returns an async fn doing `router.invalidate()` + `queryClient.invalidateQueries()`.
- `mapOrpcError(err, form?)` distinguishes typed `ORPCError` codes (`isDefinedError`) → toast or `form.setError`; falls back to a generic toast.
- Dialog atoms follow the `ResponsiveDialog` Jotai pattern.

**Patterns to follow:** `src/app/_shell/_base/index.tsx` (`$rpc` via route context), TanStack v5 optimistic canonical pattern, `src/app/_shell/modules/components/ui/dialog.tsx` (Jotai).

**Test scenarios:**

- Happy path: `useOrgOpts().members.updateRole().onMutate` writes the optimistic row; `onError` restores the snapshot; `onSettled` triggers an invalidate of the org-scoped key.
- Edge case: switching `organizationId` changes the query key (org A and org B do not share a cache entry).
- Error path: `mapOrpcError` routes `CONFLICT` → `form.setError('email', …)` and `NO_ADMIN_ROLE` → `toast.error`; unknown error → generic toast.
- Integration: an optimistic `remove` followed by a server rejection rolls the row back into the list.

**Execution note:** Test the optimistic rollback and the org-keyed cache isolation first — they're the load-bearing guarantees.

**Verification:** hooks type-check; a sample component compiles against them; optimistic + rollback proven in unit tests.

### Phase 2 — Organizations (reference slices, then fan-out)

- [ ] **Unit 4: Switcher + my-orgs (session-changing reference slice)**

**Goal:** Migrate the org switcher and org list onto `listMyMemberships` + `useAuth().switchToOrganization()` + `onOrgChanged()`.

**Requirements:** R1, R4, R9, R12.

**Dependencies:** Unit 3.

**Files:**

- Modify: `src/app/_shell/modules/components/auth/organization/organization-switcher.tsx`, `organizations.tsx`, `organization-row.tsx`, `organization-view.tsx`, `organizations-empty.tsx`, `organizations-settings.tsx`
- Modify (presentational, just drop better-auth types): `organization-view-skeleton.tsx`
- Test: `src/app/_shell/modules/components/auth/organization/__tests__/switcher.test.tsx`

**Approach:**

- Org list/switcher data ← `useQuery(useOrgOpts().organization.listMyMemberships())`; active org/role ← `useRouteContext`.
- Switch action: `const res = await switchToOrganization(orgId); if (res?.error) { toast.error(...); return } await onOrgChanged()`.
- Drop `useListOrganizations`/`useSetActiveOrganization`/`useActiveOrganization`/`useSession`/`organizationPlugin`. `organization-view` loses its `useListOrganizationMembers` call (role/active comes from route context or the membership row).
- Dialog open-state → Jotai atom (create-org dialog is dormant; render but keep create wired to `$rpc` in Unit 7).

**Patterns to follow:** Unit 3 hooks; `useRouteContext({ from: '/_shell' })`.

**Test scenarios:**

- Happy path: switcher lists memberships by `organizationName`; selecting one calls `switchToOrganization(id)` then `onOrgChanged()`.
- Edge case: zero memberships → empty state (no crash); single membership → no switch affordance needed.
- Error path: `switchToOrganization` resolves `{ error }` → toast, no `onOrgChanged()`.
- Integration: after a successful switch, route context re-derives (active org/role updates) and org-scoped queries refetch.

**Verification:** switching orgs updates the UI and refetches members/invitations; no `@better-auth-ui` imports remain in these files.

- [ ] **Unit 5: Members + invite/remove/role (optimistic reference slice)**

**Goal:** Migrate the members table and its mutations onto the optimistic option layer + `useCreateForm`.

**Requirements:** R1, R4, R5, R6, R7, R8.

**Dependencies:** Unit 3.

**Files:**

- Modify: `organization-members.tsx`, `organization-member-row.tsx`, `invite-member-dialog.tsx`, `remove-member-dialog.tsx`, `organization-member-row-skeleton.tsx`, `organization-people.tsx`
- Test: `__tests__/members.test.tsx`, `__tests__/invite-dialog.test.tsx`

**Approach:**

- Members list ← `useQuery(useOrgOpts().members.list())`; rows render enriched `MemberRow` (email/name/roleName).
- Role change/remove ← `useMutation(useOrgOpts().members.updateRole()/remove())` (optimistic).
- Invite dialog ← `useCreateForm` with `zodResolver(inviteMemberInput)`; submit → `useMutation(useOrgOpts().invitations.send())`; errors → `mapOrpcError(e, form)` (duplicate → `CONFLICT` → email field error).
- UI gating: show invite/remove/role controls only when `role === 'admin'` (from route context). Server enforces via `admin` middleware regardless.
- Replace `useState` filter/sort flags as-is (local UI state) but dialog open-state → Jotai.

**Patterns to follow:** Unit 3; `src/components/ui/form.tsx` compound API; `sonner` toasts.

**Test scenarios:**

- Happy path: role dropdown change optimistically updates the row before the server responds; invite adds an optimistic invitation.
- Edge case: a `member` (non-admin) does not see invite/remove/role controls.
- Error path: invite with an email already a member → server `CONFLICT` → `form.setError('email', …)`, optimistic add rolled back.
- Error path: remove fails → row reappears (rollback).
- Integration: removing a member invalidates the org-scoped members key and refetches.

**Execution note:** Start with a failing test for optimistic role-change + rollback.

**Verification:** members CRUD works optimistically with correct rollback; invite form validation matches the contract; no better-auth imports remain.

- [ ] **Unit 6: Organization invitations**

**Goal:** Migrate the org-invitations table (list/revoke/resend) onto the optimistic layer.

**Requirements:** R1, R5, R6, R8.

**Dependencies:** Unit 3 (and shares the invite mutation from Unit 5).

**Files:**

- Modify: `organization-invitations.tsx`, `organization-invitation-row.tsx`, `organization-invitation-row-skeleton.tsx`, `organization-invitations-empty.tsx`
- Test: `__tests__/invitations.test.tsx`

**Approach:**

- List ← `useQuery(useOrgOpts().invitations.list())`; render by `Invitation.state` (pending/accepted/expired/revoked).
- Revoke/resend ← optimistic mutations (revoke filters/marks the row; resend is a fire-and-toast, no list shape change).
- Admin-gate the revoke/resend controls via route context.

**Patterns to follow:** Unit 5 (mirror the members optimistic shape).

**Test scenarios:**

- Happy path: pending invitations list; revoke optimistically removes/marks the row.
- Edge case: only `pending` invitations show revoke/resend; `accepted`/`expired` do not.
- Error path: revoke fails → row restored.
- Integration: revoke invalidates the org-scoped invitations key.

**Verification:** invitations list + revoke/resend work; `state`-based rendering correct.

- [ ] **Unit 7: Org profile/settings + danger zone (dormant create/leave/delete)**

**Goal:** Migrate org profile (name update), settings layout, and danger-zone shells; wire create/leave/delete to `$rpc`/`useAuth` but leave them unsurfaced.

**Requirements:** R1, R7, R10, R11, R12.

**Dependencies:** Units 3–4.

**Files:**

- Modify: `organization-profile.tsx`, `organization-settings.tsx`, `organization-danger-zone.tsx`, `organization.tsx` (shell/tabs), `create-organization-dialog.tsx`, `delete-organization.tsx`, `delete-organization-dialog.tsx`, `leave-organization.tsx`, `leave-organization-dialog.tsx`, `delete-organization-skeleton.tsx`
- Delete: `change-organization-logo.tsx`, `organization-logo.tsx` (logo path), `slug-field.tsx`
- Test: `__tests__/org-profile.test.tsx`

**Approach:**

- Profile name ← `useCreateForm(zodResolver(updateOrgInput))` → `useMutation(useOrgOpts().organization.update())` (optimistic on the active-org query).
- Remove logo/slug UI entirely (decision 1). `organization-profile` keeps name only.
- create/leave/delete dialogs: keep the components, wire submit handlers to `$rpc.workOs.organization.create/delete` and `useAuth().switchToOrganization`/`signOut` per decision 12 — but do **not** mount their entry points in nav (dormant). `delete`/`leave` of the active org → `onOrgChanged()`; on no remaining membership → `signOut()`.
- Drop `useHasPermission` → gate via route-context `role`/`permissions`.

**Patterns to follow:** Units 3, 5; decision 12 landing logic.

**Test scenarios:**

- Happy path: editing the org name persists via `update` and optimistically reflects.
- Edge case: non-admin cannot see profile edit / danger zone (route-context gate).
- Error path: name update failure rolls back + toasts.
- Integration (dormant): delete-active-org handler path computes next membership from `listMyMemberships` and calls `switchToOrganization`, else `signOut` — covered by a unit test of the handler even though UI is unsurfaced.

**Verification:** profile edit works; logo/slug fully removed; create/leave/delete compile and are `$rpc`-wired but not navigable.

- [ ] **Unit 8: User-invitations + org cleanup + dependency removal**

**Goal:** Migrate the user-facing "invitations to join" cards, finish removing better-auth from the org tree, and drop dead deps.

**Requirements:** R1, R11.

**Dependencies:** Units 4–7.

**Files:**

- Modify: `user-invitations.tsx`, `user-invitation-row.tsx`, `user-invitation-row-skeleton.tsx`, `user-invitations-empty.tsx`
- Modify/clean: any remaining org component importing `@better-auth-ui/*` or `@/lib/auth/organization-plugin`
- Modify: `package.json` (remove `@better-auth-ui/*`, `better-auth` if unused elsewhere)
- Test: `__tests__/user-invitations.test.tsx`

**Approach:**

- User invitations (accept/reject) map to WorkOS invitation acceptance flow — confirm whether accept is a `$rpc` (`userManagement` accept) or an AuthKit-hosted action at execution time; render by `Invitation.state`.
- Grep the org tree for residual better-auth imports and the missing `organization-plugin`; remove all.
- Remove dead packages once no importers remain (verify with a repo-wide grep).

**Patterns to follow:** Units 5–6.

**Test scenarios:**

- Happy path: pending user invitations render; accept/reject calls the chosen flow.
- Edge case: no invitations → empty state.
- Integration: after accept, `onOrgChanged()` so the new membership appears.

**Verification:** zero `@better-auth-ui` / `organization-plugin` references remain under `auth/organization/**`; `node_modules/.bin/tsc --noEmit` shows no net-new errors in touched files.

### Phase 3 — Settings (separate approach)

- [ ] **Unit 9: Account/profile settings via `$rpc` + Widgets adoption for security flows**

**Goal:** Migrate `auth/settings/**` off better-auth: profile/name via `userManagement.updateUser` `$rpc`; adopt WorkOS Widgets for security-sensitive flows.

**Requirements:** R1, decision 14.

**Dependencies:** Unit 3 (option/error patterns).

**Files:**

- Modify: `settings/settings.tsx`, `settings/account/account-settings.tsx`, `settings/account/user-profile.tsx`, `settings/account/change-avatar.tsx`, `settings/account/change-email.tsx`
- Modify (adopt Widgets / defer): `settings/security/*` (`change-password`, `active-sessions`, `linked-accounts`)
- Modify: `auth/user/*` (`user-button`, `user-view`, `user-avatar` already use WorkOS `useAuth` — just drop any residual better-auth types)
- Modify: `additional-field.tsx`
- Test: `settings/__tests__/account-settings.test.tsx`

**Approach:**

- Profile/name/account fields → small `userManagement.updateUser` `$rpc` procedures + `useCreateForm`, same patterns as Phase 2.
- **Security-sensitive flows (password, sessions, linked accounts, MFA, email change) → WorkOS Widgets** (as `user-profile.tsx` already does) rather than custom `$rpc` — do not hand-roll auth security. Where a Widget covers it, replace the template component with the Widget; where it doesn't, mark as deferred.
- This unit is intentionally lighter — the deep custom security build is out of scope (see Deferred to Separate Tasks).

**Patterns to follow:** `auth/user/user-profile.tsx` (existing Widgets usage), Phase 2 form/mutation patterns.

**Test scenarios:**

- Happy path: profile name/field update persists via `updateUser`.
- Edge case: a `change-password`/`sessions` surface renders the Widget (or a clearly-marked "coming soon") rather than a broken better-auth form.
- Error path: profile update failure → `mapOrpcError`.

**Verification:** account settings work via `$rpc`; security flows render WorkOS Widgets or are explicitly deferred; no better-auth imports remain under `auth/settings/**`.

## System-Wide Impact

- **Interaction graph:** `useAuth().switchToOrganization` and any leave/delete-active-org path must call `onOrgChanged()` (router invalidate + query invalidate). Missing that call leaves a stale route-context snapshot + cross-org cache. The root `beforeLoad` (`__root.tsx`) re-derivation is the linchpin.
- **Error propagation:** server handlers throw typed contract errors (`NO_ADMIN_ROLE`, `NO_ACTIVE_ORGANIZATION`, `CONFLICT`, …); the client surfaces them through `mapOrpcError`. Untyped failures fall back to a generic toast.
- **State lifecycle risks:** optimistic writes must `cancelQueries` first and roll back from snapshot on error; org-keyed cache prevents cross-org bleed after a switch. Invite/remove that race a refetch are covered by the cancel + `onSettled` invalidate.
- **API surface parity:** the OpenAPI handler (`src/server/rpc/index.ts`) auto-exposes every new procedure at `/api/rpc` docs — review the stale "Clerk/Sunday" doc strings while there.
- **Integration coverage:** the members-list enrichment (`getUser` + role cross-ref) is only proven by a handler test against stubbed WorkOS responses; mocks of the option hooks won't prove it.
- **Unchanged invariants:** `init.ts` middleware (`auth`/`admin`/`org`), `createRpcContext`, the isomorphic `client.ts` bundle-separation, and the Convex data path (separate `useConvexQuery` hooks) are **not** changed — WorkOS data flows through `$rpc`, Convex through its own hooks; do not cross them.

## Risks & Dependencies

| Risk                                                                                                    | Mitigation                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Management API ignores caller role → a missing/incorrect middleware gate is a real privilege escalation | Every mutation built from `admin.*`, every read from `org.*`; handler test asserts non-admin → `NO_ADMIN_ROLE`; `organizationId` only ever from `context` |
| Members-list `getUser` fan-out latency / rate limits on large orgs                                      | Start with first-page `Promise.all` (limit 100); defer pagination/caching to execution; `staleTime` on roles                                              |
| Stale route context after org switch (forgotten `onOrgChanged`)                                         | Centralize in `useOnOrgChanged()`; switch flows call it; integration test asserts refetch after switch                                                    |
| Optimistic cross-org cache bleed                                                                        | orgId folded into the query key (R8); test asserts org A/B cache isolation                                                                                |
| `switchToOrganization`/`refreshAuth` return `{error}` instead of throwing                               | Always check `res?.error` before `onOrgChanged()`; never `await`-throw-assume                                                                             |
| Settings security flows mis-scoped as custom `$rpc` (hand-rolled auth security)                         | Adopt WorkOS Widgets for password/sessions/MFA; custom build deferred to its own plan                                                                     |
| `npx tsc` false-green hides regressions                                                                 | Verify with `node_modules/.bin/tsc --noEmit`; bar = zero net-new in touched files                                                                         |
| Removing `@better-auth-ui`/`better-auth` breaks an unexpected importer outside auth/\*\*                | Repo-wide grep before dropping deps (Unit 8)                                                                                                              |

## Documentation / Operational Notes

- Fix stale OpenAPI doc strings ("Clerk-backed Sunday") in `src/server/rpc/index.ts` while touching it.
- Seed `docs/solutions/` (currently absent) with: WorkOS+AuthKit+TanStack Start session/org-switch reconciliation, the oRPC contract-first option-layer pattern, optimistic org-keyed cache design — first durable entries for these domains (follow-up).
- No env/secrets changes (WorkOS keys already configured in `src/lib/work-os.ts`).
- Verification commands: `node_modules/.bin/tsc --noEmit` (touched files clean), `bunx vitest run <paths>`, `bunx biome check --write <files>`.

## Sources & References

- Research: repo architecture map (oRPC contract/init/router/client, `__root`/`_shell` auth context, `form.tsx`, providers, Jotai dialog pattern, conventions).
- Research: component inventory — ~52 files under `auth/{organization,settings,user}/**` with per-component better-auth API usage.
- Research: `@workos-inc/node@8.13.0` signatures (memberships/invitations/roles/orgs + gotchas), `@workos/authkit-tanstack-react-start@0.8.6` `useAuth`, `@orpc/tanstack-query@1.14.6` key shape, TanStack Query v5 optimistic pattern, `@hookform/resolvers@5.4.0` + zod v4.
- Related code: `src/server/rpc/**`, `src/lib/rpc/**`, `src/lib/work-os.ts`, `convex/auth.ts`, `src/app/__root.tsx`, `src/app/_shell.tsx`, `src/components/ui/form.tsx`, `src/app/_shell/_base/index.tsx`.
- Prior plans (tooling conventions): `docs/plans/2026-06-13-003-refactor-tanstack-orchestration-cleanup-plan.md`.

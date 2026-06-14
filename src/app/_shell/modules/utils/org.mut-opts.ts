import type {
	InvitationRow,
	MemberRow,
} from '@server/rpc/contracts/work-os.contract'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { $api } from '@/lib/rpc/client'
import { mapOrpcError } from './map-orpc-error'

/**
 * Optimistic mutation-option factories for the list-scoped org mutations.
 *
 * Each factory is a PURE function of `($rpc, qc, key)` returning a TanStack
 * Query v5 mutation-options object that spreads the procedure's
 * `mutationOptions()` and layers the canonical optimistic lifecycle:
 *
 *   onMutate  → cancelQueries → snapshot (getQueryData) → setQueryData(updater)
 *   onError   → rollback from `ctx.previous` + surface via `mapOrpcError`
 *   onSettled → invalidateQueries (refetch the authoritative list)
 *
 * The `key` is supplied by `useOrgOpts` from oRPC's native per-procedure
 * `queryKey()`, so writes/invalidations land on the same cache entry the query
 * reads from. The active org is server-derived (never in the key); cross-org
 * correctness comes from invalidate-on-switch, not org-scoped keys.
 * `resend` is non-optimistic (fire + toast) — it does not change list shape.
 */

type Api = typeof $api

/** Context returned from `onMutate`, carrying the pre-mutation snapshot. */
type RollbackContext<T> = { previous: T | undefined }

// --- Members --------------------------------------------------------------

export function membersUpdateRoleOpts(
	$rpc: Api,
	qc: QueryClient,
	key: QueryKey,
) {
	return {
		...$rpc.workOs.members.updateRole.mutationOptions(),
		onMutate: async (vars: { membershipId: string; roleSlug: string }) => {
			await qc.cancelQueries({ queryKey: key })
			const previous = qc.getQueryData<MemberRow[]>(key)
			qc.setQueryData<MemberRow[]>(key, (rows) =>
				rows?.map((row) =>
					row.membershipId === vars.membershipId
						? { ...row, roleSlug: vars.roleSlug }
						: row,
				),
			)
			return { previous } satisfies RollbackContext<MemberRow[]>
		},
		onError: (
			err: unknown,
			_vars: unknown,
			ctx: RollbackContext<MemberRow[]> | undefined,
		) => {
			if (ctx) qc.setQueryData(key, ctx.previous)
			mapOrpcError(err)
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	}
}

export function membersRemoveOpts($rpc: Api, qc: QueryClient, key: QueryKey) {
	return {
		...$rpc.workOs.members.remove.mutationOptions(),
		onMutate: async (vars: { membershipId: string }) => {
			await qc.cancelQueries({ queryKey: key })
			const previous = qc.getQueryData<MemberRow[]>(key)
			qc.setQueryData<MemberRow[]>(key, (rows) =>
				rows?.filter((row) => row.membershipId !== vars.membershipId),
			)
			return { previous } satisfies RollbackContext<MemberRow[]>
		},
		onError: (
			err: unknown,
			_vars: unknown,
			ctx: RollbackContext<MemberRow[]> | undefined,
		) => {
			if (ctx) qc.setQueryData(key, ctx.previous)
			mapOrpcError(err)
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	}
}

// --- Invitations ----------------------------------------------------------

/** A synthetic invitation row written optimistically until the server responds. */
function optimisticInvitation(vars: {
	email: string
	roleSlug: string
}): InvitationRow {
	return {
		id: `optimistic-${vars.email}`,
		email: vars.email,
		state: 'pending',
		expiresAt: new Date().toISOString(),
		roleSlug: vars.roleSlug,
	}
}

export function invitationsSendOpts($rpc: Api, qc: QueryClient, key: QueryKey) {
	return {
		...$rpc.workOs.invitations.send.mutationOptions(),
		onMutate: async (vars: { email: string; roleSlug: string }) => {
			await qc.cancelQueries({ queryKey: key })
			const previous = qc.getQueryData<InvitationRow[]>(key)
			qc.setQueryData<InvitationRow[]>(key, (rows) => [
				optimisticInvitation(vars),
				...(rows ?? []),
			])
			return { previous } satisfies RollbackContext<InvitationRow[]>
		},
		// Rollback ONLY — the invite dialog owns user-facing surfacing via
		// `mapOrpcError(e, form)` so a field-bound CONFLICT lands on the email
		// field, not a duplicate toast. (Other list mutations have no call-site
		// catch, so they surface here.)
		onError: (
			_err: unknown,
			_vars: unknown,
			ctx: RollbackContext<InvitationRow[]> | undefined,
		) => {
			if (ctx) qc.setQueryData(key, ctx.previous)
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	}
}

export function invitationsRevokeOpts(
	$rpc: Api,
	qc: QueryClient,
	key: QueryKey,
) {
	return {
		...$rpc.workOs.invitations.revoke.mutationOptions(),
		onMutate: async (vars: { invitationId: string }) => {
			await qc.cancelQueries({ queryKey: key })
			const previous = qc.getQueryData<InvitationRow[]>(key)
			qc.setQueryData<InvitationRow[]>(key, (rows) =>
				rows?.filter((row) => row.id !== vars.invitationId),
			)
			return { previous } satisfies RollbackContext<InvitationRow[]>
		},
		onError: (
			err: unknown,
			_vars: unknown,
			ctx: RollbackContext<InvitationRow[]> | undefined,
		) => {
			if (ctx) qc.setQueryData(key, ctx.previous)
			mapOrpcError(err)
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	}
}

export function invitationsResendOpts(
	$rpc: Api,
	qc: QueryClient,
	key: QueryKey,
) {
	// Non-optimistic: resend does not change the list shape. Fire, then refetch
	// to reflect any updated expiry; surface failures via toast.
	return {
		...$rpc.workOs.invitations.resend.mutationOptions(),
		onError: (err: unknown) => mapOrpcError(err),
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	}
}

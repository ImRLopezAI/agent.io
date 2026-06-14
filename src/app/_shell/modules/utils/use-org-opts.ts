import { useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import type { Organization } from '@workos-inc/node'
import { $api } from '@/lib/rpc/client'
import { mapOrpcError } from './map-orpc-error'
import {
	invitationsResendOpts,
	invitationsRevokeOpts,
	invitationsSendOpts,
	membersRemoveOpts,
	membersUpdateRoleOpts,
} from './org.mut-opts'

/**
 * The org-module option spine. `useOrgOpts()` reads the active `organizationId`
 * from the `/_shell` route context, closes over `useQueryClient`, and returns
 * grouped factories for every org query/mutation. Components consume it as:
 *
 *   const { members } = useOrgOpts()
 *   const list = useQuery(members.list())
 *   const updateRole = useMutation(members.updateRole())
 *
 * Org-awareness (decision 8): the active orgId is folded into the query KEY
 * only — a trailing path segment — never the network input. The same key is
 * used for `queryOptions`, optimistic `setQueryData`, and `invalidateQueries`,
 * so each org gets an isolated cache entry and a switch never bleeds stale rows.
 */
export function useOrgOpts() {
	const { auth } = useRouteContext({ from: '/_shell' })
	const organizationId = auth.organizationId
	const qc = useQueryClient()

	// oRPC key shape: [path: string[], { type }]. Folding `organizationId` as a
	// trailing path segment keeps oRPC prefix-match invalidation working.
	const membersKey = [
		['workOs', 'members', 'list', organizationId],
		{ type: 'query' },
	] as const
	const invitationsKey = [
		['workOs', 'invitations', 'list', organizationId],
		{ type: 'query' },
	] as const
	const rolesKey = [
		['workOs', 'roles', 'list', organizationId],
		{ type: 'query' },
	] as const
	const activeOrgKey = [
		['workOs', 'organization', 'getActive', organizationId],
		{ type: 'query' },
	] as const
	// listMyMemberships spans EVERY org the user belongs to — NOT org-scoped.
	const myMembershipsKey = [
		['workOs', 'organization', 'listMyMemberships'],
		{ type: 'query' },
	] as const

	return {
		members: {
			list: () =>
				$api.workOs.members.list.queryOptions({ queryKey: membersKey }),
			updateRole: () => membersUpdateRoleOpts($api, qc, membersKey),
			remove: () => membersRemoveOpts($api, qc, membersKey),
		},
		invitations: {
			list: () =>
				$api.workOs.invitations.list.queryOptions({ queryKey: invitationsKey }),
			send: () => invitationsSendOpts($api, qc, invitationsKey),
			revoke: () => invitationsRevokeOpts($api, qc, invitationsKey),
			resend: () => invitationsResendOpts($api, qc, invitationsKey),
		},
		roles: {
			list: () => $api.workOs.roles.list.queryOptions({ queryKey: rolesKey }),
		},
		organization: {
			getActive: () =>
				$api.workOs.organization.getActive.queryOptions({
					queryKey: activeOrgKey,
				}),
			listMyMemberships: () =>
				$api.workOs.organization.listMyMemberships.queryOptions({
					queryKey: myMembershipsKey,
				}),
			update: () => ({
				...$api.workOs.organization.update.mutationOptions(),
				onMutate: async (vars: { name: string }) => {
					await qc.cancelQueries({ queryKey: activeOrgKey })
					const previous = qc.getQueryData<Organization>(activeOrgKey)
					qc.setQueryData<Organization>(activeOrgKey, (org) =>
						org ? { ...org, name: vars.name } : org,
					)
					return { previous }
				},
				onError: (
					err: unknown,
					_vars: unknown,
					ctx: { previous: Organization | undefined } | undefined,
				) => {
					if (ctx) qc.setQueryData(activeOrgKey, ctx.previous)
					mapOrpcError(err)
				},
				onSettled: () => qc.invalidateQueries({ queryKey: activeOrgKey }),
			}),
		},
	}
}

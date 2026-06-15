import { useQueryClient } from '@tanstack/react-query'
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
 * The org-module option spine. `useOrgOpts()` closes over `useQueryClient` and
 * returns grouped factories for every org query/mutation. Components consume it:
 *
 *   const { members } = useOrgOpts()
 *   const list = useQuery(members.list())
 *   const updateRole = useMutation(members.updateRole())
 *
 * Org-awareness (decision 8): the active org is SERVER-derived (never in the
 * input), so the cache uses oRPC's NATIVE per-procedure keys — `queryOptions()`
 * needs no manual `queryKey`, and `queryKey()` yields the matching key for
 * `setQueryData`/`invalidateQueries`. Cross-org correctness comes from
 * `onOrgChanged()`'s `invalidateQueries()`, which refetches on every switch, so
 * no org id is folded into the key.
 */
export function useOrgOpts() {
	const qc = useQueryClient()

	const activeOrgKey = $api.workOs.organization.getActive.queryKey()

	return {
		members: {
			list: () => $api.workOs.members.list.queryOptions(),
			updateRole: () =>
				membersUpdateRoleOpts($api, qc, $api.workOs.members.list.queryKey()),
			remove: () =>
				membersRemoveOpts($api, qc, $api.workOs.members.list.queryKey()),
		},
		invitations: {
			list: () => $api.workOs.invitations.list.queryOptions(),
			send: () =>
				invitationsSendOpts($api, qc, $api.workOs.invitations.list.queryKey()),
			revoke: () =>
				invitationsRevokeOpts(
					$api,
					qc,
					$api.workOs.invitations.list.queryKey(),
				),
			resend: () =>
				invitationsResendOpts(
					$api,
					qc,
					$api.workOs.invitations.list.queryKey(),
				),
		},
		roles: {
			list: () => $api.workOs.roles.list.queryOptions(),
		},
		organization: {
			getActive: () => $api.workOs.organization.getActive.queryOptions(),
			listMyMemberships: () =>
				$api.workOs.organization.listMyMemberships.queryOptions(),
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

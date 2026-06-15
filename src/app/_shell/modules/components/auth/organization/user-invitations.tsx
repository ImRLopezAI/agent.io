'use client'

import { useQuery } from '@tanstack/react-query'

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { $api } from '@/lib/rpc/client'

import { UserInvitationRow } from './user-invitation-row'
import { UserInvitationRowSkeleton } from './user-invitation-row-skeleton'
import { UserInvitationsEmpty } from './user-invitations-empty'

export type UserInvitationsProps = {
	className?: string
}

/**
 * Invitations addressed to the signed-in user (to join organizations).
 *
 * Data comes from the user-scoped `invitations.listMine` procedure — no org key
 * needed. Pending invitations are actionable (Accept → the WorkOS hosted accept
 * flow); other states render as informational rows. Always renders the section
 * card; uses `UserInvitationsEmpty` when there are no invitations.
 */
export function UserInvitations({ className }: UserInvitationsProps) {
	const { data: invitations, isPending } = useQuery(
		$api.workOs.invitations.listMine.queryOptions({}),
	)

	return (
		<div className={className}>
			<div className='flex flex-col gap-3'>
				<h2 className='truncate font-semibold text-sm'>Invitations</h2>

				<Card className='p-0'>
					<CardContent className='p-0'>
						{isPending ? (
							<div className='p-4'>
								<UserInvitationRowSkeleton />
							</div>
						) : !invitations?.length ? (
							<UserInvitationsEmpty />
						) : (
							invitations.map((invitation, index) => (
								<div key={invitation.id}>
									{index > 0 && <Separator />}

									<div className='p-4'>
										<UserInvitationRow invitation={invitation} />
									</div>
								</div>
							))
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

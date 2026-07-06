'use client'

import type { MyInvitationRow } from '@server/rpc/contracts/work-os.contract'
import { cn } from 'cnfast'
import { Check, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export type UserInvitationRowProps = {
	invitation: MyInvitationRow
}

const stateBadgeClasses: Record<MyInvitationRow['state'], string> = {
	pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	expired: 'bg-muted text-muted-foreground',
	revoked: 'bg-destructive/10 text-destructive',
}

/**
 * Single invitation row for the current user.
 *
 * WorkOS has no membership name on the invitation and no decline/reject
 * management API — acceptance happens through the WorkOS hosted flow at
 * `invitation.acceptUrl`. The Accept action navigates there; a `pending`
 * invitation is the only actionable state.
 */
export function UserInvitationRow({ invitation }: UserInvitationRowProps) {
	const isPending = invitation.state === 'pending'

	return (
		<div className='flex items-center gap-3'>
			<div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
				<Clock className='size-4.5' />
			</div>

			<div className='flex flex-col'>
				<div className='flex items-center gap-1.5'>
					<span className='truncate font-medium text-sm leading-tight'>
						{invitation.organizationId ?? 'an organization'}
					</span>

					<Badge
						variant='secondary'
						className={cn(stateBadgeClasses[invitation.state])}
					>
						{invitation.state}
					</Badge>
				</div>

				<span className='truncate text-muted-foreground text-xs'>
					Expires{' '}
					{new Date(invitation.expiresAt).toLocaleString(undefined, {
						dateStyle: 'medium',
						timeStyle: 'short',
					})}
				</span>
			</div>

			<div className='ml-auto flex shrink-0 items-center gap-2'>
				<a
					href={invitation.acceptUrl}
					aria-disabled={!isPending}
					title={
						isPending
							? undefined
							: 'Acceptance happens through the WorkOS invitation link'
					}
					className={cn(
						buttonVariants({ variant: 'outline', size: 'sm' }),
						!isPending && 'pointer-events-none opacity-50',
					)}
				>
					<Check />
					Accept
				</a>
			</div>
		</div>
	)
}

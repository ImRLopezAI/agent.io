'use client'

import { Send } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type OrganizationInvitationsEmptyProps = {
	onInvitePress: () => void
}

/**
 * Empty state for `OrganizationInvitations`.
 */
export function OrganizationInvitationsEmpty({
	onInvitePress,
}: OrganizationInvitationsEmptyProps) {
	return (
		<div className='flex flex-col items-center gap-4 p-4 text-center'>
			<Send className='size-6 text-muted-foreground' />

			<div className='flex flex-col gap-2'>
				<p className='font-semibold text-foreground text-sm'>No invitations</p>

				<span className='text-muted-foreground text-sm'>
					Invite someone to join this organization.
				</span>
			</div>

			<Button size='sm' onClick={onInvitePress}>
				Invite member
			</Button>
		</div>
	)
}

'use client'

import { Send } from 'lucide-react'

/**
 * Empty state for `UserInvitations`.
 */
export function UserInvitationsEmpty() {
	return (
		<div className='flex flex-col items-center gap-4 p-4 text-center'>
			<div className='flex size-12 items-center justify-center rounded-full bg-muted'>
				<Send className='size-5' />
			</div>

			<div className='flex flex-col gap-2'>
				<p className='font-semibold text-foreground text-sm'>No invitations</p>

				<span className='text-muted-foreground text-sm'>
					You have no pending invitations to join an organization.
				</span>
			</div>
		</div>
	)
}

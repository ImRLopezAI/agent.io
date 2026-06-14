'use client'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { Button } from '@/components/ui/button'
import { LeaveOrganizationDialog } from './leave-organization-dialog'

/**
 * Danger-zone row to leave the active organization, available to any member.
 * The confirm dialog's open-state lives in the shared Jotai `org-dialogs` atom
 * (`leaveOpen`).
 *
 * DORMANT (decision 11): wired but not surfaced in nav.
 */
export function LeaveOrganization() {
	const [, dispatch] = useOrgDialogs()

	return (
		<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
			<div>
				<p className='font-medium text-sm leading-tight'>Leave organization</p>

				<p className='mt-0.5 text-muted-foreground text-xs'>
					Remove yourself from this organization. You will lose access to its
					data.
				</p>
			</div>

			<Button
				size='sm'
				variant='outline'
				className='text-destructive'
				onClick={() => dispatch({ type: 'open', dialog: 'leave' })}
			>
				Leave organization
			</Button>

			<LeaveOrganizationDialog />
		</div>
	)
}

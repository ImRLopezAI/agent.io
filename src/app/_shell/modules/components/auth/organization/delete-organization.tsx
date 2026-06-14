'use client'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { Button } from '@/components/ui/button'
import { DeleteOrganizationDialog } from './delete-organization-dialog'

/**
 * Danger-zone row to delete the active organization. Visibility is gated by the
 * parent `OrganizationDangerZone` on the built-in `admin` role (decision 3), so
 * this row no longer fetches a permission itself. The confirm dialog's
 * open-state lives in the shared Jotai `org-dialogs` atom (`deleteOpen`).
 *
 * DORMANT (decision 11): wired but not surfaced in nav.
 */
export function DeleteOrganization() {
	const [, dispatch] = useOrgDialogs()

	return (
		<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
			<div>
				<p className='font-medium text-sm leading-tight'>Delete organization</p>

				<p className='mt-0.5 text-muted-foreground text-xs'>
					Permanently delete this organization and all of its data. This cannot
					be undone.
				</p>
			</div>

			<Button
				size='sm'
				variant='outline'
				className='text-destructive'
				onClick={() => dispatch({ type: 'open', dialog: 'delete' })}
			>
				Delete organization
			</Button>

			<DeleteOrganizationDialog />
		</div>
	)
}

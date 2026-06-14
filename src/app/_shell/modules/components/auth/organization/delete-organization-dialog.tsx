'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import type { Organization } from '@workos-inc/node'
import { TriangleAlert } from 'lucide-react'
import { mapOrpcError } from '@/app/_shell/modules/utils/map-orpc-error'
import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { useOnOrgChanged } from '@/app/_shell/modules/utils/use-on-org-changed'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { $api } from '@/lib/rpc/client'
import { landAfterLeavingActiveOrg } from './org-landing'
import { OrganizationView } from './organization-view'

/**
 * Confirm dialog for deleting the ACTIVE organization (DORMANT — wired but not
 * surfaced). `remove` takes no input — the server deletes the active org from
 * the session. On success we reconcile and land the user per decision 12
 * (switch to the next membership, else sign out). Open-state is the shared Jotai
 * `org-dialogs` atom (`deleteOpen`).
 */
export function DeleteOrganizationDialog() {
	const auth = useAuth()
	const onOrgChanged = useOnOrgChanged()
	const { organization } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const { data } = useQuery(organization.getActive())
	const activeOrganization = data as Organization | undefined

	const { mutate: deleteOrg, isPending } = useMutation({
		...$api.workOs.organization.remove.mutationOptions(),
		onSuccess: async () => {
			dispatch({ type: 'close', dialog: 'delete' })
			await landAfterLeavingActiveOrg(
				auth,
				onOrgChanged,
				activeOrganization?.id,
			)
		},
		onError: (error) => mapOrpcError(error),
	})

	return (
		<AlertDialog
			open={dialogs.deleteOpen}
			onOpenChange={(open) =>
				dispatch({ type: open ? 'open' : 'close', dialog: 'delete' })
			}
		>
			<AlertDialogContent>
				<div className='flex flex-col gap-6'>
					<AlertDialogHeader>
						<AlertDialogMedia className='bg-destructive/10 text-destructive'>
							<TriangleAlert />
						</AlertDialogMedia>

						<AlertDialogTitle>Delete organization</AlertDialogTitle>

						<AlertDialogDescription>
							Permanently delete this organization and all of its data. This
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<Card>
						<CardContent>
							<OrganizationView
								hideRole
								organization={{ name: activeOrganization?.name }}
							/>
						</CardContent>
					</Card>

					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

						<Button
							variant='destructive'
							disabled={isPending}
							onClick={() => deleteOrg(undefined)}
						>
							{isPending && <Spinner />}
							Delete organization
						</Button>
					</AlertDialogFooter>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	)
}

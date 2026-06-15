'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import { LogOut } from 'lucide-react'

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
 * Confirm dialog for leaving the ACTIVE organization (DORMANT — wired but not
 * surfaced). `leave` takes no input — the server deletes the caller's own
 * membership in the active org. On success we reconcile and land the user per
 * decision 12 (switch to the next membership, else sign out). Open-state is the
 * shared Jotai `org-dialogs` atom (`leaveOpen`).
 */
export function LeaveOrganizationDialog() {
	const auth = useAuth()
	const onOrgChanged = useOnOrgChanged()
	const { organization } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const { data: activeOrganization } = useQuery(organization.getActive())

	const { mutate: leaveOrg, isPending } = useMutation({
		...$api.workOs.organization.leave.mutationOptions(),
		onSuccess: async () => {
			dispatch({ type: 'close', dialog: 'leave' })
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
			open={dialogs.leaveOpen}
			onOpenChange={(open) =>
				dispatch({ type: open ? 'open' : 'close', dialog: 'leave' })
			}
		>
			<AlertDialogContent>
				<div className='flex flex-col gap-6'>
					<AlertDialogHeader>
						<AlertDialogMedia className='bg-destructive/10 text-destructive'>
							<LogOut />
						</AlertDialogMedia>

						<AlertDialogTitle>Leave organization</AlertDialogTitle>

						<AlertDialogDescription>
							Remove yourself from this organization. You will lose access to
							its data.
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
							onClick={() => leaveOrg(undefined)}
						>
							{isPending && <Spinner />}
							Leave organization
						</Button>
					</AlertDialogFooter>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	)
}

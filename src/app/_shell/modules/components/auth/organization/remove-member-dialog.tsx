'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

import { UserView } from '../user/user-view'

/**
 * Confirm-and-remove dialog for a member. The target membership lives in the
 * shared Jotai `org-dialogs` atom (`removeMembershipId`), set by the member
 * row's remove button; the dialog reads the member out of the cached members
 * list to render its preview. Confirm fires the optimistic `members.remove`
 * mutation (the row is filtered out immediately, rolled back on failure); on
 * success it toasts and clears the target.
 */
export function RemoveMemberDialog() {
	const { members } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const close = () => dispatch({ type: 'remove-member', membershipId: null })

	const { data: membersData } = useQuery(members.list())
	const { mutate: removeMember, isPending } = useMutation({
		...members.remove(),
		onSuccess: () => {
			toast.success('Member removed')
			close()
		},
	})

	const member = membersData?.find(
		(m) => m.membershipId === dialogs.removeMembershipId,
	)

	return (
		<AlertDialog
			open={dialogs.removeMembershipId !== null}
			onOpenChange={(open) => {
				if (!open) close()
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia className='bg-destructive/10 text-destructive'>
						<Trash2 />
					</AlertDialogMedia>

					<AlertDialogTitle>Remove member</AlertDialogTitle>

					<AlertDialogDescription>
						This member will lose access to the organization. This action cannot
						be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				{member && (
					<Card>
						<CardContent className='flex flex-row items-center justify-between gap-2'>
							<UserView
								user={{
									object: 'user',
									id: member.userId,
									email: member.email,
									emailVerified: member.status === 'active',
									profilePictureUrl: member.avatarUrl,
									firstName: member.name,
									lastName: null,
									lastSignInAt: null,
									locale: null,
									createdAt: '',
									updatedAt: '',
									externalId: null,
									metadata: {},
								}}
							/>

							<Badge variant='outline'>
								{member.roleName ?? member.roleSlug}
							</Badge>
						</CardContent>
					</Card>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

					<Button
						variant='destructive'
						disabled={isPending || !member}
						onClick={() =>
							member && removeMember({ membershipId: member.membershipId })
						}
					>
						{isPending && <Spinner />}
						Remove member
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

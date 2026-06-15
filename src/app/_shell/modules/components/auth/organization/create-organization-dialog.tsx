'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { createOrgInput } from '@server/rpc/contracts/work-os.contract'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import { Briefcase } from 'lucide-react'
import { toast } from 'sonner'

import { mapOrpcError } from '@/app/_shell/modules/utils/map-orpc-error'
import { useOnOrgChanged } from '@/app/_shell/modules/utils/use-on-org-changed'
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
import { useCreateForm } from '@/components/ui/form'
import { $api } from '@/lib/rpc/client'

/** Props for the `CreateOrganizationDialog` component. */
export type CreateOrganizationDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * DORMANT (decision 11): built and `$rpc`-wired, but its entry points are not
 * mounted in nav. Name-only create form (slug removed in the WorkOS migration).
 *
 * Submit creates the org via the `organization.create` procedure, then runs the
 * session-changing flow: switch the active org to the new one and reconcile
 * (decision 10) so the new org becomes active immediately. Open-state is owned
 * by the parent (the shared Jotai `org-dialogs` atom) and passed in as props.
 */
export function CreateOrganizationDialog({
	open,
	onOpenChange,
}: CreateOrganizationDialogProps) {
	const { switchToOrganization } = useAuth()
	const onOrgChanged = useOnOrgChanged()
	const create = useMutation($api.workOs.organization.create.mutationOptions())

	const [Form] = useCreateForm(
		() => ({
			resolver: zodResolver(createOrgInput),
			defaultValues: { name: '' },
			onSubmit: async (values, f) => {
				try {
					const { id } = await create.mutateAsync(values)
					onOpenChange(false)
					const res = await switchToOrganization(id)
					if (res?.error) {
						toast.error(res.error)
						return
					}
					await onOrgChanged()
				} catch (e) {
					mapOrpcError(e, f)
				}
			},
		}),
		[create.mutateAsync, switchToOrganization, onOrgChanged, onOpenChange],
	)

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<Form>
					{() => (
						<div className='flex flex-col gap-6'>
							<AlertDialogHeader>
								<AlertDialogMedia>
									<Briefcase />
								</AlertDialogMedia>

								<AlertDialogTitle>Create organization</AlertDialogTitle>

								<AlertDialogDescription>
									Create a new organization. You will become its first member.
								</AlertDialogDescription>
							</AlertDialogHeader>

							<div className='flex flex-col gap-4'>
								<Form.Field
									name='name'
									render={({ field }) => (
										<Form.Item>
											<Form.Label>Name</Form.Label>

											<Form.Control
												render={
													<Form.Input
														autoFocus
														placeholder='Acme Inc.'
														{...field}
													/>
												}
											/>

											<Form.Message />
										</Form.Item>
									)}
								/>
							</div>

							<AlertDialogFooter>
								<AlertDialogCancel type='button'>Cancel</AlertDialogCancel>

								<Form.Submit>Create organization</Form.Submit>
							</AlertDialogFooter>
						</div>
					)}
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

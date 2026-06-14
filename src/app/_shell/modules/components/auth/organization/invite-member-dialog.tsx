'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { inviteMemberInput } from '@server/rpc/contracts/work-os.contract'
import { useMutation, useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import type { z } from 'zod'
import { mapOrpcError } from '@/app/_shell/modules/utils/map-orpc-error'
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
import { useCreateForm } from '@/components/ui/form'

/** Invite-form values — derived from the contract input schema (no drift). */
type InviteMemberInput = z.infer<typeof inviteMemberInput>

/**
 * Props for `InviteMemberDialog`.
 *
 * Open-state is owned by the shared Jotai `org-dialogs` atom, so the dialog
 * needs no props. The optional `open`/`onOpenChange` are an accepted-but-ignored
 * compatibility shim for the not-yet-migrated Unit 6 call site
 * (`organization-invitations.tsx`); remove them when that unit lands.
 */
export type InviteMemberDialogProps = {
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

/**
 * The canonical `useCreateForm` reference slice (Unit 5).
 *
 * Email + role-select invite form. The zod resolver reuses the contract's
 * `inviteMemberInput` schema verbatim (single source of truth, so client
 * validation can never drift from the server). Submit fires the optimistic
 * `invitations.send` mutation; a duplicate is surfaced as a server `CONFLICT`
 * which `mapOrpcError(e, form)` routes onto the `email` field. The dialog's
 * open-state lives in the shared Jotai `org-dialogs` atom (decision: no local
 * `useState` open flags).
 *
 * Unit 6/7 forms should mirror this shape: `useCreateForm(() => ({ resolver,
 * defaultValues, onSubmit }), [deps])` → render-prop `<Form>{() => (...)}</Form>`
 * with `Form.Field` render callbacks wiring the field into `Form.*` controls.
 */
export function InviteMemberDialog(_props: InviteMemberDialogProps = {}) {
	const { invitations, roles } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const { data: roleOptions } = useQuery(roles.list())
	const send = useMutation(invitations.send())

	const close = () => dispatch({ type: 'close', dialog: 'invite' })

	const [Form] = useCreateForm<InviteMemberInput>(
		() => ({
			resolver: zodResolver(inviteMemberInput),
			defaultValues: { email: '', roleSlug: 'member' },
			onSubmit: async (values, f) => {
				try {
					await send.mutateAsync(values)
					close()
				} catch (e) {
					mapOrpcError(e, f)
				}
			},
		}),
		[send.mutateAsync],
	)

	return (
		<AlertDialog
			open={dialogs.inviteOpen}
			onOpenChange={(open) =>
				dispatch({ type: open ? 'open' : 'close', dialog: 'invite' })
			}
		>
			<AlertDialogContent>
				<Form>
					{() => (
						<div className='flex flex-col gap-6'>
							<AlertDialogHeader>
								<AlertDialogMedia>
									<UserPlus />
								</AlertDialogMedia>

								<AlertDialogTitle>Invite member</AlertDialogTitle>

								<AlertDialogDescription>
									Send an invitation to join this organization. They will get an
									email with a link to accept.
								</AlertDialogDescription>
							</AlertDialogHeader>

							<div className='flex flex-col gap-4'>
								<Form.Field
									name='email'
									render={({ field }) => (
										<Form.Item>
											<Form.Label>Email</Form.Label>

											<Form.Control
												render={
													<Form.Input
														type='email'
														autoFocus
														placeholder='member@example.com'
														{...field}
													/>
												}
											/>

											<Form.Message />
										</Form.Item>
									)}
								/>

								<Form.Field
									name='roleSlug'
									render={({ field }) => (
										<Form.Item>
											<Form.Label>Role</Form.Label>

											<Form.Select
												value={field.value}
												onValueChange={field.onChange}
											>
												<Form.Select.Trigger className='w-full'>
													<Form.Select.Value />
												</Form.Select.Trigger>

												<Form.Select.Content>
													{roleOptions?.map((role) => (
														<Form.Select.Item key={role.id} value={role.slug}>
															{role.name}
														</Form.Select.Item>
													))}
												</Form.Select.Content>
											</Form.Select>

											<Form.Message />
										</Form.Item>
									)}
								/>
							</div>

							<AlertDialogFooter>
								<AlertDialogCancel type='button'>Cancel</AlertDialogCancel>

								<Form.Submit>Invite</Form.Submit>
							</AlertDialogFooter>
						</div>
					)}
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

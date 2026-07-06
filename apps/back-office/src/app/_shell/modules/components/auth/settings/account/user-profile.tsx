'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { updateProfileInput } from '@server/rpc/contracts/work-os.contract'
import { useMutation } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { cn } from 'cnfast'
import { toast } from 'sonner'
import type { z } from 'zod'

import { mapOrpcError } from '@/app/_shell/modules/utils/map-orpc-error'
import { Card, CardContent } from '@/components/ui/card'
import { useCreateForm } from '@/components/ui/form'
import { $api } from '@/lib/rpc/client'

import { UserAvatar } from '../../user/user-avatar'

/** Profile-form values — derived from the contract input schema (no drift). */
type UpdateProfileInput = z.infer<typeof updateProfileInput>

export type UserProfileProps = {
	className?: string
}

/**
 * Profile card for the current user: first/last name only.
 *
 * Migrated off the prior auth-UI template: the name is a small `$rpc`
 * (`workOs.user.updateProfile`) form that reuses the contract's
 * `updateProfileInput` schema as its zod resolver (single source of truth) and
 * submits through `useMutation`. The current name is read from the `/_shell`
 * route context (`auth.user`) — no fetch — and seeded via `values` so the form
 * re-syncs once the session resolves.
 *
 * The avatar is sourced from the user's identity provider (OAuth) and is not
 * settable through `userManagement.updateUser`, so it renders read-only with a
 * short note rather than an upload control.
 */
export function UserProfile({ className }: UserProfileProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const user = auth.user

	const update = useMutation($api.workOs.user.updateProfile.mutationOptions())

	const [Form] = useCreateForm<UpdateProfileInput>(
		() => ({
			resolver: zodResolver(updateProfileInput),
			// `values` (not `defaultValues`) so the form re-syncs once the session
			// user resolves (react-hook-form re-applies `values`).
			values: {
				firstName: user?.firstName ?? '',
				lastName: user?.lastName ?? '',
			},
			onSubmit: async (vars, f) => {
				try {
					await update.mutateAsync(vars)
					toast.success('Profile updated')
				} catch (e) {
					mapOrpcError(e, f)
				}
			},
		}),
		[user?.firstName, user?.lastName, update.mutateAsync],
	)

	return (
		<div>
			<h2 className={cn('mb-3 font-semibold text-sm')}>Profile</h2>

			<Card className={className}>
				<CardContent className='flex flex-col gap-6'>
					<div className='flex items-center gap-4'>
						<UserAvatar className='size-12' />

						<p className='text-muted-foreground text-xs'>
							Your avatar is managed by your identity provider.
						</p>
					</div>

					<Form>
						{() => (
							<div className='flex flex-col gap-4'>
								<Form.Field
									name='firstName'
									render={({ field }) => (
										<Form.Item>
											<Form.Label>First name</Form.Label>

											<Form.Control
												render={
													<Form.Input
														autoComplete='given-name'
														placeholder='Ada'
														{...field}
													/>
												}
											/>

											<Form.Message />
										</Form.Item>
									)}
								/>

								<Form.Field
									name='lastName'
									render={({ field }) => (
										<Form.Item>
											<Form.Label>Last name</Form.Label>

											<Form.Control
												render={
													<Form.Input
														autoComplete='family-name'
														placeholder='Lovelace'
														{...field}
													/>
												}
											/>

											<Form.Message />
										</Form.Item>
									)}
								/>

								<Form.Submit className='mt-1 w-fit' size='sm'>
									Save changes
								</Form.Submit>
							</div>
						)}
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

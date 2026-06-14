'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@lib/utils'
import { updateOrgInput } from '@server/rpc/contracts/work-os.contract'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import type { z } from 'zod'
import { mapOrpcError } from '@/app/_shell/modules/utils/map-orpc-error'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Card, CardContent } from '@/components/ui/card'
import { useCreateForm } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'

/** Profile-form values — derived from the contract input schema (no drift). */
type UpdateOrgInput = z.infer<typeof updateOrgInput>

export type OrganizationProfileProps = {
	className?: string
}

/**
 * Profile card for the active organization: name only.
 *
 * Logo and slug were removed in the WorkOS migration (no backing fields). The
 * name form reuses the contract's `updateOrgInput` schema as its zod resolver
 * (single source of truth) and submits the optimistic `organization.update`
 * mutation from `useOrgOpts` — the active-org query reflects the new name
 * immediately and rolls back on failure. The active org name is read from the
 * `organization.getActive` query.
 *
 * Editing the org name is an org-management mutation, so the whole card is gated
 * on the built-in `admin` role (decision 3) read from the `/_shell` route
 * context — non-admins see nothing here. The server enforces the same regardless.
 */
export function OrganizationProfile({ className }: OrganizationProfileProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { organization } = useOrgOpts()

	// `organization.getActive` now output-parses against `organizationSchema`, so
	// `data` is typed `OrganizationDto | undefined` — no cast needed.
	const { data: activeOrganization } = useQuery(organization.getActive())
	const update = useMutation(organization.update())

	const [Form] = useCreateForm<UpdateOrgInput>(
		() => ({
			resolver: zodResolver(updateOrgInput),
			// `values` (not `defaultValues`) so the form re-syncs once the active
			// org name resolves from the query (react-hook-form re-applies `values`).
			values: { name: activeOrganization?.name ?? '' },
			onSubmit: async (values, f) => {
				try {
					await update.mutateAsync(values)
				} catch (e) {
					mapOrpcError(e, f)
				}
			},
		}),
		[activeOrganization?.name, update.mutateAsync],
	)

	if (auth.role !== 'admin') return null

	return (
		<div>
			<h2 className={cn('mb-3 font-semibold text-sm')}>Organization profile</h2>

			<Card className={className}>
				<CardContent>
					{activeOrganization ? (
						<Form>
							{() => (
								<div className='flex flex-col gap-4'>
									<Form.Field
										name='name'
										render={({ field }) => (
											<Form.Item>
												<Form.Label>Name</Form.Label>

												<Form.Control
													render={
														<Form.Input
															autoComplete='organization'
															placeholder='Acme Inc.'
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
					) : (
						<div className='flex flex-col gap-4'>
							<div className='flex flex-col gap-2'>
								<Skeleton className='h-4 w-16 rounded-md' />
								<Skeleton className='h-8 w-full rounded-md' />
							</div>

							<Skeleton className='mt-1 h-8 w-28 rounded-md' />
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

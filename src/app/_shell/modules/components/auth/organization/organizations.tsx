'use client'

import { useQuery } from '@tanstack/react-query'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CreateOrganizationDialog } from './create-organization-dialog'
import { OrganizationRow } from './organization-row'
import { OrganizationViewSkeleton } from './organization-view-skeleton'
import { OrganizationsEmpty } from './organizations-empty'

export type OrganizationsProps = {
	className?: string
}

/**
 * Lists every organization the user belongs to (via
 * `listMyMemberships`): loading skeleton, empty state with create, or a card of
 * rows with a Manage/switch control per organization. The create-org dialog is
 * dormant (built + wired in a later unit) but kept rendered; its open-state
 * lives in the shared Jotai `org-dialogs` atom.
 */
export function Organizations({ className }: OrganizationsProps) {
	const { organization } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const { data: memberships, isPending } = useQuery(
		organization.listMyMemberships(),
	)

	const openCreate = () => dispatch({ type: 'open', dialog: 'create' })

	return (
		<>
			<div className={className}>
				<div className='flex flex-col gap-3'>
					<div className='flex items-end justify-between gap-3'>
						<h2 className='truncate font-semibold text-sm'>Organizations</h2>

						<Button
							className='shrink-0'
							size='sm'
							disabled={isPending}
							onClick={openCreate}
						>
							Create organization
						</Button>
					</div>

					<Card className='p-0'>
						<CardContent className='p-0'>
							{isPending ? (
								<div className='p-4'>
									<OrganizationViewSkeleton />
								</div>
							) : !memberships?.length ? (
								<OrganizationsEmpty onCreatePress={openCreate} />
							) : (
								memberships.map((membership, index) => (
									<div key={membership.organizationId}>
										{index > 0 && <Separator />}

										<div className='p-4'>
											<OrganizationRow membership={membership} />
										</div>
									</div>
								))
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<CreateOrganizationDialog
				open={dialogs.createOpen}
				onOpenChange={(open) =>
					dispatch({ type: open ? 'open' : 'close', dialog: 'create' })
				}
			/>
		</>
	)
}

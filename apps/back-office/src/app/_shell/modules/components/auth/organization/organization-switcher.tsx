'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import { cn } from 'cnfast'
import { ChevronsUpDown, PlusCircle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { useOnOrgChanged } from '@/app/_shell/modules/utils/use-on-org-changed'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { UserView } from '../user/user-view'
import { CreateOrganizationDialog } from './create-organization-dialog'
import { OrganizationView } from './organization-view'

/** Props for the `OrganizationSwitcher` component. */
export type OrganizationSwitcherProps = {
	className?: string
	align?: 'center' | 'end' | 'start'
	side?: 'top' | 'right' | 'bottom' | 'left'
	sideOffset?: number
	trigger?: ReactNode
	hideCreate?: boolean
	hidePersonal?: boolean
}

/**
 * Renders an organizations dropdown with a trigger button, header summary, and a
 * menu of organizations to switch to. Data comes from `listMyMemberships`; the
 * active org/role from the `/_shell` route context. Selecting an org runs the
 * session-changing reconciliation flow: `switchToOrganization` →
 * `onOrgChanged()` (router invalidate + query invalidate).
 */
export function OrganizationSwitcher({
	className,
	align,
	side,
	sideOffset,
	hideCreate,
	hidePersonal,
	trigger,
}: OrganizationSwitcherProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { switchToOrganization } = useAuth()
	const onOrgChanged = useOnOrgChanged()
	const { organization } = useOrgOpts()
	const [dialogs, dispatch] = useOrgDialogs()

	const { data: memberships, isPending } = useQuery(
		organization.listMyMemberships(),
	)

	const [dropdownOpen, setDropdownOpen] = useState(false)

	const activeMembership = memberships?.find(
		(membership) => membership.organizationId === auth.organizationId,
	)
	const otherMemberships =
		memberships?.filter(
			(membership) => membership.organizationId !== auth.organizationId,
		) ?? []

	const hasOtherEntries =
		otherMemberships.length > 0 || (!!activeMembership && !hidePersonal)

	async function switchOrg(organizationId: string) {
		setDropdownOpen(false)

		const res = await switchToOrganization(organizationId)
		if (res?.error) {
			toast.error(res.error)
			return
		}
		await onOrgChanged()
	}

	return (
		<>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				{trigger ? (
					<DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
				) : (
					<DropdownMenuTrigger
						render={
							<Button
								variant='ghost'
								className={cn('h-auto px-2 py-2 text-left', className)}
								disabled={!auth.user || isPending}
							/>
						}
					>
						{isPending ? (
							<OrganizationView isPending hideRole />
						) : activeMembership ? (
							<OrganizationView
								hideRole
								organization={{ name: activeMembership.organizationName }}
							/>
						) : auth.user && !hidePersonal ? (
							<UserView hideSubtitle />
						) : (
							<OrganizationView hideRole organization={{ name: 'Personal' }} />
						)}
						<ChevronsUpDown className='size-4 shrink-0 text-muted-foreground' />
					</DropdownMenuTrigger>
				)}

				<DropdownMenuContent
					align={align}
					side={side}
					sideOffset={sideOffset}
					className='min-w-64 max-w-svw'
				>
					{activeMembership ? (
						<div className='flex items-center justify-between gap-4 px-2 py-2'>
							<OrganizationView
								hideRole
								organization={{ name: activeMembership.organizationName }}
							/>
						</div>
					) : !isPending && auth.user && !hidePersonal ? (
						<div className='flex items-center justify-between gap-4 px-2 py-2'>
							<UserView hideSubtitle />
						</div>
					) : null}

					<DropdownMenuSeparator />

					{otherMemberships.map((membership) => (
						<DropdownMenuItem
							key={membership.organizationId}
							onSelect={() => switchOrg(membership.organizationId)}
						>
							<OrganizationView
								hideRole
								organization={{ name: membership.organizationName }}
							/>
						</DropdownMenuItem>
					))}

					{!hideCreate && (
						<>
							{hasOtherEntries && <DropdownMenuSeparator />}

							<DropdownMenuItem
								onSelect={() => {
									setDropdownOpen(false)
									dispatch({ type: 'open', dialog: 'create' })
								}}
							>
								<PlusCircle className='text-muted-foreground' />
								Create organization
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateOrganizationDialog
				open={dialogs.createOpen}
				onOpenChange={(open) =>
					dispatch({ type: open ? 'open' : 'close', dialog: 'create' })
				}
			/>
		</>
	)
}

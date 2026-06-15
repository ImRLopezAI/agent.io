'use client'

import { cn } from '@lib/utils'
import type { InvitationRow } from '@server/rpc/contracts/work-os.contract'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { ChevronUp, Filter, Search, X } from 'lucide-react'
import { type ComponentProps, type ReactNode, useMemo, useState } from 'react'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from '@/components/ui/input-group'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'

import { InviteMemberDialog } from './invite-member-dialog'
import { OrganizationInvitationRow } from './organization-invitation-row'
import { OrganizationInvitationRowSkeleton } from './organization-invitation-row-skeleton'
import { OrganizationInvitationsEmpty } from './organization-invitations-empty'

type SortDirection = 'ascending' | 'descending'

type SortDescriptor = {
	column: string
	direction: SortDirection
}

const INVITATION_STATES: InvitationRow['state'][] = [
	'pending',
	'accepted',
	'expired',
	'revoked',
]

/** Props for the `OrganizationInvitations` component. */
export type OrganizationInvitationsProps = {
	className?: string
}

/**
 * Organization invitations table with invite control and per-row actions.
 *
 * Rows are the `InvitationRow` from `invitations.list()`. Search, role filter,
 * status filter, and sort are purely local UI state (`useState`) over the
 * fetched list; only the invite dialog's open-state is shared (Jotai
 * `org-dialogs`). The Invite button is admin-only — gated on the session `role`
 * from route context — and the server enforces the same via the `admin`
 * middleware.
 */
export function OrganizationInvitations({
	className,
	...props
}: OrganizationInvitationsProps & ComponentProps<'div'>) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { invitations, roles } = useOrgOpts()
	const [, dispatch] = useOrgDialogs()

	const { data: invitationsData, isPending } = useQuery(invitations.list())
	const { data: roleOptions } = useQuery(roles.list())

	const isAdmin = auth.role === 'admin'

	const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>()
	const [roleFilter, setRoleFilter] = useState('all')
	const [statusFilter, setStatusFilter] = useState('all')
	const [search, setSearch] = useState('')

	const roleLabels = useMemo(() => {
		const map = new Map<string, string>()
		for (const role of roleOptions ?? []) map.set(role.slug, role.name)
		return map
	}, [roleOptions])

	const filteredInvitations = useMemo(() => {
		const term = search.toLowerCase()
		return invitationsData?.filter(
			(invitation) =>
				(roleFilter === 'all' || invitation.roleSlug === roleFilter) &&
				(statusFilter === 'all' || invitation.state === statusFilter) &&
				invitation.email.toLowerCase().includes(term),
		)
	}, [search, invitationsData, roleFilter, statusFilter])

	const sortedInvitations = useMemo(() => {
		if (!sortDescriptor || !filteredInvitations) return filteredInvitations

		return [...filteredInvitations].sort((a, b) => {
			let cmp = 0

			if (sortDescriptor.column === 'expiresAt') {
				cmp = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
			} else {
				const col = sortDescriptor.column as keyof InvitationRow
				cmp = String(a[col] ?? '').localeCompare(String(b[col] ?? ''))
			}

			if (sortDescriptor.direction === 'descending') cmp *= -1
			return cmp
		})
	}, [sortDescriptor, filteredInvitations])

	function toggleSort(column: string) {
		setSortDescriptor((current) => {
			if (current?.column !== column) {
				return { column, direction: 'ascending' }
			}
			if (current.direction === 'ascending') {
				return { column, direction: 'descending' }
			}
			return undefined
		})
	}

	return (
		<div className={cn('flex flex-col gap-3', className)} {...props}>
			<div className='flex items-end justify-between gap-3'>
				<h3 className='truncate font-semibold text-sm'>Invitations</h3>

				{isAdmin && (
					<Button
						className='shrink-0'
						size='sm'
						disabled={isPending}
						onClick={() => dispatch({ type: 'open', dialog: 'invite' })}
					>
						Invite member
					</Button>
				)}
			</div>

			<div className='flex flex-col gap-4'>
				<div className='flex items-center gap-3'>
					<InputGroup className='min-w-0 sm:w-[220px]'>
						<InputGroupInput
							type='search'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label='Search'
							placeholder='Search'
							disabled={isPending}
						/>

						<InputGroupAddon>
							<Search className='text-muted-foreground' />
						</InputGroupAddon>
					</InputGroup>

					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button size='sm' variant='outline' disabled={isPending} />
							}
						>
							<Filter />
							Role
						</DropdownMenuTrigger>

						<DropdownMenuContent align='start'>
							<DropdownMenuRadioGroup
								value={roleFilter}
								onValueChange={setRoleFilter}
							>
								<DropdownMenuRadioItem value='all'>All</DropdownMenuRadioItem>

								{roleOptions?.map((role) => (
									<DropdownMenuRadioItem key={role.id} value={role.slug}>
										{role.name}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button size='sm' variant='outline' disabled={isPending} />
							}
						>
							<Filter />
							Status
						</DropdownMenuTrigger>

						<DropdownMenuContent align='start'>
							<DropdownMenuRadioGroup
								value={statusFilter}
								onValueChange={setStatusFilter}
							>
								<DropdownMenuRadioItem value='all'>All</DropdownMenuRadioItem>

								{INVITATION_STATES.map((state) => (
									<DropdownMenuRadioItem key={state} value={state}>
										<span className='capitalize'>{state}</span>
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{(roleFilter !== 'all' || statusFilter !== 'all') && (
					<div className='flex flex-wrap gap-2'>
						{roleFilter !== 'all' && (
							<Badge variant='secondary' className='gap-1'>
								Role:{' '}
								<span className='capitalize'>
									{roleLabels.get(roleFilter) ?? roleFilter}
								</span>
								<button
									type='button'
									aria-label='Clear'
									className='inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground'
									onClick={() => setRoleFilter('all')}
								>
									<X className='size-3' />
								</button>
							</Badge>
						)}

						{statusFilter !== 'all' && (
							<Badge variant='secondary' className='gap-1'>
								Status: <span className='capitalize'>{statusFilter}</span>
								<button
									type='button'
									aria-label='Clear'
									className='inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground'
									onClick={() => setStatusFilter('all')}
								>
									<X className='size-3' />
								</button>
							</Badge>
						)}
					</div>
				)}

				<Card className='p-0'>
					<Table aria-label='Invitations'>
						<TableHeader>
							<TableRow>
								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'email'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('email')}
								>
									Email
								</SortableTableHead>

								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'expiresAt'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('expiresAt')}
								>
									Expires
								</SortableTableHead>

								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'roleSlug'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('roleSlug')}
								>
									Role
								</SortableTableHead>

								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'state'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('state')}
								>
									Status
								</SortableTableHead>

								<TableHead className='text-end'>Actions</TableHead>
							</TableRow>
						</TableHeader>

						<TableBody>
							{isPending ? (
								<OrganizationInvitationRowSkeleton />
							) : !sortedInvitations?.length ? (
								<TableRow>
									<TableCell colSpan={5}>
										<OrganizationInvitationsEmpty
											onInvitePress={() =>
												dispatch({ type: 'open', dialog: 'invite' })
											}
										/>
									</TableCell>
								</TableRow>
							) : (
								sortedInvitations.map((invitation) => (
									<OrganizationInvitationRow
										key={invitation.id}
										invitation={invitation}
									/>
								))
							)}
						</TableBody>
					</Table>
				</Card>
			</div>

			<InviteMemberDialog />
		</div>
	)
}

function SortableTableHead({
	children,
	sortDirection,
	onClick,
}: {
	children: ReactNode
	sortDirection?: SortDirection
	onClick: () => void
}) {
	return (
		<TableHead aria-sort={sortDirection ?? 'none'}>
			<button
				type='button'
				onClick={onClick}
				className='flex w-full items-center gap-2 text-left font-medium'
			>
				{children}

				{!!sortDirection && (
					<ChevronUp
						className={cn(
							'size-3 transition-transform duration-100 ease-out',
							sortDirection === 'descending' ? 'rotate-180' : '',
						)}
					/>
				)}
			</button>
		</TableHead>
	)
}

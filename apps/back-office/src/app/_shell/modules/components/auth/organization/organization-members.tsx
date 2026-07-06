'use client'

import type { MemberRow } from '@server/rpc/contracts/work-os.contract'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { cn } from 'cnfast'
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
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'

import { InviteMemberDialog } from './invite-member-dialog'
import { OrganizationMemberRow } from './organization-member-row'
import { OrganizationMemberRowSkeleton } from './organization-member-row-skeleton'
import { RemoveMemberDialog } from './remove-member-dialog'

type SortDirection = 'ascending' | 'descending'

type SortDescriptor = {
	column: string
	direction: SortDirection
}

/** Props for the `OrganizationMembers` component. */
export type OrganizationMembersProps = {
	className?: string
}

/** Display label for a member, used for searching and sorting. */
function memberLabel(member: MemberRow): string {
	return member.name ?? member.email
}

/**
 * Organization members table with title, invite control, and per-row actions.
 *
 * Rows are the enriched `MemberRow` from `members.list()`. Search, role filter,
 * and sort are purely local UI state (`useState`) and operate on the fetched
 * list; only the invite dialog's open-state is shared (Jotai `org-dialogs`).
 * Admin-only controls (the Invite button) are gated on the session `role` from
 * route context — the server enforces the same via the `admin` middleware.
 */
export function OrganizationMembers({
	className,
	...props
}: OrganizationMembersProps & ComponentProps<'div'>) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { members, roles } = useOrgOpts()
	const [, dispatch] = useOrgDialogs()

	const { data: membersData, isPending } = useQuery(members.list())
	const { data: roleOptions } = useQuery(roles.list())

	const isAdmin = auth.role === 'admin'

	const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>()
	const [roleFilter, setRoleFilter] = useState('all')
	const [search, setSearch] = useState('')

	const roleLabels = useMemo(() => {
		const map = new Map<string, string>()
		for (const role of roleOptions ?? []) map.set(role.slug, role.name)
		return map
	}, [roleOptions])

	const filteredMembers = useMemo(() => {
		const term = search.toLowerCase()
		return membersData?.filter(
			(member) =>
				(roleFilter === 'all' || member.roleSlug === roleFilter) &&
				memberLabel(member).toLowerCase().includes(term),
		)
	}, [search, membersData, roleFilter])

	const sortedMembers = useMemo(() => {
		if (!sortDescriptor || !filteredMembers) return filteredMembers

		return [...filteredMembers].sort((a, b) => {
			const first =
				sortDescriptor.column === 'role'
					? (a.roleName ?? a.roleSlug)
					: memberLabel(a)
			const second =
				sortDescriptor.column === 'role'
					? (b.roleName ?? b.roleSlug)
					: memberLabel(b)

			let cmp = first.localeCompare(second)
			if (sortDescriptor.direction === 'descending') cmp *= -1
			return cmp
		})
	}, [sortDescriptor, filteredMembers])

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
				<h3 className='truncate font-semibold text-sm'>Members</h3>

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
				</div>

				{roleFilter !== 'all' && (
					<Badge variant='secondary' className='w-fit gap-1'>
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

				<Card className='p-0'>
					<Table aria-label='Members'>
						<TableHeader>
							<TableRow>
								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'user'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('user')}
								>
									Member
								</SortableTableHead>

								<SortableTableHead
									sortDirection={
										sortDescriptor?.column === 'role'
											? sortDescriptor.direction
											: undefined
									}
									onClick={() => toggleSort('role')}
								>
									Role
								</SortableTableHead>

								<TableHead className='text-end'>Actions</TableHead>
							</TableRow>
						</TableHeader>

						<TableBody>
							{isPending ? (
								<OrganizationMemberRowSkeleton />
							) : (
								sortedMembers?.map((member) => (
									<OrganizationMemberRow
										key={member.membershipId}
										member={member}
									/>
								))
							)}
						</TableBody>
					</Table>
				</Card>
			</div>

			<InviteMemberDialog />
			<RemoveMemberDialog />
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

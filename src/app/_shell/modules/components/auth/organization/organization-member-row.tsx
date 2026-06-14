'use client'

import type { MemberRow } from '@server/rpc/contracts/work-os.contract'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import type { User } from '@workos/authkit-tanstack-react-start'
import { Pencil, Trash2 } from 'lucide-react'

import { useOrgDialogs } from '@/app/_shell/modules/utils/org-dialogs.atoms'
import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { TableCell, TableRow } from '@/components/ui/table'
import { UserView } from '../user/user-view'

export type OrganizationMemberRowProps = {
	member: MemberRow
}

/**
 * Project a `MemberRow` onto the WorkOS `User` shape `UserView`/`UserAvatar`
 * consume. The contract carries a single `name`; we surface it as `firstName`
 * (with an empty `lastName`) so the existing display logic renders it. Only the
 * fields the view reads are meaningful — the rest are inert placeholders.
 */
function toUserView(member: MemberRow): User {
	return {
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
	}
}

/**
 * One member row: avatar + name/email (`UserView`), a role dropdown, and a
 * remove control. The role/remove controls are admin-only — gated on the
 * session `role` from route context — and the server enforces the same via the
 * `admin` middleware. The role change is an optimistic `updateRole` mutation;
 * remove opens the shared `RemoveMemberDialog` by recording the target
 * membership in the Jotai `org-dialogs` atom.
 */
export function OrganizationMemberRow({ member }: OrganizationMemberRowProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { members, roles } = useOrgOpts()
	const [, dispatch] = useOrgDialogs()

	const { data: roleOptions } = useQuery(roles.list())
	const { mutate: updateRole, isPending: isUpdatingRole } = useMutation(
		members.updateRole(),
	)

	const isAdmin = auth.role === 'admin'
	const isCurrentUser = auth.user?.id === member.userId
	const roleLabel = member.roleName ?? member.roleSlug

	return (
		<TableRow>
			<TableCell>
				<UserView user={toUserView(member)} />
			</TableCell>

			<TableCell>{roleLabel}</TableCell>

			<TableCell>
				<div className='flex items-center justify-end gap-1'>
					{isAdmin && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										size='icon'
										variant='ghost'
										className='size-8'
										disabled={isUpdatingRole}
										aria-label='Change member role'
									/>
								}
							>
								{isUpdatingRole ? <Spinner /> : <Pencil />}
							</DropdownMenuTrigger>

							<DropdownMenuContent align='end'>
								{roleOptions?.map((role) => (
									<DropdownMenuItem
										key={role.id}
										disabled={member.roleSlug === role.slug}
										onSelect={() =>
											updateRole({
												membershipId: member.membershipId,
												roleSlug: role.slug,
											})
										}
									>
										{role.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{isAdmin && !isCurrentUser && (
						<Button
							size='icon'
							variant='outline'
							className='size-8 text-destructive'
							aria-label='Remove member'
							onClick={() =>
								dispatch({
									type: 'remove-member',
									membershipId: member.membershipId,
								})
							}
						>
							<Trash2 />
						</Button>
					)}
				</div>
			</TableCell>
		</TableRow>
	)
}

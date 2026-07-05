'use client'

import { cn } from '@lib/utils'
import type { User } from '@workos/authkit-tanstack-react-start'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'

import { Skeleton } from '@/components/ui/skeleton'

import { UserAvatar } from './user-avatar'

export type UserViewProps = {
	className?: string
	isPending?: boolean
	/**
	 * When true, the subtitle line (email when name is shown) is hidden.
	 * @default false
	 */
	hideSubtitle?: boolean
	user?: User
}

function getUserDisplayName(user: User | undefined): string | undefined {
	if (!user) return undefined

	const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
	return name || user.email
}

/**
 * Render a compact user item with an avatar, a primary label (name or email), and an optional subtitle (email).
 */
export function UserView({
	className,
	isPending,
	hideSubtitle = false,
	user,
}: UserViewProps) {
	const { user: sessionUser, loading } = useAuth()

	const resolvedUser = user ?? sessionUser ?? undefined
	const displayName = getUserDisplayName(resolvedUser)
	const hasName =
		Boolean(resolvedUser?.firstName || resolvedUser?.lastName) &&
		Boolean(resolvedUser?.email)

	if ((isPending || loading) && !user) {
		return (
			<div className={cn('flex min-w-0 items-center gap-2', className)}>
				<UserAvatar isPending />

				<div className='grid flex-1 gap-1 text-left text-sm'>
					<Skeleton className='h-4 w-24' />

					{!hideSubtitle && <Skeleton className='h-3 w-32' />}
				</div>
			</div>
		)
	}

	return (
		<div className={cn('flex min-w-0 items-center gap-2', className)}>
			<UserAvatar user={resolvedUser} />

			<div className='grid min-w-0 flex-1 text-left text-sm leading-tight'>
				<span className='truncate font-medium text-foreground'>
					{displayName}
				</span>

				{!hideSubtitle && hasName && (
					<span className='truncate text-muted-foreground text-xs'>
						{resolvedUser?.email}
					</span>
				)}
			</div>
		</div>
	)
}

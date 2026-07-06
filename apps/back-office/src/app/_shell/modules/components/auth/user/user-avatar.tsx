'use client'

import type { User } from '@workos/authkit-tanstack-react-start'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import { cn } from 'cnfast'
import { User2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

export type UserAvatarProps = {
	className?: string
	fallback?: ReactNode
	isPending?: boolean
	user?: User
}

function getUserDisplayName(user: User | undefined): string | undefined {
	if (!user) return undefined

	const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
	return name || user.email
}

function getUserInitials(user: User | undefined): string | undefined {
	return getUserDisplayName(user)?.slice(0, 2).toUpperCase()
}

/**
 * Display a user's avatar using session information or an explicit user prop.
 *
 * Renders a circular avatar that shows the user's image when available, a fallback node if provided, or the user's first two initials; while the session is loading (or when `isPending` is true) and no `user` prop is supplied, renders a skeleton placeholder.
 */
export function UserAvatar({
	className,
	user,
	isPending,
	fallback,
}: UserAvatarProps) {
	const { user: sessionUser, loading } = useAuth()

	if ((isPending || loading) && !user) {
		return <Skeleton className={cn('size-8 rounded-full', className)} />
	}

	const resolvedUser = user ?? sessionUser ?? undefined
	const displayName = getUserDisplayName(resolvedUser)
	const initials = getUserInitials(resolvedUser)

	return (
		<Avatar
			className={cn(
				'size-8 rounded-full bg-muted text-foreground text-sm',
				className,
			)}
		>
			<AvatarImage
				src={resolvedUser?.profilePictureUrl ?? undefined}
				alt={displayName}
			/>

			<AvatarFallback
				className='text-muted-foreground!'
				delay={resolvedUser?.profilePictureUrl ? 600 : undefined}
			>
				{fallback || initials || <User2 className='size-4' />}
			</AvatarFallback>
		</Avatar>
	)
}

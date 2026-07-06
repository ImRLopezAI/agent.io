'use client'

import { cn } from 'cnfast'
import type { ComponentProps } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

export type OrganizationViewSkeletonProps = {
	className?: string
}

/**
 * Placeholder matching `OrganizationView` while organization data loads.
 *
 * Logo/slug were removed in the WorkOS migration (no backing fields), so this
 * is a square avatar-shaped block plus a single name line.
 */
export function OrganizationViewSkeleton({
	className,
	...props
}: OrganizationViewSkeletonProps & ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex min-w-0 items-center gap-2', className)}
			{...props}
		>
			<Skeleton className='size-8 shrink-0 rounded-md' />

			<div className='flex min-w-0 flex-col gap-1'>
				<Skeleton className='h-3.5 w-20 rounded-md' />
			</div>
		</div>
	)
}

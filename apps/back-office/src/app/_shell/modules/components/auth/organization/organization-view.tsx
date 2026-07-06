'use client'

import { useRouteContext } from '@tanstack/react-router'
import { cn } from 'cnfast'
import type { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'

import { OrganizationViewSkeleton } from './organization-view-skeleton'

/**
 * Minimal org shape this view renders. Sourced from a `MyMembership`
 * (`organizationName` + `roleSlug`) in the switcher/list, or from route context
 * for the active org. Logo and slug were removed in the WorkOS migration — there
 * are no backing fields — so this is just a name plus an optional role badge.
 */
export type OrganizationViewData = {
	name?: string
	/** Role slug to surface as a badge when `hideRole` is false. */
	role?: string
}

export type OrganizationViewProps = {
	className?: string
	isPending?: boolean
	hideRole?: boolean
	organization?: OrganizationViewData
}

/**
 * Compact organization row: primary name and an optional role badge —
 * analogous to `UserView`.
 *
 * When no `organization` is passed, falls back to the active organization from
 * the `/_shell` route context (name resolved by the caller; here we surface the
 * session `role`). Reads session scalars only — no fetch.
 */
export function OrganizationView({
	className,
	isPending,
	hideRole,
	organization,
	...props
}: OrganizationViewProps & ComponentProps<'div'>) {
	const { auth } = useRouteContext({ from: '/_shell' })

	const name = organization?.name
	const role = organization?.role ?? auth.role

	if (isPending) {
		return <OrganizationViewSkeleton className={className} {...props} />
	}

	return (
		<div
			className={cn('flex min-w-0 items-center gap-2', className)}
			{...props}
		>
			<div className='flex min-w-0 flex-col'>
				<div className='flex min-w-0 items-center gap-2'>
					<p className='truncate font-medium text-foreground text-sm leading-tight'>
						{name}
					</p>

					{!hideRole && !!role && (
						<Badge variant='secondary' className='-my-0.5 shrink-0'>
							{role}
						</Badge>
					)}
				</div>
			</div>
		</div>
	)
}

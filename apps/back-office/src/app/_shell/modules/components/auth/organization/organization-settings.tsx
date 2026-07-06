'use client'

import { cn } from 'cnfast'
import type { ComponentProps } from 'react'

import { OrganizationDangerZone } from './organization-danger-zone'
import { OrganizationProfile } from './organization-profile'

export type OrganizationSettingsProps = {
	className?: string
}

/**
 * Organization settings UI: profile card followed by the danger zone. The
 * plugin-card slot was removed in the WorkOS migration.
 */
export function OrganizationSettings({
	className,
	...props
}: OrganizationSettingsProps & ComponentProps<'div'>) {
	return (
		<div className={cn('flex flex-col gap-4 md:gap-6', className)} {...props}>
			<OrganizationProfile />

			<OrganizationDangerZone />
		</div>
	)
}

'use client'

import { cn } from '@lib/utils'
import { useRouteContext } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { DeleteOrganization } from './delete-organization'
import { LeaveOrganization } from './leave-organization'

export type OrganizationDangerZoneProps = {
	className?: string
}

/**
 * Danger zone for the active organization: a `LeaveOrganization` row available
 * to any member, and a `DeleteOrganization` row gated on the built-in `admin`
 * role. Gating is read synchronously from the `/_shell` route-context session
 * (decision 3/4) — no async permission fetch, so no skeleton flash.
 */
export function OrganizationDangerZone({
	className,
	...props
}: OrganizationDangerZoneProps & ComponentProps<'div'>) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const canDelete = auth.role === 'admin'

	return (
		<div className={cn('flex w-full flex-col', className)} {...props}>
			<h2 className='mb-3 font-semibold text-destructive text-sm'>
				Danger zone
			</h2>

			<Card>
				<CardContent>
					<LeaveOrganization />

					{canDelete && (
						<>
							<Separator className='my-4' />

							<DeleteOrganization />
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

'use client'

import type { MyMembership } from '@server/rpc/contracts/work-os.contract'
import { useRouteContext } from '@tanstack/react-router'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'
import { Check, Settings as SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useOnOrgChanged } from '@/app/_shell/modules/utils/use-on-org-changed'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { OrganizationView } from './organization-view'

export type OrganizationRowProps = {
	membership: MyMembership
}

/**
 * Single organization row: name + role badge via `OrganizationView`, plus a
 * Manage action that switches the active organization to this one (the
 * session-changing reconciliation flow). The active org renders an inert
 * "Current" marker instead of a switch affordance.
 */
export function OrganizationRow({ membership }: OrganizationRowProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { switchToOrganization } = useAuth()
	const onOrgChanged = useOnOrgChanged()
	const [switching, setSwitching] = useState(false)

	const isActive = membership.organizationId === auth.organizationId

	async function manageOrganization() {
		if (isActive) return

		setSwitching(true)
		try {
			const res = await switchToOrganization(membership.organizationId)
			if (res?.error) {
				toast.error(res.error)
				return
			}
			await onOrgChanged()
		} finally {
			setSwitching(false)
		}
	}

	return (
		<div className='flex items-center gap-3'>
			<OrganizationView
				organization={{
					name: membership.organizationName,
					role: membership.roleSlug,
				}}
			/>

			{isActive ? (
				<span className='ml-auto flex shrink-0 items-center gap-1 text-muted-foreground text-sm'>
					<Check className='size-4' />
					Current
				</span>
			) : (
				<Button
					className='ml-auto shrink-0'
					variant='outline'
					size='sm'
					disabled={switching}
					onClick={manageOrganization}
					aria-label='Manage'
				>
					{switching ? <Spinner /> : <SettingsIcon />}
					Manage
				</Button>
			)}
		</div>
	)
}

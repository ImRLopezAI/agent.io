'use client'

import { cn } from '@lib/utils'
import type { ComponentProps } from 'react'
import { UserProfile } from './user-profile'

export type AccountSettingsProps = {
	className?: string
}

/**
 * Account settings layout.
 *
 * Migrated off the prior auth-UI template: the editable name is a small `$rpc`
 * (`workOs.user.updateProfile`) form rendered by `UserProfile`. Email is a
 * security-sensitive change, so it is handled by the WorkOS Widgets surface in
 * the Security tab rather than a hand-rolled form here (decision 14). The
 * template's plugin-driven account cards have no WorkOS equivalent and are
 * dropped.
 */
export function AccountSettings({
	className,
	...props
}: AccountSettingsProps & ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex w-full flex-col gap-4 md:gap-6', className)}
			{...props}
		>
			<UserProfile />
		</div>
	)
}

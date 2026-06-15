'use client'

import { cn } from '@lib/utils'
import { Navigate, useRouteContext } from '@tanstack/react-router'
import { Shield, User2 } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { AccountSettings } from './account/account-settings'
import { SecuritySettings } from './security/security-settings'

/** The two views of the account settings shell. */
export type SettingsView = 'account' | 'security'

export type SettingsProps = {
	className?: string
	/** Which tab to open initially. Defaults to `account`. */
	view?: SettingsView
	hideNav?: boolean
}

/**
 * Account settings shell: tabs for the account (profile/name via `$rpc`) and
 * security (password / MFA / sessions via WorkOS Widgets).
 *
 * Migrated off the prior auth-UI template — auth is read from the `/_shell`
 * route context (decision 4); there is no auth-client, plugin, or
 * localization here. With no authenticated user there is nothing to manage, so
 * we redirect to sign-in (the `/_shell` gate already enforces this server-side).
 */
export function Settings({
	className,
	view = 'account',
	hideNav,
}: SettingsProps) {
	const { auth } = useRouteContext({ from: '/_shell' })

	if (!auth.user) {
		return <Navigate to='/auth/sign-in' replace />
	}

	return (
		<Tabs
			defaultValue={view}
			className={cn('w-full gap-4 md:gap-6', className)}
		>
			<div className={cn(hideNav && 'hidden')}>
				<TabsList aria-label='Settings'>
					<TabsTrigger value='account' className='gap-1'>
						<User2 className='text-muted-foreground' />
						Account
					</TabsTrigger>

					<TabsTrigger value='security' className='gap-1'>
						<Shield className='text-muted-foreground' />
						Security
					</TabsTrigger>
				</TabsList>
			</div>

			<TabsContent value='account' tabIndex={-1}>
				<AccountSettings />
			</TabsContent>

			<TabsContent value='security' tabIndex={-1}>
				<SecuritySettings />
			</TabsContent>
		</Tabs>
	)
}

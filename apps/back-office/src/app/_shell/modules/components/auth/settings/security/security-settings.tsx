'use client'

import { useRouteContext } from '@tanstack/react-router'
import { UserSecurity, UserSessions, WorkOsWidgets } from '@workos-inc/widgets'
import { cn } from 'cnfast'

import '@radix-ui/themes/styles.css'
import '@workos-inc/widgets/styles.css'
import { useTheme } from 'next-themes'

export type SecuritySettingsProps = {
	className?: string
}

/**
 * Security settings — password, MFA, and active sessions.
 *
 * Migrated off the prior auth-UI template: these are security-sensitive flows, so they
 * adopt WorkOS Widgets (decision 14) rather than hand-rolled `$rpc` forms.
 * `UserSecurity` covers password + MFA; `UserSessions` covers the active-session
 * list and revocation. Both need a WorkOS access token, read from the `/_shell`
 * route context (same wiring as `user/user-profile.tsx`).
 *
 * Linked / connected accounts have no `UserSecurity` equivalent yet — see the
 * TODO below.
 */
export function SecuritySettings({ className }: SecuritySettingsProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { resolvedTheme } = useTheme()

	return (
		<div className={cn('flex w-full flex-col gap-4 md:gap-6', className)}>
			<WorkOsWidgets
				theme={{ appearance: resolvedTheme === 'dark' ? 'dark' : 'light' }}
			>
				<div className='flex flex-col gap-4 md:gap-6'>
					<UserSecurity authToken={auth.accessToken} className='z-100' />

					<UserSessions
						authToken={auth.accessToken}
						currentSessionId={auth.sessionId ?? ''}
						className='z-100'
					/>

					{/* TODO(settings): connected/linked accounts have no WorkOS Widget
					    equivalent yet; surface them once a widget or `$rpc` flow exists. */}
				</div>
			</WorkOsWidgets>
		</div>
	)
}

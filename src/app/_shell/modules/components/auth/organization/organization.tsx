'use client'

import { cn } from '@lib/utils'
import { Navigate, useRouteContext } from '@tanstack/react-router'
import { Settings as SettingsIcon, User2 as UserIcon } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { OrganizationPeople } from './organization-people'
import { OrganizationSettings } from './organization-settings'

/** The two views of the organization management shell. */
export type OrganizationView = 'settings' | 'people'

export type OrganizationProps = {
	className?: string
	hideNav?: boolean
	/** Which tab to open initially. Defaults to `settings`. */
	view?: OrganizationView
}

/**
 * Organization management shell: tabs for settings (profile + danger zone) and
 * people (members + invitations).
 *
 * Gating source is the `/_shell` route-context session (decision 4): with no
 * active organization there is nothing to manage, so we redirect to the
 * organizations list. The server enforces every read/mutation regardless
 * (defense in depth).
 */
export function Organization({
	className,
	hideNav,
	view = 'settings',
}: OrganizationProps) {
	const { auth } = useRouteContext({ from: '/_shell' })

	if (!auth.organizationId) {
		return <Navigate to='/' replace />
	}

	return (
		<Tabs
			defaultValue={view}
			className={cn('w-full gap-4 md:gap-6', className)}
		>
			<div className={cn(hideNav && 'hidden')}>
				<TabsList aria-label='Settings'>
					<TabsTrigger value='settings' className='gap-1'>
						<SettingsIcon className='text-muted-foreground' />
						Settings
					</TabsTrigger>

					<TabsTrigger value='people' className='gap-1'>
						<UserIcon className='text-muted-foreground' />
						People
					</TabsTrigger>
				</TabsList>
			</div>

			<TabsContent value='settings' tabIndex={-1}>
				<OrganizationSettings />
			</TabsContent>

			<TabsContent value='people' tabIndex={-1}>
				<OrganizationPeople />
			</TabsContent>
		</Tabs>
	)
}

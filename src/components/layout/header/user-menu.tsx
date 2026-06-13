'use client'
import { UserAvatar, useClerk } from '@clerk/tanstack-react-start'
import { UserButton } from '@components/auth/user-button'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '@components/ui/sidebar'
import { MoreVertical } from 'lucide-react'
export function NavUser() {
	const { isMobile } = useSidebar()
	const { user } = useClerk()
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<UserButton
					side={isMobile ? 'bottom' : 'right'}
					render={
						<SidebarMenuButton
							variant='ghost'
							size='lg'
							className='data-[state=expanded]:bg-sidebar-accent data-[state=expanded]:text-sidebar-accent-foreground'
						>
							<UserAvatar rounded />
							<div className='grid flex-1 text-left text-sm leading-tight'>
								<span className='truncate font-medium'>
									{user?.fullName || 'User'}
								</span>
								<span className='truncate text-muted-foreground text-xs'>
									{user?.emailAddresses.find(
										(email) => email.id === user.primaryEmailAddressId,
									)?.emailAddress || 'user@example.com'}
								</span>
							</div>
							<MoreVertical className='ml-auto size-4' />
						</SidebarMenuButton>
					}
				/>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}

'use client'

import {
	SidebarMenu,
	SidebarMenuItem,
	useSidebar,
} from '@components/ui/sidebar'
import { Button } from '@ui/button'
import { MoreVertical } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
export function NavUser() {
	const { isMobile } = useSidebar()
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<Button variant='ghost' className='w-full justify-between px-0'>
					<div className='flex items-center space-x-3'>
						<Avatar className='h-8 w-8'>
							<AvatarImage src='/avatars/1.svg' alt='User Avatar' />
							<AvatarFallback>AB</AvatarFallback>
						</Avatar>
						{!isMobile && <span className='font-medium'>Alice Brown</span>}
					</div>
					{!isMobile && <MoreVertical className='h-4 w-4' />}
				</Button>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}

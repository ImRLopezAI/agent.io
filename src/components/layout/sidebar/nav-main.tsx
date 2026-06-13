'use client'

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	useSidebar,
} from '@/components/ui/sidebar'
import { useAppSidebar } from './context'
import { NavGroupMenu } from './nav-items'
import { NavWrappedPanel } from './nav-wrapped'
import { useSidebarNavStack } from './sidebar-nav-store'

export function NavMain() {
	const { isMobile, state } = useSidebar()
	const { items, navigate, pathname } = useAppSidebar()
	const stack = useSidebarNavStack(items, pathname, state === 'collapsed')
	const activeFrame = stack.at(-1)

	if (activeFrame) {
		return (
			<NavWrappedPanel
				frame={activeFrame}
				isMobile={isMobile}
				maxDepth={3}
				navigate={navigate}
				pathname={pathname}
			/>
		)
	}

	return (
		<>
			{items.map((nav) => {
				const groupItems =
					nav.type === 'dynamic' ? nav.dynamicItems() : nav.items
				const maxDepth = nav.type === 'dynamic' ? 3 : 2
				const actions = nav.type === 'dynamic' ? nav.actions : undefined

				return (
					<SidebarGroup key={nav.title}>
						<div className='flex w-full items-center justify-between'>
							<SidebarGroupLabel>{nav.title}</SidebarGroupLabel>
							{typeof actions === 'function' ? actions() : actions}
						</div>
						<SidebarGroupContent className='flex flex-col gap-2'>
							<NavGroupMenu
								isMobile={isMobile}
								items={groupItems}
								maxDepth={maxDepth}
								navigate={navigate}
								pathname={pathname}
							/>
						</SidebarGroupContent>
					</SidebarGroup>
				)
			})}
		</>
	)
}

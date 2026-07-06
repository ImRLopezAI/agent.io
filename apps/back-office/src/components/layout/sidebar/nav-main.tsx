'use client'

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	useSidebar,
} from '@/components/ui/sidebar'

import { useAppSidebar } from './context'
import { NavDynamicMore } from './nav-dynamic-more'
import { NavGroupMenu } from './nav-items'
import { NavWrappedPanel } from './nav-wrapped'
import {
	getNavGroupKey,
	resolveDynamicGroupItems,
	splitDynamicGroupItems,
} from './nav-utils'
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
			{items.map((nav, index) => {
				const isDynamic = nav.type === 'dynamic'
				const allGroupItems = isDynamic
					? resolveDynamicGroupItems(nav)
					: nav.items
				const { visible: groupItems, overflow: overflowItems } = isDynamic
					? splitDynamicGroupItems(nav, allGroupItems)
					: { visible: allGroupItems, overflow: [] as typeof allGroupItems }
				const maxDepth = isDynamic ? 3 : 2
				const actions = isDynamic ? nav.actions : undefined
				const isWrappedGroup = isDynamic && nav.navType === 'wrapped'

				return (
					<SidebarGroup key={getNavGroupKey(nav, index)}>
						{!isWrappedGroup && nav.title ? (
							<div className='flex w-full items-center justify-between'>
								<SidebarGroupLabel>{nav.title}</SidebarGroupLabel>
								{typeof actions === 'function' ? actions() : actions}
							</div>
						) : null}
						{isWrappedGroup && actions ? (
							<div className='flex w-full justify-end px-2'>
								{typeof actions === 'function' ? actions() : actions}
							</div>
						) : null}
						<SidebarGroupContent className='flex flex-col gap-2'>
							<NavGroupMenu
								isMobile={isMobile}
								items={groupItems}
								maxDepth={maxDepth}
								more={
									isDynamic && overflowItems.length > 0 ? (
										<NavDynamicMore
											group={nav}
											items={overflowItems}
											navigate={navigate}
										/>
									) : null
								}
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

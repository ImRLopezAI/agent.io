'use client'

import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
} from '@/components/ui/sidebar'
import { useSidebarNavActions } from './sidebar-nav-store'
import { NavItemNode } from './nav-items'
import type { NavStackFrame } from './nav-utils'
import { resolveStackFrameItems } from './nav-utils'

type NavWrappedPanelProps = {
	frame: NavStackFrame
	pathname: string
	navigate: (to: string) => void
	isMobile: boolean
	maxDepth: number
}

export function NavWrappedPanel({
	frame,
	pathname,
	navigate,
	isMobile,
	maxDepth,
}: NavWrappedPanelProps) {
	const { pop: popStack } = useSidebarNavActions()
	const items = resolveStackFrameItems(frame)

	return (
		<SidebarGroup>
			<div className='mb-2 flex items-center gap-2 border-sidebar-border border-b px-2 pb-3'>
				<Button
					className='size-8 shrink-0'
					onClick={() => popStack()}
					size='icon'
					variant='ghost'
				>
					<ArrowLeft className='size-4' />
					<span className='sr-only'>Back</span>
				</Button>
				<h3 className='flex-1 truncate text-center font-medium text-sm'>
					{frame.title}
				</h3>
				<div className='size-8 shrink-0' />
			</div>
			<SidebarGroupContent className='flex flex-col gap-2'>
				<SidebarMenu>
					{items.map((item) => (
						<NavItemNode
							isMobile={isMobile}
							item={item}
							key={item.id ?? item.title}
							maxDepth={maxDepth}
							mode='stack'
							navigate={navigate}
							pathname={pathname}
						/>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}

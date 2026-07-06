'use client'
import { useLocation, useRouter, Link } from '@tanstack/react-router'
import {
	SidebarInset,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
} from '@ui/sidebar'
import { Suspense } from 'react'

import { AppSidebar } from '@/components/layout/sidebar/app-sidebar'
import type { NavGroup } from '@/components/layout/sidebar/items'

import { SiteHeader } from './components/header'
import { Logo } from './components/logo'

const sidebarProviderStyle: React.CSSProperties & {
	'--header-height': string
	'--sidebar-width': string
} = {
	'--sidebar-width': 'calc(var(--spacing) * 72)',
	'--header-height': 'calc(var(--spacing) * 12)',
}

function BaseLayoutShell(
	props: React.PropsWithChildren & { navItems: NavGroup[] },
) {
	const { pathname } = useLocation()
	const router = useRouter()
	return (
		<AppSidebar
			variant='floating'
			collapsible='icon'
			items={props.navItems}
			pathname={pathname}
			navigate={(to) => router.navigate({ to })}
		>
			<AppSidebar.Header>
				<SidebarMenu>
					<SidebarMenuItem>
						<Link to='/' className='flex items-center gap-2'>
							<Logo fill='currentColor' className='size-7' />
							<span className='font-semibold text-lg group-data-[collapsible=icon]:hidden'>
								Agent.IO
							</span>
						</Link>
					</SidebarMenuItem>
				</SidebarMenu>
			</AppSidebar.Header>
			<SidebarInset>
				<SiteHeader />
				<div className='@container/main scrollbar-thumb-foreground/10 scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto'>
					{props.children}
				</div>
			</SidebarInset>
		</AppSidebar>
	)
}

export default function BaseLayout(
	props: React.PropsWithChildren & { navItems: NavGroup[] },
) {
	return (
		<SidebarProvider
			className='h-svh overflow-hidden'
			style={sidebarProviderStyle}
		>
			<Suspense fallback={null}>
				<BaseLayoutShell navItems={props.navItems}>
					{props.children}
				</BaseLayoutShell>
			</Suspense>
		</SidebarProvider>
	)
}

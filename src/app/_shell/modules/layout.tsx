import { useLocation, useRouter } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import {
	SidebarInset,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
} from '@ui/sidebar'

import { AppSidebar } from '@/components/layout/sidebar/app-sidebar'
import { navItems } from '@/components/layout/sidebar/items'

import { SiteHeader } from './components/header'
import { Logo } from './components/logo'

export default function BaseLayout(props: React.PropsWithChildren) {
	const { pathname } = useLocation()
	const router = useRouter()
	return (
		<SidebarProvider
			className='h-svh overflow-hidden'
			style={
				{
					'--sidebar-width': 'calc(var(--spacing) * 72)',
					'--header-height': 'calc(var(--spacing) * 12)',
				} as React.CSSProperties
			}
		>
			<AppSidebar
				variant='floating'
				collapsible='icon'
				items={navItems}
				pathname={pathname}
				navigate={(to) => router.navigate({ to })}
			>
				<AppSidebar.Header>
					<SidebarMenu>
						<SidebarMenuItem>
							<Link to='/' className='flex items-center gap-2'>
								<Logo fill='currentColor' className='size-7' />
								<span className='font-semibold text-lg group-data-[collapsible=icon]:hidden'>
									Agent.io
								</span>
							</Link>
						</SidebarMenuItem>
					</SidebarMenu>
				</AppSidebar.Header>
				<SidebarInset>
					<SiteHeader />
					<div className='@container/main min-h-0 flex-1 p-4 xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto'>
						{props.children}
					</div>
				</SidebarInset>
			</AppSidebar>
		</SidebarProvider>
	)
}

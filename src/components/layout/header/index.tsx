'use client'

import { AiChatDrawer } from '@components/ui/ai/drawer'
import { useRouteContext } from '@tanstack/react-router'
// import { UserButton } from '@components/auth/user-button'
import { PromptInputProvider } from '@ui/ai-elements/prompt-input'
import { AnimatedThemeToggler } from '@ui/animated-theme-toggler'
import { ShimmerButton } from '@ui/shimmer-button'
import { OrganizationSwitcher } from '@workos-inc/widgets'
import { PanelLeftIcon, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import Search from '@/components/layout/header/search'
import { useAgent } from '@/components/ui/ai/use-agent'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSidebar } from '@/components/ui/sidebar'

import { Menu } from './navigation'
function HeaderAiAssistant() {
	const transport = useMemo(
		() => ({
			body: {
				agent: 'hubspot',
			},
		}),
		[],
	)

	const { handler } = useAgent({ transport })

	return (
		<AiChatDrawer
			handler={handler}
			render={
				<ShimmerButton>
					<Sparkles className='me-2 size-4' />
					<span>AI Assistant</span>
				</ShimmerButton>
			}
		/>
	)
}

export function SiteHeader() {
	const { toggleSidebar } = useSidebar()
	const { auth } = useRouteContext({
		from: '/_shell',
	})
	return (
		<header className='sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/40 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) md:rounded-tl-xl md:rounded-tr-xl'>
			<div className='flex w-full items-center gap-1 px-4 lg:gap-2'>
				<Button onClick={toggleSidebar} size='icon' variant='ghost'>
					<PanelLeftIcon />
				</Button>
				<Separator orientation='vertical' />
				<Menu />
				<div className='ml-auto flex items-center gap-2'>
					<PromptInputProvider>
						<HeaderAiAssistant />
					</PromptInputProvider>
					<Search />
					<AnimatedThemeToggler />
					<Separator orientation='vertical' />
					<OrganizationSwitcher
						authToken={auth.accessToken}
						switchToOrganization={({ organizationId }) => {
							console.log(organizationId)
						}}
					/>
				</div>
			</div>
		</header>
	)
}

'use client'

import { Button } from '@ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@ui/dropdown-menu'
import {
	ChevronDown,
	ChevronLeft,
	Home,
	PlusIcon,
	Newspaper,
	Wrench,
	Blocks,
	AudioLines,
	PhoneOutgoing,
	Smartphone,
	Spotlight,
	Workflow,
	ChartColumn,
	FileChartColumn,
	ListTree,
	Drone,
	Radar,
	PhoneIncoming,
	Bubbles
} from 'lucide-react'
import { useState } from 'react'

import type {
	NavGroup,
	WrappedHeaderContext,
} from '@/components/layout/sidebar/items'
import { cn } from '@/lib/utils'

import BaseLayout from '../../layout'

const agentBranches = [
	{ id: 'main', label: 'Main' },
	{ id: 'draft', label: 'Draft' },
] as const

function AgentWrappedHeader({ goBack, item, title }: WrappedHeaderContext) {
	const [branch, setBranch] =
		useState<(typeof agentBranches)[number]['id']>('main')
	const selectedBranch =
		agentBranches.find((entry) => entry.id === branch) ?? agentBranches[0]
	const Icon = item.icon

	return (
		<Card className='mb-2 bg-sidebar-accent/15' size='sm'>
			<CardHeader className='items-center justify-start'>
				<Button
					className='h-auto gap-1 text-sidebar-foreground/55 text-xs hover:text-sidebar-foreground'
					onClick={() => goBack('/')}
					type='button'
					variant='link'
				>
					<ChevronLeft className='size-3.5 shrink-0' />
					Back to workspace
				</Button>
			</CardHeader>

			<Card className='mx-2 gap-0 bg-sidebar p-1' size='sm'>
				<CardContent className='flex items-center gap-2.5'>
					<div className='flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10'>
						{Icon ? <Icon className='size-4 text-primary' /> : null}
					</div>
					<CardTitle className='truncate'>{title}</CardTitle>
				</CardContent>

				<CardFooter className='p-0'>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									className='h-auto w-full justify-start gap-2.5 rounded-none px-3 font-normal'
									type='button'
									variant='ghost'
								/>
							}
						>
							<span
								aria-hidden
								className={cn(
									'size-3 shrink-0 rounded-full border-2',
									branch === 'main'
										? 'border-green-500'
										: 'border-muted-foreground/40',
								)}
							/>
							<span className='min-w-0 flex-1 truncate text-left font-medium'>
								{selectedBranch.label}
							</span>
							<ChevronDown className='size-4 shrink-0 text-muted-foreground' />
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align='start'
							className='min-w-(--anchor-width) w-(--anchor-width)'
						>
							<DropdownMenuRadioGroup
								onValueChange={(value) =>
									setBranch(value as (typeof agentBranches)[number]['id'])
								}
								value={branch}
							>
								{agentBranches.map((entry) => (
									<DropdownMenuRadioItem key={entry.id} value={entry.id}>
										{entry.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</CardFooter>
			</Card>
		</Card>
	)
}

const navItems: NavGroup[] = [
	{
		items: [
			{
				title: 'Home',
				href: '/',
				icon: Home,
			},
		],
	},
	{
		title: 'Agent',
		type: 'dynamic',
		maxItems: 4,
		searchPlaceholder: 'Search agents...',
		viewAllHref: '/agents',

		dynamicItems: () => {
			const agents = new Array(10).fill(0).map((_, index) => ({
				name: `Agent ${index + 1}`,
				id: `agent-${index + 1}`,
			}))
			return agents.map((agent) => ({
				title: agent.name,
				href: `/agents/${agent.id}`,
				icon: Drone,
				navType: 'wrapped',
				showWrappedIndicator: false,
				directNavigation: true,
				wrappedHeader: AgentWrappedHeader,
				items: [
					{
						title: 'Agent',
						href: `/agents/${agent.id}`,
						icon: Bubbles,
					},
					{
						title: 'Configuration',
						navType: 'group',
						items: [
							{
								title: 'Workflows',
								href: `/agents/${agent.id}/workflows`,
								icon: Workflow,
							},
							{
								title: 'Procedures',
								href: `/agents/${agent.id}/procedures`,
								icon: ListTree,
							},
							{
								title: 'Knowledge Base',
								href: `/agents/${agent.id}/kb`,
								icon: Newspaper,
							},
						],
					},
					{
						title: 'Monitoring',
						navType: 'group',
						items: [
							{
								title: 'Metrics',
								href: `/agents/${agent.id}/metrics`,
								icon: ChartColumn,
							},
							{
								title: 'Logs',
								href: `/agents/${agent.id}/logs`,
								icon: FileChartColumn,
							},
						],
					},
					{
						title: 'Deploy',
						navType: 'group',
						items: [
							{
								title: 'Outbound',
								href: `/agents/${agent.id}/deploy/outbound`,
								icon: PhoneOutgoing,
							},
							{
								title: 'Inbound',
								href: `/agents/${agent.id}/deploy/inbound`,
								icon: PhoneIncoming,
							},
							{
								title: 'Channels',
								href: `/agents/${agent.id}/deploy/channels`,
								icon: Radar,
							},
						],
					},
				],
			}))
		},
		actions: () => (
			<Button variant='ghost' size='icon'>
				<PlusIcon className='h-4 w-4' />
			</Button>
		),
	},
	{
		title: 'Deploy',
		type: 'static',
		items: [
			{
				title: 'Batch Call',
				href: '/deploy/batch-call',
				icon: PhoneOutgoing,
			},
			{
				title: 'Phone Number',
				href: '/deploy/phone-number',
				icon: Smartphone,
			},
		],
	},
	{
		title: 'Config',
		type: 'static',
		items: [
			{
				title: 'Knowledge Base',
				href: '/settings/kb',
				icon: Newspaper,
			},
			{
				title: 'Tools',
				href: '/settings/tools',
				icon: Wrench,
			},
			{
				title: 'Integrations',
				href: '/settings/integrations',
				icon: Blocks,
			},
			{
				title: 'Voices',
				href: '/settings/voices',
				icon: AudioLines,
			},
		],
	},
]

export default function AgentsLayout(props: React.PropsWithChildren) {
	return <BaseLayout navItems={navItems}>{props.children}</BaseLayout>
}

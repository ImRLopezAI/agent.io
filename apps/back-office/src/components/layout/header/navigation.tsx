'use client'

import { Link } from '@tanstack/react-router'
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '@ui/navigation-menu'
import type { LucideIcon } from 'lucide-react'
import {
	Activity,
	BadgeDollarSign,
	BookUser,
	CalendarDays,
	CalendarRange,
	ClipboardList,
	Users2,
	Webhook,
} from 'lucide-react'
import type * as React from 'react'

type Navigations = {
	title: string
	href: string
	description: string
	icon: LucideIcon
}[]

const factorial: Navigations = [
	{
		title: 'Roster',
		href: '/factorial/roster',
		description:
			'View all active agents with their department, position, and attendance schedule.',
		icon: ClipboardList,
	},
	{
		title: 'Insights',
		href: '/factorial/insights',
		description:
			'Analyze schedule compliance, break adherence, overtime, and absence alerts directly from Factorial.',
		icon: Activity,
	},
	{
		title: 'Schedule',
		href: '/factorial/schedule',
		description:
			'Render and inspect the base schedule seed used for Factorial attendance insights.',
		icon: CalendarRange,
	},
	{
		title: 'Webhooks',
		href: '/factorial/integration',
		description:
			'Manage and configure webhooks to integrate with external services and automate workflows.',
		icon: Webhook,
	},
	{
		title: 'Teams',
		href: '/factorial/teams',
		description:
			'See and manage all your teams, their members, and team settings in one place.',
		icon: Users2,
	},
]

const reports: Navigations = [
	{
		title: 'Sales Report',
		href: '/reports/sales',
		description:
			'Generate detailed sales reports to analyze performance and track growth over time.',
		icon: BadgeDollarSign,
	},
	{
		title: 'Customer Iteractions',
		href: '/reports/cs-iteraction',
		description:
			'Monitor and evaluate customer interactions to improve service quality and satisfaction.',
		icon: BookUser,
	},
]

export function Menu() {
	return (
		<NavigationMenu>
			<NavigationMenuList className='flex justify-start'>
				<Menues items={reports} label='Reports' icon={ClipboardList} />
				<Menues items={factorial} label='Factorial' icon={CalendarDays} />
			</NavigationMenuList>
		</NavigationMenu>
	)
}

function Menues({
	items,
	label,
	icon: Icon,
}: {
	label: string
	icon: LucideIcon
	items: Navigations
}) {
	return (
		<NavigationMenuItem>
			<NavigationMenuTrigger className='gap-2'>
				<Icon className='size-4' />
				<span>{label}</span>
			</NavigationMenuTrigger>
			<NavigationMenuContent>
				<ul className='grid w-100 gap-2 md:w-125 md:grid-cols-2 lg:w-150'>
					{items.map((component) => (
						<ListItem
							key={component.title}
							title={component.title}
							href={component.href}
							icon={component.icon}
						>
							{component.description}
						</ListItem>
					))}
				</ul>
			</NavigationMenuContent>
		</NavigationMenuItem>
	)
}

function ListItem({
	title,
	children,
	href,
	icon: Icon,
	...props
}: React.ComponentPropsWithoutRef<'li'> & { href: string; icon: LucideIcon }) {
	return (
		<li {...props}>
			<NavigationMenuLink
				render={
					<Link to={href}>
						<div className='flex flex-col gap-1 text-sm'>
							<div className='font-medium leading-none'>
								<Icon className='me-2 inline size-4' />
								{title}
							</div>
							<div className='line-clamp-2 text-muted-foreground'>
								{children}
							</div>
						</div>
					</Link>
				}
			/>
		</li>
	)
}

import type { LucideIcon } from 'lucide-react'
import {
	Activity,
	Album,
	AlertTriangle,
	BookDown,
	Gauge,
	History,
	NotebookTabs,
	UserStar,
	Users,
} from 'lucide-react'

type StaticNavGroup = {
	type?: 'static'
	title: string
	items: NavItem[]
}

type DynamicNavGroup = {
	type: 'dynamic'
	title: string
	actions?: React.ReactNode | (() => React.ReactNode)
	dynamicItems: () => NavItem[]
}

export type NavGroup = StaticNavGroup | DynamicNavGroup

export type BadgeTypes = 'NEW' | 'COMING' | 'WIP' | 'UPDATED' | (string & {})

export type NavItem = {
	title: string
	href: React.ComponentProps<'a'>['href']
	icon?: LucideIcon
	badge?: BadgeTypes
	newTab?: boolean
	items?: NavItem[]
}

export const navItems: NavGroup[] = [
	{
		title: 'Productivity Agent',
		items: [
			{
				title: 'Dashboard',
				href: '/',
				icon: Activity,
			},
			{
				title: 'Alerts',
				href: '/productivity/alerts',
				icon: AlertTriangle,
			},
			{
				title: 'Agents',
				href: '/productivity/agents',
				icon: Users,
			},
			{
				title: 'Metrics',
				href: '/productivity/metrics',
				icon: Gauge,
			},
			{
				title: 'Baselines',
				href: '/productivity/baselines',
				icon: History,
			},
			{
				title: 'Scores Cards',
				href: '#',
				icon: NotebookTabs,
				items: [
					{
						title: 'Customer Service',
						href: '/scorecards/cs',
						icon: UserStar,
					},
					{
						title: 'Inscription',
						href: '/scorecards/inscription',
						icon: Album,
					},
					{
						title: 'Inscription BO',
						href: '/scorecards/inscription-bo',
						icon: BookDown,
					},
				],
			},
		],
	},
]

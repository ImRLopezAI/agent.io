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
	title?: string
	items: NavItem[]
}

export type DynamicNavGroup = {
	type: 'dynamic'
	title: string
	icon?: LucideIcon
	navType?: NavItemNavType
	maxItems?: number
	moreLabel?: string
	searchPlaceholder?: string
	viewAllHref?: React.ComponentProps<'a'>['href']
	viewAllLabel?: string
	wrappedHeader?: (context: WrappedHeaderContext) => React.ReactNode
	actions?: React.ReactNode | (() => React.ReactNode)
	dynamicItems: () => NavItem[]
}

export type NavGroup = StaticNavGroup | DynamicNavGroup

export type BadgeTypes = 'NEW' | 'COMING' | 'WIP' | 'UPDATED' | (string & {})

export type NavItemNavType = 'link' | 'dropdown' | 'wrapped' | 'group'

export type WrappedHeaderContext = {
	id: string
	title: string
	pathname: string
	href?: React.ComponentProps<'a'>['href']
	item: NavItem
	navigate: (to: string) => void
	goBack: (to?: React.ComponentProps<'a'>['href']) => void
}

export type NavItem = {
	id?: string
	title: string
	href?: React.ComponentProps<'a'>['href']
	icon?: LucideIcon
	badge?: BadgeTypes
	newTab?: boolean
	navType?: NavItemNavType
	showWrappedIndicator?: boolean
	directNavigation?: boolean
	wrappedHeader?: (context: WrappedHeaderContext) => React.ReactNode
	items?: NavItem[]
	dynamicItems?: () => NavItem[]
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
				title: 'Score Cards',
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
						id: 'scorecards-back-office',
						title: 'Back Office',
						navType: 'wrapped',
						icon: BookDown,
						items: [
							{
								title: 'Inscription BO',
								href: '/scorecards/inscription-bo',
								icon: BookDown,
							},
						],
					},
				],
			},
		],
	},
]

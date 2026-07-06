'use client'

import {
	Activity,
	Bot,
	BookOpenCheck,
	Building2,
	CalendarClock,
	CheckSquare,
	ClipboardList,
	Gavel,
	UserRoundCheck,
	Settings2,
	Workflow,
} from 'lucide-react'
import type { NavGroup } from '@/components/layout/sidebar/items'
import BaseLayout from '../../layout'

const navItems: NavGroup[] = [
	{
		title: 'Admin',
		items: [
			{
				title: 'Overview',
				href: '/admin',
				icon: Activity,
			},
			{
				title: 'Approvals',
				icon: CheckSquare,
				items: [
					{
						title: 'Queue',
						href: '/admin/approvals',
						icon: ClipboardList,
					},
					{
						title: 'Manager assignments',
						href: '/admin/approvals/assign',
						icon: UserRoundCheck,
					},
					{
						title: 'Review',
						href: '/admin/approvals/review',
						icon: Gavel,
					},
					{
						title: 'Eve recommendations',
						href: '/admin/approvals/eve',
						icon: Bot,
					},
					{
						title: 'Automatic runs',
						href: '/admin/approvals/auto',
						icon: CalendarClock,
					},
					{
						title: 'Playbook',
						href: '/admin/approvals/playbook',
						icon: BookOpenCheck,
					},
				],
			},
			{
				title: 'Configurations',
				icon: Settings2,
				navType: 'wrapped',
				items: [
					{
						title: 'Engine',
						href: '/admin/settings/engine',
						icon: Workflow,
					},
					{
						title: 'Organizations',
						href: '/admin/settings/organization',
						icon: Building2,
					},
				],
			},
		],
	},
]

export default function AdminLayout(props: React.PropsWithChildren) {
	return <BaseLayout navItems={navItems}>{props.children}</BaseLayout>
}

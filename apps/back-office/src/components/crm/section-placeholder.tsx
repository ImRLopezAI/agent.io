import type { LucideIcon } from 'lucide-react'

import { EmptyState } from './empty-state'
import { PageHeader } from './page-header'

/** Temporary section scaffold used by routes whose full screen is still being
 *  built out from the design. */
export function SectionPlaceholder({
	title,
	subtitle,
	icon,
	note,
}: {
	title: string
	subtitle?: string
	icon: LucideIcon
	note?: string
}) {
	return (
		<div className='flex flex-col gap-6'>
			<PageHeader title={title} subtitle={subtitle} />
			<EmptyState
				icon={icon}
				title={`${title} — coming soon`}
				description={
					note ?? 'This section is being implemented from the design spec.'
				}
			/>
		</div>
	)
}

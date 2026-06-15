import type * as React from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** CRM surface card matching the design: 14px radius, 1px border, 24px padding,
 *  no ring/shadow. Built on the shadcn Card primitive. */
export function SectionCard({
	className,
	...props
}: React.ComponentProps<typeof Card>) {
	return (
		<Card
			className={cn(
				'gap-0 rounded-[14px] border border-border p-6 shadow-none ring-0',
				className,
			)}
			{...props}
		/>
	)
}

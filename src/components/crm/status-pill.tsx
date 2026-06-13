import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type PillTone =
	| 'primary'
	| 'positive'
	| 'warning'
	| 'danger'
	| 'info'
	| 'neutral'

const toneToVariant = {
	primary: 'default',
	positive: 'positive',
	warning: 'warning',
	danger: 'danger',
	info: 'secondary',
	neutral: 'neutral',
} as const

/** Rounded status/stage/priority pill built on the Badge primitive. */
export function StatusPill({
	tone = 'neutral',
	className,
	children,
}: {
	tone?: PillTone
	className?: string
	children: React.ReactNode
}) {
	return (
		<Badge
			variant={toneToVariant[tone]}
			className={cn(
				'h-auto rounded-full px-3 py-1 font-medium text-[11px]',
				className,
			)}
		>
			{children}
		</Badge>
	)
}

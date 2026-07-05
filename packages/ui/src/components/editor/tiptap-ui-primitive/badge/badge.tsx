'use client'

import { forwardRef } from 'react'

import { cn } from '#/lib/tiptap-utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: 'ghost' | 'white' | 'gray' | 'green' | 'yellow' | 'default'
	size?: 'default' | 'small'
	appearance?: 'default' | 'subdued' | 'emphasized'
	trimText?: boolean
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
	(
		{
			variant,
			size = 'default',
			appearance = 'default',
			trimText = false,
			className,
			children,
			...props
		},
		ref,
	) => {
		return (
			<div
				ref={ref}
				className={cn(
					'inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-background p-1 font-bold text-[0.625rem] text-muted-foreground leading-[1.15] transition-colors data-[size=small]:h-4 data-[size=small]:min-w-4 data-[text-trim=on]:max-w-full data-[text-trim=on]:truncate data-[size=small]:rounded-[0.25rem] data-[appearance=subdued]:border-transparent data-[style=default]:border-transparent data-[style=ghost]:border-transparent data-[style=green]:border-chart-4/25 data-[style=yellow]:border-chart-5/25 data-[appearance=emphasized]:bg-foreground data-[appearance=subdued]:bg-muted data-[style=default]:bg-foreground data-[style=ghost]:bg-transparent data-[style=gray]:bg-muted data-[style=green]:bg-chart-4/10 data-[style=white]:bg-background data-[style=yellow]:bg-chart-5/10 data-[size=small]:p-0.5 data-[appearance=emphasized]:text-background data-[appearance=subdued]:text-muted-foreground data-[style=default]:text-background data-[style=green]:text-chart-4 data-[style=yellow]:text-chart-5',
					className,
				)}
				data-style={variant}
				data-size={size}
				data-appearance={appearance}
				data-text-trim={trimText ? 'on' : 'off'}
				{...props}
			>
				{children}
			</div>
		)
	},
)

Badge.displayName = 'Badge'

export default Badge

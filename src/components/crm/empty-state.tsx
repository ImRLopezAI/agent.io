import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
	icon?: LucideIcon
	title: string
	description?: string
	action?: React.ReactNode
	className?: string
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center gap-3 rounded-2xl border border-border border-dashed bg-card/40 px-6 py-16 text-center',
				className,
			)}
		>
			{Icon && (
				<div className='flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground'>
					<Icon className='size-6' />
				</div>
			)}
			<div className='flex flex-col gap-1'>
				<h3 className='font-heading font-semibold text-foreground text-lg'>
					{title}
				</h3>
				{description && (
					<p className='mx-auto max-w-sm text-muted-foreground text-sm'>
						{description}
					</p>
				)}
			</div>
			{action}
		</div>
	)
}

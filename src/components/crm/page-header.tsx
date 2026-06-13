import type * as React from 'react'
import { ButtonGroup } from '@/components/ui/button-group'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
	title: React.ReactNode
	subtitle?: React.ReactNode
	actions?: React.ReactNode
	className?: string
}

/** Compact page action row. The shell/sidebar already supplies page context, so
 *  list pages should spend their first row on useful controls instead of a
 *  repeated title block. */
export function PageHeader({
	title: _title,
	subtitle: _subtitle,
	actions,
	className,
}: PageHeaderProps) {
	if (!actions) return null

	return (
		<div className={cn('flex items-center justify-end', className)}>
			<ButtonGroup className='shrink-0'>{actions}</ButtonGroup>
		</div>
	)
}

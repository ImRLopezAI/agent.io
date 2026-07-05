'use client'

import { cn } from '#/lib/tiptap-utils'

export type Orientation = 'horizontal' | 'vertical'

export function Separator({
	decorative,
	orientation = 'vertical',
	className,
	...props
}: React.ComponentProps<'div'> & {
	orientation?: Orientation
	decorative?: boolean
}) {
	const ariaOrientation = orientation === 'vertical' ? orientation : undefined
	const semanticProps = decorative
		? { role: 'none' }
		: { 'aria-orientation': ariaOrientation, role: 'separator' }

	return (
		<div
			className={cn(
				'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
				className,
			)}
			data-orientation={orientation}
			{...semanticProps}
			{...props}
		/>
	)
}

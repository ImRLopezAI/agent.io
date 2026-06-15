import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { VariantProps } from 'class-variance-authority'

import type { StatusKey } from '#/lib/constants'
import { cn } from '#/lib/utils'

import { badgeVariants, getBadgeVariantFromStatus } from './badge-variants'

function Badge({
	className,
	variant = 'default',
	render,
	type,
	...props
}: useRender.ComponentProps<'span'> &
	VariantProps<typeof badgeVariants> & { type?: StatusKey }) {
	return useRender({
		defaultTagName: 'span',
		props: mergeProps<'span'>(
			{
				className: cn(
					badgeVariants({
						variant: type ? getBadgeVariantFromStatus(type) : variant,
					}),
					className,
				),
			},
			props,
		),
		render,
		state: {
			slot: 'badge',
			variant,
		},
	})
}

export { Badge }

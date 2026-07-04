import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { Separator } from '@ui/separator'
import type { VariantProps } from 'class-variance-authority'

import { cn } from 'cnfast'

import { buttonGroupVariants } from './button-group-variants'

function ButtonGroup({
	className,
	orientation,
	...props
}: React.ComponentProps<'fieldset'> &
	VariantProps<typeof buttonGroupVariants>) {
	return (
		<fieldset
			data-slot='button-group'
			data-orientation={orientation}
			className={cn(
				'm-0 min-w-0 border-0 p-0',
				buttonGroupVariants({ orientation }),
				className,
			)}
			{...props}
		/>
	)
}

function ButtonGroupText({
	className,
	render,
	...props
}: useRender.ComponentProps<'div'>) {
	return useRender({
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				className: cn(
					"flex items-center gap-2 rounded-lg border bg-muted px-2.5 font-medium text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
					className,
				),
			},
			props,
		),
		render,
		state: {
			slot: 'button-group-text',
		},
	})
}

function ButtonGroupSeparator({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			data-slot='button-group-separator'
			orientation={orientation}
			className={cn(
				'relative self-stretch bg-input data-horizontal:mx-px data-vertical:my-px data-vertical:h-auto data-horizontal:w-auto',
				className,
			)}
			{...props}
		/>
	)
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText }

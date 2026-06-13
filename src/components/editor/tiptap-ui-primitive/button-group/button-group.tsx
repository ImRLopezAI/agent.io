import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { VariantProps } from 'class-variance-authority'
import { Separator } from '#/components/editor/tiptap-ui-primitive/separator'
import { cn } from '#/lib/tiptap-utils'
import { buttonGroupVariants } from './button-group-variants'

function ButtonGroup({
	className,
	orientation,
	...props
}: React.ComponentProps<'fieldset'> & VariantProps<typeof buttonGroupVariants>) {
	return (
		<fieldset
			data-slot='tiptap-button-group'
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
					'flex h-8 items-center px-2 text-muted-foreground text-sm',
					className,
				),
			},
			props,
		),
		render,
		state: { slot: 'tiptap-button-group-text' },
	})
}

function ButtonGroupSeparator({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			data-slot='tiptap-button-group-separator'
			orientation={orientation}
			className={cn('mx-1', className)}
			{...props}
		/>
	)
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText }

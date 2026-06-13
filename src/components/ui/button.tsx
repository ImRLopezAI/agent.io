'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

function Button({
	className,
	variant = 'default',
	size = 'default',
	render,
	nativeButton,
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot='button'
			className={cn(buttonVariants({ variant, size, className }))}
			nativeButton={nativeButton ?? render === undefined}
			render={render}
			{...props}
		/>
	)
}

export { Button }

'use client'

import { forwardRef } from 'react'
import { cn } from '#/lib/tiptap-utils'

const Card = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'rounded-lg border border-border bg-popover text-popover-foreground shadow-lg',
					className,
				)}
				{...props}
			/>
		)
	},
)
Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'flex items-center gap-2 border-border border-b p-2',
					className,
				)}
				{...props}
			/>
		)
	},
)
CardHeader.displayName = 'CardHeader'

const CardBody = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, ...props }, ref) => {
		return <div ref={ref} className={cn('p-2', className)} {...props} />
	},
)
CardBody.displayName = 'CardBody'

const CardItemGroup = forwardRef<
	HTMLDivElement,
	React.ComponentProps<'div'> & {
		orientation?: 'horizontal' | 'vertical'
	}
>(({ className, orientation = 'vertical', ...props }, ref) => {
	return (
		<div
			ref={ref}
			data-orientation={orientation}
			className={cn(
				'flex gap-1 data-[orientation=vertical]:flex-col data-[orientation=horizontal]:items-center',
				className,
			)}
			{...props}
		/>
	)
})
CardItemGroup.displayName = 'CardItemGroup'

const CardGroupLabel = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'px-2 py-1 font-semibold text-[0.6875rem] text-muted-foreground uppercase tracking-[0.12em]',
					className,
				)}
				{...props}
			/>
		)
	},
)
CardGroupLabel.displayName = 'CardGroupLabel'

const CardFooter = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'flex items-center justify-end gap-2 border-border border-t p-2',
					className,
				)}
				{...props}
			/>
		)
	},
)
CardFooter.displayName = 'CardFooter'

export { Card, CardBody, CardFooter, CardGroupLabel, CardHeader, CardItemGroup }

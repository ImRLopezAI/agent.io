'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import * as React from 'react'

import { cn } from '@/lib/utils'

type AnchorElement = Element | null
type VirtualAnchor = { current: AnchorElement }

type AnchorContextValue = {
	anchor: AnchorElement | VirtualAnchor | undefined
	setAnchor: (anchor: AnchorElement | VirtualAnchor | undefined) => void
}

const PopoverAnchorContext = React.createContext<AnchorContextValue | null>(
	null,
)

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	const [anchor, setAnchor] = React.useState<
		AnchorElement | VirtualAnchor | undefined
	>(undefined)
	const value = React.useMemo<AnchorContextValue>(
		() => ({ anchor, setAnchor }),
		[anchor],
	)
	return (
		<PopoverAnchorContext.Provider value={value}>
			<PopoverPrimitive.Root data-slot='popover' {...props} />
		</PopoverAnchorContext.Provider>
	)
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger data-slot='popover-trigger' {...props} />
}

type PopoverAnchorProps = {
	children?: React.ReactNode
	virtualRef?: VirtualAnchor
	render?: React.ReactElement
	asChild?: boolean
	className?: string
	style?: React.CSSProperties
}

function PopoverAnchor({ children, virtualRef, render }: PopoverAnchorProps) {
	const ctx = React.useContext(PopoverAnchorContext)
	const localRef = React.useRef<HTMLElement | null>(null)

	React.useEffect(() => {
		if (!ctx) return
		if (virtualRef) {
			ctx.setAnchor(virtualRef)
		} else if (localRef.current) {
			ctx.setAnchor(localRef.current)
		}
		return () => ctx.setAnchor(undefined)
	}, [ctx, virtualRef])

	if (render) {
		return React.cloneElement(render, {
			ref: (node: HTMLElement | null) => {
				localRef.current = node
				if (ctx && node) ctx.setAnchor(node)
			},
		} as React.RefAttributes<HTMLElement>)
	}

	if (!children) return null

	return (
		<span
			data-slot='popover-anchor'
			ref={(node) => {
				localRef.current = node
				if (ctx && node) ctx.setAnchor(node)
			}}
		>
			{children}
		</span>
	)
}

type RadixPopoverContentExtras = {
	onCloseAutoFocus?: (event: Event) => void
	onOpenAutoFocus?: (event: Event) => void
	onEscapeKeyDown?: (event: KeyboardEvent) => void
}

function PopoverContent({
	className,
	align = 'center',
	alignOffset = 0,
	side = 'bottom',
	sideOffset = 4,
	anchor,
	collisionAvoidance,
	collisionPadding,
	positionMethod,
	onCloseAutoFocus: _onCloseAutoFocus,
	onOpenAutoFocus: _onOpenAutoFocus,
	onEscapeKeyDown: _onEscapeKeyDown,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<
		PopoverPrimitive.Positioner.Props,
		| 'align'
		| 'alignOffset'
		| 'side'
		| 'sideOffset'
		| 'anchor'
		| 'collisionAvoidance'
		| 'collisionPadding'
		| 'positionMethod'
	> &
	RadixPopoverContentExtras) {
	const ctx = React.useContext(PopoverAnchorContext)
	const resolvedAnchor = anchor ?? ctx?.anchor

	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				anchor={resolvedAnchor}
				collisionAvoidance={collisionAvoidance}
				collisionPadding={collisionPadding}
				positionMethod={positionMethod}
				side={side}
				sideOffset={sideOffset}
				className='isolate z-50'
			>
				<PopoverPrimitive.Popup
					data-slot='popover-content'
					className={cn(
						'data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-popover-foreground text-sm shadow-md outline-hidden ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in',
						className,
					)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	)
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot='popover-header'
			className={cn('flex flex-col gap-0.5 text-sm', className)}
			{...props}
		/>
	)
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
	return (
		<PopoverPrimitive.Title
			data-slot='popover-title'
			className={cn('font-heading font-medium', className)}
			{...props}
		/>
	)
}

function PopoverDescription({
	className,
	...props
}: PopoverPrimitive.Description.Props) {
	return (
		<PopoverPrimitive.Description
			data-slot='popover-description'
			className={cn('text-muted-foreground', className)}
			{...props}
		/>
	)
}

export {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
}

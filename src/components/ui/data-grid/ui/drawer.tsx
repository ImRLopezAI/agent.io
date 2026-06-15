'use client'

import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import type * as React from 'react'
import { createContext, useContext } from 'react'

import { cn } from '#/lib/utils'

type DrawerDirection = 'top' | 'right' | 'bottom' | 'left'

const DrawerDirectionContext = createContext<DrawerDirection>('bottom')

function Drawer({
	direction = 'bottom',
	...props
}: DrawerPrimitive.Root.Props & {
	direction?: DrawerDirection
}) {
	return (
		<DrawerDirectionContext.Provider value={direction}>
			<DrawerPrimitive.Root
				data-slot='drawer'
				swipeDirection={directionToSwipeDirection(direction)}
				{...props}
			/>
		</DrawerDirectionContext.Provider>
	)
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
	return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...props} />
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
	return <DrawerPrimitive.Portal data-slot='drawer-portal' {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
	return <DrawerPrimitive.Close data-slot='drawer-close' {...props} />
}

function DrawerOverlay({
	className,
	...props
}: DrawerPrimitive.Backdrop.Props) {
	return (
		<DrawerPrimitive.Backdrop
			data-slot='drawer-overlay'
			className={cn(
				'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 min-h-dvh bg-black/10 opacity-[calc(1-var(--drawer-swipe-progress))] duration-200 data-closed:animate-out data-open:animate-in data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute supports-backdrop-filter:backdrop-blur-xs',
				className,
			)}
			{...props}
		/>
	)
}

function DrawerContent({
	className,
	children,
	direction: directionProp,
	...props
}: DrawerPrimitive.Popup.Props & {
	direction?: DrawerDirection
}) {
	const contextDirection = useContext(DrawerDirectionContext)
	const direction = directionProp ?? contextDirection

	return (
		<DrawerPortal data-slot='drawer-portal'>
			<DrawerOverlay />
			<DrawerPrimitive.Viewport
				data-slot='drawer-viewport'
				className={cn(
					'fixed inset-0 flex',
					direction === 'bottom' && 'items-end justify-center',
					direction === 'top' && 'items-start justify-center',
					direction === 'left' && 'items-stretch justify-start',
					direction === 'right' && 'items-stretch justify-end',
				)}
			>
				<DrawerPrimitive.Popup
					data-slot='drawer-content'
					data-direction={direction}
					className={cn(
						'group/drawer-content flex min-h-0 flex-col bg-background text-sm outline-none ring-1 ring-foreground/10 transition-transform duration-200 ease-out data-swiping:select-none data-ending-style:duration-200 data-swiping:duration-0',
						direction === 'bottom' &&
							'transform-[translateY(var(--drawer-swipe-movement-y))] max-h-[calc(86dvh+2rem)] w-full rounded-t-xl border-t pb-[calc(env(safe-area-inset-bottom,0)+2rem)] data-ending-style:translate-y-full data-starting-style:translate-y-full',
						direction === 'top' &&
							'transform-[translateY(var(--drawer-swipe-movement-y))] max-h-[calc(86dvh+2rem)] w-full rounded-b-xl border-b pt-[env(safe-area-inset-top,0px)] data-ending-style:-translate-y-full data-starting-style:-translate-y-full',
						direction === 'left' &&
							'transform-[translateX(var(--drawer-swipe-movement-x))] h-dvh w-[min(28rem,calc(100vw-3rem))] rounded-r-xl border-r data-ending-style:-translate-x-full data-starting-style:-translate-x-full',
						direction === 'right' &&
							'transform-[translateX(var(--drawer-swipe-movement-x))] h-dvh w-[min(28rem,calc(100vw-3rem))] rounded-l-xl border-l data-ending-style:translate-x-full data-starting-style:translate-x-full',
						className,
					)}
					{...props}
				>
					<div className='mx-auto mt-3 hidden h-1 w-12 shrink-0 rounded-full bg-muted group-data-[direction=bottom]/drawer-content:block' />
					<DrawerPrimitive.Content
						data-slot='drawer-inner'
						className='flex min-h-0 flex-1 flex-col'
					>
						{children}
					</DrawerPrimitive.Content>
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</DrawerPortal>
	)
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot='drawer-header'
			className={cn(
				'flex flex-col gap-0.5 p-4 group-data-[direction=bottom]/drawer-content:text-center group-data-[direction=top]/drawer-content:text-center md:text-left',
				className,
			)}
			{...props}
		/>
	)
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot='drawer-footer'
			className={cn('mt-auto flex flex-col gap-2 p-4', className)}
			{...props}
		/>
	)
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
	return (
		<DrawerPrimitive.Title
			data-slot='drawer-title'
			className={cn(
				'font-heading font-medium text-base text-foreground',
				className,
			)}
			{...props}
		/>
	)
}

function DrawerDescription({
	className,
	...props
}: DrawerPrimitive.Description.Props) {
	return (
		<DrawerPrimitive.Description
			data-slot='drawer-description'
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	)
}

function directionToSwipeDirection(direction: DrawerDirection) {
	return direction === 'bottom'
		? 'down'
		: direction === 'top'
			? 'up'
			: direction
}

export {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
	DrawerTrigger,
}

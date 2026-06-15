'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import {
	atom,
	createStore,
	Provider,
	useAtom,
	useAtomValue,
	useSetAtom,
} from 'jotai'
import { CopyIcon, Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
	DrawerTrigger,
} from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const responsiveDialogContentVariants = cva(
	'flex min-h-0 flex-col overflow-hidden bg-background text-foreground',
	{
		variants: {
			size: {
				sm: 'sm:max-w-md',
				md: 'sm:max-w-2xl',
				lg: 'sm:max-w-4xl',
				xl: 'sm:max-w-5xl',
				full: 'sm:max-w-[calc(100vw-2rem)]',
			},
			tone: {
				default: 'bg-background',
				composer: 'bg-card',
				panel: 'bg-background',
			},
		},
		defaultVariants: {
			size: 'lg',
			tone: 'default',
		},
	},
)

const responsiveDialogBodyVariants = cva('min-h-0 flex-1 overflow-y-auto', {
	variants: {
		padding: {
			none: '',
			sm: 'p-3',
			md: 'p-4',
			lg: 'p-6',
		},
	},
	defaultVariants: {
		padding: 'md',
	},
})

type ResponsiveDialogRuntimeState = {
	defaultExpanded: boolean
	defaultOpen?: boolean
	expanded: boolean
	isMobile: boolean
	modal?: boolean
	open?: boolean
}

type ResponsiveDialogStore = ReturnType<typeof createStore>

const responsiveDialogRuntimeAtom = atom<ResponsiveDialogRuntimeState>({
	defaultExpanded: false,
	expanded: false,
	isMobile: false,
	open: false,
})

const responsiveDialogOpenAtom = atom(
	(get) => get(responsiveDialogRuntimeAtom).open,
	(get, set, nextOpen: boolean) => {
		const state = get(responsiveDialogRuntimeAtom)

		set(responsiveDialogRuntimeAtom, {
			...state,
			open: nextOpen,
			expanded: nextOpen ? state.defaultExpanded : false,
		})
	},
)

const responsiveDialogExpandedAtom = atom(
	(get) => get(responsiveDialogRuntimeAtom).expanded,
	(
		get,
		set,
		nextExpanded: boolean | ((currentExpanded: boolean) => boolean),
	) => {
		const state = get(responsiveDialogRuntimeAtom)
		const expanded =
			typeof nextExpanded === 'function'
				? nextExpanded(state.expanded)
				: nextExpanded

		set(responsiveDialogRuntimeAtom, {
			...state,
			expanded,
		})
	},
)

type ResponsiveDialogHandle = {
	close: () => void
	expand: () => void
	open: () => void
	restore: () => void
	setExpanded: (expanded: boolean) => void
	setOpen: (open: boolean) => void
	toggle: () => void
	toggleExpanded: () => void
}

type ResponsiveDialogRootProps = {
	children: React.ReactNode
	defaultExpanded?: boolean
	defaultOpen?: boolean
	modal?: boolean
	onOpenChange?: (open: boolean) => void
	open?: boolean
	ref?: React.Ref<ResponsiveDialogHandle>
}

function ResponsiveDialogRoot({
	children,
	defaultExpanded = false,
	defaultOpen,
	modal,
	onOpenChange,
	open,
	ref,
}: ResponsiveDialogRootProps) {
	const isMobile = useIsMobile()
	const dialogStoreRef = React.useRef<ResponsiveDialogStore>(undefined)
	const runtimeKey = `${isMobile}:${defaultExpanded}:${defaultOpen ?? ''}:${modal ?? ''}:${open ?? ''}`
	const runtimeKeyRef = React.useRef<string>(undefined)

	if (!dialogStoreRef.current || runtimeKeyRef.current !== runtimeKey) {
		const previousRuntime = dialogStoreRef.current?.get(
			responsiveDialogRuntimeAtom,
		)
		const store = createStore()
		const nextOpen = open ?? previousRuntime?.open ?? defaultOpen ?? false

		store.set(responsiveDialogRuntimeAtom, {
			defaultExpanded,
			defaultOpen,
			expanded: nextOpen
				? (previousRuntime?.expanded ?? defaultExpanded)
				: false,
			isMobile,
			modal,
			open: nextOpen,
		})

		dialogStoreRef.current = store
		runtimeKeyRef.current = runtimeKey
	}

	const dialogStore = dialogStoreRef.current
	const runtime = useAtomValue(responsiveDialogRuntimeAtom, {
		store: dialogStore,
	})
	const setAtomOpen = useSetAtom(responsiveDialogOpenAtom, {
		store: dialogStore,
	})
	const setExpanded = useSetAtom(responsiveDialogExpandedAtom, {
		store: dialogStore,
	})
	const setOpen = React.useCallback(
		(nextOpen: boolean) => {
			setAtomOpen(nextOpen)
			onOpenChange?.(nextOpen)
		},
		[onOpenChange, setAtomOpen],
	)

	React.useImperativeHandle(
		ref,
		() => ({
			close: () => setOpen(false),
			expand: () => setExpanded(true),
			open: () => setOpen(true),
			restore: () => setExpanded(false),
			setExpanded,
			setOpen,
			toggle: () => setOpen(!dialogStore.get(responsiveDialogRuntimeAtom).open),
			toggleExpanded: () => setExpanded((current) => !current),
		}),
		[ref, dialogStore, setExpanded, setOpen],
	)

	const primitiveProps = {
		defaultOpen: runtime.defaultOpen,
		modal: runtime.modal,
		onOpenChange: setOpen,
		open: runtime.open,
	}

	return (
		<Provider store={dialogStore}>
			{runtime.isMobile ? (
				<Drawer direction='bottom' {...primitiveProps}>
					{children}
				</Drawer>
			) : (
				<Dialog {...primitiveProps}>{children}</Dialog>
			)}
		</Provider>
	)
}

type ResponsiveDialogTriggerProps = {
	children: React.ReactElement
}

function ResponsiveDialogTrigger({ children }: ResponsiveDialogTriggerProps) {
	const { isMobile } = useAtomValue(responsiveDialogRuntimeAtom)

	return isMobile ? (
		<DrawerTrigger render={children} />
	) : (
		<DialogTrigger render={children} />
	)
}

type ResponsiveDialogContentProps = React.ComponentProps<'div'> &
	VariantProps<typeof responsiveDialogContentVariants> & {
		showCloseButton?: boolean
	}

function ResponsiveDialogContent({
	children,
	className,
	showCloseButton = false,
	size,
	tone,
	...props
}: ResponsiveDialogContentProps) {
	const { expanded, isMobile } = useAtomValue(responsiveDialogRuntimeAtom)
	const contentClassName = cn(
		responsiveDialogContentVariants({ size, tone }),
		isMobile
			? 'max-h-[calc(92dvh+2rem)] w-full rounded-t-2xl'
			: 'max-h-[88vh] rounded-2xl p-0 data-[expanded=true]:h-[calc(100dvh-2rem)] data-[expanded=true]:max-h-[calc(100dvh-2rem)] data-[expanded=true]:sm:max-w-[calc(100vw-2rem)]',
		className,
	)

	if (isMobile) {
		return (
			<DrawerContent className={contentClassName} {...props}>
				{children}
			</DrawerContent>
		)
	}

	return (
		<DialogContent
			showCloseButton={showCloseButton}
			data-expanded={expanded ? 'true' : undefined}
			className={contentClassName}
			{...props}
		>
			{children}
		</DialogContent>
	)
}

function ResponsiveDialogHeader({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<header
			data-slot='responsive-dialog-header'
			className={cn(
				'flex shrink-0 items-center justify-between gap-4 border-border/60 border-b px-4 py-3 sm:px-6 sm:py-4',
				className,
			)}
			{...props}
		/>
	)
}

function ResponsiveDialogHeading({
	children,
	className,
	icon,
	meta,
	...props
}: React.ComponentProps<'div'> & {
	icon?: React.ReactNode
	meta?: React.ReactNode
}) {
	return (
		<div
			className={cn('flex min-w-0 items-center gap-3', className)}
			{...props}
		>
			{icon && (
				<span className='flex size-8 shrink-0 items-center justify-center rounded-lg text-primary'>
					{icon}
				</span>
			)}
			<div className='flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3'>
				{children}
				{meta}
			</div>
		</div>
	)
}

function ResponsiveDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogTitle>) {
	const { isMobile } = useAtomValue(responsiveDialogRuntimeAtom)
	const Comp = isMobile ? DrawerTitle : DialogTitle

	return (
		<Comp
			className={cn(
				'font-heading font-semibold text-lg leading-tight',
				className,
			)}
			{...props}
		/>
	)
}

function ResponsiveDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogDescription>) {
	const { isMobile } = useAtomValue(responsiveDialogRuntimeAtom)
	const Comp = isMobile ? DrawerDescription : DialogDescription

	return (
		<Comp
			className={cn('text-muted-foreground text-sm leading-snug', className)}
			{...props}
		/>
	)
}

type ResponsiveDialogBodyProps = React.ComponentProps<'div'> &
	VariantProps<typeof responsiveDialogBodyVariants>

function ResponsiveDialogBody({
	className,
	padding,
	...props
}: ResponsiveDialogBodyProps) {
	return (
		<div
			data-slot='responsive-dialog-body'
			className={cn(responsiveDialogBodyVariants({ padding }), className)}
			{...props}
		/>
	)
}

function ResponsiveDialogFooter({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<footer
			data-slot='responsive-dialog-footer'
			className={cn(
				'flex shrink-0 flex-col gap-3 border-border/60 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4',
				className,
			)}
			{...props}
		/>
	)
}

function ResponsiveDialogActions({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot='responsive-dialog-actions'
			className={cn('flex shrink-0 items-center gap-1', className)}
			{...props}
		/>
	)
}

type ResponsiveDialogActionButtonProps = React.ComponentProps<typeof Button>

function ResponsiveDialogActionButton({
	className,
	size = 'icon-sm',
	variant = 'ghost',
	...props
}: ResponsiveDialogActionButtonProps) {
	return (
		<Button
			size={size}
			variant={variant}
			className={cn('text-muted-foreground', className)}
			{...props}
		/>
	)
}

type ResponsiveDialogLinkActionProps = Omit<
	ResponsiveDialogActionButtonProps,
	'children'
> & {
	copyValue?: string
}

function ResponsiveDialogLinkAction({
	copyValue,
	onClick,
	...props
}: ResponsiveDialogLinkActionProps) {
	return (
		<ResponsiveDialogActionButton
			aria-label='Copy link'
			onClick={(event) => {
				onClick?.(event)
				if (event.defaultPrevented) return
				const value =
					copyValue ??
					(typeof window === 'undefined' ? '' : window.location.href)
				void navigator.clipboard?.writeText(value)
			}}
			{...props}
		>
			<CopyIcon />
		</ResponsiveDialogActionButton>
	)
}

function ResponsiveDialogExpandAction(
	props: ResponsiveDialogActionButtonProps,
) {
	const [expanded, setExpanded] = useAtom(responsiveDialogExpandedAtom)
	const Icon = expanded ? Minimize2Icon : Maximize2Icon

	return (
		<ResponsiveDialogActionButton
			aria-label={expanded ? 'Restore' : 'Expand'}
			aria-pressed={expanded}
			onClick={() => setExpanded((current) => !current)}
			{...props}
		>
			<Icon />
		</ResponsiveDialogActionButton>
	)
}

function ResponsiveDialogCloseAction(props: ResponsiveDialogActionButtonProps) {
	const { isMobile } = useAtomValue(responsiveDialogRuntimeAtom)
	const closeButton = (
		<ResponsiveDialogActionButton
			aria-label={props['aria-label'] ?? 'Close'}
			{...props}
		>
			{props.children ?? <XIcon />}
		</ResponsiveDialogActionButton>
	)

	return isMobile ? (
		<DrawerClose render={closeButton} />
	) : (
		<DialogClose render={closeButton} />
	)
}

export const ResponsiveDialog = {
	Root: ResponsiveDialogRoot,
	Trigger: ResponsiveDialogTrigger,
	Content: ResponsiveDialogContent,
	Header: ResponsiveDialogHeader,
	Heading: ResponsiveDialogHeading,
	Title: ResponsiveDialogTitle,
	Description: ResponsiveDialogDescription,
	Body: ResponsiveDialogBody,
	Footer: ResponsiveDialogFooter,
	Actions: ResponsiveDialogActions,
	ActionButton: ResponsiveDialogActionButton,
	LinkAction: ResponsiveDialogLinkAction,
	ExpandAction: ResponsiveDialogExpandAction,
	CloseAction: ResponsiveDialogCloseAction,
}

export {
	ResponsiveDialogActionButton,
	ResponsiveDialogActions,
	ResponsiveDialogBody,
	ResponsiveDialogCloseAction,
	ResponsiveDialogContent,
	ResponsiveDialogDescription,
	ResponsiveDialogExpandAction,
	ResponsiveDialogFooter,
	type ResponsiveDialogHandle,
	ResponsiveDialogHeader,
	ResponsiveDialogHeading,
	ResponsiveDialogLinkAction,
	ResponsiveDialogRoot,
	type ResponsiveDialogRuntimeState,
	ResponsiveDialogTitle,
	ResponsiveDialogTrigger,
	responsiveDialogContentVariants,
	responsiveDialogExpandedAtom,
	responsiveDialogOpenAtom,
	responsiveDialogRuntimeAtom,
}

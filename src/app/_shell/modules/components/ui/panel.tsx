'use client'

import { useHotkey } from '@tanstack/react-hotkeys'
import { cva, type VariantProps } from 'class-variance-authority'
import { atom, useAtom } from 'jotai'
import type * as React from 'react'
import {
	createContext,
	type Ref,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
} from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from '@/components/ui/resizable'
import { cn } from '@/lib/utils'

const panelGroupVariants = cva('min-h-0 w-full items-stretch', {
	variants: {
		layout: {
			mainRail: 'min-h-[640px] gap-6',
			inbox: 'min-h-[620px] gap-0',
			compact: 'min-h-[520px] gap-4',
			fill: 'h-full gap-4',
		},
		framing: {
			flat: '',
			surface: 'overflow-hidden rounded-lg border border-border bg-background',
		},
	},
	defaultVariants: {
		layout: 'mainRail',
		framing: 'flat',
	},
})

const paneVariants = cva('flex h-full min-h-0 min-w-0 flex-col', {
	variants: {
		surface: {
			plain: '',
			section: 'gap-4',
			rail: 'gap-5 border-border border-l pl-4',
			surface: 'gap-4 rounded-lg border border-border bg-card p-4',
			coach: 'gap-3 rounded-lg bg-primary p-4 text-primary-foreground',
		},
		scroll: {
			none: '',
			y: 'overflow-y-auto',
			hidden: 'overflow-hidden',
		},
	},
	defaultVariants: {
		surface: 'plain',
		scroll: 'none',
	},
})

const sectionVariants = cva('flex min-w-0 flex-col', {
	variants: {
		density: {
			compact: 'gap-2.5',
			default: 'gap-3',
			relaxed: 'gap-4',
		},
		rule: {
			none: '',
			top: 'border-border border-t pt-4',
			bottom: 'border-border border-b pb-4',
		},
	},
	defaultVariants: {
		density: 'default',
		rule: 'none',
	},
})

type PanelSizePreset = keyof typeof PANEL_SIZE_PRESETS

type RegisteredPane = {
	id: symbol
	handle: PanelImperativeHandle | null
}

type PanelContextValue = {
	registerPane: (id: symbol, handle: PanelImperativeHandle | null) => void
	unregisterPane: (id: symbol) => void
}

type PanelCollapsedState = {
	left?: boolean
	right?: boolean
}

const panelCollapsedStateAtom = atom<Record<string, PanelCollapsedState>>({})
const activePanelGroupAtom = atom<string | null>(null)

const PanelContext = createContext<PanelContextValue | null>(null)

function togglePanel(handle: PanelImperativeHandle | null | undefined) {
	if (!handle) return
	if (handle.isCollapsed()) {
		handle.expand()
		return
	}
	handle.collapse()
}

type PanelGroupProps = React.ComponentProps<typeof ResizablePanelGroup> &
	VariantProps<typeof panelGroupVariants> & {
		hotkeyScope?: string
		hotkeys?: boolean
	}

function PanelGroup({
	children,
	className,
	hotkeyScope,
	hotkeys = true,
	layout,
	framing,
	onFocusCapture,
	onPointerDown,
	onPointerEnter,
	orientation = 'horizontal',
	...props
}: PanelGroupProps) {
	const panesRef = useRef<RegisteredPane[]>([])
	const generatedHotkeyScope = useId()
	const groupHotkeyScope = hotkeyScope ?? generatedHotkeyScope
	const [collapsedStateByGroup, setCollapsedStateByGroup] = useAtom(
		panelCollapsedStateAtom,
	)
	const [activeGroup, setActiveGroup] = useAtom(activePanelGroupAtom)
	const collapsedState = collapsedStateByGroup[groupHotkeyScope] ?? {}
	const isActiveGroup = activeGroup === groupHotkeyScope

	useEffect(() => {
		setActiveGroup((current) => current ?? groupHotkeyScope)
		return () => {
			setActiveGroup((current) =>
				current === groupHotkeyScope ? null : current,
			)
		}
	}, [groupHotkeyScope, setActiveGroup])

	const registerPane = useCallback(
		(id: symbol, handle: PanelImperativeHandle | null) => {
			const existingPane = panesRef.current.find((pane) => pane.id === id)

			if (existingPane) {
				existingPane.handle = handle
				return
			}

			panesRef.current = [...panesRef.current, { id, handle }]
		},
		[],
	)

	const unregisterPane = useCallback((id: symbol) => {
		panesRef.current = panesRef.current.filter((pane) => pane.id !== id)
	}, [])

	const contextValue = useMemo<PanelContextValue>(
		() => ({ registerPane, unregisterPane }),
		[registerPane, unregisterPane],
	)

	const setPaneCollapsedState = useCallback(
		(edge: keyof PanelCollapsedState, collapsed: boolean) => {
			setCollapsedStateByGroup((state) => ({
				...state,
				[groupHotkeyScope]: {
					...state[groupHotkeyScope],
					[edge]: collapsed,
				},
			}))
		},
		[groupHotkeyScope, setCollapsedStateByGroup],
	)

	const togglePane = useCallback(
		(edge: keyof PanelCollapsedState, requireThreePanes = false) => {
			if (!hotkeys || !isActiveGroup || orientation !== 'horizontal') return

			const panes = panesRef.current.filter((pane) => pane.handle)
			if (requireThreePanes && panes.length < 3) return

			const handle = edge === 'left' ? panes[0]?.handle : panes.at(-1)?.handle
			if (!handle) return

			const nextCollapsed = !handle.isCollapsed()
			togglePanel(handle)
			setPaneCollapsedState(edge, nextCollapsed)
		},
		[hotkeys, isActiveGroup, orientation, setPaneCollapsedState],
	)

	useHotkey(']', () => togglePane('right'), {
		enabled: hotkeys && isActiveGroup,
		conflictBehavior: 'allow',
		preventDefault: true,
		meta: {
			name: 'Toggle right panel',
			description: 'Collapse or expand the right panel in the active workspace',
			group: 'Navigation',
		},
	})

	useHotkey('Shift+[' as never, () => togglePane('left', true), {
		enabled: hotkeys && isActiveGroup,
		conflictBehavior: 'allow',
		preventDefault: true,
		meta: {
			name: 'Toggle left panel',
			description: 'Collapse or expand the left panel in three-pane layouts',
			group: 'Navigation',
		},
	})

	useHotkey('Shift+]' as never, () => togglePane('right', true), {
		enabled: hotkeys && isActiveGroup,
		conflictBehavior: 'allow',
		preventDefault: true,
		meta: {
			name: 'Toggle right panel',
			description: 'Collapse or expand the right panel in three-pane layouts',
			group: 'Navigation',
		},
	})

	return (
		<PanelContext.Provider value={contextValue}>
			<ResizablePanelGroup
				orientation={orientation}
				className={cn(panelGroupVariants({ layout, framing }), className)}
				data-left-pane-collapsed={collapsedState.left ? '' : undefined}
				data-right-pane-collapsed={collapsedState.right ? '' : undefined}
				onFocusCapture={(event) => {
					setActiveGroup(groupHotkeyScope)
					onFocusCapture?.(event)
				}}
				onPointerDown={(event) => {
					setActiveGroup(groupHotkeyScope)
					onPointerDown?.(event)
				}}
				onPointerEnter={(event) => {
					setActiveGroup(groupHotkeyScope)
					onPointerEnter?.(event)
				}}
				{...props}
			>
				{children}
			</ResizablePanelGroup>
		</PanelContext.Provider>
	)
}

type PaneProps = React.ComponentProps<typeof ResizablePanel> &
	VariantProps<typeof paneVariants> & {
		size?: keyof ReturnType<typeof PANEL_SIZE_PRESETS>
	}

function PanePrimitive({
	children,
	className,
	panelRef,
	size = 'main',
	surface,
	scroll,
	...props
}: PaneProps) {
	const preset = PANEL_SIZE_PRESETS()[size]
	const paneIdRef = useRef(Symbol('pane'))
	const panelContext = useContext(PanelContext)

	const setPanelRef = useCallback(
		(handle: PanelImperativeHandle | null) => {
			if (typeof panelRef === 'function') {
				panelRef(handle)
			} else if (panelRef) {
				;(
					panelRef as React.MutableRefObject<PanelImperativeHandle | null>
				).current = handle
			}

			panelContext?.registerPane(paneIdRef.current, handle)
		},
		[panelContext, panelRef],
	)

	useEffect(
		() => () => {
			panelContext?.unregisterPane(paneIdRef.current)
		},
		[panelContext],
	)

	return (
		<ResizablePanel
			collapsible
			collapsedSize={0}
			{...preset}
			{...props}
			panelRef={setPanelRef as Ref<PanelImperativeHandle | null>}
		>
			<div className={cn(paneVariants({ surface, scroll }), className)}>
				{children}
			</div>
		</ResizablePanel>
	)
}

type PaneVariantProps = Omit<PaneProps, 'size'>

function MainPane(props: PaneVariantProps) {
	return <PanePrimitive size='main' {...props} />
}

function RailPane(props: PaneVariantProps) {
	return <PanePrimitive size='rail' surface='rail' {...props} />
}

function ListPane(props: PaneVariantProps) {
	return <PanePrimitive size='list' {...props} />
}

function DetailPane(props: PaneVariantProps) {
	return <PanePrimitive size='detail' {...props} />
}

type PanelHandleProps = Omit<
	React.ComponentProps<typeof ResizableHandle>,
	'withHandle'
> & {
	label?: string
}

function PanelHandle({
	className,
	label = 'Drag to resize. Double click to collapse.',
	...props
}: PanelHandleProps) {
	return (
		<ResizableHandle
			aria-label={label}
			title={label}
			className={className}
			{...props}
			withHandle
		/>
	)
}

type PanelSectionProps = React.ComponentProps<'section'> &
	VariantProps<typeof sectionVariants>

function PanelSection({
	className,
	density,
	rule,
	...props
}: PanelSectionProps) {
	return (
		<section
			className={cn(sectionVariants({ density, rule }), className)}
			{...props}
		/>
	)
}

function PanelEyebrow({ className, ...props }: React.ComponentProps<'h3'>) {
	return (
		<h3
			className={cn(
				'font-caption font-semibold text-[11px] text-muted-foreground/70 tracking-[1.5px]',
				className,
			)}
			{...props}
		/>
	)
}

function PanelStack({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div className={cn('flex min-w-0 flex-col gap-4', className)} {...props} />
	)
}

export const Panel = {
	Group: PanelGroup,
	Pane: PanePrimitive,
	Main: MainPane,
	Rail: RailPane,
	List: ListPane,
	Detail: DetailPane,
	Handle: PanelHandle,
	Section: PanelSection,
	Eyebrow: PanelEyebrow,
	Stack: PanelStack,
}

export {
	DetailPane,
	ListPane,
	MainPane,
	PanelEyebrow,
	PanelGroup,
	PanelHandle,
	PanelSection,
	PanelStack,
	PanePrimitive,
	panelGroupVariants,
	paneVariants,
	RailPane,
	sectionVariants,
}

function PANEL_SIZE_PRESETS() {
	return {
		main: {
			defaultSize: 66,
			minSize: 45,
		},
		balancedMain: {
			defaultSize: 64,
			minSize: 45,
		},
		focusMain: {
			defaultSize: 62,
			minSize: 45,
		},
		indexMain: {
			defaultSize: 75,
			minSize: 58,
		},
		wideMain: {
			defaultSize: 72,
			minSize: 52,
		},
		forecastMain: {
			defaultSize: 68,
			minSize: 48,
		},
		messageMain: {
			defaultSize: 70,
			minSize: 48,
		},
		rail: {
			defaultSize: 34,
			minSize: 24,
			collapsible: true,
			collapsedSize: 0,
		},
		balancedRail: {
			defaultSize: 36,
			minSize: 26,
			collapsible: true,
			collapsedSize: 0,
		},
		focusRail: {
			defaultSize: 38,
			minSize: 28,
			collapsible: true,
			collapsedSize: 0,
		},
		forecastRail: {
			defaultSize: 32,
			minSize: 24,
			collapsible: true,
			collapsedSize: 0,
		},
		indexRail: {
			defaultSize: 25,
			minSize: 20,
			collapsible: true,
			collapsedSize: 0,
		},
		narrowRail: {
			defaultSize: 28,
			minSize: 20,
			collapsible: true,
			collapsedSize: 0,
		},
		wideRail: {
			defaultSize: 30,
			minSize: 22,
			collapsible: true,
			collapsedSize: 0,
		},
		list: {
			defaultSize: 28,
			minSize: 22,
			collapsible: true,
			collapsedSize: 0,
		},
		inboxList: {
			defaultSize: 30,
			minSize: 24,
			collapsible: true,
			collapsedSize: 0,
		},
		detail: {
			defaultSize: 46,
			minSize: 34,
		},
		messageDetail: {
			defaultSize: 45,
			minSize: 32,
		},
	} as const
}
'use client'

import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { Cell } from '@tanstack/react-table'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cnfast'
import { Eye, X } from 'lucide-react'
import * as React from 'react'

/**
 * Sentinel tag identifying a `<Preview>` element returned from a column's
 * `preview` render prop. Mirrors `GRID_COLUMN_TAG` in the compound API: the
 * cell trigger validates against this symbol instead of referential equality.
 */
const PREVIEW_TAG: unique symbol = Symbol.for('sunday/grid-preview')

interface PreviewTagged {
	[PREVIEW_TAG]: true
}

/** State passed to the `render`/`footer` callbacks (useRender callback form). */
export interface DataGridPreviewState extends Record<string, unknown> {
	open: boolean
}

/**
 * Root props consumers may pass through `props.root`. The non-modal contract
 * (`modal`, `disablePointerDismissal`), the shared `handle`, and open-state
 * ownership are stripped so they cannot be overridden.
 */
export type DataGridPreviewRootProps = Omit<
	DrawerPrimitive.Root.Props,
	| 'modal'
	| 'disablePointerDismissal'
	| 'handle'
	| 'open'
	| 'defaultOpen'
	| 'triggerId'
	| 'defaultTriggerId'
	| 'children'
>

export interface DataGridPreviewSlotProps {
	root?: DataGridPreviewRootProps
	content?: useRender.ElementProps<'div'>
	trigger?: useRender.ElementProps<'button'>
	footer?: useRender.ElementProps<'div'>
}

export interface DataGridPreviewProps {
	/** Panel body. useRender semantics: element overrides the default `div`. */
	render: useRender.RenderProp<DataGridPreviewState>
	/** Trigger element. Defaults to a ghost eye icon button. */
	trigger?: DrawerPrimitive.Trigger.Props['render']
	/** Optional footer pinned below the body. */
	footer?: useRender.RenderProp<DataGridPreviewState>
	/**
	 * Header title. When omitted no header bar renders — the panel keeps a
	 * visually-hidden title and a floating close button instead.
	 */
	title?: React.ReactNode
	/** Panel width variant. Defaults to `default` (28rem). */
	size?: DataGridPreviewSize
	/** Extra props merged (mergeProps) onto each part. */
	props?: DataGridPreviewSlotProps
}

export type DataGridPreviewElement = React.ReactElement<DataGridPreviewProps>

export type DataGridPreviewComponent = ((
	props: DataGridPreviewProps,
) => React.ReactElement | null) &
	PreviewTagged

/**
 * Per-column preview renderer. Receives the row data and the grid's
 * preconfigured `Preview` component; must return a `<Preview>` element.
 */
export type DataGridPreviewRenderer<TData> = (
	row: TData,
	Preview: DataGridPreviewComponent,
) => DataGridPreviewElement | null

interface DataGridPreviewPayload {
	rowId: string
	render: useRender.RenderProp<DataGridPreviewState>
	footer?: useRender.RenderProp<DataGridPreviewState>
	title?: React.ReactNode
	size?: DataGridPreviewSize
	slotProps?: DataGridPreviewSlotProps
}

interface DataGridPreviewStoreState {
	open: boolean
	payload: DataGridPreviewPayload | null
}

function createDataGridPreviewStore() {
	let state: DataGridPreviewStoreState = { open: false, payload: null }
	const listeners = new Set<() => void>()
	const emit = () => {
		for (const listener of listeners) listener()
	}

	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot: () => state,
		setActive(payload: DataGridPreviewPayload) {
			state = { open: true, payload }
			emit()
		},
		setOpen(open: boolean) {
			if (state.open === open) return
			state = { ...state, open }
			emit()
		},
	}
}

type DataGridPreviewStore = ReturnType<typeof createDataGridPreviewStore>

export interface DataGridPreviewController {
	handle: DrawerPrimitive.Handle<DataGridPreviewPayload>
	store: DataGridPreviewStore
}

/**
 * One controller per grid: the shared drawer handle that all detached cell
 * triggers open, plus an external store tracking the active row (for
 * `data-previewed` marking and per-column root-prop application).
 */
export function useDataGridPreviewController(): DataGridPreviewController {
	const [controller] = React.useState<DataGridPreviewController>(() => ({
		handle: DrawerPrimitive.createHandle<DataGridPreviewPayload>(),
		store: createDataGridPreviewStore(),
	}))
	return controller
}

const DataGridPreviewContext =
	React.createContext<DataGridPreviewController | null>(null)

export function DataGridPreviewProvider({
	controller,
	children,
}: {
	controller: DataGridPreviewController
	children: React.ReactNode
}) {
	return (
		<DataGridPreviewContext.Provider value={controller}>
			{children}
		</DataGridPreviewContext.Provider>
	)
}

interface DataGridPreviewCellContextValue extends DataGridPreviewController {
	rowId: string
}

const DataGridPreviewCellContext =
	React.createContext<DataGridPreviewCellContextValue | null>(null)

// Once-per-process dedup for dev warnings, matching the compound walker's
// `warnedColumnTypes` pattern.
const warnedPreviewTypes = new WeakSet<object>()
const warnedPreviewStringTypes = new Set<string>()
let warnedOrphanPreview = false

function warnInvalidPreviewElement(node: unknown): void {
	if (process.env.NODE_ENV === 'production') return
	const type = React.isValidElement(node) ? node.type : node
	if (type == null) return

	if (typeof type === 'string') {
		if (warnedPreviewStringTypes.has(type)) return
		warnedPreviewStringTypes.add(type)
	} else if (typeof type === 'function' || typeof type === 'object') {
		if (warnedPreviewTypes.has(type as object)) return
		warnedPreviewTypes.add(type as object)
	} else {
		return
	}

	const name =
		typeof type === 'string'
			? type
			: ((type as { displayName?: string; name?: string }).displayName ??
				(type as { name?: string }).name ??
				'<anonymous>')
	console.warn(
		`[Grid] A column's preview render must return the <Preview> component ` +
			`it receives as its second argument. Found: ${name}`,
	)
}

function isPreviewElement(node: unknown): node is DataGridPreviewElement {
	return (
		React.isValidElement(node) &&
		typeof node.type === 'function' &&
		(node.type as Partial<PreviewTagged>)[PREVIEW_TAG] === true
	)
}

export const dataGridPreviewPopupVariants = cva(
	'transform-[translateX(var(--drawer-swipe-movement-x))] pointer-events-auto relative flex h-dvh min-h-0 flex-col rounded-l-xl border-l bg-background text-sm outline-none ring-1 ring-foreground/10 transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full data-swiping:select-none data-ending-style:duration-200 data-swiping:duration-0',
	{
		variants: {
			size: {
				sm: 'w-[min(20rem,calc(100vw-3rem))]',
				default: 'w-[min(28rem,calc(100vw-3rem))]',
				lg: 'w-[min(36rem,calc(100vw-3rem))]',
				xl: 'w-[min(48rem,calc(100vw-3rem))]',
				full: 'w-[calc(100vw-3rem)]',
			},
		},
		defaultVariants: {
			size: 'default',
		},
	},
)

export type DataGridPreviewSize = NonNullable<
	VariantProps<typeof dataGridPreviewPopupVariants>['size']
>

const DEFAULT_TRIGGER_CLASSNAME =
	'inline-flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring'

function DataGridPreviewImpl({
	render,
	trigger,
	footer,
	title,
	size,
	props: slotProps,
}: DataGridPreviewProps) {
	const cellContext = React.useContext(DataGridPreviewCellContext)
	if (!cellContext) {
		if (process.env.NODE_ENV !== 'production' && !warnedOrphanPreview) {
			warnedOrphanPreview = true
			console.warn(
				'[Grid] <Preview> can only be rendered through a column `preview` prop.',
			)
		}
		return null
	}

	const { handle, store, rowId } = cellContext
	const payload: DataGridPreviewPayload = {
		rowId,
		render,
		footer,
		title,
		size,
		slotProps,
	}

	return (
		<DrawerPrimitive.Trigger
			handle={handle}
			payload={payload}
			data-slot='grid-preview-trigger-button'
			data-grid-interactive=''
			render={trigger}
			{...mergeProps<'button'>(
				{
					'aria-label': 'Preview row',
					className: trigger ? undefined : DEFAULT_TRIGGER_CLASSNAME,
					children: trigger ? undefined : <Eye className='size-3.5' />,
					// Track the active payload ourselves (before Base UI opens) so
					// the root callback and row marking read the new row in the same
					// event, and so switching rows swaps content in place.
					onClick: () => store.setActive(payload),
				},
				(slotProps?.trigger ?? {}) as Record<string, unknown>,
			)}
		/>
	)
}

/**
 * The preconfigured `Preview` component handed to a column's `preview`
 * renderer. Renders only the detached trigger in the cell; body, footer, and
 * title travel to the grid's single shared drawer as the trigger payload.
 */
export const DataGridPreview: DataGridPreviewComponent = Object.assign(
	DataGridPreviewImpl,
	{ [PREVIEW_TAG]: true as const },
)

/**
 * Hover trigger slot rendered by the base grid row for preview-enabled
 * columns. Validates the element returned by `column.preview` (symbol tag,
 * dev warn + skip on mismatch) and marks the active row with
 * `data-previewed` while its preview is open.
 */
export function DataGridPreviewCellTrigger<TData>({
	cell,
}: {
	cell: Cell<TData, unknown>
}) {
	const controller = React.useContext(DataGridPreviewContext)
	const store = controller?.store
	const rowId = cell.row.id

	const subscribe = React.useCallback(
		(listener: () => void) => store?.subscribe(listener) ?? (() => undefined),
		[store],
	)
	const getIsActive = React.useCallback(() => {
		if (!store) return false
		const snapshot = store.getSnapshot()
		return snapshot.open && snapshot.payload?.rowId === rowId
	}, [store, rowId])
	const isActive = React.useSyncExternalStore(
		subscribe,
		getIsActive,
		getIsActive,
	)

	const wrapperRef = React.useRef<HTMLSpanElement>(null)

	// Attribute (not React state on the row) so the heavily memoized
	// DataGridRow never re-renders for preview changes; virtualization
	// remounts re-run this effect, restoring the mark on scroll-back.
	React.useEffect(() => {
		if (!isActive) return
		const rowEl = wrapperRef.current?.closest('[data-slot=grid-row]')
		if (!(rowEl instanceof HTMLElement)) return
		rowEl.setAttribute('data-previewed', '')
		return () => {
			rowEl.removeAttribute('data-previewed')
		}
	}, [isActive])

	const previewFn = cell.column.columnDef.meta?.preview
	if (!controller || !previewFn) return null

	const element = previewFn(cell.row.original, DataGridPreview)
	if (element == null) return null
	if (!isPreviewElement(element)) {
		warnInvalidPreviewElement(element)
		return null
	}

	const cellContextValue: DataGridPreviewCellContextValue = {
		...controller,
		rowId,
	}

	return (
		<span
			ref={wrapperRef}
			data-slot='grid-preview-trigger'
			data-active={isActive ? '' : undefined}
			className='absolute end-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/grid-cell:opacity-100 data-active:opacity-100'
		>
			<DataGridPreviewCellContext.Provider value={cellContextValue}>
				{element}
			</DataGridPreviewCellContext.Provider>
		</span>
	)
}

/**
 * The grid's single shared non-modal drawer. Follows the Base UI non-modal
 * recipe: `modal={false}` + `disablePointerDismissal`, no backdrop, and a
 * `pointer-events-none` viewport so the table stays fully interactive.
 */
export function DataGridPreviewRoot() {
	const controller = React.useContext(DataGridPreviewContext)
	if (!controller) {
		throw new Error(
			'DataGridPreviewRoot must be used within a DataGridPreviewProvider',
		)
	}
	return <DataGridPreviewRootInner controller={controller} />
}

function DataGridPreviewRootInner({
	controller,
}: {
	controller: DataGridPreviewController
}) {
	const { handle, store } = controller
	const snapshot = React.useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	)
	const activeRootProps = snapshot.payload?.slotProps?.root

	const onOpenChange = React.useCallback(
		(
			open: boolean,
			eventDetails: Parameters<
				NonNullable<DrawerPrimitive.Root.Props['onOpenChange']>
			>[1],
		) => {
			// Read the store imperatively: the trigger's onClick has already
			// stored the new payload, so the opening column's own callback fires
			// even on the very first open.
			store
				.getSnapshot()
				.payload?.slotProps?.root?.onOpenChange?.(open, eventDetails)
			store.setOpen(open)
		},
		[store],
	)

	return (
		<DrawerPrimitive.Root
			{...activeRootProps}
			handle={handle}
			modal={false}
			disablePointerDismissal
			swipeDirection={activeRootProps?.swipeDirection ?? 'right'}
			onOpenChange={onOpenChange}
		>
			{({ payload }) =>
				payload ? (
					<DataGridPreviewPanel payload={payload} open={snapshot.open} />
				) : null
			}
		</DrawerPrimitive.Root>
	)
}

function DataGridPreviewPanel({
	payload,
	open,
}: {
	payload: DataGridPreviewPayload
	open: boolean
}) {
	const state = React.useMemo<DataGridPreviewState>(() => ({ open }), [open])

	const body = useRender({
		render: payload.render,
		state,
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				'data-slot': 'grid-preview-content',
				className: 'flex min-h-0 flex-1 flex-col overflow-y-auto p-4',
			} as useRender.ElementProps<'div'>,
			(payload.slotProps?.content ?? {}) as Record<string, unknown>,
		),
	})

	const footer = useRender({
		render: payload.footer,
		state,
		enabled: payload.footer != null,
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				'data-slot': 'grid-preview-footer',
				className: 'mt-auto flex shrink-0 items-center gap-2 border-t p-4',
			} as useRender.ElementProps<'div'>,
			(payload.slotProps?.footer ?? {}) as Record<string, unknown>,
		),
	})

	return (
		<DrawerPrimitive.Portal data-slot='grid-preview-portal'>
			<DrawerPrimitive.Viewport
				data-slot='grid-preview-viewport'
				className='pointer-events-none fixed inset-0 z-50 flex items-stretch justify-end'
			>
				<DrawerPrimitive.Popup
					data-slot='grid-preview-popup'
					className={cn(dataGridPreviewPopupVariants({ size: payload.size }))}
				>
					{/* Swipe affordance: dragging the panel toward the edge dismisses
					    it (Base UI swipe), mirroring the bottom drawer's grab pill. */}
					<div
						data-slot='grid-preview-handle'
						className='absolute inset-y-0 start-0 z-10 flex w-4 cursor-grab touch-none items-center justify-center active:cursor-grabbing'
					>
						<div className='h-12 w-1 shrink-0 rounded-full bg-muted' />
					</div>
					{payload.title != null ? (
						<div
							data-slot='grid-preview-header'
							className='flex shrink-0 items-center justify-between gap-2 border-b p-4'
						>
							<DrawerPrimitive.Title
								data-slot='grid-preview-title'
								className='font-heading font-medium text-base text-foreground'
							>
								{payload.title}
							</DrawerPrimitive.Title>
							<DrawerPrimitive.Close
								aria-label='Close preview'
								className='inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring'
							>
								<X className='size-4' />
							</DrawerPrimitive.Close>
						</div>
					) : (
						<>
							{/* Accessible name without visible chrome; the close affordance
							    floats since pointer dismissal is disabled. */}
							<DrawerPrimitive.Title
								data-slot='grid-preview-title'
								className='sr-only'
							>
								Preview
							</DrawerPrimitive.Title>
							<DrawerPrimitive.Close
								aria-label='Close preview'
								className='absolute end-3 top-3 z-10 inline-flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring'
							>
								<X className='size-4' />
							</DrawerPrimitive.Close>
						</>
					)}
					<DrawerPrimitive.Content
						data-slot='grid-preview-inner'
						className='flex min-h-0 flex-1 flex-col'
					>
						{body}
						{footer}
					</DrawerPrimitive.Content>
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</DrawerPrimitive.Portal>
	)
}

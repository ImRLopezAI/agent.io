'use client'

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import {
	type Announcements,
	type CollisionDetection,
	closestCenter,
	closestCorners,
	DndContext,
	type DndContextProps,
	type DragCancelEvent,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	type DropAnimation,
	type DroppableContainer,
	defaultDropAnimationSideEffects,
	getFirstCollision,
	type KeyboardCoordinateGetter,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	type UniqueIdentifier,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	type AnimateLayoutChanges,
	arrayMove,
	defaultAnimateLayoutChanges,
	horizontalListSortingStrategy,
	SortableContext,
	type SortableContextProps,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { createStore, Provider, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { cn } from '@/lib/utils'

import { useComposedRefs } from './compose-refs'
import {
	useKanbanColumnHandleOptional,
	useKanbanConfig,
	useKanbanInBoard,
	useKanbanInOverlay,
	useKanbanItemHandleOptional,
} from './hooks'
import {
	KanbanBoardContext,
	type KanbanConfig,
	KanbanOverlayContext,
	type KanbanSortableHandleState,
	kanbanActiveIdAtom,
	kanbanColumnHandleAtomFamily,
	kanbanConfigAtom,
	kanbanHandleKey,
	kanbanItemHandleAtomFamily,
} from './store'
import { kanbanDirectionCodes, useKanbanHotkeys } from './use-kanban-hotkeys'

const coordinateGetter: KeyboardCoordinateGetter = (event, { context }) => {
	const { active, droppableRects, droppableContainers, collisionRect } = context

	if ((kanbanDirectionCodes as readonly string[]).includes(event.code)) {
		event.preventDefault()

		if (!active || !collisionRect) return

		const filteredContainers: DroppableContainer[] = []

		for (const entry of droppableContainers.getEnabled()) {
			if (!entry || entry?.disabled) return

			const rect = droppableRects.get(entry.id)

			if (!rect) return

			const data = entry.data.current

			if (data) {
				const { type, children } = data

				if (type === 'container' && children?.length > 0) {
					if (active.data.current?.type !== 'container') {
						return
					}
				}
			}

			switch (event.code) {
				case 'ArrowDown':
					if (collisionRect.top < rect.top) {
						filteredContainers.push(entry)
					}
					break
				case 'ArrowUp':
					if (collisionRect.top > rect.top) {
						filteredContainers.push(entry)
					}
					break
				case 'ArrowLeft':
					if (collisionRect.left >= rect.left + rect.width) {
						filteredContainers.push(entry)
					}
					break
				case 'ArrowRight':
					if (collisionRect.left + collisionRect.width <= rect.left) {
						filteredContainers.push(entry)
					}
					break
			}
		}

		const collisions = closestCorners({
			active,
			collisionRect: collisionRect,
			droppableRects,
			droppableContainers: filteredContainers,
			pointerCoordinates: null,
		})
		const closestId = getFirstCollision(collisions, 'id')

		if (closestId != null) {
			const newDroppable = droppableContainers.get(closestId)
			const newNode = newDroppable?.node.current
			const newRect = newDroppable?.rect.current

			if (newNode && newRect) {
				if (newDroppable.id === 'placeholder') {
					return {
						x: newRect.left + (newRect.width - collisionRect.width) / 2,
						y: newRect.top + (newRect.height - collisionRect.height) / 2,
					}
				}

				if (newDroppable.data.current?.type === 'container') {
					return {
						x: newRect.left + 20,
						y: newRect.top + 74,
					}
				}

				return {
					x: newRect.left,
					y: newRect.top,
				}
			}
		}
	}

	return undefined
}

const BOARD_NAME = 'KanbanBoard'
const COLUMN_NAME = 'KanbanColumn'
const COLUMN_HANDLE_NAME = 'KanbanColumnHandle'
const ITEM_NAME = 'KanbanItem'
const ITEM_HANDLE_NAME = 'KanbanItemHandle'
const OVERLAY_NAME = 'KanbanOverlay'

const KanbanColumnHandleKeyContext = React.createContext<string | null>(null)
const KanbanItemHandleKeyContext = React.createContext<string | null>(null)
const KanbanColumnHandleStateContext =
	React.createContext<KanbanSortableHandleState | null>(null)
const KanbanItemHandleStateContext =
	React.createContext<KanbanSortableHandleState | null>(null)

interface GetItemValue<T> {
	/**
	 * Callback that returns a unique identifier for each kanban item. Required for array of objects.
	 * @example getItemValue={(item) => item.id}
	 */
	getItemValue: (item: T) => UniqueIdentifier
}

type KanbanRootProps<T> = Omit<DndContextProps, 'collisionDetection'> &
	GetItemValue<T> & {
		value: Record<UniqueIdentifier, T[]>
		onValueChange?: (columns: Record<UniqueIdentifier, T[]>) => void
		onMove?: (
			event: DragEndEvent & { activeIndex: number; overIndex: number },
		) => void
		strategy?: SortableContextProps['strategy']
		orientation?: 'horizontal' | 'vertical'
		flatCursor?: boolean
	} & (T extends object ? GetItemValue<T> : Partial<GetItemValue<T>>)

function KanbanHotkeysBridge() {
	useKanbanHotkeys()
	return null
}

function KanbanRoot<T>(props: KanbanRootProps<T>) {
	const {
		value,
		onValueChange,
		modifiers,
		strategy = verticalListSortingStrategy,
		orientation = 'horizontal',
		onMove,
		getItemValue: getItemValueProp,
		accessibility,
		flatCursor = false,
		children,
		...kanbanProps
	} = props

	const id = React.useId()
	const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)
	const lastOverIdRef = React.useRef<UniqueIdentifier | null>(null)
	const hasMovedRef = React.useRef(false)
	const sensors = useSensors(
		useSensor(MouseSensor),
		useSensor(TouchSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter,
		}),
	)

	const getItemValue = React.useCallback(
		(item: T): UniqueIdentifier => {
			if (typeof item === 'object' && !getItemValueProp) {
				throw new Error('getItemValue is required when using array of objects')
			}
			return getItemValueProp
				? getItemValueProp(item)
				: (item as UniqueIdentifier)
		},
		[getItemValueProp],
	)

	const getColumn = React.useCallback(
		(id: UniqueIdentifier) => {
			if (id in value) return id

			for (const [columnId, items] of Object.entries(value)) {
				if (items.some((item) => getItemValue(item) === id)) {
					return columnId
				}
			}

			return null
		},
		[value, getItemValue],
	)

	const collisionDetection: CollisionDetection = React.useCallback(
		(args) => {
			if (activeId && activeId in value) {
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(container) => container.id in value,
					),
				})
			}

			const pointerIntersections = pointerWithin(args)
			const intersections =
				pointerIntersections.length > 0
					? pointerIntersections
					: rectIntersection(args)
			let overId = getFirstCollision(intersections, 'id')

			if (!overId) {
				if (hasMovedRef.current) {
					lastOverIdRef.current = activeId
				}
				return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : []
			}

			if (overId in value) {
				const containerItems = value[overId]
				if (containerItems && containerItems.length > 0) {
					const closestItem = closestCenter({
						...args,
						droppableContainers: args.droppableContainers.filter(
							(container) =>
								container.id !== overId &&
								containerItems.some(
									(item) => getItemValue(item) === container.id,
								),
						),
					})

					if (closestItem.length > 0) {
						overId = closestItem[0]?.id ?? overId
					}
				}
			}

			lastOverIdRef.current = overId
			return [{ id: overId }]
		},
		[activeId, value, getItemValue],
	)

	const onDragStart = React.useCallback(
		(event: DragStartEvent) => {
			kanbanProps.onDragStart?.(event)

			if (event.activatorEvent.defaultPrevented) return
			setActiveId(event.active.id)
		},
		[kanbanProps.onDragStart, setActiveId],
	)

	const onDragOver = React.useCallback(
		(event: DragOverEvent) => {
			kanbanProps.onDragOver?.(event)

			if (event.activatorEvent.defaultPrevented) return

			const { active, over } = event
			if (!over) return

			const activeColumn = getColumn(active.id)
			const overColumn = getColumn(over.id)

			if (!activeColumn || !overColumn) return

			if (activeColumn === overColumn) {
				const items = value[activeColumn]
				if (!items) return

				const activeIndex = items.findIndex(
					(item) => getItemValue(item) === active.id,
				)
				const overIndex = items.findIndex(
					(item) => getItemValue(item) === over.id,
				)

				if (activeIndex !== overIndex) {
					const newColumns = { ...value }
					newColumns[activeColumn] = arrayMove(items, activeIndex, overIndex)
					onValueChange?.(newColumns)
				}
			} else {
				const activeItems = value[activeColumn]
				const overItems = value[overColumn]

				if (!activeItems || !overItems) return

				const activeIndex = activeItems.findIndex(
					(item) => getItemValue(item) === active.id,
				)

				if (activeIndex === -1) return

				const activeItem = activeItems[activeIndex]
				if (!activeItem) return

				const updatedItems = {
					...value,
					[activeColumn]: activeItems.filter(
						(item) => getItemValue(item) !== active.id,
					),
					[overColumn]: [...overItems, activeItem],
				}

				onValueChange?.(updatedItems)
				hasMovedRef.current = true
			}
		},
		[value, getColumn, getItemValue, onValueChange, kanbanProps.onDragOver],
	)

	const onDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			kanbanProps.onDragEnd?.(event)

			if (event.activatorEvent.defaultPrevented) return

			const { active, over } = event

			if (!over) {
				setActiveId(null)
				return
			}

			if (active.id in value && over.id in value) {
				const activeIndex = Object.keys(value).indexOf(active.id as string)
				const overIndex = Object.keys(value).indexOf(over.id as string)

				if (activeIndex !== overIndex) {
					const orderedColumns = Object.keys(value)
					const newOrder = arrayMove(orderedColumns, activeIndex, overIndex)

					const newColumns: Record<UniqueIdentifier, T[]> = {}
					for (const key of newOrder) {
						const items = value[key]
						if (items) {
							newColumns[key] = items
						}
					}

					if (onMove) {
						onMove({ ...event, activeIndex, overIndex })
					} else {
						onValueChange?.(newColumns)
					}
				}
			} else {
				const activeColumn = getColumn(active.id)
				const overColumn = getColumn(over.id)

				if (!activeColumn || !overColumn) {
					setActiveId(null)
					return
				}

				if (activeColumn === overColumn) {
					const items = value[activeColumn]
					if (!items) {
						setActiveId(null)
						return
					}

					const activeIndex = items.findIndex(
						(item) => getItemValue(item) === active.id,
					)
					const overIndex = items.findIndex(
						(item) => getItemValue(item) === over.id,
					)

					if (activeIndex !== overIndex) {
						const newColumns = { ...value }
						newColumns[activeColumn] = arrayMove(items, activeIndex, overIndex)
						if (onMove) {
							onMove({
								...event,
								activeIndex,
								overIndex,
							})
						} else {
							onValueChange?.(newColumns)
						}
					}
				}
			}

			setActiveId(null)
			hasMovedRef.current = false
		},
		[
			value,
			getColumn,
			getItemValue,
			onValueChange,
			onMove,
			kanbanProps.onDragEnd,
			setActiveId,
		],
	)

	const onDragCancel = React.useCallback(
		(event: DragCancelEvent) => {
			kanbanProps.onDragCancel?.(event)

			if (event.activatorEvent.defaultPrevented) return

			setActiveId(null)
			hasMovedRef.current = false
		},
		[kanbanProps.onDragCancel, setActiveId],
	)

	const announcements: Announcements = React.useMemo(
		() => ({
			onDragStart({ active }) {
				const isColumn = active.id in value
				const itemType = isColumn ? 'column' : 'item'
				const position = isColumn
					? Object.keys(value).indexOf(active.id as string) + 1
					: (() => {
							const column = getColumn(active.id)
							if (!column || !value[column]) return 1
							return (
								value[column].findIndex(
									(item) => getItemValue(item) === active.id,
								) + 1
							)
						})()
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(active.id)
							return column ? (value[column]?.length ?? 0) : 0
						})()

				return `Picked up ${itemType} at position ${position} of ${total}`
			},
			onDragOver({ active, over }) {
				if (!over) return

				const isColumn = active.id in value
				const itemType = isColumn ? 'column' : 'item'
				const position = isColumn
					? Object.keys(value).indexOf(over.id as string) + 1
					: (() => {
							const column = getColumn(over.id)
							if (!column || !value[column]) return 1
							return (
								value[column].findIndex(
									(item) => getItemValue(item) === over.id,
								) + 1
							)
						})()
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(over.id)
							return column ? (value[column]?.length ?? 0) : 0
						})()

				const overColumn = getColumn(over.id)
				const activeColumn = getColumn(active.id)

				if (isColumn) {
					return `${itemType} is now at position ${position} of ${total}`
				}

				if (activeColumn !== overColumn) {
					return `${itemType} is now at position ${position} of ${total} in ${overColumn}`
				}

				return `${itemType} is now at position ${position} of ${total}`
			},
			onDragEnd({ active, over }) {
				if (!over) return

				const isColumn = active.id in value
				const itemType = isColumn ? 'column' : 'item'
				const position = isColumn
					? Object.keys(value).indexOf(over.id as string) + 1
					: (() => {
							const column = getColumn(over.id)
							if (!column || !value[column]) return 1
							return (
								value[column].findIndex(
									(item) => getItemValue(item) === over.id,
								) + 1
							)
						})()
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(over.id)
							return column ? (value[column]?.length ?? 0) : 0
						})()

				const overColumn = getColumn(over.id)
				const activeColumn = getColumn(active.id)

				if (isColumn) {
					return `${itemType} was dropped at position ${position} of ${total}`
				}

				if (activeColumn !== overColumn) {
					return `${itemType} was dropped at position ${position} of ${total} in ${overColumn}`
				}

				return `${itemType} was dropped at position ${position} of ${total}`
			},
			onDragCancel({ active }) {
				const isColumn = active.id in value
				const itemType = isColumn ? 'column' : 'item'
				return `Dragging was cancelled. ${itemType} was dropped.`
			},
		}),
		[value, getColumn, getItemValue],
	)

	const config = React.useMemo<KanbanConfig<T>>(
		() => ({
			instanceId: id,
			items: value,
			modifiers,
			strategy,
			orientation,
			getItemValue,
			flatCursor,
		}),
		[id, value, modifiers, strategy, orientation, getItemValue, flatCursor],
	)

	const store = React.useMemo(() => {
		const nextStore = createStore()
		nextStore.set(kanbanConfigAtom, config as KanbanConfig)
		nextStore.set(kanbanActiveIdAtom, activeId)
		return nextStore
	}, [])

	React.useLayoutEffect(() => {
		store.set(kanbanConfigAtom, config as KanbanConfig)
	}, [store, config])

	React.useLayoutEffect(() => {
		store.set(kanbanActiveIdAtom, activeId)
	}, [store, activeId])

	return (
		<Provider store={store}>
			<HotkeysProvider
				defaultOptions={{
					hotkey: {
						ignoreInputs: false,
						conflictBehavior: 'warn',
					},
				}}
			>
				<KanbanHotkeysBridge />
				<DndContext
					collisionDetection={collisionDetection}
					modifiers={modifiers}
					sensors={sensors}
					{...kanbanProps}
					id={id}
					measuring={{
						droppable: {
							strategy: MeasuringStrategy.Always,
						},
					}}
					onDragStart={onDragStart}
					onDragOver={onDragOver}
					onDragEnd={onDragEnd}
					onDragCancel={onDragCancel}
					accessibility={{
						announcements,
						screenReaderInstructions: {
							draggable: `
            To pick up a kanban item or column, press space or enter.
            While dragging, use the arrow keys to move the item.
            Press space or enter again to drop the item in its new position, or press escape to cancel.
          `,
						},
						...accessibility,
					}}
				>
					{children}
				</DndContext>
			</HotkeysProvider>
		</Provider>
	)
}

function useSyncKanbanHandle(
	handleKey: string,
	state: KanbanSortableHandleState,
	family: typeof kanbanColumnHandleAtomFamily,
) {
	const handleAtom = family(handleKey)
	const setHandle = useSetAtom(handleAtom)

	React.useLayoutEffect(() => {
		setHandle(state)
	}, [setHandle, state])

	React.useLayoutEffect(() => {
		return () => setHandle(null)
	}, [setHandle])
}

interface KanbanBoardProps extends useRender.ComponentProps<'div'> {}

const KanbanBoard = React.forwardRef<HTMLDivElement, KanbanBoardProps>(
	(props, forwardedRef) => {
		const { className, render, ...boardProps } = props

		const context = useKanbanConfig(BOARD_NAME)

		const columns = React.useMemo(() => {
			return Object.keys(context.items)
		}, [context.items])

		const element = useRender({
			defaultTagName: 'div',
			render,
			props: mergeProps<'div'>(
				{
					'aria-orientation': context.orientation,
					ref: forwardedRef,
					className: cn(
						'flex size-full gap-4',
						context.orientation === 'horizontal' ? 'flex-row' : 'flex-col',
						className,
					),
				},
				boardProps,
			),
		})

		return (
			<KanbanBoardContext.Provider value={true}>
				<SortableContext
					items={columns}
					strategy={
						context.orientation === 'horizontal'
							? horizontalListSortingStrategy
							: verticalListSortingStrategy
					}
				>
					{element}
				</SortableContext>
			</KanbanBoardContext.Provider>
		)
	},
)
KanbanBoard.displayName = BOARD_NAME

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
	defaultAnimateLayoutChanges({ ...args, wasDragging: true })

interface KanbanColumnProps extends useRender.ComponentProps<'div'> {
	value: UniqueIdentifier
	asHandle?: boolean
	disabled?: boolean
}

const KanbanColumn = React.forwardRef<HTMLDivElement, KanbanColumnProps>(
	(props, forwardedRef) => {
		const {
			value,
			asHandle,
			disabled,
			className,
			style,
			render,
			...columnProps
		} = props

		const id = React.useId()
		const context = useKanbanConfig(COLUMN_NAME)
		const handleKey = kanbanHandleKey(context.instanceId, value)
		const inBoard = useKanbanInBoard()
		const inOverlay = useKanbanInOverlay()

		if (!inBoard && !inOverlay) {
			throw new Error(
				`\`${COLUMN_NAME}\` must be used within \`${BOARD_NAME}\` or \`${OVERLAY_NAME}\``,
			)
		}

		if (value === '') {
			throw new Error(`\`${COLUMN_NAME}\` value cannot be an empty string`)
		}

		const {
			attributes,
			listeners,
			setNodeRef,
			setActivatorNodeRef,
			transform,
			transition,
			isDragging,
		} = useSortable({
			id: value,
			disabled,
			animateLayoutChanges,
		})

		const composedRef = useComposedRefs(forwardedRef, (node) => {
			if (disabled) return
			setNodeRef(node)
			if (asHandle) {
				setActivatorNodeRef(node)
			}
		})

		const composedStyle = React.useMemo<React.CSSProperties>(() => {
			return {
				transform: CSS.Transform.toString(transform),
				transition,
				...style,
			}
		}, [transform, transition, style])

		const items = React.useMemo(() => {
			const items = context.items[value] ?? []
			return items.map((item) => context.getItemValue(item))
		}, [context.items, value, context.getItemValue])

		const handleState = React.useMemo<KanbanSortableHandleState>(
			() => ({
				id,
				attributes,
				listeners,
				setActivatorNodeRef,
				isDragging,
				disabled,
			}),
			[id, attributes, listeners, setActivatorNodeRef, isDragging, disabled],
		)

		useSyncKanbanHandle(handleKey, handleState, kanbanColumnHandleAtomFamily)

		const element = useRender({
			defaultTagName: 'div',
			render,
			props: mergeProps<'div'>(
				{
					'aria-disabled': disabled || undefined,
					...(disabled || !asHandle ? {} : attributes),
					...(disabled || !asHandle ? {} : listeners),
					ref: composedRef,
					style: composedStyle,
					className: cn(
						'flex size-full flex-col gap-2 rounded-lg bg-muted p-2.5 aria-disabled:pointer-events-none aria-disabled:opacity-50',
						{
							'touch-none select-none': asHandle,
							'cursor-default': context.flatCursor,
							'data-dragging:cursor-grabbing': !context.flatCursor,
							'cursor-grab': !isDragging && asHandle && !context.flatCursor,
							'opacity-50': isDragging,
							'pointer-events-none opacity-50': disabled,
						},
						className,
					),
				},
				columnProps,
			),
		})

		return (
			<KanbanColumnHandleKeyContext.Provider value={handleKey}>
				<KanbanColumnHandleStateContext.Provider value={handleState}>
					<SortableContext
						items={items}
						strategy={
							context.orientation === 'horizontal'
								? horizontalListSortingStrategy
								: verticalListSortingStrategy
						}
					>
						{element}
					</SortableContext>
				</KanbanColumnHandleStateContext.Provider>
			</KanbanColumnHandleKeyContext.Provider>
		)
	},
)
KanbanColumn.displayName = COLUMN_NAME

interface KanbanColumnHandleProps extends useRender.ComponentProps<'button'> {}

const KanbanColumnHandle = React.forwardRef<
	HTMLButtonElement,
	KanbanColumnHandleProps
>((props, forwardedRef) => {
	const { render, disabled, className, ...columnHandleProps } = props

	const context = useKanbanConfig(COLUMN_HANDLE_NAME)
	const handleKey = React.useContext(KanbanColumnHandleKeyContext)
	const contextHandle = React.useContext(KanbanColumnHandleStateContext)
	const storedHandle = useKanbanColumnHandleOptional(handleKey ?? '')
	const columnHandle = contextHandle ?? storedHandle

	if (!columnHandle) {
		throw new Error(
			`\`${COLUMN_HANDLE_NAME}\` must be used within \`${COLUMN_NAME}\``,
		)
	}

	const isDisabled = disabled ?? columnHandle.disabled

	const composedRef = useComposedRefs(forwardedRef, (node) => {
		if (isDisabled) return
		columnHandle.setActivatorNodeRef(node)
	})

	const element = useRender({
		defaultTagName: 'button',
		render,
		props: mergeProps<'button'>(
			{
				type: 'button',
				'aria-controls': columnHandle.id,
				...columnHandleProps,
				...(isDisabled ? {} : columnHandle.attributes),
				...(isDisabled ? {} : columnHandle.listeners),
				ref: composedRef,
				className: cn(
					'select-none disabled:pointer-events-none disabled:opacity-50',
					context.flatCursor
						? 'cursor-default'
						: 'cursor-grab data-dragging:cursor-grabbing',
					className,
				),
				disabled: isDisabled,
			},
			columnHandleProps,
		),
	})

	return element
})
KanbanColumnHandle.displayName = COLUMN_HANDLE_NAME

interface KanbanItemProps extends useRender.ComponentProps<'div'> {
	value: UniqueIdentifier
	asHandle?: boolean
	disabled?: boolean
}

const KanbanItem = React.forwardRef<HTMLDivElement, KanbanItemProps>(
	(props, forwardedRef) => {
		const {
			value,
			style,
			asHandle,
			render,
			disabled,
			className,
			...itemProps
		} = props

		const id = React.useId()
		const context = useKanbanConfig(ITEM_NAME)
		const handleKey = kanbanHandleKey(context.instanceId, value)
		const inBoard = useKanbanInBoard()
		const inOverlay = useKanbanInOverlay()

		if (!inBoard && !inOverlay) {
			throw new Error(`\`${ITEM_NAME}\` must be used within \`${BOARD_NAME}\``)
		}

		const {
			attributes,
			listeners,
			setNodeRef,
			setActivatorNodeRef,
			transform,
			transition,
			isDragging,
		} = useSortable({ id: value, disabled })

		if (value === '') {
			throw new Error(`\`${ITEM_NAME}\` value cannot be an empty string`)
		}

		const composedRef = useComposedRefs(forwardedRef, (node) => {
			if (disabled) return
			setNodeRef(node)
			if (asHandle) {
				setActivatorNodeRef(node)
			}
		})

		const composedStyle = React.useMemo<React.CSSProperties>(() => {
			return {
				transform: CSS.Transform.toString(transform),
				transition,
				...style,
			}
		}, [transform, transition, style])

		const handleState = React.useMemo<KanbanSortableHandleState>(
			() => ({
				id,
				attributes,
				listeners,
				setActivatorNodeRef,
				isDragging,
				disabled,
			}),
			[id, attributes, listeners, setActivatorNodeRef, isDragging, disabled],
		)

		useSyncKanbanHandle(handleKey, handleState, kanbanItemHandleAtomFamily)

		const element = useRender({
			defaultTagName: 'div',
			render,
			props: mergeProps<'div'>(
				{
					'aria-disabled': disabled || undefined,
					...(disabled || !asHandle ? {} : attributes),
					...(disabled || !asHandle ? {} : listeners),
					ref: composedRef,
					style: composedStyle,
					className: cn(
						'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
						{
							'touch-none select-none': asHandle,
							'cursor-default': context.flatCursor,
							'data-dragging:cursor-grabbing': !context.flatCursor,
							'cursor-grab': !isDragging && asHandle && !context.flatCursor,
							'opacity-50': isDragging,
							'pointer-events-none opacity-50': disabled,
						},
						className,
					),
				},
				itemProps,
			),
		})

		return (
			<KanbanItemHandleKeyContext.Provider value={handleKey}>
				<KanbanItemHandleStateContext.Provider value={handleState}>
					{element}
				</KanbanItemHandleStateContext.Provider>
			</KanbanItemHandleKeyContext.Provider>
		)
	},
)
KanbanItem.displayName = ITEM_NAME

interface KanbanItemHandleProps extends useRender.ComponentProps<'button'> {}

const KanbanItemHandle = React.forwardRef<
	HTMLButtonElement,
	KanbanItemHandleProps
>((props, forwardedRef) => {
	const { render, disabled, className, ...itemHandleProps } = props

	const context = useKanbanConfig(ITEM_HANDLE_NAME)
	const handleKey = React.useContext(KanbanItemHandleKeyContext)
	const contextHandle = React.useContext(KanbanItemHandleStateContext)
	const storedHandle = useKanbanItemHandleOptional(handleKey ?? '')
	const itemHandle = contextHandle ?? storedHandle

	if (!itemHandle) {
		throw new Error(
			`\`${ITEM_HANDLE_NAME}\` must be used within \`${ITEM_NAME}\``,
		)
	}

	const isDisabled = disabled ?? itemHandle.disabled

	const composedRef = useComposedRefs(forwardedRef, (node) => {
		if (isDisabled) return
		itemHandle.setActivatorNodeRef(node)
	})

	const element = useRender({
		defaultTagName: 'button',
		render,
		props: mergeProps<'button'>(
			{
				type: 'button',
				'aria-controls': itemHandle.id,
				...itemHandleProps,
				...(isDisabled ? {} : itemHandle.attributes),
				...(isDisabled ? {} : itemHandle.listeners),
				ref: composedRef,
				className: cn(
					'select-none disabled:pointer-events-none disabled:opacity-50',
					context.flatCursor
						? 'cursor-default'
						: 'cursor-grab data-dragging:cursor-grabbing',
					className,
				),
				disabled: isDisabled,
			},
			itemHandleProps,
		),
	})

	return element
})
KanbanItemHandle.displayName = ITEM_HANDLE_NAME

const dropAnimation: DropAnimation = {
	sideEffects: defaultDropAnimationSideEffects({
		styles: {
			active: {
				opacity: '0.4',
			},
		},
	}),
}

interface KanbanOverlayProps extends Omit<
	React.ComponentPropsWithoutRef<typeof DragOverlay>,
	'children'
> {
	container?: Element | DocumentFragment | null
	children?:
		| ((params: {
				value: UniqueIdentifier
				variant: 'column' | 'item'
		  }) => React.ReactNode)
		| React.ReactNode
}

function KanbanOverlay(props: KanbanOverlayProps) {
	const { container: containerProp, children, ...overlayProps } = props

	const context = useKanbanConfig(OVERLAY_NAME)
	const activeId = useAtomValue(kanbanActiveIdAtom)

	const [mounted, setMounted] = React.useState(false)
	React.useLayoutEffect(() => setMounted(true), [])

	const container =
		containerProp ?? (mounted ? globalThis.document?.body : null)

	if (!container) return null

	const variant = activeId && activeId in context.items ? 'column' : 'item'

	return ReactDOM.createPortal(
		<DragOverlay
			dropAnimation={dropAnimation}
			modifiers={context.modifiers}
			className={cn(!context.flatCursor && 'cursor-grabbing')}
			{...overlayProps}
		>
			<KanbanOverlayContext.Provider value={true}>
				{activeId && children
					? typeof children === 'function'
						? children({
								value: activeId,
								variant,
							})
						: children
					: null}
			</KanbanOverlayContext.Provider>
		</DragOverlay>,
		container,
	)
}

export { KANBAN_SHORTCUTS } from './kanban-shortcuts'
export {
	KanbanBoard as Board,
	KanbanBoard,
	KanbanColumn as Column,
	KanbanColumn,
	KanbanColumnHandle as ColumnHandle,
	KanbanColumnHandle,
	KanbanItem as Item,
	KanbanItem,
	KanbanItemHandle as ItemHandle,
	KanbanItemHandle,
	KanbanOverlay,
	KanbanOverlay as Overlay,
	KanbanRoot as Kanban,
	KanbanRoot as Root,
}

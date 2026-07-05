import type {
	DndContextProps,
	DraggableAttributes,
	DraggableSyntheticListeners,
	UniqueIdentifier,
} from '@dnd-kit/core'
import type { SortableContextProps } from '@dnd-kit/sortable'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import * as React from 'react'

export interface KanbanConfig<T = unknown> {
	instanceId: string
	items: Record<UniqueIdentifier, T[]>
	modifiers: DndContextProps['modifiers']
	strategy: SortableContextProps['strategy']
	orientation: 'horizontal' | 'vertical'
	getItemValue: (item: T) => UniqueIdentifier
	flatCursor: boolean
}

export interface KanbanSortableHandleState {
	id: string
	attributes: DraggableAttributes
	listeners: DraggableSyntheticListeners | undefined
	setActivatorNodeRef: (node: HTMLElement | null) => void
	isDragging?: boolean
	disabled?: boolean
}

export const kanbanConfigAtom = atom<KanbanConfig | null>(null)
export const kanbanActiveIdAtom = atom<UniqueIdentifier | null>(null)

export const KanbanBoardContext = React.createContext(false)
export const KanbanOverlayContext = React.createContext(false)

export const kanbanColumnHandleAtomFamily = atomFamily((_key: string) =>
	atom<KanbanSortableHandleState | null>(null),
)

export const kanbanItemHandleAtomFamily = atomFamily((_key: string) =>
	atom<KanbanSortableHandleState | null>(null),
)

export function kanbanHandleKey(
	instanceId: string,
	value: UniqueIdentifier,
): string {
	return `${instanceId}:${String(value)}`
}

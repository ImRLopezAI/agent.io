import { useAtomValue } from 'jotai'
import * as React from 'react'

import {
	KanbanBoardContext,
	type KanbanConfig,
	KanbanOverlayContext,
	type KanbanSortableHandleState,
	kanbanColumnHandleAtomFamily,
	kanbanConfigAtom,
	kanbanItemHandleAtomFamily,
} from './store'

const ROOT_NAME = 'Kanban'

export function useKanbanConfig<T = unknown>(
	consumerName = 'Kanban component',
): KanbanConfig<T> {
	const config = useAtomValue(kanbanConfigAtom)
	if (!config) {
		throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
	}
	return config as KanbanConfig<T>
}

export function useKanbanInBoard(): boolean {
	return React.useContext(KanbanBoardContext)
}

export function useKanbanInOverlay(): boolean {
	return React.useContext(KanbanOverlayContext)
}

export function useKanbanColumnHandle(
	handleKey: string,
	consumerName: string,
): KanbanSortableHandleState {
	const handle = useKanbanColumnHandleOptional(handleKey)
	if (!handle) {
		throw new Error(`\`${consumerName}\` must be used within \`KanbanColumn\``)
	}
	return handle
}

export function useKanbanColumnHandleOptional(
	handleKey: string,
): KanbanSortableHandleState | null {
	return useAtomValue(kanbanColumnHandleAtomFamily(handleKey))
}

export function useKanbanItemHandle(
	handleKey: string,
	consumerName: string,
): KanbanSortableHandleState {
	const handle = useKanbanItemHandleOptional(handleKey)
	if (!handle) {
		throw new Error(`\`${consumerName}\` must be used within \`KanbanItem\``)
	}
	return handle
}

export function useKanbanItemHandleOptional(
	handleKey: string,
): KanbanSortableHandleState | null {
	return useAtomValue(kanbanItemHandleAtomFamily(handleKey))
}

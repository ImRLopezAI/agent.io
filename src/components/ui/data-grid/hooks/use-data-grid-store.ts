import type {
	ColumnFiltersState,
	ColumnOrderState,
	ExpandedState,
	RowSelectionState,
	SortingState,
} from '@tanstack/react-table'
import * as React from 'react'

import type {
	CellPosition,
	ContextMenuState,
	PasteDialogState,
	RowHeightValue,
	SelectionState,
} from '../types/data-grid'

export interface DataGridState {
	globalFilter: string
	sorting: SortingState
	columnFilters: ColumnFiltersState
	columnOrder: ColumnOrderState
	rowHeight: RowHeightValue
	rowSelection: RowSelectionState
	expanded: ExpandedState
	selectionState: SelectionState
	focusedCell: CellPosition | null
	editingCell: CellPosition | null
	cutCells: Set<string>
	contextMenu: ContextMenuState
	searchQuery: string
	replaceQuery: string
	searchCaseSensitive: boolean
	searchWholeWord: boolean
	searchRegex: boolean
	searchRegexError: string | null
	searchInSelection: boolean
	searchMatches: CellPosition[]
	matchIndex: number
	searchOpen: boolean
	lastClickedRowIndex: number | null
	pasteDialog: PasteDialogState
	liveAnnouncement: string
}

export interface DataGridStore {
	subscribe: (callback: () => void) => () => void
	getState: () => DataGridState
	setState: <K extends keyof DataGridState>(
		key: K,
		value: DataGridState[K],
	) => void
	notify: () => void
	batch: (fn: () => void) => void
}

export function createDataGridStore(
	initialState: DataGridState,
): DataGridStore {
	const state: DataGridState = initialState
	const listeners = new Set<() => void>()
	let isBatching = false
	let pendingNotification = false

	const store: DataGridStore = {
		subscribe: (callback) => {
			listeners.add(callback)
			return () => listeners.delete(callback)
		},
		getState: () => state,
		setState: (key, value) => {
			if (Object.is(state[key], value)) return
			state[key] = value

			if (isBatching) {
				pendingNotification = true
			} else {
				if (!pendingNotification) {
					pendingNotification = true
					queueMicrotask(() => {
						pendingNotification = false
						store.notify()
					})
				}
			}
		},
		notify: () => {
			for (const listener of listeners) {
				listener()
			}
		},
		batch: (fn) => {
			if (isBatching) {
				fn()
				return
			}

			isBatching = true
			const wasPending = pendingNotification
			pendingNotification = false

			try {
				fn()
			} finally {
				isBatching = false
				if (pendingNotification || wasPending) {
					pendingNotification = false
					store.notify()
				}
			}
		},
	}

	return store
}

export function useStore<T>(
	store: DataGridStore,
	selector: (state: DataGridState) => T,
): T {
	const getSnapshot = React.useCallback(
		() => selector(store.getState()),
		[store, selector],
	)

	return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

// Sets a polite live-region announcement on the store and clears it shortly
// after so identical subsequent messages still trigger a screen-reader cue.
const ANNOUNCEMENT_CLEAR_MS = 1000
const announcementTimers = new WeakMap<
	DataGridStore,
	ReturnType<typeof setTimeout>
>()

export function announce(store: DataGridStore, message: string): void {
	if (!message) return

	store.setState('liveAnnouncement', '')

	queueMicrotask(() => {
		store.setState('liveAnnouncement', message)
	})

	const existing = announcementTimers.get(store)
	if (existing) clearTimeout(existing)

	const timer = setTimeout(() => {
		store.setState('liveAnnouncement', '')
		announcementTimers.delete(store)
	}, ANNOUNCEMENT_CLEAR_MS)
	announcementTimers.set(store, timer)
}

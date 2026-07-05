'use client'

import * as React from 'react'

import type {
	CellUpdate,
	FileCellData,
	NavigationDirection,
	RowHeightValue,
} from '../types/data-grid'

/**
 * Framework-internal actions are required (always wired by the data-grid
 * orchestrator). User-supplied callbacks (file upload/delete) stay optional.
 */
export interface DataGridActionsContextValue {
	// Row interactions
	onRowSelect: (
		rowIndex: number,
		checked: boolean,
		shiftKey: boolean,
		rowId?: string,
	) => void
	onRowsDelete?: (
		rowIndices: number[],
		rowIds?: string[],
	) => void | Promise<void>
	onColumnClick: (columnId: string) => void

	// Cell mouse/pointer
	onCellClick: (
		rowIndex: number,
		columnId: string,
		event?: React.MouseEvent,
		rowId?: string,
	) => void
	onCellDoubleClick: (
		rowIndex: number,
		columnId: string,
		event?: React.MouseEvent,
		rowId?: string,
	) => void
	onCellMouseDown: (
		rowIndex: number,
		columnId: string,
		event: React.MouseEvent,
		rowId?: string,
	) => void
	onCellMouseEnter: (rowIndex: number, columnId: string, rowId?: string) => void
	onCellMouseUp: () => void
	onCellContextMenu: (
		rowIndex: number,
		columnId: string,
		event: React.MouseEvent,
		rowId?: string,
	) => void

	// Editing lifecycle
	onCellEditingStart: (
		rowIndex: number,
		columnId: string,
		rowId?: string,
	) => void
	onCellEditingStop: (opts?: {
		direction?: NavigationDirection
		moveToNextRow?: boolean
	}) => void

	// Data mutation
	onDataUpdate: (params: CellUpdate | Array<CellUpdate>) => void

	// Clipboard / selection
	onCellsCopy: () => void
	onCellsCut: () => void
	onCellsPaste: (expand?: boolean) => void
	onSelectionClear: () => void

	// Files (USER-SUPPLIED — optional)
	onFilesUpload?: (params: {
		files: File[]
		rowIndex: number
		columnId: string
		rowId?: string
	}) => Promise<FileCellData[]>
	onFilesDelete?: (params: {
		fileIds: string[]
		rowIndex: number
		columnId: string
		rowId?: string
	}) => void | Promise<void>

	// UI state
	onContextMenuOpenChange: (open: boolean) => void
	onPasteDialogOpenChange: (open: boolean) => void
	onRowHeightChange: (value: RowHeightValue) => void

	/**
	 * Request that the filter menu open and reveal a specific column.
	 * Replaces the previous runtime monkey-patch on `tableMeta.onFilterMenuRequest`.
	 */
	requestFilterMenu: (columnId: string) => void
}

const DataGridActionsContext =
	React.createContext<DataGridActionsContextValue | null>(null)

export interface DataGridActionsProviderProps {
	value: DataGridActionsContextValue
	children: React.ReactNode
}

export function DataGridActionsProvider({
	value,
	children,
}: DataGridActionsProviderProps) {
	return (
		<DataGridActionsContext.Provider value={value}>
			{children}
		</DataGridActionsContext.Provider>
	)
}

export function useDataGridActions(): DataGridActionsContextValue {
	const ctx = React.useContext(DataGridActionsContext)
	if (!ctx) {
		throw new Error(
			'useDataGridActions() must be used inside <DataGridActionsProvider>. ' +
				'Did you forget to wrap your data-grid in <DataGrid />?',
		)
	}
	return ctx
}

/**
 * A tiny pub/sub used to wire `requestFilterMenu` from the actions context to
 * the filter menu component without runtime mutation. The orchestrator owns
 * an instance of this; the actions context exposes `requestFilterMenu` (the
 * publisher) and the filter menu consumes via `subscribeFilterMenuRequests`.
 */
export interface FilterMenuRequestBus {
	subscribe: (listener: (columnId: string) => void) => () => void
	emit: (columnId: string) => void
}

export function createFilterMenuRequestBus(): FilterMenuRequestBus {
	const listeners = new Set<(columnId: string) => void>()
	return {
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		emit(columnId) {
			for (const l of listeners) {
				l(columnId)
			}
		},
	}
}

const FilterMenuRequestBusContext =
	React.createContext<FilterMenuRequestBus | null>(null)

export interface FilterMenuRequestBusProviderProps {
	value: FilterMenuRequestBus
	children: React.ReactNode
}

export function FilterMenuRequestBusProvider({
	value,
	children,
}: FilterMenuRequestBusProviderProps) {
	return (
		<FilterMenuRequestBusContext.Provider value={value}>
			{children}
		</FilterMenuRequestBusContext.Provider>
	)
}

/**
 * Subscribe to filter menu open requests. Returns the bus so consumers can
 * call `.subscribe()`. Returns `null` if no bus is available (filter menu is
 * not mounted) so call sites can no-op gracefully.
 */
export function useFilterMenuRequestBus(): FilterMenuRequestBus | null {
	return React.useContext(FilterMenuRequestBusContext)
}

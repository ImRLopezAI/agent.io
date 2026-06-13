'use client'

import * as React from 'react'

import { type DataGridStore, useStore } from '../hooks/use-data-grid-store'
import type {
	CellPosition,
	ContextMenuState,
	PasteDialogState,
	RowHeightValue,
	SelectionState,
} from '../types/data-grid'

export interface DataGridStateContextValue {
	store: DataGridStore
	dataGridRef: React.RefObject<HTMLDivElement | null>
	cellMapRef: React.RefObject<Map<string, HTMLDivElement>>
	readOnly: boolean
}

const DataGridStateContext =
	React.createContext<DataGridStateContextValue | null>(null)

export interface DataGridStateProviderProps {
	value: DataGridStateContextValue
	children: React.ReactNode
}

export function DataGridStateProvider({
	value,
	children,
}: DataGridStateProviderProps) {
	return (
		<DataGridStateContext.Provider value={value}>
			{children}
		</DataGridStateContext.Provider>
	)
}

function useDataGridStateContext(): DataGridStateContextValue {
	const ctx = React.useContext(DataGridStateContext)
	if (!ctx) {
		throw new Error(
			'useDataGridState* hooks must be used inside <DataGridStateProvider>. ' +
				'Did you forget to wrap your data-grid in <DataGrid />?',
		)
	}
	return ctx
}

/**
 * Returns a stable bag of refs and read-only flags. Does not subscribe
 * to fine-grained store state — use the per-slice hooks below for that.
 */
export function useDataGridState(): DataGridStateContextValue {
	return useDataGridStateContext()
}

export function useDataGridFocusedCell(): CellPosition | null {
	const { store } = useDataGridStateContext()
	return useStore(store, selectFocusedCell)
}

export function useDataGridEditingCell(): CellPosition | null {
	const { store } = useDataGridStateContext()
	return useStore(store, selectEditingCell)
}

export function useDataGridSelectionState(): SelectionState {
	const { store } = useDataGridStateContext()
	return useStore(store, selectSelectionState)
}

export function useDataGridSearchOpen(): boolean {
	const { store } = useDataGridStateContext()
	return useStore(store, selectSearchOpen)
}

export function useDataGridContextMenuState(): ContextMenuState {
	const { store } = useDataGridStateContext()
	return useStore(store, selectContextMenu)
}

export function useDataGridPasteDialogState(): PasteDialogState {
	const { store } = useDataGridStateContext()
	return useStore(store, selectPasteDialog)
}

export function useDataGridRowHeight(): RowHeightValue {
	const { store } = useDataGridStateContext()
	return useStore(store, selectRowHeight)
}

export function useDataGridReadOnly(): boolean {
	return useDataGridStateContext().readOnly
}

const selectFocusedCell = (s: { focusedCell: CellPosition | null }) =>
	s.focusedCell
const selectEditingCell = (s: { editingCell: CellPosition | null }) =>
	s.editingCell
const selectSelectionState = (s: { selectionState: SelectionState }) =>
	s.selectionState
const selectSearchOpen = (s: { searchOpen: boolean }) => s.searchOpen
const selectContextMenu = (s: { contextMenu: ContextMenuState }) =>
	s.contextMenu
const selectPasteDialog = (s: { pasteDialog: PasteDialogState }) =>
	s.pasteDialog
const selectRowHeight = (s: { rowHeight: RowHeightValue }) => s.rowHeight

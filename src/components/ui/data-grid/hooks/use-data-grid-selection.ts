import type { useReactTable } from '@tanstack/react-table'
import * as React from 'react'

import { getCellKey, parseCellKey } from '../lib/data-grid'
import type { CellPosition } from '../types/data-grid'
import { type DataGridStore, useStore } from './use-data-grid-store'
import { useLazyRef } from './use-lazy-ref'

interface UseDataGridSelectionParams<TData> {
	store: DataGridStore
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>
	propsRef: React.RefObject<{
		data: TData[]
	}>
	columnIds: string[]
}

interface UseDataGridSelectionReturn {
	getIsCellSelected: (rowIndex: number, columnId: string) => boolean
	onSelectionClear: () => void
	selectAll: () => void
	selectColumn: (columnId: string) => void
	selectRange: (
		start: CellPosition,
		end: CellPosition,
		isSelecting?: boolean,
	) => void
	cellSelectionMap: Map<number, Set<string>> | null
}

function useDataGridSelection<TData>({
	store,
	tableRef,
	propsRef,
	columnIds,
}: UseDataGridSelectionParams<TData>): UseDataGridSelectionReturn {
	const selectionState = useStore(store, (state) => state.selectionState)

	const prevCellSelectionMapRef = useLazyRef(
		() => new Map<number, Set<string>>(),
	)

	// Memoize per-row selection sets to prevent unnecessary row re-renders
	// Each row gets a stable Set reference that only changes when its cells' selection changes
	const cellSelectionMap = React.useMemo(() => {
		const selectedCells = selectionState.selectedCells

		if (selectedCells.size === 0) {
			prevCellSelectionMapRef.current.clear()
			return null
		}

		const newRowCells = new Map<number, Set<string>>()
		for (const cellKey of selectedCells) {
			const { rowIndex } = parseCellKey(cellKey)
			let rowSet = newRowCells.get(rowIndex)
			if (!rowSet) {
				rowSet = new Set<string>()
				newRowCells.set(rowIndex, rowSet)
			}
			rowSet.add(cellKey)
		}

		const stableMap = new Map<number, Set<string>>()
		for (const [rowIndex, newSet] of newRowCells) {
			const prevSet = prevCellSelectionMapRef.current.get(rowIndex)
			if (
				prevSet &&
				prevSet.size === newSet.size &&
				[...newSet].every((key) => prevSet.has(key))
			) {
				stableMap.set(rowIndex, prevSet)
			} else {
				stableMap.set(rowIndex, newSet)
			}
		}

		prevCellSelectionMapRef.current = stableMap
		return stableMap
	}, [selectionState.selectedCells, prevCellSelectionMapRef])

	const getIsCellSelected = React.useCallback(
		(rowIndex: number, columnId: string) => {
			const currentSelectionState = store.getState().selectionState
			return currentSelectionState.selectedCells.has(
				getCellKey(rowIndex, columnId),
			)
		},
		[store],
	)

	const onSelectionClear = React.useCallback(() => {
		store.batch(() => {
			store.setState('selectionState', {
				selectedCells: new Set(),
				selectionRange: null,
				isSelecting: false,
			})
			store.setState('rowSelection', {})
		})
	}, [store])

	const selectAll = React.useCallback(() => {
		const allCells = new Set<string>()
		const currentTable = tableRef.current
		const rows = currentTable?.getRowModel().rows ?? []
		const rowCount = rows.length ?? propsRef.current.data.length

		for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
			for (const columnId of columnIds) {
				allCells.add(getCellKey(rowIndex, columnId))
			}
		}

		const firstColumnId = columnIds[0]
		const lastColumnId = columnIds[columnIds.length - 1]

		store.setState('selectionState', {
			selectedCells: allCells,
			selectionRange:
				columnIds.length > 0 && rowCount > 0 && firstColumnId && lastColumnId
					? {
							start: { rowIndex: 0, columnId: firstColumnId },
							end: { rowIndex: rowCount - 1, columnId: lastColumnId },
						}
					: null,
			isSelecting: false,
		})
	}, [columnIds, propsRef, store])

	const selectColumn = React.useCallback(
		(columnId: string) => {
			const currentTable = tableRef.current
			const rows = currentTable?.getRowModel().rows ?? []
			const rowCount = rows.length ?? propsRef.current.data.length

			if (rowCount === 0) return

			const selectedCells = new Set<string>()

			for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
				selectedCells.add(getCellKey(rowIndex, columnId))
			}

			store.setState('selectionState', {
				selectedCells,
				selectionRange: {
					start: { rowIndex: 0, columnId },
					end: { rowIndex: rowCount - 1, columnId },
				},
				isSelecting: false,
			})
		},
		[propsRef, store],
	)

	const selectRange = React.useCallback(
		(start: CellPosition, end: CellPosition, isSelecting = false) => {
			const startColIndex = columnIds.indexOf(start.columnId)
			const endColIndex = columnIds.indexOf(end.columnId)

			const minRow = Math.min(start.rowIndex, end.rowIndex)
			const maxRow = Math.max(start.rowIndex, end.rowIndex)
			const minCol = Math.min(startColIndex, endColIndex)
			const maxCol = Math.max(startColIndex, endColIndex)

			const selectedCells = new Set<string>()

			for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
				for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
					const columnId = columnIds[colIndex]
					if (columnId) {
						selectedCells.add(getCellKey(rowIndex, columnId))
					}
				}
			}

			store.setState('selectionState', {
				selectedCells,
				selectionRange: { start, end },
				isSelecting,
			})
		},
		[columnIds, store],
	)

	return {
		getIsCellSelected,
		onSelectionClear,
		selectAll,
		selectColumn,
		selectRange,
		cellSelectionMap,
	}
}

export type { UseDataGridSelectionParams, UseDataGridSelectionReturn }
export { useDataGridSelection }

import type { useReactTable } from '@tanstack/react-table'
import * as React from 'react'
import { getCellKey, scrollCellIntoView } from '../lib/data-grid'
import type {
	CellPosition,
	Direction,
	NavigationDirection,
} from '../types/data-grid'
import type { DataGridStore } from './use-data-grid-store'

const VIEWPORT_OFFSET = 1

interface UseDataGridEditingParams<TData> {
	store: DataGridStore
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>
	dataGridRef: React.RefObject<HTMLDivElement | null>
	cellMapRef: React.RefObject<Map<string, HTMLDivElement>>
	propsRef: React.RefObject<{
		readOnly?: boolean
		data: TData[]
		enableSingleCellSelection?: boolean
		enableCellContextMenu?: boolean
	}>
	dir: Direction
	focusCell: (rowIndex: number, columnId: string) => void
	focusCellWrapper: (rowIndex: number, columnId: string) => void
	navigateCell: (direction: NavigationDirection) => void
	selectRange: (
		start: CellPosition,
		end: CellPosition,
		isSelecting?: boolean,
	) => void
	onSelectionClear: () => void
}

interface UseDataGridEditingReturn {
	onCellEditingStart: (rowIndex: number, columnId: string) => void
	onCellEditingStop: (opts?: {
		moveToNextRow?: boolean
		direction?: NavigationDirection
	}) => void
	onCellClick: (
		rowIndex: number,
		columnId: string,
		event?: React.MouseEvent,
	) => void
	onCellDoubleClick: (
		rowIndex: number,
		columnId: string,
		event?: React.MouseEvent,
	) => void
	onCellMouseDown: (
		rowIndex: number,
		columnId: string,
		event: React.MouseEvent,
	) => void
	onCellMouseEnter: (rowIndex: number, columnId: string) => void
	onCellMouseUp: () => void
	onCellContextMenu: (
		rowIndex: number,
		columnId: string,
		event: React.MouseEvent,
	) => void
}

function useDataGridEditing<TData>({
	store,
	tableRef,
	dataGridRef,
	cellMapRef,
	propsRef,
	dir,
	focusCell,
	focusCellWrapper,
	navigateCell,
	selectRange,
	onSelectionClear,
}: UseDataGridEditingParams<TData>): UseDataGridEditingReturn {
	const onCellEditingStart = React.useCallback(
		(rowIndex: number, columnId: string) => {
			if (propsRef.current.readOnly) return

			store.batch(() => {
				store.setState('focusedCell', { rowIndex, columnId })
				store.setState('editingCell', { rowIndex, columnId })
			})
		},
		[store, propsRef],
	)

	const onCellEditingStop = React.useCallback(
		(opts?: { moveToNextRow?: boolean; direction?: NavigationDirection }) => {
			const currentState = store.getState()
			const currentEditing = currentState.editingCell

			store.setState('editingCell', null)

			if (opts?.moveToNextRow && currentEditing) {
				const { rowIndex, columnId } = currentEditing
				const currentTable = tableRef.current
				const rows = currentTable?.getRowModel().rows ?? []
				const rowCount = rows.length ?? propsRef.current.data.length

				const nextRowIndex = rowIndex + 1
				if (nextRowIndex < rowCount) {
					requestAnimationFrame(() => {
						focusCell(nextRowIndex, columnId)
					})
				}
			} else if (opts?.direction && currentEditing) {
				const { rowIndex, columnId } = currentEditing
				focusCell(rowIndex, columnId)
				requestAnimationFrame(() => {
					navigateCell(opts.direction ?? 'right')
				})
			} else if (currentEditing) {
				const { rowIndex, columnId } = currentEditing
				focusCellWrapper(rowIndex, columnId)
			}
		},
		[store, propsRef, tableRef, focusCell, navigateCell, focusCellWrapper],
	)

	const onCellClick = React.useCallback(
		(rowIndex: number, columnId: string, event?: React.MouseEvent) => {
			if (event?.button === 2) {
				return
			}

			const currentState = store.getState()
			const currentFocused = currentState.focusedCell

			function scrollToCell() {
				requestAnimationFrame(() => {
					const container = dataGridRef.current
					const cellKey = getCellKey(rowIndex, columnId)
					const targetCell = cellMapRef.current.get(cellKey)

					if (container && targetCell) {
						scrollCellIntoView({
							container,
							targetCell,
							tableRef,
							viewportOffset: VIEWPORT_OFFSET,
							isRtl: dir === 'rtl',
						})
					}
				})
			}

			if (event) {
				if (event.ctrlKey || event.metaKey) {
					event.preventDefault()
					const cellKey = getCellKey(rowIndex, columnId)
					const newSelectedCells = new Set(
						currentState.selectionState.selectedCells,
					)

					if (newSelectedCells.has(cellKey)) {
						newSelectedCells.delete(cellKey)
					} else {
						newSelectedCells.add(cellKey)
					}

					store.setState('selectionState', {
						selectedCells: newSelectedCells,
						selectionRange: null,
						isSelecting: false,
					})
					focusCell(rowIndex, columnId)
					scrollToCell()
					return
				}

				if (event.shiftKey && currentState.focusedCell) {
					event.preventDefault()
					selectRange(currentState.focusedCell, { rowIndex, columnId })
					scrollToCell()
					return
				}
			}

			const hasSelectedCells =
				currentState.selectionState.selectedCells.size > 0
			const hasSelectedRows = Object.keys(currentState.rowSelection).length > 0

			if (hasSelectedCells && !currentState.selectionState.isSelecting) {
				const cellKey = getCellKey(rowIndex, columnId)
				const isClickingSelectedCell =
					currentState.selectionState.selectedCells.has(cellKey)

				if (!isClickingSelectedCell) {
					onSelectionClear()
				} else {
					focusCell(rowIndex, columnId)
					scrollToCell()
					return
				}
			} else if (hasSelectedRows && columnId !== 'select') {
				onSelectionClear()
			}

			if (
				currentFocused?.rowIndex === rowIndex &&
				currentFocused?.columnId === columnId
			) {
				onCellEditingStart(rowIndex, columnId)
			} else {
				focusCell(rowIndex, columnId)
				scrollToCell()
			}
		},
		[
			store,
			focusCell,
			onCellEditingStart,
			selectRange,
			onSelectionClear,
			dir,
			cellMapRef,
			dataGridRef,
			tableRef,
		],
	)

	const onCellDoubleClick = React.useCallback(
		(rowIndex: number, columnId: string, event?: React.MouseEvent) => {
			if (event?.defaultPrevented) return

			onCellEditingStart(rowIndex, columnId)
		},
		[onCellEditingStart],
	)

	const onCellMouseDown = React.useCallback(
		(rowIndex: number, columnId: string, event: React.MouseEvent) => {
			if (event.button === 2) {
				return
			}

			event.preventDefault()

			if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
				const cellKey = getCellKey(rowIndex, columnId)
				store.batch(() => {
					store.setState('selectionState', {
						selectedCells: propsRef.current.enableSingleCellSelection
							? new Set([cellKey])
							: new Set(),
						selectionRange: {
							start: { rowIndex, columnId },
							end: { rowIndex, columnId },
						},
						isSelecting: true,
					})
					store.setState('rowSelection', {})
				})
			}
		},
		[store, propsRef],
	)

	const onCellMouseEnter = React.useCallback(
		(rowIndex: number, columnId: string) => {
			const currentState = store.getState()
			if (
				currentState.selectionState.isSelecting &&
				currentState.selectionState.selectionRange
			) {
				const start = currentState.selectionState.selectionRange.start
				const end = { rowIndex, columnId }

				if (
					currentState.focusedCell?.rowIndex !== start.rowIndex ||
					currentState.focusedCell?.columnId !== start.columnId
				) {
					focusCell(start.rowIndex, start.columnId)
				}

				selectRange(start, end, true)
			}
		},
		[store, selectRange, focusCell],
	)

	const onCellMouseUp = React.useCallback(() => {
		const currentState = store.getState()
		store.setState('selectionState', {
			...currentState.selectionState,
			isSelecting: false,
		})
	}, [store])

	const onCellContextMenu = React.useCallback(
		(rowIndex: number, columnId: string, event: React.MouseEvent) => {
			if (propsRef.current.enableCellContextMenu === false) {
				return
			}
			event.preventDefault()
			event.stopPropagation()

			const currentState = store.getState()
			const cellKey = getCellKey(rowIndex, columnId)
			const isTargetCellSelected =
				currentState.selectionState.selectedCells.has(cellKey)

			if (!isTargetCellSelected) {
				store.batch(() => {
					store.setState('selectionState', {
						selectedCells: new Set([cellKey]),
						selectionRange: {
							start: { rowIndex, columnId },
							end: { rowIndex, columnId },
						},
						isSelecting: false,
					})
					store.setState('focusedCell', { rowIndex, columnId })
				})
			} else if (
				currentState.focusedCell?.rowIndex !== rowIndex ||
				currentState.focusedCell?.columnId !== columnId
			) {
				store.setState('focusedCell', { rowIndex, columnId })
			}

			store.setState('contextMenu', {
				open: true,
				x: event.clientX,
				y: event.clientY,
			})
		},
		[store, propsRef],
	)

	return {
		onCellEditingStart,
		onCellEditingStop,
		onCellClick,
		onCellDoubleClick,
		onCellMouseDown,
		onCellMouseEnter,
		onCellMouseUp,
		onCellContextMenu,
	}
}

export {
	//
	type UseDataGridEditingParams,
	type UseDataGridEditingReturn,
	useDataGridEditing,
}

import type { ColumnDef, useReactTable } from '@tanstack/react-table'
import type { Virtualizer } from '@tanstack/react-virtual'
import * as React from 'react'
import {
	getCellKey,
	getRowHeightValue,
	getScrollDirection,
	scrollCellIntoView,
} from '../lib/data-grid'
import type {
	CellPosition,
	Direction,
	NavigationDirection,
	RowHeightValue,
} from '../types/data-grid'
import type { DataGridStore } from './use-data-grid-store'

const VIEWPORT_OFFSET = 1
const HORIZONTAL_PAGE_SIZE = 5
const SCROLL_SYNC_RETRY_COUNT = 16
const NON_NAVIGABLE_COLUMN_IDS = ['select', 'actions']

interface UseDataGridNavigationParams<TData> {
	store: DataGridStore
	dataGridRef: React.RefObject<HTMLDivElement | null>
	headerRef: React.RefObject<HTMLDivElement | null>
	footerRef: React.RefObject<HTMLDivElement | null>
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>
	rowVirtualizerRef: React.RefObject<Virtualizer<
		HTMLDivElement,
		Element
	> | null>
	rowMapRef: React.RefObject<Map<number, HTMLDivElement>>
	cellMapRef: React.RefObject<Map<string, HTMLDivElement>>
	focusGuardRef: React.RefObject<boolean>
	propsRef: React.RefObject<{
		data: TData[]
		columns: ColumnDef<TData, unknown>[]
	}>
	dir: Direction
	navigableColumnIds: string[]
	rowHeight: RowHeightValue
}

interface UseDataGridNavigationReturn {
	focusCell: (rowIndex: number, columnId: string) => void
	focusCellWrapper: (rowIndex: number, columnId: string) => void
	releaseFocusGuard: (immediate?: boolean) => void
	blurCell: () => void
	navigateCell: (direction: NavigationDirection) => void
	onScrollToRow: (opts: Partial<CellPosition>) => Promise<void>
}

function useDataGridNavigation<TData>({
	store,
	dataGridRef,
	headerRef,
	footerRef,
	tableRef,
	rowVirtualizerRef,
	rowMapRef,
	cellMapRef,
	focusGuardRef,
	propsRef,
	dir,
	navigableColumnIds,
	rowHeight,
}: UseDataGridNavigationParams<TData>): UseDataGridNavigationReturn {
	// Release focus guard after delay to allow async data re-renders to settle.
	// 300ms accounts for db sync and virtualized cell mounting.
	const releaseFocusGuard = React.useCallback(
		(immediate = false) => {
			if (immediate) {
				focusGuardRef.current = false
				return
			}

			setTimeout(() => {
				focusGuardRef.current = false
			}, 300)
		},
		[focusGuardRef],
	)

	const focusCellWrapper = React.useCallback(
		(rowIndex: number, columnId: string) => {
			focusGuardRef.current = true

			requestAnimationFrame(() => {
				const cellKey = getCellKey(rowIndex, columnId)
				const cellWrapperElement = cellMapRef.current.get(cellKey)

				if (!cellWrapperElement) {
					const container = dataGridRef.current
					if (container) {
						container.focus()
					}
					releaseFocusGuard()
					return
				}

				cellWrapperElement.focus()
				releaseFocusGuard()
			})
		},
		[releaseFocusGuard, focusGuardRef, cellMapRef, dataGridRef],
	)

	const focusCell = React.useCallback(
		(rowIndex: number, columnId: string) => {
			store.batch(() => {
				store.setState('focusedCell', { rowIndex, columnId })
				store.setState('editingCell', null)
			})

			const currentState = store.getState()

			if (currentState.searchOpen) return

			focusCellWrapper(rowIndex, columnId)
		},
		[store, focusCellWrapper],
	)

	const blurCell = React.useCallback(() => {
		const currentState = store.getState()
		if (
			currentState.editingCell &&
			document.activeElement instanceof HTMLElement
		) {
			document.activeElement.blur()
		}

		store.batch(() => {
			store.setState('focusedCell', null)
			store.setState('editingCell', null)
		})
	}, [store])

	const navigateCell = React.useCallback(
		(direction: NavigationDirection) => {
			const currentState = store.getState()
			if (!currentState.focusedCell) return

			const { rowIndex, columnId } = currentState.focusedCell
			const currentColIndex = navigableColumnIds.indexOf(columnId)
			const rowVirtualizer = rowVirtualizerRef.current
			const currentTable = tableRef.current
			const rows = currentTable?.getRowModel().rows ?? []
			const rowCount = rows.length ?? propsRef.current.data.length

			let newRowIndex = rowIndex
			let newColumnId = columnId

			const isRtl = dir === 'rtl'

			switch (direction) {
				case 'up':
					newRowIndex = Math.max(0, rowIndex - 1)
					break
				case 'down':
					newRowIndex = Math.min(rowCount - 1, rowIndex + 1)
					break
				case 'left':
					if (isRtl) {
						if (currentColIndex < navigableColumnIds.length - 1) {
							const nextColumnId = navigableColumnIds[currentColIndex + 1]
							if (nextColumnId) newColumnId = nextColumnId
						}
					} else {
						if (currentColIndex > 0) {
							const prevColumnId = navigableColumnIds[currentColIndex - 1]
							if (prevColumnId) newColumnId = prevColumnId
						}
					}
					break
				case 'right':
					if (isRtl) {
						if (currentColIndex > 0) {
							const prevColumnId = navigableColumnIds[currentColIndex - 1]
							if (prevColumnId) newColumnId = prevColumnId
						}
					} else {
						if (currentColIndex < navigableColumnIds.length - 1) {
							const nextColumnId = navigableColumnIds[currentColIndex + 1]
							if (nextColumnId) newColumnId = nextColumnId
						}
					}
					break
				case 'home':
					if (navigableColumnIds.length > 0) {
						newColumnId = navigableColumnIds[0] ?? columnId
					}
					break
				case 'end':
					if (navigableColumnIds.length > 0) {
						newColumnId =
							navigableColumnIds[navigableColumnIds.length - 1] ?? columnId
					}
					break
				case 'ctrl+home':
					newRowIndex = 0
					if (navigableColumnIds.length > 0) {
						newColumnId = navigableColumnIds[0] ?? columnId
					}
					break
				case 'ctrl+end':
					newRowIndex = Math.max(0, rowCount - 1)
					if (navigableColumnIds.length > 0) {
						newColumnId =
							navigableColumnIds[navigableColumnIds.length - 1] ?? columnId
					}
					break
				case 'ctrl+up':
					newRowIndex = 0
					break
				case 'ctrl+down':
					newRowIndex = Math.max(0, rowCount - 1)
					break
				case 'pageup':
					if (rowVirtualizer) {
						const visibleRange = rowVirtualizer.getVirtualItems()
						const pageSize = visibleRange.length ?? 10
						newRowIndex = Math.max(0, rowIndex - pageSize)
					} else {
						newRowIndex = Math.max(0, rowIndex - 10)
					}
					break
				case 'pagedown':
					if (rowVirtualizer) {
						const visibleRange = rowVirtualizer.getVirtualItems()
						const pageSize = visibleRange.length ?? 10
						newRowIndex = Math.min(rowCount - 1, rowIndex + pageSize)
					} else {
						newRowIndex = Math.min(rowCount - 1, rowIndex + 10)
					}
					break
				case 'pageleft':
					if (currentColIndex > 0) {
						const targetIndex = Math.max(
							0,
							currentColIndex - HORIZONTAL_PAGE_SIZE,
						)
						const targetColumnId = navigableColumnIds[targetIndex]
						if (targetColumnId) newColumnId = targetColumnId
					}
					break
				case 'pageright':
					if (currentColIndex < navigableColumnIds.length - 1) {
						const targetIndex = Math.min(
							navigableColumnIds.length - 1,
							currentColIndex + HORIZONTAL_PAGE_SIZE,
						)
						const targetColumnId = navigableColumnIds[targetIndex]
						if (targetColumnId) newColumnId = targetColumnId
					}
					break
			}

			if (newRowIndex !== rowIndex || newColumnId !== columnId) {
				focusCell(newRowIndex, newColumnId)

				// Calculate and apply scrolls synchronously to avoid flashing
				const container = dataGridRef.current
				if (!container) return

				const targetRow = rowMapRef.current.get(newRowIndex)
				const cellKey = getCellKey(newRowIndex, newColumnId)
				const targetCell = cellMapRef.current.get(cellKey)

				// If target row is not rendered, scroll it into view first
				if (!targetRow) {
					if (rowVirtualizer) {
						const align =
							direction === 'up' ||
							direction === 'pageup' ||
							direction === 'ctrl+up' ||
							direction === 'ctrl+home'
								? 'start'
								: direction === 'down' ||
										direction === 'pagedown' ||
										direction === 'ctrl+down' ||
										direction === 'ctrl+end'
									? 'end'
									: 'center'

						rowVirtualizer.scrollToIndex(newRowIndex, { align })

						// Wait for row to render before horizontal scroll
						if (newColumnId !== columnId) {
							requestAnimationFrame(() => {
								const cellKeyRetry = getCellKey(newRowIndex, newColumnId)
								const targetCellRetry = cellMapRef.current.get(cellKeyRetry)

								if (targetCellRetry) {
									const scrollDirection = getScrollDirection(direction)

									scrollCellIntoView({
										container,
										targetCell: targetCellRetry,
										tableRef,
										viewportOffset: VIEWPORT_OFFSET,
										direction: scrollDirection,
										isRtl: dir === 'rtl',
									})
								}
							})
						}
					} else {
						// Fallback: use direct scroll calculation when virtualizer is not available
						const rowHeightValue = getRowHeightValue(rowHeight)
						const estimatedScrollTop = newRowIndex * rowHeightValue
						container.scrollTop = estimatedScrollTop
					}

					return
				}

				// Vertical scrolling for rendered rows that changed
				if (newRowIndex !== rowIndex && targetRow) {
					requestAnimationFrame(() => {
						const containerRect = container.getBoundingClientRect()
						const headerHeight =
							headerRef.current?.getBoundingClientRect().height ?? 0
						const footerHeight =
							footerRef.current?.getBoundingClientRect().height ?? 0
						const viewportTop =
							containerRect.top + headerHeight + VIEWPORT_OFFSET
						const viewportBottom =
							containerRect.bottom - footerHeight - VIEWPORT_OFFSET

						const rowRect = targetRow.getBoundingClientRect()
						const isFullyVisible =
							rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom

						if (!isFullyVisible) {
							// Only apply vertical scroll for vertical navigation
							const isVerticalNavigation =
								direction === 'up' ||
								direction === 'down' ||
								direction === 'pageup' ||
								direction === 'pagedown' ||
								direction === 'ctrl+up' ||
								direction === 'ctrl+down' ||
								direction === 'ctrl+home' ||
								direction === 'ctrl+end'

							if (isVerticalNavigation) {
								if (
									direction === 'down' ||
									direction === 'pagedown' ||
									direction === 'ctrl+down' ||
									direction === 'ctrl+end'
								) {
									container.scrollTop += rowRect.bottom - viewportBottom
								} else {
									container.scrollTop -= viewportTop - rowRect.top
								}
							}
						}
					})
				}

				// Horizontal scrolling for rendered cells
				if (newColumnId !== columnId && targetCell) {
					requestAnimationFrame(() => {
						const scrollDirection = getScrollDirection(direction)

						scrollCellIntoView({
							container,
							targetCell,
							tableRef,
							viewportOffset: VIEWPORT_OFFSET,
							direction: scrollDirection,
							isRtl: dir === 'rtl',
						})
					})
				}
			}
		},
		[
			dir,
			store,
			navigableColumnIds,
			focusCell,
			propsRef,
			rowHeight,
			cellMapRef,
			dataGridRef,
			footerRef,
			headerRef,
			rowMapRef,
			rowVirtualizerRef,
			tableRef,
		],
	)

	const onScrollToRow = React.useCallback(
		async (opts: Partial<CellPosition>) => {
			const rowIndex = opts?.rowIndex ?? 0
			const columnId = opts?.columnId

			focusGuardRef.current = true

			const navigableIds = propsRef.current.columns
				.map((c) => {
					if (c.id) return c.id
					if ('accessorKey' in c) return c.accessorKey as string
					return undefined
				})
				.filter((id): id is string => Boolean(id))
				.filter((c) => !NON_NAVIGABLE_COLUMN_IDS.includes(c))

			const targetColumnId = columnId ?? navigableIds[0]

			if (!targetColumnId) {
				releaseFocusGuard(true)
				return
			}

			const rowVirtualizer = rowVirtualizerRef.current

			async function onScrollAndFocus(retryCount: number) {
				if (!targetColumnId) return
				const currentRowCount = propsRef.current.data.length

				// If the requested row doesn't exist yet, wait for data to update
				if (rowIndex >= currentRowCount && retryCount > 0) {
					await new Promise((resolve) => setTimeout(resolve, 50))
					await onScrollAndFocus(retryCount - 1)
					return
				}

				const safeRowIndex = Math.min(
					rowIndex,
					Math.max(0, currentRowCount - 1),
				)

				const isBottomHalf = safeRowIndex > currentRowCount / 2
				rowVirtualizer?.scrollToIndex(safeRowIndex, {
					align: isBottomHalf ? 'end' : 'start',
				})

				await new Promise((resolve) => requestAnimationFrame(resolve))

				// Adjust scroll position to account for sticky header/footer
				const container = dataGridRef.current
				const targetRow = rowMapRef.current.get(safeRowIndex)

				if (container && targetRow) {
					const containerRect = container.getBoundingClientRect()
					const headerHeight =
						headerRef.current?.getBoundingClientRect().height ?? 0
					const footerHeight =
						footerRef.current?.getBoundingClientRect().height ?? 0

					const viewportTop = containerRect.top + headerHeight + VIEWPORT_OFFSET
					const viewportBottom =
						containerRect.bottom - footerHeight - VIEWPORT_OFFSET

					const rowRect = targetRow.getBoundingClientRect()
					const isFullyVisible =
						rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom

					if (!isFullyVisible) {
						if (rowRect.top < viewportTop) {
							// Row is partially hidden by header - scroll up
							container.scrollTop -= viewportTop - rowRect.top
						} else if (rowRect.bottom > viewportBottom) {
							// Row is partially hidden by footer - scroll down
							container.scrollTop += rowRect.bottom - viewportBottom
						}
					}
				}

				store.batch(() => {
					store.setState('focusedCell', {
						rowIndex: safeRowIndex,
						columnId: targetColumnId,
					})
					store.setState('editingCell', null)
				})

				const cellKey = getCellKey(safeRowIndex, targetColumnId)
				const cellElement = cellMapRef.current.get(cellKey)

				if (cellElement) {
					cellElement.focus()
					releaseFocusGuard()
				} else if (retryCount > 0) {
					await new Promise((resolve) => requestAnimationFrame(resolve))
					await onScrollAndFocus(retryCount - 1)
				} else {
					dataGridRef.current?.focus()
					releaseFocusGuard()
				}
			}

			await onScrollAndFocus(SCROLL_SYNC_RETRY_COUNT)
		},
		[
			rowVirtualizerRef,
			propsRef,
			store,
			releaseFocusGuard,
			focusGuardRef,
			cellMapRef,
			dataGridRef,
			footerRef,
			headerRef,
			rowMapRef,
		],
	)

	return {
		focusCell,
		focusCellWrapper,
		releaseFocusGuard,
		blurCell,
		navigateCell,
		onScrollToRow,
	}
}

export {
	//
	type UseDataGridNavigationParams,
	type UseDataGridNavigationReturn,
	useDataGridNavigation,
}

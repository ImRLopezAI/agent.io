import { useDirection } from '@base-ui/react/direction-provider'
import {
	type ColumnOrderState,
	type ExpandedState,
	type Row,
	type RowSelectionState,
	type TableMeta,
	type TableOptions,
	type Updater,
	useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import * as React from 'react'

import {
	createFilterMenuRequestBus,
	type DataGridActionsContextValue,
} from '../contexts/data-grid-actions-context'
import type { DataGridSelectorsContextValue } from '../contexts/data-grid-selectors-context'
import type { DataGridStateContextValue } from '../contexts/data-grid-state-context'
import type { DataGridPaginationProps } from '../data-grid-pagination'
import { getDataGridSelectColumn } from '../data-grid-select-column'
import {
	getCellKey,
	getColumnSizeVarId,
	getIsInPopover,
	getRowHeightValue,
} from '../lib/data-grid'
import {
	getInitialColumnFilters,
	getInitialGlobalFilter,
	getInitialSorting,
} from '../lib/data-grid-controlled-state'
import {
	readServerFilterStateFromUrl,
	resolveServerFiltersOptions,
} from '../server/server-filters'
import type {
	CellPosition,
	CellUpdate,
	DataGridServerFilterState,
	DataGridServerFiltersOptions,
	Direction,
	FileCellData,
	RowHeightValue,
} from '../types/data-grid'
import { useAsRef } from './use-as-ref'
import { useDataGridClipboard } from './use-data-grid-clipboard'
import { useDataGridEditing } from './use-data-grid-editing'
import { useDataGridKeyboard } from './use-data-grid-keyboard'
import { useDataGridNavigation } from './use-data-grid-navigation'
import { useDataGridSearch } from './use-data-grid-search'
import { useDataGridSelection } from './use-data-grid-selection'
import { useDataGridServerFilter } from './use-data-grid-server-filter'
import {
	createDataGridStore,
	type DataGridState,
	type DataGridStore,
	useStore,
} from './use-data-grid-store'
import { useDataGridTableOptions } from './use-data-grid-table-options'
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect'
import { useLazyRef } from './use-lazy-ref'

const DEFAULT_ROW_HEIGHT = 'short'
const OVERSCAN = 6
const NON_NAVIGABLE_COLUMN_IDS = ['select', 'actions']

interface UseDataGridProps<TData>
	extends Omit<TableOptions<TData>, 'getCoreRowModel' | 'onColumnOrderChange'> {
	/**
	 * Called when the user reorders columns (drag-and-drop or context menu).
	 * Receives the resolved next column order so consumers can persist it
	 * without dealing with TanStack's `Updater<ColumnOrderState>` shape.
	 */
	onColumnOrderChange?: (columnOrder: string[]) => void
	/**
	 * Enables server-mode for filtering, sorting, and pagination. When set
	 * (truthy / options object), the grid commits filter/sort/pagination state
	 * to the consumer (via `onCommit` / URL sync) and OPTS OUT of TanStack's
	 * client-side row models: `manualFiltering`, `manualSorting`, and
	 * `manualPagination` are forced on, and `getFilteredRowModel` /
	 * `getSortedRowModel` are omitted from the table options. The consumer is
	 * the source of truth for the visible row set; the grid will not
	 * re-filter or re-sort `data` locally.
	 */
	serverFilters?: boolean | DataGridServerFiltersOptions
	onDataChange?: (data: TData[]) => void
	onRowAdd?: (
		event?: React.MouseEvent<HTMLDivElement>,
	) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null
	onRowsAdd?: (count: number) => void | Promise<void>
	/**
	 * @param rows the row originals being deleted.
	 * @param rowIndices visual row indices — **@deprecated** prefer `rowIds`.
	 * @param rowIds stable TanStack row ids matching `rowIndices` index for
	 *   index. Available alongside `rowIndices` for consumers that key off
	 *   row identity rather than visual position.
	 */
	onRowsDelete?: (
		rows: TData[],
		rowIndices: number[],
		rowIds?: string[],
	) => void | Promise<void>
	onPaste?: (updates: Array<CellUpdate>) => void | Promise<void>
	/**
	 * @param params.rowIndex visual row index — **@deprecated** prefer
	 *   `params.rowId`.
	 * @param params.rowId stable TanStack row id; available alongside
	 *   `rowIndex`.
	 */
	onFilesUpload?: (params: {
		files: File[]
		rowIndex: number
		columnId: string
		rowId?: string
	}) => Promise<FileCellData[]>
	/**
	 * @param params.rowIndex visual row index — **@deprecated** prefer
	 *   `params.rowId`.
	 * @param params.rowId stable TanStack row id; available alongside
	 *   `rowIndex`.
	 */
	onFilesDelete?: (params: {
		fileIds: string[]
		rowIndex: number
		columnId: string
		rowId?: string
	}) => void | Promise<void>
	rowHeight?: RowHeightValue
	onRowHeightChange?: (rowHeight: RowHeightValue) => void
	overscan?: number
	dir?: Direction
	autoFocus?: boolean | Partial<CellPosition>
	enableSingleCellSelection?: boolean
	enableColumnSelection?: boolean
	enableSearch?: boolean
	enablePaste?: boolean
	enableCellContextMenu?: boolean
	/**
	 * Enables drag-and-drop column reordering. When false (the default), header
	 * cells render without the drag handle and the SortableContext wrapper is
	 * skipped. Pinned and system columns (`select`, `actions`) are never
	 * reorderable regardless of this flag. Reordering only persists when the
	 * caller treats the grid as uncontrolled for `columnOrder` or when an
	 * `onColumnOrderChange` consumer wires it back to its own store.
	 */
	enableColumnReorder?: boolean
	/**
	 * Enables the Excel/Sheets-style selection summary footer that aggregates
	 * the currently selected cells. When the selection is homogeneous and
	 * numeric, surfaces Sum (default), Avg, Min, Max, Count, Count Numbers.
	 * For dates: Min, Max, Count, Count Numbers. For text-only or mixed
	 * selections: Count. The footer is hidden when no cells are selected.
	 */
	enableSelectionSummary?: boolean
	readOnly?: boolean
	withSelect?: boolean
	enablePagination?: boolean
	showPagination?: boolean
	paginationProps?: Omit<DataGridPaginationProps<TData>, 'table'>
	scrollInterceptors?: string[]
}

function useDataGrid<TData>({
	data,
	columns: columnsProp,
	rowHeight: rowHeightProp = DEFAULT_ROW_HEIGHT,
	overscan = OVERSCAN,
	dir: dirProp,
	readOnly,
	withSelect = false,
	enablePagination = false,
	showPagination,
	paginationProps,
	initialState,
	enableCellContextMenu = true,
	...props
}: UseDataGridProps<TData>) {
	const inheritedDir = useDirection()
	const dir = dirProp ?? inheritedDir
	const resolvedEnablePagination =
		enablePagination ||
		Boolean(showPagination) ||
		Boolean(paginationProps) ||
		Boolean(initialState?.pagination) ||
		Boolean(props.state?.pagination) ||
		Boolean(props.onPaginationChange) ||
		Boolean(props.pageCount) ||
		Boolean(props.manualPagination)
	const columns = React.useMemo(() => {
		if (!withSelect) return columnsProp
		const hasSelectColumn = columnsProp.some((column) => {
			if (column.id) return column.id === 'select'
			if ('accessorKey' in column) {
				return column.accessorKey === 'select'
			}
			return false
		})
		if (hasSelectColumn) return columnsProp
		return [getDataGridSelectColumn<TData>({}), ...columnsProp]
	}, [columnsProp, readOnly, withSelect])
	const dataGridRef = React.useRef<HTMLDivElement>(null)
	const tableRef = React.useRef<ReturnType<typeof useReactTable<TData>>>(null)
	const rowVirtualizerRef =
		React.useRef<Virtualizer<HTMLDivElement, Element>>(null)
	const headerRef = React.useRef<HTMLDivElement>(null)
	const rowMapRef = React.useRef<Map<number, HTMLDivElement>>(new Map())
	const cellMapRef = React.useRef<Map<string, HTMLDivElement>>(new Map())
	const footerRef = React.useRef<HTMLDivElement>(null)
	const focusGuardRef = React.useRef(false)

	const propsRef = useAsRef({
		...props,
		readOnly,
		enablePagination: resolvedEnablePagination,
		enableCellContextMenu,
		data,
		columns,
		initialState,
	})

	const storeRef = useLazyRef<DataGridStore>(() => {
		const fallbackServerFilterState: DataGridServerFilterState = {
			globalFilter: getInitialGlobalFilter(
				typeof props.state?.globalFilter === 'string'
					? props.state.globalFilter
					: undefined,
				typeof initialState?.globalFilter === 'string'
					? initialState.globalFilter
					: undefined,
			),
			sorting: getInitialSorting(props.state?.sorting, initialState?.sorting),
			columnFilters: getInitialColumnFilters(
				props.state?.columnFilters,
				initialState?.columnFilters,
			),
		}
		const initialResolvedServerFilters = resolveServerFiltersOptions(
			props.serverFilters,
		)
		const initialServerFilterState = initialResolvedServerFilters?.syncUrl
			? readServerFilterStateFromUrl({
					params: initialResolvedServerFilters.params,
					fallbackState: fallbackServerFilterState,
				})
			: fallbackServerFilterState

		const initialDataGridState: DataGridState = {
			globalFilter: initialServerFilterState.globalFilter,
			sorting: initialServerFilterState.sorting,
			columnFilters: initialServerFilterState.columnFilters,
			columnOrder: initialState?.columnOrder ?? props.state?.columnOrder ?? [],
			rowHeight: rowHeightProp,
			rowSelection: initialState?.rowSelection ?? {},
			expanded: initialState?.expanded ?? {},
			selectionState: {
				selectedCells: new Set(),
				selectionRange: null,
				isSelecting: false,
			},
			focusedCell: null,
			editingCell: null,
			cutCells: new Set(),
			contextMenu: {
				open: false,
				x: 0,
				y: 0,
			},
			searchQuery: '',
			replaceQuery: '',
			searchCaseSensitive: false,
			searchWholeWord: false,
			searchRegex: false,
			searchRegexError: null,
			searchInSelection: false,
			searchMatches: [],
			matchIndex: -1,
			searchOpen: false,
			lastClickedRowIndex: null,
			pasteDialog: {
				open: false,
				rowsNeeded: 0,
				clipboardText: '',
			},
			liveAnnouncement: '',
		}

		return createDataGridStore(initialDataGridState)
	})

	const store = storeRef.current

	const focusedCell = useStore(store, (state) => state.focusedCell)
	const editingCell = useStore(store, (state) => state.editingCell)
	const rowSelection = useStore(store, (state) => state.rowSelection)
	const expanded = useStore(store, (state) => state.expanded)
	const columnOrder = useStore(store, (state) => state.columnOrder)
	const rowHeight = useStore(store, (state) => state.rowHeight)
	const contextMenu = useStore(store, (state) => state.contextMenu)
	const pasteDialog = useStore(store, (state) => state.pasteDialog)

	const {
		resolvedServerFilters,
		resolvedSorting,
		resolvedColumnFilters,
		resolvedGlobalFilter,
		onSortingChange,
		onColumnFiltersChange,
		onGlobalFilterChange,
	} = useDataGridServerFilter({
		store,
		propsRef,
		serverFilters: props.serverFilters,
		controlledGlobalFilter:
			typeof props.state?.globalFilter === 'string'
				? props.state.globalFilter
				: undefined,
		controlledSorting: props.state?.sorting,
		controlledColumnFilters: props.state?.columnFilters,
	})

	const rowHeightValue = getRowHeightValue(rowHeight)

	const visualRowIndexCacheRef = React.useRef<{
		rows: Row<TData>[] | null
		map: Map<string, number>
	} | null>(null)

	// Pre-compute visual row index map for O(1) lookups (used by select column)
	// Cache is invalidated when row model identity changes (sorting/filtering)
	const getVisualRowIndex = React.useCallback(
		(rowId: string): number | undefined => {
			const rows = tableRef.current?.getRowModel().rows
			if (!rows) return undefined

			if (visualRowIndexCacheRef.current?.rows !== rows) {
				const map = new Map<string, number>()
				for (const [i, row] of rows.entries()) {
					map.set(row.id, i + 1)
				}
				visualRowIndexCacheRef.current = { rows, map }
			}

			return visualRowIndexCacheRef.current.map.get(rowId)
		},
		[],
	)

	const columnIds = React.useMemo(() => {
		return columns
			.map((c) => {
				if (c.id) return c.id
				if ('accessorKey' in c) return c.accessorKey as string
				return undefined
			})
			.filter((id): id is string => Boolean(id))
	}, [columns])

	const navigableColumnIds = React.useMemo(() => {
		return columnIds.filter((c) => !NON_NAVIGABLE_COLUMN_IDS.includes(c))
	}, [columnIds])

	const onDataUpdate = React.useCallback(
		(updates: CellUpdate | Array<CellUpdate>) => {
			if (propsRef.current.readOnly) return

			const updateArray = Array.isArray(updates) ? updates : [updates]

			if (updateArray.length === 0) return

			const currentTable = tableRef.current
			const currentData = propsRef.current.data
			const rows = currentTable?.getRowModel().rows

			// Build newData from the full unfiltered `currentData` so rows hidden
			// by client-side filter/sort are preserved untouched. Only iterate
			// through the actual updates list and resolve each visual rowIndex
			// to its `originalRowIndex` in `currentData` via `row.original`.
			const newData: TData[] = currentData.slice()
			const updatedIndices = new Map<number, Record<string, unknown>>()

			for (const update of updateArray) {
				let targetIndex: number

				if (!rows || !currentTable) {
					targetIndex = update.rowIndex
				} else {
					const row = rows[update.rowIndex]
					if (!row) continue

					const originalRowIndex = currentData.indexOf(row.original)
					targetIndex =
						originalRowIndex !== -1 ? originalRowIndex : update.rowIndex
				}

				let updatedRow = updatedIndices.get(targetIndex)
				if (!updatedRow) {
					const baseRow =
						currentData[targetIndex] ??
						rows?.[update.rowIndex]?.original ??
						({} as TData)
					updatedRow = { ...baseRow } as Record<string, unknown>
					updatedIndices.set(targetIndex, updatedRow)
				}
				updatedRow[update.columnId] = update.value
			}

			for (const [index, updatedRow] of updatedIndices) {
				newData[index] = updatedRow as TData
			}

			propsRef.current.onDataChange?.(newData)
		},
		[propsRef],
	)

	const {
		getIsCellSelected,
		onSelectionClear,
		selectAll,
		selectColumn,
		selectRange,
		cellSelectionMap,
	} = useDataGridSelection<TData>({
		store,
		tableRef,
		propsRef,
		columnIds,
	})

	const { onCellsCopy, onCellsCut, onCellsPaste, restoreFocus } =
		useDataGridClipboard<TData>({
			store,
			tableRef,
			dataGridRef,
			propsRef: propsRef as React.RefObject<{
				readOnly?: boolean
				data: TData[]
				onRowAdd?: (
					...args: unknown[]
				) =>
					| Partial<CellPosition>
					| Promise<Partial<CellPosition> | null>
					| null
				onRowsAdd?: (count: number) => void | Promise<void>
				onPaste?: (updates: Array<CellUpdate>) => void | Promise<void>
				enableSingleCellSelection?: boolean
			}>,
			navigableColumnIds,
			onDataUpdate,
			selectRange,
		})

	const {
		focusCell,
		focusCellWrapper,
		releaseFocusGuard,
		blurCell,
		navigateCell,
		onScrollToRow,
	} = useDataGridNavigation<TData>({
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
	})

	const {
		searchState,
		searchMatchesByRow,
		activeSearchMatch,
		onSearchOpenChange,
		onNavigateToNextMatch,
		onNavigateToPrevMatch,
		getIsSearchMatch,
		getIsActiveSearchMatch,
	} = useDataGridSearch<TData>({
		store,
		tableRef,
		dataGridRef,
		rowVirtualizerRef,
		columnIds,
		focusCell,
		onDataUpdate,
		enableSearch: propsRef.current.enableSearch ?? false,
		readOnly: Boolean(propsRef.current.readOnly),
	})

	const onRowsDelete = React.useCallback(
		async (rowIndices: number[]) => {
			if (
				propsRef.current.readOnly ||
				!propsRef.current.onRowsDelete ||
				rowIndices.length === 0
			)
				return

			const currentTable = tableRef.current
			const rows = currentTable?.getRowModel().rows

			if (!rows || rows.length === 0) return

			const currentState = store.getState()
			const currentFocusedColumn =
				currentState.focusedCell?.columnId ?? navigableColumnIds[0]

			const minDeletedRowIndex = Math.min(...rowIndices)

			const rowsToDelete: TData[] = []
			const rowIdsToDelete: string[] = []
			for (const rowIndex of rowIndices) {
				const row = rows[rowIndex]
				if (row) {
					rowsToDelete.push(row.original)
					rowIdsToDelete.push(row.id)
				}
			}

			await propsRef.current.onRowsDelete(
				rowsToDelete,
				rowIndices,
				rowIdsToDelete,
			)

			store.batch(() => {
				store.setState('selectionState', {
					selectedCells: new Set(),
					selectionRange: null,
					isSelecting: false,
				})
				store.setState('rowSelection', {})
				store.setState('editingCell', null)
			})

			requestAnimationFrame(() => {
				const currentTable = tableRef.current
				const currentRows = currentTable?.getRowModel().rows ?? []
				const newRowCount = currentRows.length ?? propsRef.current.data.length

				if (newRowCount > 0 && currentFocusedColumn) {
					const targetRowIndex = Math.min(minDeletedRowIndex, newRowCount - 1)
					focusCell(targetRowIndex, currentFocusedColumn)
				}
			})
		},
		[propsRef, store, navigableColumnIds, focusCell],
	)

	const {
		onCellEditingStart,
		onCellEditingStop,
		onCellClick,
		onCellDoubleClick,
		onCellMouseDown,
		onCellMouseEnter,
		onCellMouseUp,
		onCellContextMenu,
	} = useDataGridEditing<TData>({
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
	})

	const onContextMenuOpenChange = React.useCallback(
		(open: boolean) => {
			if (!open) {
				const currentMenu = store.getState().contextMenu
				store.setState('contextMenu', {
					open: false,
					x: currentMenu.x,
					y: currentMenu.y,
				})
			}
		},
		[store],
	)

	const onExpandedChange = React.useCallback(
		(updater: Updater<ExpandedState>) => {
			const currentState = store.getState()
			const newExpanded =
				typeof updater === 'function' ? updater(currentState.expanded) : updater
			store.setState('expanded', newExpanded)
			propsRef.current.onExpandedChange?.(newExpanded)
		},
		[store, propsRef],
	)

	const onRowSelectionChange = React.useCallback(
		(updater: Updater<RowSelectionState>) => {
			const currentState = store.getState()
			const newRowSelection =
				typeof updater === 'function'
					? updater(currentState.rowSelection)
					: updater

			const selectedRows = Object.keys(newRowSelection).filter(
				(key) => newRowSelection[key],
			)

			const selectedCells = new Set<string>()
			const rows = tableRef.current?.getRowModel().rows ?? []

			for (const rowId of selectedRows) {
				const rowIndex = rows.findIndex((r) => r.id === rowId)
				if (rowIndex === -1) continue

				for (const columnId of columnIds) {
					selectedCells.add(getCellKey(rowIndex, columnId))
				}
			}

			store.batch(() => {
				store.setState('rowSelection', newRowSelection)
				store.setState('selectionState', {
					selectedCells,
					selectionRange: null,
					isSelecting: false,
				})
				store.setState('focusedCell', null)
				store.setState('editingCell', null)
			})
		},
		[store, columnIds],
	)

	const onRowSelect = React.useCallback(
		(rowIndex: number, selected: boolean, shiftKey: boolean) => {
			const currentState = store.getState()
			const rows = tableRef.current?.getRowModel().rows ?? []
			const currentRow = rows[rowIndex]
			if (!currentRow) return

			if (shiftKey && currentState.lastClickedRowIndex !== null) {
				const startIndex = Math.min(currentState.lastClickedRowIndex, rowIndex)
				const endIndex = Math.max(currentState.lastClickedRowIndex, rowIndex)

				const newRowSelection: RowSelectionState = {
					...currentState.rowSelection,
				}

				for (let i = startIndex; i <= endIndex; i++) {
					const row = rows[i]
					if (row) {
						newRowSelection[row.id] = selected
					}
				}

				onRowSelectionChange(newRowSelection)
			} else {
				onRowSelectionChange({
					...currentState.rowSelection,
					[currentRow.id]: selected,
				})
			}

			store.setState('lastClickedRowIndex', rowIndex)
		},
		[store, onRowSelectionChange],
	)

	const onRowHeightChange = React.useCallback(
		(updater: Updater<RowHeightValue>) => {
			const currentState = store.getState()
			const newRowHeight =
				typeof updater === 'function'
					? updater(currentState.rowHeight)
					: updater
			store.setState('rowHeight', newRowHeight)
			propsRef.current.onRowHeightChange?.(newRowHeight)
		},
		[store, propsRef],
	)

	const onColumnClick = React.useCallback(
		(columnId: string) => {
			if (!propsRef.current.enableColumnSelection) {
				onSelectionClear()
				return
			}

			selectColumn(columnId)
		},
		[propsRef, selectColumn, onSelectionClear],
	)

	const onPasteDialogOpenChange = React.useCallback(
		(open: boolean) => {
			if (!open) {
				store.setState('pasteDialog', {
					open: false,
					rowsNeeded: 0,
					clipboardText: '',
				})
			}
		},
		[store],
	)

	const tableMeta = React.useMemo<TableMeta<TData>>(() => {
		return {
			...propsRef.current.meta,
			selectionStateStore: {
				subscribe: store.subscribe,
				getSnapshot: () => store.getState().selectionState,
			},
			// Use getters for frequently changing state values to avoid recreating meta
			get selectionState() {
				return store.getState().selectionState
			},
			get rowHeight() {
				return store.getState().rowHeight
			},
			onRowHeightChange,
			onColumnClick,
			onSelectionClear,
		}
	}, [propsRef, store, onRowHeightChange, onColumnClick, onSelectionClear])

	const onColumnOrderChange = React.useCallback(
		(updater: Updater<ColumnOrderState>) => {
			const previous = store.getState().columnOrder
			const next =
				typeof updater === 'function'
					? (updater as (prev: ColumnOrderState) => ColumnOrderState)(previous)
					: updater
			store.setState('columnOrder', next)
			propsRef.current.onColumnOrderChange?.(next)
		},
		[store, propsRef],
	)

	const filterMenuRequestBus = useLazyRef(createFilterMenuRequestBus)

	const requestFilterMenu = React.useCallback(
		(columnId: string) => {
			filterMenuRequestBus.current.emit(columnId)
		},
		[filterMenuRequestBus],
	)

	const stateContextValue = React.useMemo<DataGridStateContextValue>(
		() => ({
			store,
			dataGridRef,
			cellMapRef,
			get readOnly() {
				return Boolean(propsRef.current.readOnly)
			},
		}),
		[propsRef, store],
	)

	const actionsContextValue = React.useMemo<DataGridActionsContextValue>(
		() => ({
			onRowSelect,
			onRowsDelete: propsRef.current.onRowsDelete ? onRowsDelete : undefined,
			onColumnClick,
			onCellClick,
			onCellDoubleClick,
			onCellMouseDown,
			onCellMouseEnter,
			onCellMouseUp,
			onCellContextMenu,
			onCellEditingStart,
			onCellEditingStop,
			onDataUpdate,
			onCellsCopy,
			onCellsCut,
			onCellsPaste,
			onSelectionClear,
			onFilesUpload: propsRef.current.onFilesUpload,
			onFilesDelete: propsRef.current.onFilesDelete,
			onContextMenuOpenChange,
			onPasteDialogOpenChange,
			onRowHeightChange,
			requestFilterMenu,
		}),
		[
			propsRef,
			onRowSelect,
			onRowsDelete,
			onColumnClick,
			onCellClick,
			onCellDoubleClick,
			onCellMouseDown,
			onCellMouseEnter,
			onCellMouseUp,
			onCellContextMenu,
			onCellEditingStart,
			onCellEditingStop,
			onDataUpdate,
			onCellsCopy,
			onCellsCut,
			onCellsPaste,
			onSelectionClear,
			onContextMenuOpenChange,
			onPasteDialogOpenChange,
			onRowHeightChange,
			requestFilterMenu,
		],
	)

	const selectorsContextValue = React.useMemo<
		DataGridSelectorsContextValue<TData>
	>(
		() => ({
			getIsCellSelected,
			getIsSearchMatch,
			getIsActiveSearchMatch,
			getVisualRowIndex,
			getRowById: (rowId: string) =>
				tableRef.current?.getRowModel().rowsById[rowId],
			getCellSelectionForRow: (rowIndex: number) => {
				const sel = store.getState().selectionState.selectedCells
				const result = new Set<string>()
				const prefix = `${rowIndex}:`
				for (const key of sel) {
					if (key.startsWith(prefix)) {
						const [, columnId] = key.split(':')
						if (columnId) result.add(columnId)
					}
				}
				return result
			},
		}),
		[
			getIsCellSelected,
			getIsSearchMatch,
			getIsActiveSearchMatch,
			getVisualRowIndex,
			store,
		],
	)

	const { tableOptions } = useDataGridTableOptions<TData>({
		propsRef,
		data,
		columns,
		dir,
		tableMeta,
		resolvedGlobalFilter,
		resolvedSorting,
		resolvedColumnFilters,
		rowSelection,
		expanded,
		columnOrder,
		resolvedEnablePagination,
		resolvedServerFilters,
		onGlobalFilterChange,
		onRowSelectionChange,
		onSortingChange,
		onColumnFiltersChange,
		onExpandedChange,
		onColumnOrderChange,
	})

	const table = useReactTable(tableOptions)

	if (!tableRef.current) {
		tableRef.current = table
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: columnSizingInfo and columnSizing are used for calculating the column size vars
	const columnSizeVars = React.useMemo(() => {
		const headers = table.getFlatHeaders()
		const colSizes: { [key: string]: number } = {}
		for (const header of headers) {
			const headerKey = getColumnSizeVarId(header.id)
			const columnKey = getColumnSizeVarId(header.column.id)
			colSizes[`--header-${headerKey}-size`] = header.getSize()
			colSizes[`--col-${columnKey}-size`] = header.column.getSize()
		}
		colSizes['--grid-width'] = table.getTotalSize()
		return colSizes
	}, [table.getState().columnSizingInfo, table.getState().columnSizing])

	const isFirefox = React.useSyncExternalStore(
		React.useCallback(() => () => {}, []),
		React.useCallback(() => {
			if (typeof window === 'undefined' || typeof navigator === 'undefined') {
				return false
			}
			return navigator.userAgent.indexOf('Firefox') !== -1
		}, []),
		React.useCallback(() => false, []),
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: columnPinning is used for calculating the adjustLayout
	const adjustLayout = React.useMemo(() => {
		const columnPinning = table.getState().columnPinning
		return (
			isFirefox &&
			((columnPinning.left?.length ?? 0) > 0 ||
				(columnPinning.right?.length ?? 0) > 0)
		)
	}, [isFirefox, table.getState().columnPinning])

	const rowVirtualizer = useVirtualizer({
		count: table.getRowModel().rows.length,
		getScrollElement: () => dataGridRef.current,
		estimateSize: () => rowHeightValue,
		overscan,
		measureElement: !isFirefox
			? (element) => element?.getBoundingClientRect().height
			: undefined,
	})

	if (!rowVirtualizerRef.current) {
		rowVirtualizerRef.current = rowVirtualizer
	}

	const onRowAdd = React.useCallback(
		async (event?: React.MouseEvent<HTMLDivElement>) => {
			if (propsRef.current.readOnly || !propsRef.current.onRowAdd) return

			const initialRowCount = propsRef.current.data.length

			let result: Partial<CellPosition> | null
			try {
				result = await propsRef.current.onRowAdd(event)
			} catch {
				// Callback threw an error, don't proceed with scroll/focus
				return
			}

			if (result === null || event?.defaultPrevented) return

			onSelectionClear()

			// Trust the returned rowIndex from the callback
			// onScrollToRow will handle retries if the row isn't rendered yet
			const targetRowIndex = result.rowIndex ?? initialRowCount
			const targetColumnId = result.columnId

			onScrollToRow({
				rowIndex: targetRowIndex,
				columnId: targetColumnId,
			})
		},
		[propsRef, onScrollToRow, onSelectionClear],
	)

	const onRowAddShortcut = React.useCallback(() => {
		if (propsRef.current.readOnly || !propsRef.current.onRowAdd) return
		const currentState = store.getState()
		const initialRowCount = propsRef.current.data.length
		const currentColumnId = currentState.focusedCell?.columnId

		Promise.resolve(propsRef.current.onRowAdd())
			.then(async (result) => {
				if (result === null) return
				onSelectionClear()
				const targetRowIndex = result.rowIndex ?? initialRowCount
				const targetColumnId = result.columnId ?? currentColumnId
				onScrollToRow({
					rowIndex: targetRowIndex,
					columnId: targetColumnId,
				})
			})
			.catch(() => {
				// Callback threw an error, don't proceed with scroll/focus
			})
	}, [propsRef, store, onSelectionClear, onScrollToRow])

	useDataGridKeyboard<TData>({
		dataGridRef,
		headerRef,
		footerRef,
		rowMapRef,
		cellMapRef,
		rowVirtualizerRef,
		tableRef,
		store,
		propsRef: propsRef as React.RefObject<{
			readOnly?: boolean
			enableSearch?: boolean
			enablePaste?: boolean
			data: TData[]
			onRowAdd?: (
				event?: React.MouseEvent<HTMLDivElement>,
			) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null
			onRowsDelete?: (
				rows: TData[],
				rowIndices: number[],
				rowIds?: string[],
			) => void | Promise<void>
		}>,
		dir,
		navigableColumnIds,
		navigateCell,
		blurCell,
		selectAll,
		selectRange,
		onSelectionClear,
		onCellsCopy,
		onCellsCut,
		onCellsPaste,
		restoreFocus,
		onSearchOpenChange,
		onNavigateToNextMatch,
		onNavigateToPrevMatch,
		onCellEditingStart,
		onDataUpdate,
		onRowsDelete,
		onRowAddShortcut,
	})

	React.useEffect(() => {
		const currentState = store.getState()
		const autoFocus = propsRef.current.autoFocus

		if (
			autoFocus &&
			data.length > 0 &&
			columns.length > 0 &&
			!currentState.focusedCell
		) {
			if (navigableColumnIds.length > 0) {
				const rafId = requestAnimationFrame(() => {
					if (typeof autoFocus === 'object') {
						const { rowIndex, columnId } = autoFocus
						if (columnId) {
							focusCell(rowIndex ?? 0, columnId)
						}
						return
					}

					const firstColumnId = navigableColumnIds[0]
					if (firstColumnId) {
						focusCell(0, firstColumnId)
					}
				})
				return () => cancelAnimationFrame(rafId)
			}
		}
	}, [store, propsRef, data, columns, navigableColumnIds, focusCell])

	// Restore focus to container when virtualized cells are unmounted
	React.useEffect(() => {
		const container = dataGridRef.current
		if (!container) return

		function onFocusOut(event: FocusEvent) {
			if (focusGuardRef.current) return

			const currentContainer = dataGridRef.current
			if (!currentContainer) return

			const currentState = store.getState()

			if (!currentState.focusedCell || currentState.editingCell) return

			const relatedTarget = event.relatedTarget

			const isFocusMovingOutsideGrid =
				!relatedTarget || !currentContainer.contains(relatedTarget as Node)

			const isFocusMovingToPopover = getIsInPopover(relatedTarget)

			if (isFocusMovingOutsideGrid && !isFocusMovingToPopover) {
				const { rowIndex, columnId } = currentState.focusedCell
				const cellKey = getCellKey(rowIndex, columnId)
				const cellElement = cellMapRef.current.get(cellKey)

				requestAnimationFrame(() => {
					if (focusGuardRef.current) return

					if (cellElement && document.body.contains(cellElement)) {
						cellElement.focus()
					} else {
						currentContainer.focus()
					}
				})
			}
		}

		container.addEventListener('focusout', onFocusOut)

		return () => {
			container.removeEventListener('focusout', onFocusOut)
		}
	}, [store])

	React.useEffect(() => {
		function onOutsideClick(event: MouseEvent) {
			if (event.button === 2) {
				return
			}

			if (
				dataGridRef.current &&
				!dataGridRef.current.contains(event.target as Node)
			) {
				const elements = document.elementsFromPoint(
					event.clientX,
					event.clientY,
				)

				// Compensate for event.target bubbling up
				const isInsidePopover = elements.some((element) =>
					getIsInPopover(element),
				)

				if (!isInsidePopover) {
					blurCell()
					const currentState = store.getState()
					if (
						currentState.selectionState.selectedCells.size > 0 ||
						Object.keys(currentState.rowSelection).length > 0
					) {
						onSelectionClear()
					}
				}
			}
		}

		document.addEventListener('mousedown', onOutsideClick)
		return () => {
			document.removeEventListener('mousedown', onOutsideClick)
		}
	}, [store, blurCell, onSelectionClear])

	React.useEffect(() => {
		function onSelectStart(event: Event) {
			event.preventDefault()
		}

		function onContextMenu(event: Event) {
			event.preventDefault()
		}

		function onCleanup() {
			document.removeEventListener('selectstart', onSelectStart)
			document.removeEventListener('contextmenu', onContextMenu)
			document.body.style.userSelect = ''
		}

		const onUnsubscribe = store.subscribe(() => {
			const currentState = store.getState()
			if (currentState.selectionState.isSelecting) {
				document.addEventListener('selectstart', onSelectStart)
				document.addEventListener('contextmenu', onContextMenu)
				document.body.style.userSelect = 'none'
			} else {
				onCleanup()
			}
		})

		return () => {
			onCleanup()
			onUnsubscribe()
		}
	}, [store])

	useIsomorphicLayoutEffect(() => {
		const rafId = requestAnimationFrame(() => {
			rowVirtualizer.measure()
		})
		return () => cancelAnimationFrame(rafId)
	}, [
		rowHeight,
		table.getState().columnFilters,
		table.getState().columnOrder,
		table.getState().columnPinning,
		table.getState().columnSizing,
		table.getState().columnVisibility,
		table.getState().globalFilter,
		table.getState().grouping,
		table.getState().sorting,
	])

	// Calculate virtual values outside of child render to avoid flushSync issues
	const virtualTotalSize = rowVirtualizer.getTotalSize()
	const virtualItems = rowVirtualizer.getVirtualItems()
	const measureElement = rowVirtualizer.measureElement

	return React.useMemo(
		() => ({
			dataGridRef,
			headerRef,
			rowMapRef,
			footerRef,
			dir,
			store,
			table,
			tableMeta,
			stateContextValue,
			actionsContextValue,
			selectorsContextValue,
			filterMenuRequestBus: filterMenuRequestBus.current,
			virtualTotalSize,
			virtualItems,
			measureElement,
			columns,
			columnSizeVars,
			searchState,
			searchMatchesByRow,
			activeSearchMatch,
			cellSelectionMap,
			focusedCell,
			editingCell,
			expanded,
			rowHeight,
			contextMenu,
			pasteDialog,
			enablePagination: resolvedEnablePagination,
			enableColumnReorder: props.enableColumnReorder ?? false,
			enableSelectionSummary: props.enableSelectionSummary ?? false,
			showPagination,
			paginationProps,
			onRowAdd: propsRef.current.onRowAdd ? onRowAdd : undefined,
			adjustLayout,
			scrollInterceptors: props.scrollInterceptors,
		}),
		[
			propsRef,
			dir,
			store,
			table,
			tableMeta,
			stateContextValue,
			actionsContextValue,
			selectorsContextValue,
			filterMenuRequestBus,
			virtualTotalSize,
			virtualItems,
			measureElement,
			columns,
			columnSizeVars,
			searchState,
			searchMatchesByRow,
			activeSearchMatch,
			cellSelectionMap,
			focusedCell,
			editingCell,
			expanded,
			rowHeight,
			contextMenu,
			pasteDialog,
			resolvedEnablePagination,
			showPagination,
			paginationProps,
			onRowAdd,
			adjustLayout,
			props.enableColumnReorder,
			props.enableSelectionSummary,
			props.scrollInterceptors,
		],
	)
}

export {
	//
	type UseDataGridProps,
	useDataGrid,
}

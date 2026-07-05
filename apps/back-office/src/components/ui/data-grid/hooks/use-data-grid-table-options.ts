import {
	type ColumnDef,
	type ColumnFiltersState,
	type ColumnOrderState,
	type ExpandedState,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	type TableMeta,
	type TableOptions,
	type TableState,
	type Updater,
} from '@tanstack/react-table'
import * as React from 'react'

import type { ResolvedDataGridServerFiltersOptions } from '../server/server-filters'
import type { Direction } from '../types/data-grid'

const MIN_COLUMN_SIZE = 60
const MAX_COLUMN_SIZE = 800

export { MAX_COLUMN_SIZE, MIN_COLUMN_SIZE }

interface UseDataGridTableOptionsParams<TData> {
	propsRef: React.RefObject<
		Omit<TableOptions<TData>, 'getCoreRowModel' | 'onColumnOrderChange'> & {
			data: TData[]
			columns: ColumnDef<TData, unknown>[]
		}
	>
	data: TData[]
	columns: ColumnDef<TData, unknown>[]
	dir: Direction
	tableMeta: TableMeta<TData>
	resolvedGlobalFilter: string
	resolvedSorting: SortingState
	resolvedColumnFilters: ColumnFiltersState
	rowSelection: RowSelectionState
	expanded: ExpandedState
	columnOrder: ColumnOrderState
	resolvedEnablePagination: boolean
	resolvedServerFilters: ResolvedDataGridServerFiltersOptions | undefined
	onGlobalFilterChange: (updater: Updater<unknown>) => void
	onRowSelectionChange: (updater: Updater<RowSelectionState>) => void
	onSortingChange: (updater: Updater<SortingState>) => void
	onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
	onExpandedChange: (updater: Updater<ExpandedState>) => void
	onColumnOrderChange: (updater: Updater<ColumnOrderState>) => void
}

interface UseDataGridTableOptionsReturn<TData> {
	defaultColumn: Partial<ColumnDef<TData>>
	tableState: Partial<TableState>
	tableOptions: TableOptions<TData>
}

function useDataGridTableOptions<TData>({
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
}: UseDataGridTableOptionsParams<TData>): UseDataGridTableOptionsReturn<TData> {
	const defaultColumn: Partial<ColumnDef<TData>> = React.useMemo(
		() => ({
			// Note: cell is rendered directly in DataGridRow to bypass flexRender's
			// unstable cell.getContext() (see TanStack Table issue #4794)
			minSize: MIN_COLUMN_SIZE,
			maxSize: MAX_COLUMN_SIZE,
		}),
		[],
	)

	const getMemoizedCoreRowModel = React.useMemo(() => getCoreRowModel(), [])
	const getMemoizedFilteredRowModel = React.useMemo(
		() => getFilteredRowModel(),
		[],
	)
	const getMemoizedSortedRowModel = React.useMemo(() => getSortedRowModel(), [])
	const getMemoizedPaginationRowModel = React.useMemo(
		() => getPaginationRowModel(),
		[],
	)
	const getMemoizedExpandedRowModel = React.useMemo(
		() => getExpandedRowModel(),
		[],
	)

	// Memoize state object to reduce shallow equality checks
	const tableState = React.useMemo<Partial<TableState>>(
		() => ({
			...propsRef.current.state,
			globalFilter: resolvedGlobalFilter,
			sorting: resolvedSorting,
			columnFilters: resolvedColumnFilters,
			rowSelection,
			expanded,
			columnOrder,
		}),
		[
			propsRef,
			resolvedGlobalFilter,
			resolvedSorting,
			resolvedColumnFilters,
			rowSelection,
			expanded,
			columnOrder,
		],
	)

	const tableOptions = React.useMemo<TableOptions<TData>>(() => {
		const common: TableOptions<TData> = {
			...propsRef.current,
			data,
			columns,
			defaultColumn,
			initialState: propsRef.current.initialState,
			state: tableState,
			autoResetExpanded: propsRef.current.autoResetExpanded ?? false,
			onGlobalFilterChange,
			onRowSelectionChange,
			onSortingChange,
			onColumnFiltersChange,
			onExpandedChange,
			onColumnOrderChange,
			columnResizeMode: 'onChange',
			columnResizeDirection: dir,
			getCoreRowModel: getMemoizedCoreRowModel,
			getExpandedRowModel: getMemoizedExpandedRowModel,
			...(resolvedEnablePagination
				? { getPaginationRowModel: getMemoizedPaginationRowModel }
				: {}),
			meta: tableMeta,
		}

		// When `serverFilters` is enabled the consumer is the source of truth
		// for filtering, sorting, and pagination — opt out of TanStack's
		// client row models so we don't double-filter/double-sort on every
		// keystroke. Otherwise wire the client row models as before.
		return resolvedServerFilters
			? {
					...common,
					manualFiltering: true,
					manualSorting: true,
					manualPagination: true,
				}
			: {
					...common,
					getFilteredRowModel: getMemoizedFilteredRowModel,
					getSortedRowModel: getMemoizedSortedRowModel,
				}
	}, [
		propsRef,
		data,
		columns,
		defaultColumn,
		tableState,
		dir,
		onGlobalFilterChange,
		onRowSelectionChange,
		onSortingChange,
		onColumnFiltersChange,
		onExpandedChange,
		onColumnOrderChange,
		getMemoizedCoreRowModel,
		getMemoizedFilteredRowModel,
		getMemoizedSortedRowModel,
		getMemoizedExpandedRowModel,
		getMemoizedPaginationRowModel,
		resolvedEnablePagination,
		resolvedServerFilters,
		tableMeta,
	])

	return {
		defaultColumn,
		tableState,
		tableOptions,
	}
}

export {
	//
	type UseDataGridTableOptionsParams,
	type UseDataGridTableOptionsReturn,
	useDataGridTableOptions,
}

'use client'

import { DirectionProvider } from '@base-ui/react/direction-provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { Plus } from 'lucide-react'
import * as React from 'react'

import { cn } from '#/lib/utils'

import {
	DataGridActionsProvider,
	FilterMenuRequestBusProvider,
} from './contexts/data-grid-actions-context'
import { DataGridSelectorsProvider } from './contexts/data-grid-selectors-context'
import { DataGridStateProvider } from './contexts/data-grid-state-context'
import { DataGridContextMenu } from './data-grid-context-menu'
import { DataGridHeaderRow } from './data-grid-header-row'
import {
	DataGridPagination,
	type DataGridPaginationProps,
} from './data-grid-pagination'
import { DataGridPasteDialog } from './data-grid-paste-dialog'
import { DataGridRow } from './data-grid-row'
import { useRowContextMenu } from './data-grid-row-context-menu'
import { DataGridSearch } from './data-grid-search'
import { DataGridSelectionSummary } from './data-grid-selection-summary'
import { useAsRef } from './hooks/use-as-ref'
import type { useDataGrid } from './hooks/use-data-grid'
import { useStore } from './hooks/use-data-grid-store'
import { getRowHeightValue } from './lib/data-grid'
import type { RowContextMenuItem } from './lib/data-grid-row-context'
import {
	dataGridContainerVariants,
	dataGridHeaderVariants,
} from './lib/data-grid-variants'
import type {
	Direction,
	InfiniteScrollOptions,
	TableVariant,
} from './types/data-grid'
import { Spinner } from './ui/spinner'

const EMPTY_CELL_SELECTION_SET = new Set<string>()

type UseDataGridReturn<TData> = ReturnType<typeof useDataGrid<TData>>

interface DataGridProps<TData>
	extends
		Omit<
			UseDataGridReturn<TData>,
			'dir' | 'showPagination' | 'paginationProps'
		>,
		Omit<React.ComponentProps<'div'>, 'contextMenu'> {
	dir?: Direction
	height?: number
	stretchColumns?: boolean
	variant?: TableVariant
	showPagination?: boolean
	paginationProps?: Omit<DataGridPaginationProps<TData>, 'table'>
	rowContextMenu?: RowContextMenuItem<TData>[]
	cellContextMenu?: RowContextMenuItem<TData>[]
	rowClassName?: string | ((row: TData, rowIndex: number) => string | undefined)
	infiniteScroll?: InfiniteScrollOptions
	isLoading?: boolean
	emptyMessage?: React.ReactNode
	animated?: boolean
}

export function DataGrid<TData>({
	dataGridRef,
	headerRef,
	rowMapRef,
	footerRef,
	dir = 'ltr',
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
	rowHeight,
	contextMenu,
	pasteDialog,
	onRowAdd: onRowAddProp,
	variant = 'default',
	enablePagination = false,
	showPagination,
	paginationProps,
	rowContextMenu,
	cellContextMenu,
	rowClassName,
	infiniteScroll,
	isLoading,
	emptyMessage,
	animated = true,
	height = 520,
	stretchColumns = true,
	adjustLayout = false,
	scrollInterceptors,
	enableColumnReorder = false,
	enableSelectionSummary = false,
	className,
	...props
}: DataGridProps<TData>) {
	const rows = table.getRowModel().rows
	const readOnly = stateContextValue.readOnly
	const sorting = table.getState().sorting
	const columnVisibility = table.getState().columnVisibility
	const columnPinning = table.getState().columnPinning
	const columnOrder = table.getState().columnOrder
	const shouldShowPagination = showPagination ?? enablePagination

	const onRowAddRef = useAsRef(onRowAddProp)

	const onRowAdd = React.useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			onRowAddRef.current?.(event)
		},
		[onRowAddRef],
	)

	const { openMenu: openRowMenu, menu: rowMenu } =
		useRowContextMenu<TData>(rowContextMenu)
	const hasRowContextMenu = Boolean(rowContextMenu?.length)

	const onRowContextMenu = React.useCallback(
		(row: TData, event: React.MouseEvent<HTMLDivElement>) => {
			if (!hasRowContextMenu) return
			event.preventDefault()
			event.stopPropagation()
			openRowMenu(row, { x: event.clientX, y: event.clientY })
		},
		[hasRowContextMenu, openRowMenu],
	)

	const onDataGridContextMenu = React.useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			event.preventDefault()
		},
		[],
	)

	const onFooterCellKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!onRowAddRef.current) return

			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				onRowAddRef.current()
			}
		},
		[onRowAddRef],
	)

	const showLoading = Boolean(isLoading) && rows.length === 0
	const showEmpty = !isLoading && rows.length === 0
	const resolvedHeight = React.useMemo(() => {
		if (typeof height !== 'number' || Number.isNaN(height)) {
			return getRowHeightValue(rowHeight) * 9
		}
		return Math.max(height, getRowHeightValue(rowHeight) * 4)
	}, [height, rowHeight])
	const minBodyHeight = resolvedHeight
	const normalizedInfiniteThreshold = React.useMemo(() => {
		const threshold = infiniteScroll?.threshold
		if (typeof threshold !== 'number' || Number.isNaN(threshold)) return 0
		return Math.max(0, Math.floor(threshold))
	}, [infiniteScroll?.threshold])
	const lastVirtualRowIndex = virtualItems[virtualItems.length - 1]?.index ?? -1
	const infiniteTriggerIndex =
		rows.length > 0
			? Math.max(0, rows.length - 1 - normalizedInfiniteThreshold)
			: -1
	const hasReachedInfiniteThreshold =
		rows.length > 0 && lastVirtualRowIndex >= infiniteTriggerIndex
	const showInfiniteLoading =
		Boolean(infiniteScroll?.isLoading) && rows.length > 0
	const infiniteLoaderHeight = showInfiniteLoading
		? getRowHeightValue(rowHeight)
		: 0
	const loadMoreTriggerRef = React.useRef(false)
	const previousRowCountRef = React.useRef(rows.length)

	React.useEffect(() => {
		if (rows.length !== previousRowCountRef.current) {
			loadMoreTriggerRef.current = false
			previousRowCountRef.current = rows.length
		}

		if (!infiniteScroll) {
			loadMoreTriggerRef.current = false
			return
		}

		if (!hasReachedInfiniteThreshold) {
			loadMoreTriggerRef.current = false
			return
		}

		if (loadMoreTriggerRef.current) return
		if (infiniteScroll.hasMore === false || infiniteScroll.isLoading === true) {
			return
		}

		loadMoreTriggerRef.current = true
		try {
			void Promise.resolve(infiniteScroll.loadMore()).catch(() => {
				loadMoreTriggerRef.current = false
			})
		} catch {
			loadMoreTriggerRef.current = false
		}
	}, [hasReachedInfiniteThreshold, infiniteScroll, rows.length])

	return (
		<HotkeysProvider
			defaultOptions={{
				hotkey: {
					target: dataGridRef,
					ignoreInputs: true,
					conflictBehavior: 'warn',
				},
			}}
		>
			<DataGridStateProvider value={stateContextValue}>
				<DataGridActionsProvider value={actionsContextValue}>
					<DataGridSelectorsProvider value={selectorsContextValue}>
						<FilterMenuRequestBusProvider value={filterMenuRequestBus}>
							<DirectionProvider direction={dir}>
								<div
									data-slot='grid-wrapper'
									dir={dir}
									{...props}
									className={cn(
										'scrollbar-background relative flex w-full flex-col space-y-3',
										className,
									)}
								>
									<DataGridLiveRegion store={store} />
									{searchState && <DataGridSearch {...searchState} />}
									<DataGridContextMenu
										columns={columns}
										contextMenu={contextMenu}
										table={table}
										extraItems={cellContextMenu}
									/>
									{rowMenu}
									<DataGridPasteDialog pasteDialog={pasteDialog} />
									<div
										role='grid'
										aria-label='Data grid'
										aria-rowcount={rows.length + (onRowAddProp ? 1 : 0)}
										aria-colcount={columns.length}
										data-slot='grid'
										tabIndex={0}
										ref={dataGridRef}
										className={cn(
											'relative grid select-none focus:outline-none',
											dataGridContainerVariants({ variant }),
											enablePagination
												? 'overflow-x-auto overflow-y-hidden'
												: 'overflow-auto',
											'overscroll-contain',
										)}
										style={{
											...columnSizeVars,
											...(enablePagination
												? {}
												: { maxHeight: `${resolvedHeight}px` }),
											width: stretchColumns ? '100%' : 'var(--grid-width)',
											minWidth: 'var(--grid-width)',
										}}
										onContextMenu={onDataGridContextMenu}
									>
										<div
											role='rowgroup'
											data-slot='grid-header'
											ref={headerRef}
											className={cn(
												'sticky top-0 z-10 grid',
												dataGridHeaderVariants({ variant }),
											)}
											style={{
												width: stretchColumns ? '100%' : 'var(--grid-width)',
												minWidth: 'var(--grid-width)',
											}}
										>
											{table.getHeaderGroups().map((headerGroup, rowIndex) => (
												<DataGridHeaderRow
													key={headerGroup.id}
													headerGroup={headerGroup}
													table={table}
													sorting={sorting}
													rowIndex={rowIndex}
													variant={variant}
													dir={dir}
													stretchColumns={stretchColumns}
													enableColumnReorder={enableColumnReorder}
												/>
											))}
										</div>
										<div
											role='rowgroup'
											data-slot='grid-body'
											className='relative grid'
											style={{
												height: `${virtualTotalSize + infiniteLoaderHeight}px`,
												...(showLoading || showEmpty
													? { minHeight: `${minBodyHeight}px` }
													: null),
												contain: adjustLayout ? 'layout paint' : 'strict',
												width: stretchColumns ? '100%' : 'var(--grid-width)',
												minWidth: 'var(--grid-width)',
											}}
										>
											{showLoading && (
												<div className='absolute inset-0 flex items-center justify-center'>
													<div className='flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-muted-foreground text-sm shadow-xs'>
														<Spinner />
														<span>Loading…</span>
													</div>
												</div>
											)}
											{showEmpty && (
												<div className='absolute inset-0 flex items-center justify-center'>
													<div className='text-muted-foreground text-sm'>
														{emptyMessage ?? 'There is no data to display.'}
													</div>
												</div>
											)}
											{virtualItems.map((virtualItem) => {
												const row = rows[virtualItem.index]
												if (!row) return null
												const resolvedRowClassName =
													typeof rowClassName === 'function'
														? rowClassName(row.original, row.index)
														: rowClassName

												const cellSelectionKeys =
													cellSelectionMap?.get(virtualItem.index) ??
													EMPTY_CELL_SELECTION_SET

												const searchMatchColumns =
													searchMatchesByRow?.get(virtualItem.index) ?? null
												const isActiveSearchRow =
													activeSearchMatch?.rowIndex === virtualItem.index

												return (
													<DataGridRow
														key={row.id}
														row={row}
														rowMapRef={rowMapRef}
														virtualItem={virtualItem}
														measureElement={measureElement}
														rowHeight={rowHeight}
														isExpanded={row.getIsExpanded()}
														columnVisibility={columnVisibility}
														columnPinning={columnPinning}
														columnOrder={columnOrder}
														focusedCell={focusedCell}
														editingCell={editingCell}
														cellSelectionKeys={cellSelectionKeys}
														searchMatchColumns={searchMatchColumns}
														activeSearchMatch={
															isActiveSearchRow ? activeSearchMatch : null
														}
														dir={dir}
														adjustLayout={adjustLayout}
														stretchColumns={stretchColumns}
														readOnly={readOnly}
														tableVariant={variant}
														animated={animated}
														className={resolvedRowClassName}
														onContextMenu={(event) =>
															onRowContextMenu(row.original, event)
														}
													/>
												)
											})}
											{showInfiniteLoading && (
												<div
													className='absolute inset-x-0 flex items-center justify-center'
													style={{
														top: `${virtualTotalSize}px`,
														height: `${infiniteLoaderHeight}px`,
													}}
												>
													<div className='flex items-center gap-2 rounded-md bg-card px-4 py-2 text-muted-foreground text-sm shadow-xs'>
														<Spinner />
														<span>Loading…</span>
													</div>
												</div>
											)}
										</div>
										{!readOnly && onRowAdd && (
											<div
												role='rowgroup'
												data-slot='grid-footer'
												ref={footerRef}
												className='sticky bottom-0 z-10 grid border-t bg-background'
											>
												<div
													role='row'
													aria-rowindex={rows.length + 2}
													data-slot='grid-add-row'
													tabIndex={-1}
													className='flex w-full'
												>
													<div
														role='gridcell'
														tabIndex={0}
														className='relative flex h-9 grow items-center bg-muted/30 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none'
														style={{
															width: table.getTotalSize(),
															minWidth: table.getTotalSize(),
														}}
														onClick={onRowAdd}
														onKeyDown={onFooterCellKeyDown}
													>
														<div className='sticky start-0 flex items-center gap-2 px-3 text-muted-foreground'>
															<Plus className='size-3.5' />
															<span className='text-sm'>Add row</span>
														</div>
													</div>
												</div>
											</div>
										)}
									</div>
									{enableSelectionSummary && (
										<DataGridSelectionSummary table={table} />
									)}
									{shouldShowPagination && (
										<DataGridPagination
											{...paginationProps}
											table={table}
											recordCount={
												paginationProps?.recordCount ?? table.getRowCount()
											}
											isLoading={paginationProps?.isLoading ?? false}
											className={cn('pt-3', paginationProps?.className)}
										/>
									)}
								</div>
							</DirectionProvider>
						</FilterMenuRequestBusProvider>
					</DataGridSelectorsProvider>
				</DataGridActionsProvider>
			</DataGridStateProvider>
		</HotkeysProvider>
	)
}

interface DataGridLiveRegionProps {
	store: UseDataGridReturn<unknown>['store']
}

function DataGridLiveRegion({ store }: DataGridLiveRegionProps) {
	const message = useStore(store, (state) => state.liveAnnouncement)

	return (
		<div
			role='status'
			aria-live='polite'
			aria-atomic='true'
			data-slot='grid-live-region'
			className='sr-only'
		>
			{message}
		</div>
	)
}

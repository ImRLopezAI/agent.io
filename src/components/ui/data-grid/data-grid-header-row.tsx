'use client'

import type { HeaderGroup, SortingState, Table } from '@tanstack/react-table'
import { DataGridColumnHeader } from '@ui/data-grid/data-grid-column-header'
import { GripVertical } from 'lucide-react'
import * as React from 'react'
import { cn } from '#/lib/utils'
import {
	flexRender,
	getColumnBorderVisibility,
	getColumnPinningStyle,
	getColumnSizeVarId,
} from './lib/data-grid'
import { dataGridHeaderCellVariants } from './lib/data-grid-variants'
import type { Direction, TableVariant } from './types/data-grid'
import {
	Sortable,
	SortableContent,
	SortableItem,
	SortableItemHandle,
} from './ui/sortable'

interface DataGridHeaderRowProps<TData> {
	headerGroup: HeaderGroup<TData>
	table: Table<TData>
	sorting: SortingState
	rowIndex: number
	variant: TableVariant
	dir: Direction
	stretchColumns: boolean
	enableColumnReorder: boolean
}

const NON_REORDERABLE_COLUMN_IDS = new Set(['select', 'actions'])

function isReorderableColumn(columnId: string, isPinned: boolean): boolean {
	if (isPinned) return false
	if (NON_REORDERABLE_COLUMN_IDS.has(columnId)) return false
	return true
}

export const DataGridHeaderRow = React.memo(function DataGridHeaderRow<TData>({
	headerGroup,
	table,
	sorting,
	rowIndex,
	variant,
	dir,
	stretchColumns,
	enableColumnReorder,
}: DataGridHeaderRowProps<TData>) {
	const reorderableColumnIds = React.useMemo(() => {
		if (!enableColumnReorder) return []
		const ids: string[] = []
		for (const header of headerGroup.headers) {
			const column = header.column
			const isPinned = column.getIsPinned() !== false
			if (isReorderableColumn(column.id, isPinned)) {
				ids.push(column.id)
			}
		}
		return ids
	}, [enableColumnReorder, headerGroup.headers])

	const onColumnOrderChange = React.useCallback(
		(nextReorderable: string[]) => {
			const allLeafColumns = table.getAllLeafColumns()
			const currentOrder = table.getState().columnOrder
			const baseOrder =
				currentOrder.length > 0
					? currentOrder
					: allLeafColumns.map((col) => col.id)

			const reorderableSet = new Set(reorderableColumnIds)
			const queue = [...nextReorderable]
			const newOrder: string[] = []
			for (const id of baseOrder) {
				if (reorderableSet.has(id)) {
					const next = queue.shift()
					newOrder.push(next ?? id)
				} else {
					newOrder.push(id)
				}
			}

			table.setColumnOrder(newOrder)
		},
		[reorderableColumnIds, table],
	)

	const headerRowContent = (
		<div
			key={headerGroup.id}
			role='row'
			aria-rowindex={rowIndex + 1}
			data-slot='grid-header-row'
			tabIndex={-1}
			className='flex w-full'
			style={{
				width: stretchColumns ? '100%' : 'var(--grid-width)',
				minWidth: 'var(--grid-width)',
			}}
		>
			{headerGroup.headers.map((header, colIndex) => {
				const currentSort = sorting.find((sort) => sort.id === header.column.id)
				const isSortable = header.column.getCanSort()
				const headerSizeId = getColumnSizeVarId(header.id)

				const nextHeader = headerGroup.headers[colIndex + 1]
				const isLastColumn = colIndex === headerGroup.headers.length - 1

				const isSelectColumn = header.column.id === 'select'
				const { showEndBorder, showStartBorder } = getColumnBorderVisibility({
					column: header.column,
					nextColumn: nextHeader?.column,
					isLastColumn,
				})

				const isPinned = header.column.getIsPinned() !== false
				const isReorderable =
					enableColumnReorder && isReorderableColumn(header.column.id, isPinned)

				const cellClassName = cn('relative', {
					grow: stretchColumns && header.column.id !== 'select',
					'border-e':
						(showEndBorder || (variant === 'bordered' && !isLastColumn)) &&
						header.column.id !== 'select',
					'border-s': showStartBorder && header.column.id !== 'select',
					'border-border':
						showEndBorder || showStartBorder || variant === 'bordered',
				})

				const cellStyle: React.CSSProperties = {
					...getColumnPinningStyle({
						column: header.column,
						dir,
					}),
					width: `calc(var(--header-${headerSizeId}-size) * 1px)`,
				}

				const headerContents = header.isPlaceholder ? null : typeof header
						.column.columnDef.header === 'function' ? (
					<div
						className={cn(
							'size-full',
							dataGridHeaderCellVariants({ variant }),
							isSelectColumn && 'box-border justify-center px-2',
						)}
					>
						{flexRender(header.column.columnDef.header, header.getContext())}
					</div>
				) : (
					<DataGridColumnHeader
						header={header}
						table={table}
						variant={variant}
					/>
				)

				if (isReorderable) {
					return (
						<SortableItem key={header.id} value={header.column.id} asChild>
							<div
								role='columnheader'
								aria-colindex={colIndex + 1}
								aria-sort={
									currentSort?.desc === false
										? 'ascending'
										: currentSort?.desc === true
											? 'descending'
											: isSortable
												? 'none'
												: undefined
								}
								data-slot='grid-header-cell'
								data-reorderable=''
								tabIndex={-1}
								className={cn(cellClassName, 'group/header-cell')}
								style={cellStyle}
							>
								<SortableItemHandle
									aria-label={`Reorder column ${header.column.id}`}
									className='absolute start-0 top-1/2 z-30 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover/header-cell:opacity-100 data-dragging:opacity-100'
								>
									<GripVertical className='size-3.5' />
								</SortableItemHandle>
								{headerContents}
							</div>
						</SortableItem>
					)
				}

				return (
					<div
						key={header.id}
						role='columnheader'
						aria-colindex={colIndex + 1}
						aria-sort={
							currentSort?.desc === false
								? 'ascending'
								: currentSort?.desc === true
									? 'descending'
									: isSortable
										? 'none'
										: undefined
						}
						data-slot='grid-header-cell'
						tabIndex={-1}
						className={cellClassName}
						style={cellStyle}
					>
						{headerContents}
					</div>
				)
			})}
		</div>
	)

	if (!enableColumnReorder) {
		return headerRowContent
	}

	return (
		<Sortable
			value={reorderableColumnIds}
			onValueChange={onColumnOrderChange}
			orientation='horizontal'
			getItemValue={(item: string) => item}
		>
			<SortableContent withoutSlot>{headerRowContent}</SortableContent>
		</Sortable>
	)
}) as <TData>(props: DataGridHeaderRowProps<TData>) => React.ReactElement

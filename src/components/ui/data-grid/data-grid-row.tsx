'use client'

import type {
	ColumnPinningState,
	Row,
	VisibilityState,
} from '@tanstack/react-table'
import type { VirtualItem } from '@tanstack/react-virtual'
import { DataGridCell } from '@ui/data-grid/data-grid-cell'
import { DataGridCellWrapper } from '@ui/data-grid/data-grid-cell-wrapper'
import { DataGridPreviewCellTrigger } from '@ui/data-grid/data-grid-preview'
import { motion, type Variants } from 'motion/react'
import * as React from 'react'
import { cn } from '#/lib/utils'

import { useComposedRefs } from './lib/compose-refs'
import {
	flexRender,
	getCellKey,
	getColumnBorderVisibility,
	getColumnPinningStyle,
	getColumnSizeVarId,
	getRowHeightValue,
} from './lib/data-grid'
import { dataGridRowVariants } from './lib/data-grid-variants'
import type {
	CellPosition,
	Direction,
	RowHeightValue,
	TableVariant,
} from './types/data-grid'

interface DataGridRowProps<TData> extends React.ComponentProps<'div'> {
	row: Row<TData>
	virtualItem: VirtualItem
	measureElement: (node: Element | null) => void
	rowMapRef: React.RefObject<Map<number, HTMLDivElement>>
	rowHeight: RowHeightValue
	isExpanded: boolean
	columnVisibility: VisibilityState
	columnPinning: ColumnPinningState
	columnOrder: string[]
	focusedCell: CellPosition | null
	editingCell: CellPosition | null
	cellSelectionKeys: Set<string>
	searchMatchColumns: Set<string> | null
	activeSearchMatch: CellPosition | null
	dir: Direction
	readOnly: boolean
	stretchColumns: boolean
	adjustLayout: boolean
	tableVariant?: TableVariant
	animated?: boolean
}

const rowEntryVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: (index: number) => ({
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.18,
			ease: 'easeOut' as const,
			delay: Math.min(index, 12) * 0.02,
		},
	}),
} satisfies Variants

export const DataGridRow = React.memo(DataGridRowImpl, (prev, next) => {
	const prevRowIndex = prev.virtualItem.index
	const nextRowIndex = next.virtualItem.index

	// Re-render if row identity changed
	if (prev.row.id !== next.row.id) {
		return false
	}

	// Re-render if row data (original) reference changed
	if (prev.row.original !== next.row.original) {
		return false
	}

	// Re-render if virtual position changed (handles transform updates)
	if (prev.virtualItem.start !== next.virtualItem.start) {
		return false
	}

	// Re-render if focus state changed for this row
	const prevHasFocus = prev.focusedCell?.rowIndex === prevRowIndex
	const nextHasFocus = next.focusedCell?.rowIndex === nextRowIndex

	if (prevHasFocus !== nextHasFocus) {
		return false
	}

	// Re-render if focused column changed within this row
	if (nextHasFocus && prevHasFocus) {
		if (prev.focusedCell?.columnId !== next.focusedCell?.columnId) {
			return false
		}
	}

	// Re-render if editing state changed for this row
	const prevHasEditing = prev.editingCell?.rowIndex === prevRowIndex
	const nextHasEditing = next.editingCell?.rowIndex === nextRowIndex

	if (prevHasEditing !== nextHasEditing) {
		return false
	}

	// Re-render if editing column changed within this row
	if (nextHasEditing && prevHasEditing) {
		if (prev.editingCell?.columnId !== next.editingCell?.columnId) {
			return false
		}
	}

	// Re-render if this row's selected cells changed
	// Using stable Set reference that only includes this row's cells
	if (prev.cellSelectionKeys !== next.cellSelectionKeys) {
		return false
	}

	// Re-render if column visibility changed
	if (prev.columnVisibility !== next.columnVisibility) {
		return false
	}

	// Re-render if row height changed
	if (prev.rowHeight !== next.rowHeight) {
		return false
	}

	// Re-render if column pinning state changed
	if (prev.columnPinning !== next.columnPinning) {
		return false
	}

	// Re-render if column order changed (drag-reorder, programmatic reorder)
	if (prev.columnOrder !== next.columnOrder) {
		return false
	}

	// Re-render if readOnly changed
	if (prev.readOnly !== next.readOnly) {
		return false
	}

	// Re-render if row className changed
	if (prev.className !== next.className) {
		return false
	}

	// Re-render if animation state changed
	if (prev.animated !== next.animated) {
		return false
	}

	// Re-render if search match columns changed for this row
	if (prev.searchMatchColumns !== next.searchMatchColumns) {
		return false
	}

	// Re-render if active search match changed for this row
	if (prev.activeSearchMatch?.columnId !== next.activeSearchMatch?.columnId) {
		return false
	}

	// Re-render if direction changed
	if (prev.dir !== next.dir) {
		return false
	}

	// Re-render if adjustLayout state changed
	if (prev.adjustLayout !== next.adjustLayout) {
		return false
	}

	// Re-render if stretchColumns changed
	if (prev.stretchColumns !== next.stretchColumns) {
		return false
	}

	// Re-render if table variant changed
	if (prev.tableVariant !== next.tableVariant) {
		return false
	}

	// Re-render if expanded state changed
	if (prev.isExpanded !== next.isExpanded) {
		return false
	}

	// Skip re-render - props are equal
	return true
}) as typeof DataGridRowImpl

function DataGridRowImpl<TData>({
	row,
	virtualItem,
	measureElement,
	rowMapRef,
	rowHeight,
	isExpanded: isExpandedProp,
	columnVisibility,
	columnPinning,
	columnOrder,
	focusedCell,
	editingCell,
	cellSelectionKeys,
	searchMatchColumns,
	activeSearchMatch,
	dir,
	readOnly,
	stretchColumns,
	adjustLayout,
	tableVariant,
	animated,
	className,
	style,
	ref,
	...props
}: DataGridRowProps<TData>) {
	const virtualRowIndex = virtualItem.index
	const variant = tableVariant ?? 'default'
	const isStripedVariant = variant === 'striped' || variant === 'card'
	const isStripedRow = isStripedVariant && virtualRowIndex % 2 === 1
	const isCardVariant = variant === 'card'
	const showCellBorders = variant === 'bordered'

	const onRowChange = React.useCallback(
		(node: HTMLDivElement | null) => {
			if (typeof virtualRowIndex === 'undefined') return

			if (node) {
				measureElement(node)
				rowMapRef.current?.set(virtualRowIndex, node)
			} else {
				rowMapRef.current?.delete(virtualRowIndex)
			}
		},
		[virtualRowIndex, measureElement, rowMapRef],
	)

	const rowRef = useComposedRefs(ref, onRowChange)

	const isRowSelected = row.getIsSelected()
	const isExpanded = isExpandedProp
	const rowWidth = stretchColumns ? '100%' : 'var(--grid-width)'
	const isAnimated = animated ?? true

	// Memoize visible cells to avoid recreating cell array on every render
	// Though TanStack returns new Cell wrappers, memoizing the array helps React's reconciliation
	const visibleCells = React.useMemo(
		() => row.getVisibleCells(),
		[row, columnVisibility, columnPinning, columnOrder],
	)

	// Build a logical (all-leaf) column index map so aria-colindex reflects
	// the column's logical position (1-based) — independent of visibility.
	const logicalColumnIndex = React.useMemo(() => {
		const map = new Map<string, number>()
		const allLeafColumns = row.getAllCells().map((cell) => cell.column)
		allLeafColumns.forEach((column, index) => {
			map.set(column.id, index)
		})
		return map
	}, [row])

	const expandedContentFn = React.useMemo(() => {
		for (const cell of row.getAllCells()) {
			const fn = cell.column.columnDef.meta?.expandedContent
			if (fn) return fn
		}
		return undefined
	}, [row])

	// Re-measure row element when expanded state changes
	React.useEffect(() => {
		const rowEl = rowMapRef.current?.get(virtualRowIndex)
		if (rowEl) {
			measureElement(rowEl)
		}
	}, [isExpanded, virtualRowIndex, measureElement, rowMapRef])

	const rowHeightPx = getRowHeightValue(rowHeight)

	return (
		<div
			key={row.id}
			role='row'
			aria-rowindex={virtualRowIndex + 2}
			aria-selected={isRowSelected}
			aria-expanded={expandedContentFn ? isExpanded : undefined}
			data-index={virtualRowIndex}
			data-slot='grid-row'
			tabIndex={-1}
			{...props}
			ref={rowRef}
			className={cn(
				'absolute flex',
				isExpanded && expandedContentFn ? 'flex-col' : '',
				dataGridRowVariants({ variant }),
				'data-previewed:bg-primary/5',
				!adjustLayout && 'will-change-transform',
				isStripedRow && 'bg-muted/40',
				className,
			)}
			style={{
				...(isExpanded && expandedContentFn
					? { minHeight: `${rowHeightPx}px` }
					: { height: `${rowHeightPx}px` }),
				width: rowWidth,
				minWidth: 'var(--grid-width)',
				...(adjustLayout
					? { top: `${virtualItem.start}px` }
					: { transform: `translateY(${virtualItem.start}px)` }),
				...style,
			}}
		>
			<motion.div
				className={cn(
					'flex w-full',
					isExpanded && expandedContentFn ? 'flex-col' : '',
				)}
				variants={isAnimated ? rowEntryVariants : undefined}
				initial={isAnimated ? 'hidden' : false}
				animate={isAnimated ? 'visible' : undefined}
				custom={virtualRowIndex}
			>
				<div
					className='flex w-full'
					style={{
						height: `${rowHeightPx}px`,
						minHeight: `${rowHeightPx}px`,
						width: rowWidth,
						minWidth: 'var(--grid-width)',
					}}
				>
					{visibleCells.map((cell, colIndex) => {
						const columnId = cell.column.id

						const isCellFocused =
							focusedCell?.rowIndex === virtualRowIndex &&
							focusedCell?.columnId === columnId
						const isCellEditing =
							editingCell?.rowIndex === virtualRowIndex &&
							editingCell?.columnId === columnId
						const isCellSelected =
							cellSelectionKeys?.has(getCellKey(virtualRowIndex, columnId)) ??
							false
						const columnSizeId = getColumnSizeVarId(columnId)

						const isSearchMatch = searchMatchColumns?.has(columnId) ?? false
						const isActiveSearchMatch = activeSearchMatch?.columnId === columnId

						const nextCell = visibleCells[colIndex + 1]
						const isLastColumn = colIndex === visibleCells.length - 1
						const { showEndBorder: showPinnedEndBorder, showStartBorder } =
							getColumnBorderVisibility({
								column: cell.column,
								nextColumn: nextCell?.column,
								isLastColumn,
							})
						const showEndBorder =
							(showPinnedEndBorder || (showCellBorders && !isLastColumn)) &&
							columnId !== 'select'
						const isSelectColumn = columnId === 'select'
						const hasPreview = Boolean(cell.column.columnDef.meta?.preview)
						const customCell = cell.column.columnDef.cell
						const hasVariant = Boolean(cell.column.columnDef.meta?.cell)
						const hasCustomCell = Boolean(
							cell.column.columnDef.meta?.customCell && customCell,
						)
						const shouldRenderCustomCell =
							hasCustomCell && (readOnly || !hasVariant || !isCellEditing)

						return (
							<div
								key={cell.id}
								role='gridcell'
								aria-colindex={
									(logicalColumnIndex.get(columnId) ?? colIndex) + 1
								}
								aria-selected={isCellSelected}
								data-highlighted={isCellFocused ? '' : undefined}
								data-slot='grid-cell'
								tabIndex={-1}
								className={cn({
									grow: stretchColumns && columnId !== 'select',
									'border-border': showEndBorder || showStartBorder,
									'border-e': showEndBorder,
									'border-s': showStartBorder && columnId !== 'select',
									'rounded-s-lg': isCardVariant && colIndex === 0,
									'rounded-e-lg': isCardVariant && isLastColumn,
									'group/grid-cell relative': hasPreview,
								})}
								style={{
									...getColumnPinningStyle({ column: cell.column, dir }),
									width: `calc(var(--col-${columnSizeId}-size) * 1px)`,
								}}
							>
								{shouldRenderCustomCell ? (
									isSelectColumn ? (
										<div className='flex size-full items-center justify-center text-sm'>
											{flexRender(customCell, cell.getContext())}
										</div>
									) : (
										<DataGridCellWrapper
											cell={cell}
											rowIndex={virtualRowIndex}
											columnId={columnId}
											rowHeight={rowHeight}
											tableVariant={variant}
											isEditing={false}
											isFocused={isCellFocused}
											isSelected={isCellSelected}
											isSearchMatch={isSearchMatch}
											isActiveSearchMatch={isActiveSearchMatch}
											readOnly={readOnly}
											className={cn(isSelectColumn && 'justify-center')}
										>
											<div data-slot='grid-cell-content' className='min-w-0'>
												{flexRender(customCell, cell.getContext())}
											</div>
										</DataGridCellWrapper>
									)
								) : (
									<DataGridCell
										cell={cell}
										rowIndex={virtualRowIndex}
										columnId={columnId}
										rowHeight={rowHeight}
										isFocused={isCellFocused}
										isEditing={isCellEditing}
										isSelected={isCellSelected}
										isSearchMatch={isSearchMatch}
										isActiveSearchMatch={isActiveSearchMatch}
										readOnly={readOnly}
										tableVariant={variant}
									/>
								)}
								{hasPreview && <DataGridPreviewCellTrigger cell={cell} />}
							</div>
						)
					})}
				</div>
				{isExpanded && expandedContentFn && (
					<div
						data-slot='grid-row-expanded'
						className='w-full border-t'
						style={{ width: rowWidth, minWidth: 'var(--grid-width)' }}
					>
						{expandedContentFn(row.original)}
					</div>
				)}
			</motion.div>
		</div>
	)
}

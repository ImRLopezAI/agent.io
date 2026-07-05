'use client'

import * as React from 'react'

import { CheckboxCell } from './cells/checkbox-cell'
import { DateCell } from './cells/date-cell'
import { FileCell } from './cells/file-cell'
import { LongTextCell } from './cells/long-text-cell'
import { MultiSelectCell } from './cells/multi-select-cell'
import { NumberCell } from './cells/number-cell'
import { ProgressCell } from './cells/progress-cell'
import { SelectCell } from './cells/select-cell'
import { ShortTextCell } from './cells/short-text-cell'
import { UrlCell } from './cells/url-cell'
import type { DataGridCellProps } from './types/data-grid'

export const DataGridCell = React.memo(DataGridCellImpl, (prev, next) => {
	// Fast path: check stable primitive props first
	if (prev.isFocused !== next.isFocused) return false
	if (prev.isEditing !== next.isEditing) return false
	if (prev.isSelected !== next.isSelected) return false
	if (prev.isSearchMatch !== next.isSearchMatch) return false
	if (prev.isActiveSearchMatch !== next.isActiveSearchMatch) return false
	if (prev.readOnly !== next.readOnly) return false
	if (prev.rowIndex !== next.rowIndex) return false
	if (prev.columnId !== next.columnId) return false
	if (prev.rowHeight !== next.rowHeight) return false
	if (prev.tableVariant !== next.tableVariant) return false

	// Check cell value using row.original instead of getValue() for stability
	// getValue() is unstable and recreates on every render, breaking memoization
	const prevValue = (prev.cell.row.original as Record<string, unknown>)[
		prev.columnId
	]
	const nextValue = (next.cell.row.original as Record<string, unknown>)[
		next.columnId
	]
	if (prevValue !== nextValue) {
		return false
	}

	// Check cell/row identity
	if (prev.cell.row.id !== next.cell.row.id) return false

	return true
}) as typeof DataGridCellImpl

function DataGridCellImpl<TData>({
	cell,
	rowIndex,
	columnId,
	isFocused,
	isEditing,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	rowHeight,
	tableVariant,
}: DataGridCellProps<TData>) {
	const cellOpts = cell.column.columnDef.meta?.cell
	const variant = cellOpts?.variant ?? 'text'

	let Comp: React.ComponentType<DataGridCellProps<TData>>

	switch (variant) {
		case 'short-text':
			Comp = ShortTextCell
			break
		case 'long-text':
			Comp = LongTextCell
			break
		case 'number':
			Comp = NumberCell
			break
		case 'url':
			Comp = UrlCell
			break
		case 'checkbox':
			Comp = CheckboxCell
			break
		case 'select':
			Comp = SelectCell
			break
		case 'multi-select':
			Comp = MultiSelectCell
			break
		case 'date':
			Comp = DateCell
			break
		case 'file':
			Comp = FileCell
			break
		case 'progress':
			Comp = ProgressCell
			break

		default:
			Comp = ShortTextCell
			break
	}

	return (
		<Comp
			cell={cell}
			rowIndex={rowIndex}
			columnId={columnId}
			rowHeight={rowHeight}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			isSearchMatch={isSearchMatch}
			isActiveSearchMatch={isActiveSearchMatch}
			readOnly={readOnly}
			tableVariant={tableVariant}
		/>
	)
}

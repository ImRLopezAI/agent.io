'use client'

import { Calendar } from '../ui/calendar'

import { formatters } from '@ui/data-grid/lib/data-grid-utils'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import {
	formatDateForDisplay,
	formatDateToString,
	parseLocalDate,
} from '../lib/data-grid'
import type { DataGridCellProps } from '../types/data-grid'

export function DateCell<TData>({
	cell,
	rowIndex,
	columnId,
	rowHeight,
	isFocused,
	isEditing,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	tableVariant,
}: DataGridCellProps<TData, 'date'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(initialValue ?? '')
	const containerRef = React.useRef<HTMLDivElement>(null)
	const formatter = cell.column.columnDef.meta?.formatter

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(initialValue ?? '')
	}

	// Parse date as local time to avoid timezone shifts
	const selectedDate = value ? (parseLocalDate(value) ?? undefined) : undefined

	const onDateSelect = React.useCallback(
		(date: Date | undefined) => {
			if (!date || readOnly) return

			// Format using local date components to avoid timezone issues
			const formattedDate = formatDateToString(date)
			setValue(formattedDate)
			actions.onDataUpdate({ rowIndex, columnId, value: formattedDate })
			actions.onCellEditingStop()
		},
		[actions, rowIndex, columnId, readOnly],
	)

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			if (open && !readOnly) {
				actions.onCellEditingStart(rowIndex, columnId)
			} else {
				actions.onCellEditingStop()
			}
		},
		[actions, rowIndex, columnId, readOnly],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (isEditing && event.key === 'Escape') {
				event.preventDefault()
				setValue(initialValue ?? '')
				actions.onCellEditingStop()
			} else if (isFocused && event.key === 'Tab') {
				event.preventDefault()
				actions.onCellEditingStop({
					direction: event.shiftKey ? 'left' : 'right',
				})
			}
		},
		[isEditing, isFocused, initialValue, actions],
	)

	const displayValue = formatter
		? formatter(cell.row.original, formatters)
		: formatDateForDisplay(value)

	return (
		<DataGridCellWrapper<TData>
			ref={containerRef}
			cell={cell}
			rowIndex={rowIndex}
			columnId={columnId}
			rowHeight={rowHeight}
			tableVariant={tableVariant}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			isSearchMatch={isSearchMatch}
			isActiveSearchMatch={isActiveSearchMatch}
			readOnly={readOnly}
			onKeyDown={onWrapperKeyDown}
		>
			<Popover open={isEditing} onOpenChange={onOpenChange}>
				<PopoverTrigger
					className='py-0'
					nativeButton={false}
					render={<span data-slot='grid-cell-content'>{displayValue}</span>}
				/>
				{isEditing && (
					<PopoverContent
						data-grid-cell-editor=''
						align='start'
						alignOffset={-8}
						className='w-auto p-0'
					>
						<Calendar
							autoFocus
							captionLayout='dropdown'
							mode='single'
							defaultMonth={selectedDate ?? new Date()}
							selected={selectedDate}
							onSelect={onDateSelect}
						/>
					</PopoverContent>
				)}
			</Popover>
		</DataGridCellWrapper>
	)
}

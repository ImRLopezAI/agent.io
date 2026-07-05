'use client'

import { formatters } from '@ui/data-grid/lib/data-grid-utils'
import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import type { DataGridCellProps } from '../types/data-grid'

export function NumberCell<TData>({
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
}: DataGridCellProps<TData, 'number'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(String(initialValue ?? ''))
	const inputRef = React.useRef<HTMLInputElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const formatter = cell.column.columnDef.meta?.formatter

	const cellOpts = cell.column.columnDef.meta?.cell
	const numberCellOpts = cellOpts?.variant === 'number' ? cellOpts : null
	const min = numberCellOpts?.min
	const max = numberCellOpts?.max
	const step = numberCellOpts?.step

	const prevIsEditingRef = React.useRef(isEditing)

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(String(initialValue ?? ''))
	}

	const onBlur = React.useCallback(() => {
		const numValue = value === '' ? null : Number(value)
		if (!readOnly && numValue !== initialValue) {
			actions.onDataUpdate({ rowIndex, columnId, value: numValue })
		}
		actions.onCellEditingStop()
	}, [actions, rowIndex, columnId, initialValue, value, readOnly])

	const onChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			setValue(event.target.value)
		},
		[],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === 'Enter') {
					event.preventDefault()
					const numValue = value === '' ? null : Number(value)
					if (numValue !== initialValue) {
						actions.onDataUpdate({ rowIndex, columnId, value: numValue })
					}
					actions.onCellEditingStop({ moveToNextRow: true })
				} else if (event.key === 'Tab') {
					event.preventDefault()
					const numValue = value === '' ? null : Number(value)
					if (numValue !== initialValue) {
						actions.onDataUpdate({ rowIndex, columnId, value: numValue })
					}
					actions.onCellEditingStop({
						direction: event.shiftKey ? 'left' : 'right',
					})
				} else if (event.key === 'Escape') {
					event.preventDefault()
					setValue(String(initialValue ?? ''))
					inputRef.current?.blur()
				}
			} else if (isFocused) {
				// Handle Backspace to start editing with empty value
				if (event.key === 'Backspace') {
					setValue('')
				} else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
					// Handle typing to pre-fill the value when editing starts
					setValue(event.key)
				}
			}
		},
		[isEditing, isFocused, initialValue, actions, rowIndex, columnId, value],
	)

	React.useEffect(() => {
		const wasEditing = prevIsEditingRef.current
		prevIsEditingRef.current = isEditing

		// Only focus when we start editing (transition from false to true)
		if (isEditing && !wasEditing && inputRef.current) {
			inputRef.current.focus()
		}
	}, [isEditing])

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
			{isEditing ? (
				<input
					type='number'
					ref={inputRef}
					value={value}
					min={min}
					max={max}
					step={step}
					className='w-full border-none bg-transparent p-0 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
					onBlur={onBlur}
					onChange={onChange}
				/>
			) : (
				<span data-slot='grid-cell-content'>
					{formatter ? formatter(cell.row.original, formatters) : value}
				</span>
			)}
		</DataGridCellWrapper>
	)
}

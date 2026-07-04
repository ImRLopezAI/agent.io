'use client'

import { formatters } from '@ui/data-grid/lib/data-grid-utils'
import { cn } from 'cnfast'
import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import type { DataGridCellProps } from '../types/data-grid'

export function ShortTextCell<TData>({
	cell,
	rowIndex,
	columnId,
	rowHeight,
	isEditing,
	isFocused,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	tableVariant,
}: DataGridCellProps<TData, 'short-text'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(initialValue)
	const cellRef = React.useRef<HTMLDivElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const formatter = cell.column.columnDef.meta?.formatter

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(initialValue)
		if (cellRef.current && !isEditing && !formatter) {
			cellRef.current.textContent = initialValue
		}
	}

	const onBlur = React.useCallback(() => {
		// Read the current value directly from the DOM to avoid stale state
		const currentValue = cellRef.current?.textContent ?? ''
		if (!readOnly && currentValue !== initialValue) {
			actions.onDataUpdate({ rowIndex, columnId, value: currentValue })
		}
		actions.onCellEditingStop()
	}, [actions, rowIndex, columnId, initialValue, readOnly])

	const onInput = React.useCallback(
		(event: React.FormEvent<HTMLDivElement>) => {
			const currentValue = event.currentTarget.textContent ?? ''
			setValue(currentValue)
		},
		[],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === 'Enter') {
					event.preventDefault()
					const currentValue = cellRef.current?.textContent ?? ''
					if (currentValue !== initialValue) {
						actions.onDataUpdate({
							rowIndex,
							columnId,
							value: currentValue,
						})
					}
					actions.onCellEditingStop({ moveToNextRow: true })
				} else if (event.key === 'Tab') {
					event.preventDefault()
					const currentValue = cellRef.current?.textContent ?? ''
					if (currentValue !== initialValue) {
						actions.onDataUpdate({
							rowIndex,
							columnId,
							value: currentValue,
						})
					}
					actions.onCellEditingStop({
						direction: event.shiftKey ? 'left' : 'right',
					})
				} else if (event.key === 'Escape') {
					event.preventDefault()
					setValue(initialValue)
					cellRef.current?.blur()
				}
			} else if (
				isFocused &&
				event.key.length === 1 &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				// Handle typing to pre-fill the value when editing starts
				setValue(event.key)

				queueMicrotask(() => {
					if (cellRef.current && cellRef.current.contentEditable === 'true') {
						cellRef.current.textContent = event.key
						const range = document.createRange()
						const selection = window.getSelection()
						range.selectNodeContents(cellRef.current)
						range.collapse(false)
						selection?.removeAllRanges()
						selection?.addRange(range)
					}
				})
			}
		},
		[isEditing, isFocused, initialValue, actions, rowIndex, columnId],
	)

	React.useEffect(() => {
		if (isEditing && cellRef.current) {
			cellRef.current.focus()

			if (formatter) {
				cellRef.current.textContent = value ?? ''
			} else if (!cellRef.current.textContent && value) {
				cellRef.current.textContent = value
			}

			if (cellRef.current.textContent) {
				const range = document.createRange()
				const selection = window.getSelection()
				range.selectNodeContents(cellRef.current)
				range.collapse(false)
				selection?.removeAllRanges()
				selection?.addRange(range)
			}
		}
	}, [formatter, isEditing, value])

	const formattedValue = formatter
		? formatter(cell.row.original, formatters)
		: (value ?? '')
	const displayValue = !isEditing ? formattedValue : ''

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
			<div
				role='textbox'
				data-slot='grid-cell-content'
				contentEditable={isEditing}
				tabIndex={-1}
				ref={cellRef}
				onBlur={onBlur}
				onInput={onInput}
				suppressContentEditableWarning
				className={cn('w-full min-w-0 overflow-hidden outline-none', {
					'whitespace-nowrap **:inline **:whitespace-nowrap [&_br]:hidden':
						isEditing,
				})}
			>
				{displayValue}
			</div>
		</DataGridCellWrapper>
	)
}

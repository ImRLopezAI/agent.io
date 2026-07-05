'use client'

import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import type { DataGridCellProps } from '../types/data-grid'
import { Checkbox } from '../ui/checkbox'

export function CheckboxCell<TData>({
	cell,
	rowIndex,
	columnId,
	rowHeight,
	isFocused,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	tableVariant,
}: Omit<DataGridCellProps<TData, 'checkbox'>, 'isEditing'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(Boolean(initialValue))
	const containerRef = React.useRef<HTMLDivElement>(null)
	const handleEdit = cell.column.columnDef.meta?.handleEdit

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(Boolean(initialValue))
	}

	const onCheckedChange = React.useCallback(
		(checked: boolean) => {
			if (readOnly) return
			setValue(checked)
			actions.onDataUpdate({ rowIndex, columnId, value: checked })
		},
		[actions, rowIndex, columnId, readOnly],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (
				isFocused &&
				!readOnly &&
				(event.key === ' ' || event.key === 'Enter')
			) {
				event.preventDefault()
				event.stopPropagation()
				onCheckedChange(!value)
			} else if (isFocused && event.key === 'Tab') {
				event.preventDefault()
				actions.onCellEditingStop({
					direction: event.shiftKey ? 'left' : 'right',
				})
			}
		},
		[isFocused, value, onCheckedChange, actions, readOnly],
	)

	const onWrapperClick = React.useCallback(
		(event: React.MouseEvent) => {
			if (isFocused && !readOnly) {
				event.preventDefault()
				event.stopPropagation()
				onCheckedChange(!value)
			}
		},
		[isFocused, value, onCheckedChange, readOnly],
	)

	const onCheckboxClick = React.useCallback<
		NonNullable<React.ComponentProps<typeof Checkbox>['onClick']>
	>(
		(event) => {
			event.stopPropagation()
			if (readOnly && handleEdit) {
				event.preventDefault()
				handleEdit(cell.row.original)
			}
		},
		[cell.row.original, handleEdit, readOnly],
	)

	const onCheckboxMouseDown = React.useCallback((event: React.MouseEvent) => {
		event.stopPropagation()
	}, [])

	const onCheckboxDoubleClick = React.useCallback((event: React.MouseEvent) => {
		event.stopPropagation()
	}, [])

	return (
		<DataGridCellWrapper<TData>
			ref={containerRef}
			cell={cell}
			rowIndex={rowIndex}
			columnId={columnId}
			rowHeight={rowHeight}
			tableVariant={tableVariant}
			isEditing={false}
			isFocused={isFocused}
			isSelected={isSelected}
			isSearchMatch={isSearchMatch}
			isActiveSearchMatch={isActiveSearchMatch}
			readOnly={readOnly}
			className='flex size-full justify-center'
			onClick={onWrapperClick}
			onKeyDown={onWrapperKeyDown}
		>
			<Checkbox
				checked={value}
				onCheckedChange={onCheckedChange}
				disabled={readOnly && !handleEdit}
				className='border-primary'
				onClick={onCheckboxClick}
				onMouseDown={onCheckboxMouseDown}
				onDoubleClick={onCheckboxDoubleClick}
			/>
		</DataGridCellWrapper>
	)
}

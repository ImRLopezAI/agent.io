'use client'

import { formatters } from '@ui/data-grid/lib/data-grid-utils'
import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import { useDebouncedCallback } from '../hooks/use-debounced-callback'
import type { DataGridCellProps } from '../types/data-grid'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Textarea } from '../ui/textarea'

export function LongTextCell<TData>({
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
}: DataGridCellProps<TData, 'long-text'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(initialValue ?? '')
	const textareaRef = React.useRef<HTMLTextAreaElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const pendingCharRef = React.useRef<string | null>(null)
	const sideOffset = -(containerRef.current?.clientHeight ?? 0)
	const formatter = cell.column.columnDef.meta?.formatter

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(initialValue ?? '')
	}

	const debouncedSave = useDebouncedCallback((newValue: string) => {
		if (!readOnly) {
			actions.onDataUpdate({ rowIndex, columnId, value: newValue })
		}
	}, 300)

	const onSave = React.useCallback(() => {
		// Immediately save any pending changes and close the popover
		if (!readOnly && value !== initialValue) {
			actions.onDataUpdate({ rowIndex, columnId, value })
		}
		actions.onCellEditingStop()
	}, [actions, value, initialValue, rowIndex, columnId, readOnly])

	const onCancel = React.useCallback(() => {
		// Restore the original value
		setValue(initialValue ?? '')
		if (!readOnly) {
			actions.onDataUpdate({ rowIndex, columnId, value: initialValue })
		}
		actions.onCellEditingStop()
	}, [actions, initialValue, rowIndex, columnId, readOnly])

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			if (readOnly) return
			if (open) {
				actions.onCellEditingStart(rowIndex, columnId)
			} else {
				// Immediately save any pending changes when closing
				if (value !== initialValue) {
					actions.onDataUpdate({ rowIndex, columnId, value })
				}
				actions.onCellEditingStop()
			}
		},
		[readOnly, actions, value, initialValue, rowIndex, columnId],
	)

	React.useEffect(() => {
		if (!isEditing) return
		const textarea = textareaRef.current
		if (!textarea) return

		textarea.focus()
		const length = textarea.value.length
		textarea.setSelectionRange(length, length)

		if (pendingCharRef.current) {
			const char = pendingCharRef.current
			pendingCharRef.current = null
			requestAnimationFrame(() => {
				if (
					textareaRef.current &&
					document.activeElement === textareaRef.current
				) {
					document.execCommand('insertText', false, char)
					textareaRef.current.scrollTop = textareaRef.current.scrollHeight
				}
			})
		} else {
			textarea.scrollTop = textarea.scrollHeight
		}
	}, [isEditing])

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (
				isFocused &&
				!isEditing &&
				!readOnly &&
				event.key.length === 1 &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				// Store the character to be inserted after textarea focuses
				// This ensures it's part of the textarea's undo history
				pendingCharRef.current = event.key
			}
		},
		[isFocused, isEditing, readOnly],
	)

	const onBlur = React.useCallback(() => {
		if (readOnly) return
		// Immediately save any pending changes on blur
		if (value !== initialValue) {
			actions.onDataUpdate({ rowIndex, columnId, value })
		}
		actions.onCellEditingStop()
	}, [readOnly, actions, value, initialValue, rowIndex, columnId])

	const onChange = React.useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newValue = event.target.value
			setValue(newValue)
			debouncedSave(newValue)
		},
		[debouncedSave],
	)

	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (readOnly) return
			if (event.key === 'Escape') {
				event.preventDefault()
				onCancel()
			} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault()
				onSave()
			} else if (event.key === 'Tab') {
				event.preventDefault()
				// Save any pending changes
				if (value !== initialValue) {
					actions.onDataUpdate({ rowIndex, columnId, value })
				}
				actions.onCellEditingStop({
					direction: event.shiftKey ? 'left' : 'right',
				})
				return
			}
			// Stop propagation to prevent grid navigation
			event.stopPropagation()
		},
		[
			readOnly,
			onSave,
			onCancel,
			value,
			initialValue,
			actions,
			rowIndex,
			columnId,
		],
	)

	const formattedValue = formatter
		? formatter(cell.row.original, formatters)
		: (value ?? '')
	const displayValue = !isEditing ? formattedValue : ''

	return (
		<Popover
			{...(readOnly
				? { openOnHover: true, delay: 200 }
				: { open: isEditing, onOpenChange })}
		>
			<PopoverTrigger
				className='py-0'
				nativeButton={false}
				render={
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
						<span data-slot='grid-cell-content'>{displayValue}</span>
					</DataGridCellWrapper>
				}
			/>
			<PopoverContent
				data-grid-cell-editor=''
				align='start'
				side='bottom'
				sideOffset={sideOffset}
				className='w-[400px] rounded-none p-0'
				{...(!readOnly && { initialFocus: textareaRef })}
			>
				<Textarea
					placeholder='Enter text...'
					className='max-h-[300px] min-h-[150px] resize-none overflow-y-auto rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring'
					ref={textareaRef}
					value={value}
					readOnly={readOnly}
					onBlur={onBlur}
					onChange={onChange}
					onKeyDown={onKeyDown}
				/>
			</PopoverContent>
		</Popover>
	)
}

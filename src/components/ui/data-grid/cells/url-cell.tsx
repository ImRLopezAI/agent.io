'use client'

import { formatters } from '@ui/data-grid/lib/data-grid-utils'
import { cn } from 'cnfast'
import * as React from 'react'
import { toast } from 'sonner'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import { getUrlHref } from '../lib/data-grid'
import type { DataGridCellProps } from '../types/data-grid'

export function UrlCell<TData>({
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
}: DataGridCellProps<TData, 'url'>) {
	const actions = useDataGridActions()
	const initialValue = cell.getValue()
	const [value, setValue] = React.useState(initialValue ?? '')
	const cellRef = React.useRef<HTMLDivElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const formatter = cell.column.columnDef.meta?.formatter

	const prevInitialValueRef = React.useRef(initialValue)
	if (initialValue !== prevInitialValueRef.current) {
		prevInitialValueRef.current = initialValue
		setValue(initialValue ?? '')
		if (cellRef.current && !isEditing && !formatter) {
			cellRef.current.textContent = initialValue ?? ''
		}
	}

	const onBlur = React.useCallback(() => {
		const currentValue = cellRef.current?.textContent?.trim() ?? ''

		if (!readOnly && currentValue !== initialValue) {
			actions.onDataUpdate({
				rowIndex,
				columnId,
				value: currentValue || null,
			})
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
					const currentValue = cellRef.current?.textContent?.trim() ?? ''
					if (!readOnly && currentValue !== initialValue) {
						actions.onDataUpdate({
							rowIndex,
							columnId,
							value: currentValue || null,
						})
					}
					actions.onCellEditingStop({ moveToNextRow: true })
				} else if (event.key === 'Tab') {
					event.preventDefault()
					const currentValue = cellRef.current?.textContent?.trim() ?? ''
					if (!readOnly && currentValue !== initialValue) {
						actions.onDataUpdate({
							rowIndex,
							columnId,
							value: currentValue || null,
						})
					}
					actions.onCellEditingStop({
						direction: event.shiftKey ? 'left' : 'right',
					})
				} else if (event.key === 'Escape') {
					event.preventDefault()
					setValue(initialValue ?? '')
					cellRef.current?.blur()
				}
			} else if (
				isFocused &&
				!readOnly &&
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
		[isEditing, isFocused, initialValue, actions, rowIndex, columnId, readOnly],
	)

	const onLinkClick = React.useCallback(
		(event: React.MouseEvent<HTMLAnchorElement>) => {
			if (isEditing) {
				event.preventDefault()
				return
			}

			// Check if URL was rejected due to dangerous protocol
			const href = getUrlHref(value)
			if (!href) {
				event.preventDefault()
				toast.error('Invalid URL', {
					description:
						'URL contains a dangerous protocol (javascript:, data:, vbscript:, or file:)',
				})
				return
			}

			// Stop propagation to prevent grid from interfering with link navigation
			event.stopPropagation()
		},
		[isEditing, value],
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

	const displayValue = !isEditing ? (value ?? '') : ''
	const displayLabel = !isEditing
		? formatter
			? formatter(cell.row.original, formatters)
			: displayValue
		: ''
	const urlHref = displayValue ? getUrlHref(displayValue) : ''
	const isDangerousUrl = displayValue && !urlHref

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
			{!isEditing && displayValue ? (
				<div
					data-slot='grid-cell-content'
					className='w-full min-w-0 overflow-hidden'
				>
					<a
						data-focused={isFocused && !isDangerousUrl ? '' : undefined}
						data-invalid={isDangerousUrl ? '' : undefined}
						href={urlHref}
						target='_blank'
						rel='noopener noreferrer'
						className='truncate text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60 data-invalid:cursor-not-allowed data-focused:text-foreground data-invalid:text-destructive data-focused:decoration-foreground/50 data-invalid:decoration-destructive/50 data-focused:hover:decoration-foreground/70 data-invalid:hover:decoration-destructive/70'
						onClick={onLinkClick}
					>
						{displayLabel}
					</a>
				</div>
			) : (
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
					{displayLabel}
				</div>
			)}
		</DataGridCellWrapper>
	)
}

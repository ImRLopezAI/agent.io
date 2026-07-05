'use client'

import { useComposedRefs } from '@ui/data-grid/lib/compose-refs'
import { cn } from 'cnfast'
import * as React from 'react'

import { useDataGridActions } from './contexts/data-grid-actions-context'
import { useDataGridState } from './contexts/data-grid-state-context'
import { getCellKey } from './lib/data-grid'
import { dataGridCellVariants } from './lib/data-grid-variants'
import type { DataGridCellProps } from './types/data-grid'

interface DataGridCellWrapperProps<TData>
	extends DataGridCellProps<TData>,
		React.ComponentProps<'div'> {}

type DataGridCellWrapperComponent = <TData>(
	props: DataGridCellWrapperProps<TData> & React.RefAttributes<HTMLDivElement>,
) => React.ReactElement | null

const INTERACTIVE_SELECTOR = '[data-grid-interactive]'

function isInteractiveTarget(event: {
	target: EventTarget | null
	currentTarget: EventTarget | null
}): boolean {
	const target = event.target
	return (
		target instanceof HTMLElement &&
		(!(event.currentTarget as HTMLElement)?.contains(target) ||
			Boolean(target.closest(INTERACTIVE_SELECTOR)))
	)
}

const DataGridCellWrapperInner = React.forwardRef(function DataGridCellWrapper(
	props: DataGridCellWrapperProps<unknown>,
	ref: React.ForwardedRef<HTMLDivElement>,
) {
	const {
		cell,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		isSelected,
		isSearchMatch,
		isActiveSearchMatch,
		readOnly,
		rowHeight,
		tableVariant,
		className,
		onClick: onClickProp,
		onKeyDown: onKeyDownProp,
		...restProps
	} = props
	const actions = useDataGridActions()
	const { cellMapRef } = useDataGridState()
	const handleEdit = cell.column.columnDef.meta?.handleEdit

	const onCellChange = React.useCallback(
		(node: HTMLDivElement | null) => {
			if (!cellMapRef) return

			const cellKey = getCellKey(rowIndex, columnId)

			if (node) {
				cellMapRef.current.set(cellKey, node)
			} else {
				cellMapRef.current.delete(cellKey)
			}
		},
		[rowIndex, columnId, cellMapRef],
	)

	const composedRef = useComposedRefs(ref, onCellChange)

	// Store latest values in a ref so event handlers never need to be recreated
	const stateRef = React.useRef({
		actions,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		readOnly,
		handleEdit,
		cell,
		onClickProp,
		onKeyDownProp,
	})
	stateRef.current = {
		actions,
		rowIndex,
		columnId,
		isEditing,
		isFocused,
		readOnly,
		handleEdit,
		cell,
		onClickProp,
		onKeyDownProp,
	}

	// Single stable handlers object — empty deps means never recreated
	const handlers = React.useMemo(
		() => ({
			onClick: (event: React.MouseEvent<HTMLDivElement>) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current
				const isModifiedClick = event.shiftKey || event.ctrlKey || event.metaKey
				if (!s.isEditing) {
					event.preventDefault()
					s.onClickProp?.(event)
					if (s.isFocused && !s.readOnly) {
						s.actions.onCellEditingStart(s.rowIndex, s.columnId, s.cell.row.id)
					} else {
						s.actions.onCellClick(s.rowIndex, s.columnId, event, s.cell.row.id)
						if (s.readOnly && s.handleEdit && !isModifiedClick) {
							s.handleEdit(s.cell.row.original)
						}
					}
				}
			},
			onContextMenu: (event: React.MouseEvent) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current
				if (!s.isEditing) {
					s.actions.onCellContextMenu(
						s.rowIndex,
						s.columnId,
						event,
						s.cell.row.id,
					)
				}
			},
			onDoubleClick: (event: React.MouseEvent) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current
				if (!s.isEditing) {
					event.preventDefault()
					s.actions.onCellDoubleClick(
						s.rowIndex,
						s.columnId,
						event,
						s.cell.row.id,
					)
				}
			},
			onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current

				if (
					s.isFocused &&
					s.readOnly &&
					s.handleEdit &&
					(event.key === 'Enter' || event.key === ' ') &&
					!event.shiftKey &&
					!event.ctrlKey &&
					!event.metaKey
				) {
					event.preventDefault()
					event.stopPropagation()
					s.handleEdit(s.cell.row.original)
					return
				}
				s.onKeyDownProp?.(event)

				if (event.defaultPrevented) return

				if (
					event.key === 'ArrowUp' ||
					event.key === 'ArrowDown' ||
					event.key === 'ArrowLeft' ||
					event.key === 'ArrowRight' ||
					event.key === 'Home' ||
					event.key === 'End' ||
					event.key === 'PageUp' ||
					event.key === 'PageDown' ||
					event.key === 'Tab'
				) {
					return
				}

				if (s.isFocused && !s.isEditing && !s.readOnly) {
					if (event.key === 'F2' || event.key === 'Enter') {
						event.preventDefault()
						event.stopPropagation()
						s.actions.onCellEditingStart(s.rowIndex, s.columnId, s.cell.row.id)
						return
					}

					if (event.key === ' ') {
						event.preventDefault()
						event.stopPropagation()
						s.actions.onCellEditingStart(s.rowIndex, s.columnId, s.cell.row.id)
						return
					}

					if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
						event.preventDefault()
						event.stopPropagation()
						s.actions.onCellEditingStart(s.rowIndex, s.columnId, s.cell.row.id)
					}
				}
			},
			onMouseDown: (event: React.MouseEvent) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current
				if (!s.isEditing) {
					s.actions.onCellMouseDown(
						s.rowIndex,
						s.columnId,
						event,
						s.cell.row.id,
					)
				}
			},
			onMouseEnter: () => {
				const s = stateRef.current
				if (!s.isEditing) {
					s.actions.onCellMouseEnter(s.rowIndex, s.columnId, s.cell.row.id)
				}
			},
			onMouseUp: (event: React.MouseEvent) => {
				if (isInteractiveTarget(event)) return
				const s = stateRef.current
				if (!s.isEditing) {
					s.actions.onCellMouseUp()
				}
			},
		}),
		[],
	)

	return (
		<div
			role='button'
			data-slot='grid-cell-wrapper'
			data-editing={isEditing ? '' : undefined}
			data-focused={isFocused ? '' : undefined}
			data-selected={isSelected ? '' : undefined}
			tabIndex={isFocused && !isEditing ? 0 : -1}
			{...restProps}
			ref={composedRef}
			className={cn(
				'flex size-full min-w-0 items-center text-start text-sm outline-none',
				dataGridCellVariants({ variant: tableVariant }),
				{
					'ring-1 ring-ring ring-inset': isFocused,
					'bg-yellow-100 dark:bg-yellow-900/30':
						isSearchMatch && !isActiveSearchMatch,
					'bg-orange-200 dark:bg-orange-900/50': isActiveSearchMatch,
					'bg-primary/10': isSelected && !isEditing,
					'cursor-default': !isEditing,
					'**:data-[slot=grid-cell-content]:line-clamp-1':
						!isEditing && rowHeight === 'short',
					'**:data-[slot=grid-cell-content]:line-clamp-2':
						!isEditing && rowHeight === 'medium',
					'**:data-[slot=grid-cell-content]:line-clamp-3':
						!isEditing && rowHeight === 'tall',
					'**:data-[slot=grid-cell-content]:line-clamp-4':
						!isEditing && rowHeight === 'extra-tall',
				},
				className,
			)}
			onClick={handlers.onClick}
			onContextMenu={handlers.onContextMenu}
			onDoubleClick={handlers.onDoubleClick}
			onMouseDown={handlers.onMouseDown}
			onMouseEnter={handlers.onMouseEnter}
			onMouseUp={handlers.onMouseUp}
			onKeyDown={handlers.onKeyDown}
		/>
	)
})

DataGridCellWrapperInner.displayName = 'DataGridCellWrapper'

export const DataGridCellWrapper =
	DataGridCellWrapperInner as DataGridCellWrapperComponent

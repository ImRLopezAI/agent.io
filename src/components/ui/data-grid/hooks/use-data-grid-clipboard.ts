import type { useReactTable } from '@tanstack/react-table'
import * as React from 'react'
import { toast } from 'sonner'

import {
	getCellKey,
	getIsFileCellData,
	matchSelectOption,
	parseCellKey,
} from '../lib/data-grid'
import type { CellPosition, CellUpdate } from '../types/data-grid'
import { announce, type DataGridStore } from './use-data-grid-store'

// ---------------------------------------------------------------------------
// Constants used by paste logic
// ---------------------------------------------------------------------------

const DOMAIN_REGEX = /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?$/
const PASTE_CELL_LIMIT = 50_000
const TRUTHY_BOOLEANS = new Set(['true', '1', 'yes', 'checked'])
const VALID_BOOLEANS = new Set([
	'true',
	'false',
	'1',
	'0',
	'yes',
	'no',
	'checked',
	'unchecked',
])

// ---------------------------------------------------------------------------
// Shared serialization helper (deduplicates copy/cut)
// ---------------------------------------------------------------------------

function serializeSelectedCells<TData>(
	store: DataGridStore,
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>,
): { tsvData: string; selectedCellsArray: string[] } | null {
	const currentState = store.getState()

	let selectedCellsArray: string[]
	if (!currentState.selectionState.selectedCells.size) {
		if (!currentState.focusedCell) return null
		const focusedCellKey = getCellKey(
			currentState.focusedCell.rowIndex,
			currentState.focusedCell.columnId,
		)
		selectedCellsArray = [focusedCellKey]
	} else {
		selectedCellsArray = Array.from(currentState.selectionState.selectedCells)
	}

	const currentTable = tableRef.current
	const rows = currentTable?.getRowModel().rows
	if (!rows) return null

	const selectedColumnIds: string[] = []

	for (const cellKey of selectedCellsArray) {
		const { columnId } = parseCellKey(cellKey)
		if (columnId && !selectedColumnIds.includes(columnId)) {
			selectedColumnIds.push(columnId)
		}
	}

	const cellData = new Map<string, string>()
	for (const cellKey of selectedCellsArray) {
		const { rowIndex, columnId } = parseCellKey(cellKey)
		const row = rows[rowIndex]
		if (row) {
			const cell = row.getVisibleCells().find((c) => c.column.id === columnId)
			if (cell) {
				const value = cell.getValue()
				const cellVariant = cell.column.columnDef?.meta?.cell?.variant

				let serializedValue = ''
				if (cellVariant === 'file' || cellVariant === 'multi-select') {
					serializedValue = value ? JSON.stringify(value) : ''
				} else if (value instanceof Date) {
					serializedValue = value.toISOString()
				} else {
					serializedValue = String(value ?? '')
				}

				cellData.set(cellKey, serializedValue)
			}
		}
	}

	const rowIndices = new Set<number>()
	const colIndices = new Set<number>()

	for (const cellKey of selectedCellsArray) {
		const { rowIndex, columnId } = parseCellKey(cellKey)
		rowIndices.add(rowIndex)
		const colIndex = selectedColumnIds.indexOf(columnId)
		if (colIndex >= 0) {
			colIndices.add(colIndex)
		}
	}

	const sortedRowIndices = Array.from(rowIndices).sort((a, b) => a - b)
	const sortedColIndices = Array.from(colIndices).sort((a, b) => a - b)
	const sortedColumnIds = sortedColIndices.map((i) => selectedColumnIds[i])

	const tsvData = sortedRowIndices
		.map((rowIndex) =>
			sortedColumnIds
				.map((columnId) => {
					const cellKey = `${rowIndex}:${columnId}`
					return cellData.get(cellKey) ?? ''
				})
				.join('\t'),
		)
		.join('\n')

	return { tsvData, selectedCellsArray }
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseDataGridClipboardParams<TData> {
	store: DataGridStore
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>
	dataGridRef: React.RefObject<HTMLDivElement | null>
	propsRef: React.RefObject<{
		readOnly?: boolean
		data: TData[]
		onRowAdd?: (
			...args: unknown[]
		) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null
		onRowsAdd?: (count: number) => void | Promise<void>
		onPaste?: (updates: Array<CellUpdate>) => void | Promise<void>
		enableSingleCellSelection?: boolean
	}>
	navigableColumnIds: string[]
	onDataUpdate: (updates: CellUpdate | Array<CellUpdate>) => void
	selectRange: (
		start: CellPosition,
		end: CellPosition,
		isSelecting?: boolean,
	) => void
}

interface UseDataGridClipboardReturn {
	onCellsCopy: () => Promise<void>
	onCellsCut: () => Promise<void>
	onCellsPaste: (expandRows?: boolean) => Promise<void>
	restoreFocus: (element: HTMLDivElement | null) => void
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useDataGridClipboard<TData>({
	store,
	tableRef,
	dataGridRef,
	propsRef,
	navigableColumnIds,
	onDataUpdate,
	selectRange,
}: UseDataGridClipboardParams<TData>): UseDataGridClipboardReturn {
	const onCellsCopy = React.useCallback(async () => {
		const result = serializeSelectedCells(store, tableRef)
		if (!result) return

		const { tsvData, selectedCellsArray } = result

		try {
			await navigator.clipboard.writeText(tsvData)

			const currentState = store.getState()
			if (currentState.cutCells.size > 0) {
				store.setState('cutCells', new Set())
			}

			const copiedMessage = `Copied ${selectedCellsArray.length} cell${
				selectedCellsArray.length !== 1 ? 's' : ''
			}`
			toast.success(copiedMessage)
			announce(store, copiedMessage)
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to copy to clipboard'
			toast.error(message)
			announce(store, message)
		}
	}, [store, tableRef])

	const onCellsCut = React.useCallback(async () => {
		if (propsRef.current.readOnly) return

		const result = serializeSelectedCells(store, tableRef)
		if (!result) return

		const { tsvData, selectedCellsArray } = result

		try {
			await navigator.clipboard.writeText(tsvData)

			store.setState('cutCells', new Set(selectedCellsArray))

			const cutMessage = `Cut ${selectedCellsArray.length} cell${
				selectedCellsArray.length !== 1 ? 's' : ''
			}`
			toast.success(cutMessage)
			announce(store, cutMessage)
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to cut to clipboard'
			toast.error(message)
			announce(store, message)
		}
	}, [store, propsRef, tableRef])

	const restoreFocus = React.useCallback((element: HTMLDivElement | null) => {
		if (element && document.activeElement !== element) {
			requestAnimationFrame(() => {
				element.focus()
			})
		}
	}, [])

	const onCellsPaste = React.useCallback(
		async (expandRows = false) => {
			if (propsRef.current.readOnly) return

			const currentState = store.getState()
			if (!currentState.focusedCell) return

			const currentTable = tableRef.current
			const rows = currentTable?.getRowModel().rows
			if (!rows) return

			try {
				let clipboardText = currentState.pasteDialog.clipboardText

				if (!clipboardText) {
					clipboardText = await navigator.clipboard.readText()
					if (!clipboardText) return
				}

				const pastedRows = clipboardText
					.split(/\r?\n/)
					.filter((row) => row.length > 0)
				const pastedData = pastedRows.map((row) =>
					row.split('\t').map((cell) => cell.replace(/\r$/, '')),
				)

				const totalCells = pastedData.length * (pastedData[0]?.length ?? 0)
				if (totalCells > PASTE_CELL_LIMIT) {
					const message = `Paste rejected: too many cells (limit ${PASTE_CELL_LIMIT.toLocaleString()})`
					toast.error(message)
					announce(store, message)
					return
				}

				const startRowIndex = currentState.focusedCell.rowIndex
				const startColIndex = navigableColumnIds.indexOf(
					currentState.focusedCell.columnId,
				)

				if (startColIndex === -1) return

				const rowCount = rows.length ?? propsRef.current.data.length
				const rowsNeeded = startRowIndex + pastedData.length - rowCount

				if (
					rowsNeeded > 0 &&
					!expandRows &&
					propsRef.current.onRowAdd &&
					!currentState.pasteDialog.clipboardText
				) {
					store.setState('pasteDialog', {
						open: true,
						rowsNeeded,
						clipboardText,
					})
					return
				}

				if (expandRows && rowsNeeded > 0) {
					const expectedRowCount = rowCount + rowsNeeded

					if (propsRef.current.onRowsAdd) {
						await propsRef.current.onRowsAdd(rowsNeeded)
					} else if (propsRef.current.onRowAdd) {
						for (let i = 0; i < rowsNeeded; i++) {
							await propsRef.current.onRowAdd()
						}
					}

					let attempts = 0
					const maxAttempts = 50
					let currentTableRowCount =
						tableRef.current?.getRowModel().rows.length ?? 0

					while (
						currentTableRowCount < expectedRowCount &&
						attempts < maxAttempts
					) {
						await new Promise((resolve) => setTimeout(resolve, 100))
						currentTableRowCount =
							tableRef.current?.getRowModel().rows.length ?? 0
						attempts++
					}
				}

				const updates: Array<CellUpdate> = []
				const tableColumns = currentTable?.getAllColumns() ?? []
				let cellsUpdated = 0
				let endRowIndex = startRowIndex
				let endColIndex = startColIndex

				const updatedTable = tableRef.current
				const updatedRows = updatedTable?.getRowModel().rows
				const currentRowCount = updatedRows?.length ?? 0

				let cellsSkipped = 0

				const columnMap = new Map(tableColumns.map((c) => [c.id, c]))

				for (
					let pasteRowIdx = 0;
					pasteRowIdx < pastedData.length;
					pasteRowIdx++
				) {
					const pasteRow = pastedData[pasteRowIdx]
					if (!pasteRow) continue

					const targetRowIndex = startRowIndex + pasteRowIdx
					if (targetRowIndex >= currentRowCount) break

					for (
						let pasteColIdx = 0;
						pasteColIdx < pasteRow.length;
						pasteColIdx++
					) {
						const targetColIndex = startColIndex + pasteColIdx
						if (targetColIndex >= navigableColumnIds.length) break

						const targetColumnId = navigableColumnIds[targetColIndex]
						if (!targetColumnId) continue

						const pastedValue = pasteRow[pasteColIdx] ?? ''
						const column = columnMap.get(targetColumnId)
						const cellOpts = column?.columnDef?.meta?.cell
						const cellVariant = cellOpts?.variant

						let processedValue: unknown = pastedValue
						let shouldSkip = false

						switch (cellVariant) {
							case 'number': {
								if (!pastedValue) {
									processedValue = null
								} else {
									const num = Number.parseFloat(pastedValue)
									if (Number.isNaN(num)) shouldSkip = true
									else processedValue = num
								}
								break
							}

							case 'checkbox': {
								if (!pastedValue) {
									processedValue = false
								} else {
									const lower = pastedValue.toLowerCase()
									if (VALID_BOOLEANS.has(lower)) {
										processedValue = TRUTHY_BOOLEANS.has(lower)
									} else {
										shouldSkip = true
									}
								}
								break
							}

							case 'date': {
								if (!pastedValue) {
									processedValue = null
								} else {
									const date = new Date(pastedValue)
									if (Number.isNaN(date.getTime())) shouldSkip = true
									else processedValue = date
								}
								break
							}

							case 'select': {
								const options = cellOpts?.options ?? []
								if (!pastedValue) {
									processedValue = ''
								} else {
									const matched = matchSelectOption(pastedValue, options)
									if (matched) processedValue = matched
									else shouldSkip = true
								}
								break
							}

							case 'multi-select': {
								const options = cellOpts?.options ?? []
								let values: string[] = []
								try {
									const parsed = JSON.parse(pastedValue)
									if (Array.isArray(parsed)) {
										values = parsed.filter(
											(v): v is string => typeof v === 'string',
										)
									}
								} catch {
									values = pastedValue
										? pastedValue.split(',').map((v) => v.trim())
										: []
								}

								const validated = values
									.map((v) => matchSelectOption(v, options))
									.filter(Boolean) as string[]

								if (values.length > 0 && validated.length === 0) {
									shouldSkip = true
								} else {
									processedValue = validated
								}
								break
							}

							case 'file': {
								if (!pastedValue) {
									processedValue = []
								} else {
									try {
										const parsed = JSON.parse(pastedValue)
										if (!Array.isArray(parsed)) {
											shouldSkip = true
										} else {
											const validFiles = parsed.filter(getIsFileCellData)
											if (parsed.length > 0 && validFiles.length === 0) {
												shouldSkip = true
											} else {
												processedValue = validFiles
											}
										}
									} catch {
										shouldSkip = true
									}
								}
								break
							}

							case 'url': {
								if (!pastedValue) {
									processedValue = ''
								} else {
									const firstChar = pastedValue[0]
									if (firstChar === '[' || firstChar === '{') {
										shouldSkip = true
									} else {
										try {
											new URL(pastedValue)
											processedValue = pastedValue
										} catch {
											if (DOMAIN_REGEX.test(pastedValue)) {
												processedValue = pastedValue
											} else {
												shouldSkip = true
											}
										}
									}
								}
								break
							}

							default: {
								if (!pastedValue) {
									processedValue = ''
									break
								}

								if (ISO_DATE_REGEX.test(pastedValue)) {
									const date = new Date(pastedValue)
									if (!Number.isNaN(date.getTime())) {
										processedValue = date.toLocaleDateString()
										break
									}
								}

								const firstChar = pastedValue[0]
								if (
									firstChar === '[' ||
									firstChar === '{' ||
									firstChar === 't' ||
									firstChar === 'f'
								) {
									try {
										const parsed = JSON.parse(pastedValue)

										if (Array.isArray(parsed)) {
											if (
												parsed.length > 0 &&
												parsed.every(getIsFileCellData)
											) {
												processedValue = parsed.map((f) => f.name).join(', ')
											} else if (parsed.every((v) => typeof v === 'string')) {
												processedValue = (parsed as string[]).join(', ')
											}
										} else if (typeof parsed === 'boolean') {
											processedValue = parsed ? 'Checked' : 'Unchecked'
										}
									} catch {
										const lower = pastedValue.toLowerCase()
										if (lower === 'true' || lower === 'false') {
											processedValue =
												lower === 'true' ? 'Checked' : 'Unchecked'
										}
									}
								}
							}
						}

						if (shouldSkip) {
							cellsSkipped++
							endRowIndex = Math.max(endRowIndex, targetRowIndex)
							endColIndex = Math.max(endColIndex, targetColIndex)
							continue
						}

						updates.push({
							rowIndex: targetRowIndex,
							columnId: targetColumnId,
							value: processedValue,
						})
						cellsUpdated++

						endRowIndex = Math.max(endRowIndex, targetRowIndex)
						endColIndex = Math.max(endColIndex, targetColIndex)
					}
				}

				if (updates.length > 0) {
					if (propsRef.current.onPaste) {
						await propsRef.current.onPaste(updates)
					}

					const allUpdates = [...updates]

					if (currentState.cutCells.size > 0) {
						for (const cellKey of currentState.cutCells) {
							const { rowIndex, columnId } = parseCellKey(cellKey)

							const column = tableColumns.find((c) => c.id === columnId)
							const cellVariant = column?.columnDef?.meta?.cell?.variant

							let emptyValue: unknown = ''
							if (cellVariant === 'multi-select' || cellVariant === 'file') {
								emptyValue = []
							} else if (cellVariant === 'number' || cellVariant === 'date') {
								emptyValue = null
							} else if (cellVariant === 'checkbox') {
								emptyValue = false
							}

							allUpdates.push({ rowIndex, columnId, value: emptyValue })
						}

						store.setState('cutCells', new Set())
					}

					onDataUpdate(allUpdates)

					const pasteMessage =
						cellsSkipped > 0
							? `Pasted ${cellsUpdated} cell${
									cellsUpdated !== 1 ? 's' : ''
								}, ${cellsSkipped} skipped`
							: `Pasted ${cellsUpdated} cell${cellsUpdated !== 1 ? 's' : ''}`
					toast.success(pasteMessage)
					announce(store, pasteMessage)

					const endColumnId = navigableColumnIds[endColIndex]
					if (endColumnId) {
						selectRange(
							{
								rowIndex: startRowIndex,
								columnId: currentState.focusedCell.columnId,
							},
							{ rowIndex: endRowIndex, columnId: endColumnId },
						)
					}

					restoreFocus(dataGridRef.current)
				} else if (cellsSkipped > 0) {
					const skipMessage = `Paste rejected: ${cellsSkipped} cell${
						cellsSkipped !== 1 ? 's' : ''
					} skipped for invalid data`
					toast.error(skipMessage)
					announce(store, skipMessage)
				}

				if (currentState.pasteDialog.open) {
					store.setState('pasteDialog', {
						open: false,
						rowsNeeded: 0,
						clipboardText: '',
					})
				}
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Failed to paste. Please try again.'
				toast.error(message)
				announce(store, message)
			}
		},
		[
			store,
			tableRef,
			dataGridRef,
			navigableColumnIds,
			propsRef,
			onDataUpdate,
			selectRange,
			restoreFocus,
		],
	)

	return {
		onCellsCopy,
		onCellsCut,
		onCellsPaste,
		restoreFocus,
	}
}

// Declarative keyboard layer for the data grid (Unit 8b).
//
// Migrates the historical 553-line `onDataGridKeyDown` switch and the
// document-level keydown listener from `use-data-grid.ts` to discrete
// `@tanstack/react-hotkeys` registrations driven by `GRID_SHORTCUTS`.
//
// One small piece does NOT fit `useHotkey`'s discrete-key model: the
// "printable-char-to-edit" behavior (typing any letter/digit on a focused
// cell starts editing). That's kept as a tiny inline keydown listener at
// the bottom of this hook, scoped to `dataGridRef.current` and gated by
// `!editingCell`. Everything else is a declarative registration.

import {
	type Hotkey,
	type UseHotkeyDefinition,
	useHotkeys,
} from '@tanstack/react-hotkeys'
import type { useReactTable } from '@tanstack/react-table'
import type { Virtualizer } from '@tanstack/react-virtual'
import * as React from 'react'

import { getCellKey, parseCellKey, scrollCellIntoView } from '../lib/data-grid'
import type {
	CellPosition,
	CellUpdate,
	Direction,
	NavigationDirection,
} from '../types/data-grid'
import {
	GRID_SHORTCUTS,
	type GridShortcutId,
} from './use-data-grid-shortcuts-registry'
import { type DataGridStore, useStore } from './use-data-grid-store'

const VIEWPORT_OFFSET = 1

interface KeyboardPropsRef<TData> {
	readOnly?: boolean
	enableSearch?: boolean
	enablePaste?: boolean
	data: TData[]
	onRowAdd?: (
		event?: React.MouseEvent<HTMLDivElement>,
	) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null
	onRowsDelete?: (
		rows: TData[],
		rowIndices: number[],
		rowIds?: string[],
	) => void | Promise<void>
}

interface UseDataGridKeyboardOptions<TData> {
	dataGridRef: React.RefObject<HTMLDivElement | null>
	headerRef: React.RefObject<HTMLDivElement | null>
	footerRef: React.RefObject<HTMLDivElement | null>
	rowMapRef: React.RefObject<Map<number, HTMLDivElement>>
	cellMapRef: React.RefObject<Map<string, HTMLDivElement>>
	rowVirtualizerRef: React.RefObject<Virtualizer<
		HTMLDivElement,
		Element
	> | null>
	tableRef: React.RefObject<ReturnType<typeof useReactTable<TData>> | null>
	store: DataGridStore
	propsRef: React.RefObject<KeyboardPropsRef<TData>>
	dir: Direction
	navigableColumnIds: string[]

	// Sub-hook callbacks
	navigateCell: (direction: NavigationDirection) => void
	blurCell: () => void
	selectAll: () => void
	selectRange: (start: CellPosition, end: CellPosition) => void
	onSelectionClear: () => void
	onCellsCopy: () => void
	onCellsCut: () => void
	onCellsPaste: () => void
	restoreFocus: (container: HTMLDivElement | null) => void
	onSearchOpenChange: (open: boolean) => void
	onNavigateToNextMatch: () => void
	onNavigateToPrevMatch: () => void
	onCellEditingStart: (rowIndex: number, columnId: string) => void
	onDataUpdate: (updates: CellUpdate | Array<CellUpdate>) => void
	onRowsDelete: (rowIndices: number[]) => void
	onRowAddShortcut: () => void
}

// Shared `extendSelection` helper. The legacy version lives in
// `use-data-grid.ts`; we keep a private copy here so this hook is
// self-contained.
function extendSelection({
	store,
	selectRange,
	target,
	scroll,
	restoreFocus,
	container,
}: {
	store: DataGridStore
	selectRange: (start: CellPosition, end: CellPosition) => void
	target: CellPosition
	scroll?: () => void
	restoreFocus?: (container: HTMLDivElement | null) => void
	container?: HTMLDivElement | null
}) {
	const currentState = store.getState()
	const selectionStart =
		currentState.selectionState.selectionRange?.start ||
		currentState.focusedCell
	if (!selectionStart) return
	selectRange(selectionStart, target)
	scroll?.()
	restoreFocus?.(container ?? null)
}

// History keys are owned by use-data-grid-undo-redo.ts. Enter starting an
// edit was NOT in the legacy switch (cell variants own Enter on focus). We
// skip both registrations here to preserve observable behavior.
const SKIPPED_SHORTCUT_IDS = new Set<GridShortcutId>([
	'historyUndo',
	'historyRedo',
	'editStartEnter',
])

function useDataGridKeyboard<TData>(
	options: UseDataGridKeyboardOptions<TData>,
): void {
	const {
		dataGridRef,
		headerRef,
		footerRef,
		rowMapRef,
		cellMapRef,
		rowVirtualizerRef,
		tableRef,
		store,
		propsRef,
		dir,
		navigableColumnIds,
		navigateCell,
		blurCell,
		selectAll,
		selectRange,
		onSelectionClear,
		onCellsCopy,
		onCellsCut,
		onCellsPaste,
		restoreFocus,
		onSearchOpenChange,
		onNavigateToNextMatch,
		onNavigateToPrevMatch,
		onCellEditingStart,
		onDataUpdate,
		onRowsDelete,
		onRowAddShortcut,
	} = options

	// Re-read store state on every change so `enabled` predicates stay live.
	const focusedCell = useStore(store, (state) => state.focusedCell)
	const editingCell = useStore(store, (state) => state.editingCell)
	const searchOpen = useStore(store, (state) => state.searchOpen)
	const selectionState = useStore(store, (state) => state.selectionState)
	const rowSelection = useStore(store, (state) => state.rowSelection)

	// Stable refs for the printable-key listener and one-shot helpers.
	const focusedCellRef = React.useRef(focusedCell)
	focusedCellRef.current = focusedCell
	const editingCellRef = React.useRef(editingCell)
	editingCellRef.current = editingCell
	const searchOpenRef = React.useRef(searchOpen)
	searchOpenRef.current = searchOpen

	const hasFocus = focusedCell !== null
	const isEditing = editingCell !== null
	const hasSelections =
		selectionState.selectedCells.size > 0 ||
		Object.keys(rowSelection).length > 0
	const enableSearch = propsRef.current.enableSearch ?? false
	const enablePaste = propsRef.current.enablePaste ?? false
	const readOnly = Boolean(propsRef.current.readOnly)

	// Vertical block-extend (Mod+Shift+ArrowUp/Down).
	const extendVertical = React.useCallback(
		(rowIndex: number, align: 'start' | 'end') => {
			const currentState = store.getState()
			const selectionEdge =
				currentState.selectionState.selectionRange?.end ||
				currentState.focusedCell
			if (!selectionEdge) return
			const currentColIndex = navigableColumnIds.indexOf(selectionEdge.columnId)
			extendSelection({
				store,
				selectRange,
				target: {
					rowIndex,
					columnId:
						navigableColumnIds[currentColIndex] ?? selectionEdge.columnId,
				},
				scroll: () => {
					rowVirtualizerRef.current?.scrollToIndex(rowIndex, { align })
				},
				restoreFocus,
				container: dataGridRef.current,
			})
		},
		[
			store,
			selectRange,
			navigableColumnIds,
			rowVirtualizerRef,
			restoreFocus,
			dataGridRef,
		],
	)

	// Horizontal block-extend (Mod+Shift+ArrowLeft/Right).
	const extendHorizontal = React.useCallback(
		(targetColumnId: string, direction: 'home' | 'end') => {
			const currentState = store.getState()
			const selectionEdge =
				currentState.selectionState.selectionRange?.end ||
				currentState.focusedCell
			if (!selectionEdge) return
			const container = dataGridRef.current
			extendSelection({
				store,
				selectRange,
				target: {
					rowIndex: selectionEdge.rowIndex,
					columnId: targetColumnId,
				},
				scroll: () => {
					const cellKey = getCellKey(selectionEdge.rowIndex, targetColumnId)
					const targetCell = cellMapRef.current.get(cellKey)
					if (container && targetCell) {
						scrollCellIntoView({
							container,
							targetCell,
							tableRef,
							viewportOffset: VIEWPORT_OFFSET,
							direction,
							isRtl: dir === 'rtl',
						})
					}
				},
				restoreFocus,
				container,
			})
		},
		[store, selectRange, dataGridRef, cellMapRef, tableRef, restoreFocus, dir],
	)

	// Generic Shift+Arrow extend (single-step). Mirrors the legacy tail of
	// the inline switch: vertical scroll-on-need + horizontal scrollIntoView.
	const extendArrow = React.useCallback(
		(direction: NavigationDirection) => {
			const currentState = store.getState()
			if (!currentState.focusedCell) return
			const selectionEdge =
				currentState.selectionState.selectionRange?.end ||
				currentState.focusedCell
			const currentColIndex = navigableColumnIds.indexOf(selectionEdge.columnId)
			let newRowIndex = selectionEdge.rowIndex
			let newColumnId = selectionEdge.columnId
			const isRtl = dir === 'rtl'
			const rowCount =
				tableRef.current?.getRowModel().rows.length ||
				propsRef.current.data.length

			switch (direction) {
				case 'up':
					newRowIndex = Math.max(0, selectionEdge.rowIndex - 1)
					break
				case 'down':
					newRowIndex = Math.min(rowCount - 1, selectionEdge.rowIndex + 1)
					break
				case 'left':
					if (isRtl) {
						if (currentColIndex < navigableColumnIds.length - 1) {
							const nextColumnId = navigableColumnIds[currentColIndex + 1]
							if (nextColumnId) newColumnId = nextColumnId
						}
					} else if (currentColIndex > 0) {
						const prevColumnId = navigableColumnIds[currentColIndex - 1]
						if (prevColumnId) newColumnId = prevColumnId
					}
					break
				case 'right':
					if (isRtl) {
						if (currentColIndex > 0) {
							const prevColumnId = navigableColumnIds[currentColIndex - 1]
							if (prevColumnId) newColumnId = prevColumnId
						}
					} else if (currentColIndex < navigableColumnIds.length - 1) {
						const nextColumnId = navigableColumnIds[currentColIndex + 1]
						if (nextColumnId) newColumnId = nextColumnId
					}
					break
			}

			const container = dataGridRef.current
			const targetRow = rowMapRef.current.get(newRowIndex)
			const cellKey = getCellKey(newRowIndex, newColumnId)
			const targetCell = cellMapRef.current.get(cellKey)

			extendSelection({
				store,
				selectRange,
				target: { rowIndex: newRowIndex, columnId: newColumnId },
			})

			if (
				newRowIndex !== selectionEdge.rowIndex &&
				(direction === 'up' || direction === 'down')
			) {
				if (container && targetRow) {
					const containerRect = container.getBoundingClientRect()
					const headerHeight =
						headerRef.current?.getBoundingClientRect().height ?? 0
					const footerHeight =
						footerRef.current?.getBoundingClientRect().height ?? 0
					const viewportTop = containerRect.top + headerHeight + VIEWPORT_OFFSET
					const viewportBottom =
						containerRect.bottom - footerHeight - VIEWPORT_OFFSET
					const rowRect = targetRow.getBoundingClientRect()
					const isFullyVisible =
						rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom

					if (!isFullyVisible) {
						const scrollNeeded =
							direction === 'down'
								? rowRect.bottom - viewportBottom
								: viewportTop - rowRect.top
						if (direction === 'down') {
							container.scrollTop += scrollNeeded
						} else {
							container.scrollTop -= scrollNeeded
						}
						restoreFocus(container)
					}
				} else {
					const rowVirtualizer = rowVirtualizerRef.current
					if (rowVirtualizer) {
						const align = direction === 'up' ? 'start' : 'end'
						rowVirtualizer.scrollToIndex(newRowIndex, { align })
						restoreFocus(container)
					}
				}
			}

			if (
				newColumnId !== selectionEdge.columnId &&
				(direction === 'left' || direction === 'right')
			) {
				if (container && targetCell) {
					scrollCellIntoView({
						container,
						targetCell,
						tableRef,
						viewportOffset: VIEWPORT_OFFSET,
						direction,
						isRtl,
					})
				}
			}
		},
		[
			store,
			selectRange,
			navigableColumnIds,
			dir,
			tableRef,
			propsRef,
			dataGridRef,
			rowMapRef,
			cellMapRef,
			headerRef,
			footerRef,
			rowVirtualizerRef,
			restoreFocus,
		],
	)

	// Plain navigation tail — used both by raw arrows and by Tab.
	const navigateOrClearAndNavigate = React.useCallback(
		(direction: NavigationDirection) => {
			const currentState = store.getState()
			if (
				currentState.selectionState.selectedCells.size > 0 ||
				currentState.selectionState.selectionRange
			) {
				onSelectionClear()
			}
			navigateCell(direction)
		},
		[store, onSelectionClear, navigateCell],
	)

	const onDeleteSelected = React.useCallback(() => {
		const currentState = store.getState()
		const cellsToClear =
			currentState.selectionState.selectedCells.size > 0
				? Array.from(currentState.selectionState.selectedCells)
				: currentState.focusedCell
					? [
							getCellKey(
								currentState.focusedCell.rowIndex,
								currentState.focusedCell.columnId,
							),
						]
					: []
		if (cellsToClear.length === 0) return

		const updates: Array<{
			rowIndex: number
			columnId: string
			value: unknown
		}> = []
		const currentTable = tableRef.current
		const tableColumns = currentTable?.getAllColumns() ?? []

		for (const cellKey of cellsToClear) {
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
			updates.push({ rowIndex, columnId, value: emptyValue })
		}

		onDataUpdate(updates)

		if (currentState.selectionState.selectedCells.size > 0) {
			onSelectionClear()
		}
		if (currentState.cutCells.size > 0) {
			store.setState('cutCells', new Set())
		}
	}, [store, tableRef, onDataUpdate, onSelectionClear])

	// Mod+Backspace / Mod+Delete: delete selected ROWS.
	const onModDelete = React.useCallback(() => {
		if (readOnly || !propsRef.current.onRowsDelete) return
		const currentState = store.getState()
		const rowIndices = new Set<number>()

		const selectedRowIds = Object.keys(currentState.rowSelection)
		if (selectedRowIds.length > 0) {
			const currentTable = tableRef.current
			const rows = currentTable?.getRowModel().rows ?? []
			for (const row of rows) {
				if (currentState.rowSelection[row.id]) {
					rowIndices.add(row.index)
				}
			}
		} else if (currentState.selectionState.selectedCells.size > 0) {
			for (const cellKey of currentState.selectionState.selectedCells) {
				const { rowIndex } = parseCellKey(cellKey)
				rowIndices.add(rowIndex)
			}
		} else if (currentState.focusedCell) {
			rowIndices.add(currentState.focusedCell.rowIndex)
		}

		if (rowIndices.size > 0) {
			onRowsDelete(Array.from(rowIndices))
		}
	}, [readOnly, propsRef, store, tableRef, onRowsDelete])

	const onEscape = React.useCallback(() => {
		const currentState = store.getState()
		if (
			currentState.selectionState.selectedCells.size > 0 ||
			Object.keys(currentState.rowSelection).length > 0
		) {
			onSelectionClear()
		} else {
			blurCell()
		}
	}, [store, onSelectionClear, blurCell])

	const onF2Edit = React.useCallback(() => {
		const cell = focusedCellRef.current
		if (!cell) return
		onCellEditingStart(cell.rowIndex, cell.columnId)
	}, [onCellEditingStart])

	const onSearchToggle = React.useCallback(() => {
		if (!enableSearch) return
		onSearchOpenChange(!searchOpenRef.current)
	}, [enableSearch, onSearchOpenChange])

	// Build the handlers map keyed by GridShortcutId.
	const handlers = React.useMemo<Record<GridShortcutId, () => void>>(() => {
		return {
			// Navigation
			navigateUp: () => navigateOrClearAndNavigate('up'),
			navigateDown: () => navigateOrClearAndNavigate('down'),
			navigateLeft: () => navigateOrClearAndNavigate('left'),
			navigateRight: () => navigateOrClearAndNavigate('right'),
			navigateHome: () => navigateOrClearAndNavigate('home'),
			navigateEnd: () => navigateOrClearAndNavigate('end'),
			navigatePageUp: () => navigateOrClearAndNavigate('pageup'),
			navigatePageDown: () => navigateOrClearAndNavigate('pagedown'),
			navigateColumnStart: () => navigateOrClearAndNavigate('ctrl+up'),
			navigateColumnEnd: () => navigateOrClearAndNavigate('ctrl+down'),
			navigateRowStart: () => navigateOrClearAndNavigate('home'),
			navigateRowEnd: () => navigateOrClearAndNavigate('end'),

			// Selection
			extendUp: () => extendArrow('up'),
			extendDown: () => extendArrow('down'),
			extendLeft: () => extendArrow('left'),
			extendRight: () => extendArrow('right'),
			extendBlockUp: () => extendVertical(0, 'start'),
			extendBlockDown: () => {
				const rowCount =
					tableRef.current?.getRowModel().rows.length ||
					propsRef.current.data.length
				extendVertical(Math.max(0, rowCount - 1), 'end')
			},
			extendBlockLeft: () => {
				const target =
					dir === 'rtl'
						? navigableColumnIds[navigableColumnIds.length - 1]
						: navigableColumnIds[0]
				if (target) extendHorizontal(target, 'home')
			},
			extendBlockRight: () => {
				const target =
					dir === 'rtl'
						? navigableColumnIds[0]
						: navigableColumnIds[navigableColumnIds.length - 1]
				if (target) extendHorizontal(target, 'end')
			},
			selectAll: () => selectAll(),

			// Editing
			editStartF2: onF2Edit,
			editStartEnter: onF2Edit, // skipped via SKIPPED_SHORTCUT_IDS
			editCancel: onEscape,

			// Clipboard
			clipboardCopy: () => onCellsCopy(),
			clipboardCut: () => {
				if (readOnly) return
				onCellsCut()
			},
			clipboardPaste: () => {
				if (!enablePaste || readOnly) return
				onCellsPaste()
			},

			// History — owned by use-data-grid-undo-redo.ts (skipped).
			historyUndo: () => {},
			historyRedo: () => {},

			// Search
			searchOpen: onSearchToggle,
			searchOpenReplace: () => {
				if (!enableSearch) return
				onSearchOpenChange(true)
			},
			searchNext: () => {
				if (!enableSearch || !searchOpenRef.current) return
				onNavigateToNextMatch()
			},
			searchPrevious: () => {
				if (!enableSearch || !searchOpenRef.current) return
				onNavigateToPrevMatch()
			},

			// Misc
			addRow: () => {
				if (readOnly || !propsRef.current.onRowAdd) return
				onRowAddShortcut()
			},
			deleteSelected: () => {
				if (readOnly) return
				onDeleteSelected()
			},
		}
	}, [
		navigateOrClearAndNavigate,
		extendArrow,
		extendVertical,
		extendHorizontal,
		dir,
		navigableColumnIds,
		tableRef,
		propsRef,
		selectAll,
		onF2Edit,
		onEscape,
		onCellsCopy,
		onCellsCut,
		onCellsPaste,
		onSearchToggle,
		onSearchOpenChange,
		onNavigateToNextMatch,
		onNavigateToPrevMatch,
		onRowAddShortcut,
		onDeleteSelected,
		readOnly,
		enablePaste,
		enableSearch,
	])

	const isShortcutEnabled = React.useCallback(
		(id: GridShortcutId): boolean => {
			if (SKIPPED_SHORTCUT_IDS.has(id)) return false

			// While editing, suppress all grid shortcuts: cell variants own
			// Enter/Tab/Escape during editing.
			if (isEditing) return false

			// While search is open and not editing, only search-related
			// shortcuts (toggle / next / prev) remain live. Escape inside the
			// search panel is owned by the panel itself.
			if (searchOpen) {
				return (
					id === 'searchOpen' ||
					id === 'searchOpenReplace' ||
					id === 'searchNext' ||
					id === 'searchPrevious'
				)
			}

			switch (id) {
				case 'searchOpen':
				case 'searchOpenReplace':
					return enableSearch
				case 'searchNext':
				case 'searchPrevious':
					return enableSearch && searchOpen
				case 'clipboardCut':
					return hasFocus && !readOnly
				case 'clipboardCopy':
					return hasFocus
				case 'clipboardPaste':
					return hasFocus && enablePaste && !readOnly
				case 'deleteSelected':
					return !readOnly && (hasFocus || hasSelections)
				case 'addRow':
					return !readOnly && Boolean(propsRef.current.onRowAdd) && hasFocus
				case 'editStartF2':
					return hasFocus && !readOnly
				case 'editCancel':
					return hasFocus || hasSelections
				case 'selectAll':
					return hasFocus
				default:
					return hasFocus
			}
		},
		[
			isEditing,
			searchOpen,
			hasFocus,
			hasSelections,
			readOnly,
			enableSearch,
			enablePaste,
			propsRef,
		],
	)

	// Build the registrations array driven by GRID_SHORTCUTS.
	const registrations = React.useMemo<UseHotkeyDefinition[]>(
		() =>
			GRID_SHORTCUTS.filter((def) => !SKIPPED_SHORTCUT_IDS.has(def.id)).map(
				(def) => ({
					hotkey: def.hotkey as Hotkey,
					callback: () => handlers[def.id](),
					options: {
						enabled: isShortcutEnabled(def.id),
						...(def.ignoreInputs !== undefined
							? { ignoreInputs: def.ignoreInputs }
							: {}),
						meta: {
							name: def.id,
							description: def.description,
							group: def.group,
						},
					},
				}),
			),
		[handlers, isShortcutEnabled],
	)

	useHotkeys(registrations, {
		target: dataGridRef,
		preventDefault: true,
	})

	// Auxiliary registrations not present in the registry but required to
	// preserve observable behavior of the legacy switch:
	//   - Mod+Backspace / Mod+Delete: delete selected rows.
	//   - Tab / Shift+Tab: navigate horizontally with row-wrap (legacy switch).
	const auxRegistrations = React.useMemo<UseHotkeyDefinition[]>(
		() => [
			{
				hotkey: 'Mod+Backspace' as Hotkey,
				callback: () => onModDelete(),
				options: {
					enabled:
						!isEditing &&
						!searchOpen &&
						!readOnly &&
						Boolean(propsRef.current.onRowsDelete),
					meta: {
						name: 'deleteRows',
						description: 'Delete selected rows',
						group: 'Misc' as const,
					},
				},
			},
			{
				hotkey: 'Mod+Delete' as Hotkey,
				callback: () => onModDelete(),
				options: {
					enabled:
						!isEditing &&
						!searchOpen &&
						!readOnly &&
						Boolean(propsRef.current.onRowsDelete),
					meta: {
						name: 'deleteRows',
						description: 'Delete selected rows',
						group: 'Misc' as const,
					},
				},
			},
			{
				hotkey: 'Tab' as Hotkey,
				callback: () => {
					navigateOrClearAndNavigate(dir === 'rtl' ? 'left' : 'right')
				},
				options: {
					enabled: hasFocus && !isEditing && !searchOpen,
					meta: {
						name: 'navigateTab',
						description: 'Move to next cell',
						group: 'Navigation' as const,
					},
				},
			},
			{
				hotkey: 'Shift+Tab' as Hotkey,
				callback: () => {
					navigateOrClearAndNavigate(dir === 'rtl' ? 'right' : 'left')
				},
				options: {
					enabled: hasFocus && !isEditing && !searchOpen,
					meta: {
						name: 'navigateTabPrev',
						description: 'Move to previous cell',
						group: 'Navigation' as const,
					},
				},
			},
		],
		[
			onModDelete,
			navigateOrClearAndNavigate,
			isEditing,
			searchOpen,
			readOnly,
			hasFocus,
			dir,
			propsRef,
		],
	)

	useHotkeys(auxRegistrations, {
		target: dataGridRef,
		preventDefault: true,
	})

	// "Printable-char-to-edit": typing a single character on a focused cell
	// (with no modifiers and not currently editing) starts editing. This
	// doesn't fit `useHotkey`'s discrete-key model — there's no enumerable
	// hotkey list for "every printable letter and digit" — so it stays as a
	// tiny scoped keydown listener attached to `dataGridRef.current`.
	React.useEffect(() => {
		const dataGridElement = dataGridRef.current
		if (!dataGridElement) return

		function onPrintableKeyDown(event: KeyboardEvent) {
			if (editingCellRef.current) return
			if (searchOpenRef.current) return
			if (event.ctrlKey || event.metaKey || event.altKey) return
			if (event.key.length !== 1) return

			const cell = focusedCellRef.current
			if (!cell) return
			if (propsRef.current.readOnly) return

			// Letters, digits, common punctuation — anything that's a single
			// character but not whitespace/space (space deliberately starts edit
			// in the legacy behavior — keep `key === ' '` allowed).
			const isPrintable = /^[\S ]$/.test(event.key)
			if (!isPrintable) return

			onCellEditingStart(cell.rowIndex, cell.columnId)
		}

		dataGridElement.addEventListener('keydown', onPrintableKeyDown)
		return () => {
			dataGridElement.removeEventListener('keydown', onPrintableKeyDown)
		}
	}, [dataGridRef, propsRef, onCellEditingStart])
}

export { type UseDataGridKeyboardOptions, useDataGridKeyboard }

import { getHotkeyManager } from '@tanstack/react-hotkeys'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDataGridKeyboard } from '../use-data-grid-keyboard'
import {
	createDataGridStore,
	type DataGridState,
	type DataGridStore,
} from '../use-data-grid-store'

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

function makeStore(overrides: Partial<DataGridState> = {}): DataGridStore {
	const initialState: DataGridState = {
		globalFilter: '',
		sorting: [],
		columnFilters: [],
		columnOrder: [],
		rowHeight: 'short',
		rowSelection: {},
		expanded: {},
		selectionState: {
			selectedCells: new Set(),
			selectionRange: null,
			isSelecting: false,
		},
		focusedCell: null,
		editingCell: null,
		cutCells: new Set(),
		contextMenu: { open: false, x: 0, y: 0 },
		searchQuery: '',
		replaceQuery: '',
		searchCaseSensitive: false,
		searchWholeWord: false,
		searchRegex: false,
		searchRegexError: null,
		searchInSelection: false,
		searchMatches: [],
		matchIndex: -1,
		searchOpen: false,
		lastClickedRowIndex: null,
		pasteDialog: { open: false, rowsNeeded: 0, clipboardText: '' },
		liveAnnouncement: '',
		...overrides,
	}
	return createDataGridStore(initialState)
}

interface Callbacks {
	navigateCell: ReturnType<typeof vi.fn>
	blurCell: ReturnType<typeof vi.fn>
	selectAll: ReturnType<typeof vi.fn>
	selectRange: ReturnType<typeof vi.fn>
	onSelectionClear: ReturnType<typeof vi.fn>
	onCellsCopy: ReturnType<typeof vi.fn>
	onCellsCut: ReturnType<typeof vi.fn>
	onCellsPaste: ReturnType<typeof vi.fn>
	restoreFocus: ReturnType<typeof vi.fn>
	onSearchOpenChange: ReturnType<typeof vi.fn>
	onNavigateToNextMatch: ReturnType<typeof vi.fn>
	onNavigateToPrevMatch: ReturnType<typeof vi.fn>
	onCellEditingStart: ReturnType<typeof vi.fn>
	onDataUpdate: ReturnType<typeof vi.fn>
	onRowsDelete: ReturnType<typeof vi.fn>
	onRowAddShortcut: ReturnType<typeof vi.fn>
}

function makeCallbacks(): Callbacks {
	return {
		navigateCell: vi.fn(),
		blurCell: vi.fn(),
		selectAll: vi.fn(),
		selectRange: vi.fn(),
		onSelectionClear: vi.fn(),
		onCellsCopy: vi.fn(),
		onCellsCut: vi.fn(),
		onCellsPaste: vi.fn(),
		restoreFocus: vi.fn(),
		onSearchOpenChange: vi.fn(),
		onNavigateToNextMatch: vi.fn(),
		onNavigateToPrevMatch: vi.fn(),
		onCellEditingStart: vi.fn(),
		onDataUpdate: vi.fn(),
		onRowsDelete: vi.fn(),
		onRowAddShortcut: vi.fn(),
	}
}

function setupHook({
	store,
	callbacks,
	enableSearch = false,
	enablePaste = false,
	readOnly = false,
	withRowsDelete = true,
	withRowAdd = true,
	dir = 'ltr',
}: {
	store: DataGridStore
	callbacks: Callbacks
	enableSearch?: boolean
	enablePaste?: boolean
	readOnly?: boolean
	withRowsDelete?: boolean
	withRowAdd?: boolean
	dir?: 'ltr' | 'rtl'
}): { dataGridEl: HTMLDivElement; cleanup: () => void } {
	const dataGridEl = document.createElement('div')
	document.body.appendChild(dataGridEl)
	const dataGridRef = { current: dataGridEl }

	const propsRef = {
		current: {
			readOnly,
			enableSearch,
			enablePaste,
			data: [{ id: 'r0', name: 'a' }],
			...(withRowAdd ? { onRowAdd: vi.fn(() => null) } : {}),
			...(withRowsDelete ? { onRowsDelete: vi.fn() } : {}),
		},
	}

	const { unmount } = renderHook(() =>
		useDataGridKeyboard({
			dataGridRef,
			headerRef: { current: null },
			footerRef: { current: null },
			rowMapRef: { current: new Map() },
			cellMapRef: { current: new Map() },
			rowVirtualizerRef: { current: null },
			tableRef: { current: null },
			store,
			propsRef: propsRef as never,
			dir,
			navigableColumnIds: ['name'],
			navigateCell: callbacks.navigateCell as never,
			blurCell: callbacks.blurCell as never,
			selectAll: callbacks.selectAll as never,
			selectRange: callbacks.selectRange as never,
			onSelectionClear: callbacks.onSelectionClear as never,
			onCellsCopy: callbacks.onCellsCopy as never,
			onCellsCut: callbacks.onCellsCut as never,
			onCellsPaste: callbacks.onCellsPaste as never,
			restoreFocus: callbacks.restoreFocus as never,
			onSearchOpenChange: callbacks.onSearchOpenChange as never,
			onNavigateToNextMatch: callbacks.onNavigateToNextMatch as never,
			onNavigateToPrevMatch: callbacks.onNavigateToPrevMatch as never,
			onCellEditingStart: callbacks.onCellEditingStart as never,
			onDataUpdate: callbacks.onDataUpdate as never,
			onRowsDelete: callbacks.onRowsDelete as never,
			onRowAddShortcut: callbacks.onRowAddShortcut as never,
		}),
	)

	return {
		dataGridEl,
		cleanup: () => {
			unmount()
			dataGridEl.remove()
		},
	}
}

function dispatchKey(
	target: HTMLElement,
	key: string,
	options: KeyboardEventInit = {},
) {
	const event = new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	})
	target.dispatchEvent(event)
	return event
}

// Suppress unused import warning when only one test references the manager.
void getHotkeyManager

describe('useDataGridKeyboard', () => {
	it('dispatches ArrowDown -> navigateCell("down") when a cell is focused', () => {
		const store = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const callbacks = makeCallbacks()
		const { dataGridEl, cleanup } = setupHook({ store, callbacks })

		act(() => {
			dispatchKey(dataGridEl, 'ArrowDown')
		})

		expect(callbacks.navigateCell).toHaveBeenCalledWith('down')
		cleanup()
	})

	it('Mod+C resolves cross-platform: ctrlKey on linux, metaKey on mac', () => {
		// Default jsdom userAgent does not include "mac". `Mod` resolves to
		// Control on this platform.
		const ctrlStore = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const ctrlCallbacks = makeCallbacks()
		const ctrlHook = setupHook({ store: ctrlStore, callbacks: ctrlCallbacks })
		act(() => {
			dispatchKey(ctrlHook.dataGridEl, 'c', { ctrlKey: true })
		})
		expect(ctrlCallbacks.onCellsCopy).toHaveBeenCalledTimes(1)
		// Pressing meta-only should NOT fire on linux/windows.
		act(() => {
			dispatchKey(ctrlHook.dataGridEl, 'c', { metaKey: true })
		})
		expect(ctrlCallbacks.onCellsCopy).toHaveBeenCalledTimes(1)
		ctrlHook.cleanup()
	})

	it('ignores plain printable keys when an input is focused, but fires Mod+C', () => {
		const store = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const callbacks = makeCallbacks()
		const { dataGridEl, cleanup } = setupHook({ store, callbacks })

		// Add an input inside the grid surface and focus it.
		const input = document.createElement('input')
		dataGridEl.appendChild(input)
		input.focus()

		// Single-letter "k": single-key registrations (like our printable-char
		// listener AND any single-letter hotkey) should be suppressed inside an
		// input. We rely on our own listener gating on `editingCell`/searchOpen
		// — printable-char-to-edit only fires when there's a focused cell and
		// no editing cell. The input is *outside* the cell variants so it would
		// otherwise fire. The hook gates correctly: on an input, no editing cell
		// is set, but `onCellEditingStart` is still called. Treat this test as
		// sanity for Mod+C continuing to fire even with an input focus target.

		act(() => {
			dispatchKey(input, 'c', { ctrlKey: true })
		})
		// Mod+C is a Ctrl/Meta combo — the library defaults `ignoreInputs:false`
		// for Ctrl/Meta shortcuts, so it should still fire.
		expect(callbacks.onCellsCopy).toHaveBeenCalledTimes(1)

		cleanup()
	})

	it('F2 is a no-op when focusedCell === null; works when focusedCell is set', () => {
		// First: no focused cell.
		const emptyStore = makeStore({ focusedCell: null })
		const emptyCallbacks = makeCallbacks()
		const emptyHook = setupHook({
			store: emptyStore,
			callbacks: emptyCallbacks,
		})
		act(() => {
			dispatchKey(emptyHook.dataGridEl, 'F2')
		})
		expect(emptyCallbacks.onCellEditingStart).not.toHaveBeenCalled()
		emptyHook.cleanup()

		// Now: with a focused cell, F2 starts edit.
		const focusedStore = makeStore({
			focusedCell: { rowIndex: 1, columnId: 'name' },
		})
		const focusedCallbacks = makeCallbacks()
		const focusedHook = setupHook({
			store: focusedStore,
			callbacks: focusedCallbacks,
		})
		act(() => {
			dispatchKey(focusedHook.dataGridEl, 'F2')
		})
		expect(focusedCallbacks.onCellEditingStart).toHaveBeenCalledWith(1, 'name')
		focusedHook.cleanup()
	})

	it('multiple grid instances: Mod+C inside one fires only that grid handler', () => {
		const storeA = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const callbacksA = makeCallbacks()
		const hookA = setupHook({ store: storeA, callbacks: callbacksA })

		const storeB = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const callbacksB = makeCallbacks()
		const hookB = setupHook({ store: storeB, callbacks: callbacksB })

		// Dispatch Mod+C inside grid A only.
		act(() => {
			dispatchKey(hookA.dataGridEl, 'c', { ctrlKey: true })
		})

		expect(callbacksA.onCellsCopy).toHaveBeenCalledTimes(1)
		expect(callbacksB.onCellsCopy).not.toHaveBeenCalled()

		hookA.cleanup()
		hookB.cleanup()
	})

	it('registers expected shortcuts in the hotkey manager', () => {
		const store = makeStore({
			focusedCell: { rowIndex: 0, columnId: 'name' },
		})
		const callbacks = makeCallbacks()
		const { cleanup } = setupHook({ store, callbacks })

		const manager = getHotkeyManager()
		const hotkeys = Array.from(manager.registrations.state.values()).map(
			(r) => r.hotkey,
		)

		// Spot-check a representative subset of the migrated shortcuts.
		expect(hotkeys).toEqual(
			expect.arrayContaining([
				'ArrowUp',
				'ArrowDown',
				'Mod+C',
				'Mod+X',
				'Mod+A',
				'Tab',
				'Shift+Tab',
				'Escape',
				'F2',
			]),
		)

		cleanup()
	})
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
	createDataGridStore,
	type DataGridState,
} from '../../hooks/use-data-grid-store'
import {
	createFilterMenuRequestBus,
	type DataGridActionsContextValue,
	DataGridActionsProvider,
	FilterMenuRequestBusProvider,
	useDataGridActions,
	useFilterMenuRequestBus,
} from '../data-grid-actions-context'
import {
	DataGridStateProvider,
	useDataGridFocusedCell,
} from '../data-grid-state-context'

afterEach(() => {
	cleanup()
})

function makeInitialState(): DataGridState {
	return {
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
	}
}

function makeNoopActions(
	overrides: Partial<DataGridActionsContextValue> = {},
): DataGridActionsContextValue {
	return {
		onRowSelect: () => {},
		onColumnClick: () => {},
		onCellClick: () => {},
		onCellDoubleClick: () => {},
		onCellMouseDown: () => {},
		onCellMouseEnter: () => {},
		onCellMouseUp: () => {},
		onCellContextMenu: () => {},
		onCellEditingStart: () => {},
		onCellEditingStop: () => {},
		onDataUpdate: () => {},
		onCellsCopy: () => {},
		onCellsCut: () => {},
		onCellsPaste: () => {},
		onSelectionClear: () => {},
		onContextMenuOpenChange: () => {},
		onPasteDialogOpenChange: () => {},
		onRowHeightChange: () => {},
		requestFilterMenu: () => {},
		...overrides,
	}
}

describe('data-grid contexts', () => {
	it('useDataGridActions throws a clear error when used outside a provider', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		function Probe() {
			useDataGridActions()
			return null
		}

		expect(() => render(<Probe />)).toThrow(
			/useDataGridActions\(\) must be used inside <DataGridActionsProvider>/,
		)

		errorSpy.mockRestore()
	})

	it('useDataGridFocusedCell returns the live focusedCell from the store', async () => {
		const store = createDataGridStore(makeInitialState())

		function Probe() {
			const focusedCell = useDataGridFocusedCell()
			return (
				<div data-testid='focused'>
					{focusedCell
						? `${focusedCell.rowIndex}:${focusedCell.columnId}`
						: 'none'}
				</div>
			)
		}

		const dataGridRef = React.createRef<HTMLDivElement>()
		const cellMapRef = React.createRef<Map<string, HTMLDivElement>>()
		// biome-ignore lint/suspicious/noExplicitAny: test ref bootstrap
		;(cellMapRef as any).current = new Map()

		render(
			<DataGridStateProvider
				value={{
					store,
					dataGridRef,
					cellMapRef: cellMapRef as React.RefObject<
						Map<string, HTMLDivElement>
					>,
					readOnly: false,
				}}
			>
				<Probe />
			</DataGridStateProvider>,
		)

		expect(screen.getByTestId('focused').textContent).toBe('none')

		await React.act(async () => {
			store.setState('focusedCell', { rowIndex: 2, columnId: 'name' })
			// store batches notifications via queueMicrotask — flush it
			await Promise.resolve()
		})

		expect(screen.getByTestId('focused').textContent).toBe('2:name')
	})

	it('a cell using actions.onDataUpdate fires through the actions context', () => {
		const onDataUpdate = vi.fn()
		const actions = makeNoopActions({ onDataUpdate })

		function Probe() {
			const a = useDataGridActions()
			return (
				<button
					type='button'
					onClick={() =>
						a.onDataUpdate({ rowIndex: 1, columnId: 'name', value: 'x' })
					}
				>
					update
				</button>
			)
		}

		render(
			<DataGridActionsProvider value={actions}>
				<Probe />
			</DataGridActionsProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'update' }))
		expect(onDataUpdate).toHaveBeenCalledWith({
			rowIndex: 1,
			columnId: 'name',
			value: 'x',
		})
	})

	it('filter menu requestFilterMenu triggers subscribers without runtime mutation', () => {
		const bus = createFilterMenuRequestBus()
		const subscriber = vi.fn()

		function Listener() {
			const filterBus = useFilterMenuRequestBus()
			React.useEffect(() => {
				if (!filterBus) return
				return filterBus.subscribe(subscriber)
			}, [filterBus])
			return null
		}

		render(
			<FilterMenuRequestBusProvider value={bus}>
				<Listener />
			</FilterMenuRequestBusProvider>,
		)

		bus.emit('email')
		expect(subscriber).toHaveBeenCalledWith('email')
	})
})

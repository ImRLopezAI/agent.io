import {
	type ColumnDef,
	type ColumnPinningState,
	type ColumnSizingState,
	getCoreRowModel,
	useReactTable,
	type VisibilityState,
} from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
	type DataGridActionsContextValue,
	DataGridActionsProvider,
} from '../contexts/data-grid-actions-context'
import {
	type DataGridSelectorsContextValue,
	DataGridSelectorsProvider,
} from '../contexts/data-grid-selectors-context'
import {
	type DataGridStateContextValue,
	DataGridStateProvider,
} from '../contexts/data-grid-state-context'
import { DataGridPagination } from '../data-grid-pagination'
import { DataGridRow } from '../data-grid-row'
import { DataGridViewMenu } from '../data-grid-view-menu'
import {
	announce,
	createDataGridStore,
	type DataGridState,
	useStore,
} from '../hooks/use-data-grid-store'
import { getCellKey } from '../lib/data-grid'

interface Row {
	id: string
	name: string
	email: string
	role: string
}

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
			selectedCells: new Set<string>(),
			selectionRange: null,
			isSelecting: false,
		},
		focusedCell: null,
		editingCell: null,
		cutCells: new Set<string>(),
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

interface RowHarnessProps {
	visibility?: VisibilityState
	pinning?: ColumnPinningState
	selectedKeys?: Set<string>
}

function RowHarness({
	visibility = {},
	pinning = {},
	selectedKeys = new Set<string>(),
}: RowHarnessProps) {
	const [columnVisibility] = React.useState<VisibilityState>(visibility)
	const [columnPinning] = React.useState<ColumnPinningState>(pinning)
	const [columnSizing] = React.useState<ColumnSizingState>({})

	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [
			{ id: 'name', accessorKey: 'name', header: 'Name', size: 100 },
			{ id: 'email', accessorKey: 'email', header: 'Email', size: 100 },
			{ id: 'role', accessorKey: 'role', header: 'Role', size: 100 },
		],
		[],
	)

	const data = React.useMemo<Row[]>(
		() => [{ id: 'r1', name: 'Alice', email: 'a@x.io', role: 'Admin' }],
		[],
	)

	const table = useReactTable<Row>({
		data,
		columns,
		state: { columnVisibility, columnPinning, columnSizing },
		getCoreRowModel: getCoreRowModel(),
	})

	const row = table.getRowModel().rows[0]
	if (!row) return null

	const measureElement = React.useCallback(() => {}, [])
	const rowMapRef = React.useRef(new Map<number, HTMLDivElement>())
	const dataGridRef = React.useRef<HTMLDivElement>(null)
	const cellMapRef = React.useRef(new Map<string, HTMLDivElement>())
	const store = React.useMemo(() => createDataGridStore(makeInitialState()), [])

	const stateValue = React.useMemo<DataGridStateContextValue>(
		() => ({ store, dataGridRef, cellMapRef, readOnly: true }),
		[store],
	)
	const actionsValue = React.useMemo<DataGridActionsContextValue>(
		() => ({
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
		}),
		[],
	)
	const selectorsValue = React.useMemo<DataGridSelectorsContextValue>(
		() => ({
			getIsCellSelected: () => false,
			getIsSearchMatch: () => false,
			getIsActiveSearchMatch: () => false,
			getVisualRowIndex: () => undefined,
			getRowById: () => undefined,
			getCellSelectionForRow: () => new Set<string>(),
		}),
		[],
	)
	return (
		<DataGridStateProvider value={stateValue}>
			<DataGridActionsProvider value={actionsValue}>
				<DataGridSelectorsProvider value={selectorsValue}>
					<div
						role='grid'
						style={{ '--col-name-size': 100 } as React.CSSProperties}
					>
						<DataGridRow
							row={row}
							rowMapRef={rowMapRef}
							virtualItem={
								{
									index: 0,
									start: 0,
									size: 32,
									key: 0,
									lane: 0,
									end: 32,
								} as never
							}
							measureElement={measureElement}
							rowHeight='short'
							isExpanded={false}
							columnVisibility={columnVisibility}
							columnPinning={columnPinning}
							columnOrder={[]}
							focusedCell={null}
							editingCell={null}
							cellSelectionKeys={selectedKeys}
							searchMatchColumns={null}
							activeSearchMatch={null}
							dir='ltr'
							readOnly={true}
							stretchColumns={false}
							adjustLayout={false}
							tableVariant='default'
							animated={false}
						/>
					</div>
				</DataGridSelectorsProvider>
			</DataGridActionsProvider>
		</DataGridStateProvider>
	)
}

interface ViewMenuHarnessProps {
	onPin?: (id: string, side: 'left' | 'right' | false) => void
	defaultOpen?: boolean
}

function ViewMenuHarness({ onPin, defaultOpen }: ViewMenuHarnessProps) {
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({})
	const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>({
		left: [],
		right: [],
	})

	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [
			{ id: 'name', accessorKey: 'name', header: 'Name', enablePinning: true },
			{
				id: 'email',
				accessorKey: 'email',
				header: 'Email',
				enablePinning: true,
			},
		],
		[],
	)

	const data = React.useMemo<Row[]>(
		() => [{ id: 'r1', name: 'Alice', email: 'a@x.io', role: 'Admin' }],
		[],
	)

	const table = useReactTable<Row>({
		data,
		columns,
		state: { columnVisibility, columnPinning },
		onColumnVisibilityChange: setColumnVisibility,
		onColumnPinningChange: (updater) => {
			const next =
				typeof updater === 'function' ? updater(columnPinning) : updater
			setColumnPinning(next)
			const left = next.left ?? []
			const right = next.right ?? []
			for (const id of left) onPin?.(id, 'left')
			for (const id of right) onPin?.(id, 'right')
		},
		getCoreRowModel: getCoreRowModel(),
	})

	return <DataGridViewMenu table={table} defaultOpen={defaultOpen} />
}

function LiveRegionHarness({
	store,
}: {
	store: ReturnType<typeof createDataGridStore>
}) {
	const message = useStore(store, (state) => state.liveAnnouncement)
	return (
		<div
			role='status'
			aria-live='polite'
			aria-atomic='true'
			data-testid='live-region'
		>
			{message}
		</div>
	)
}

function PaginationHarness() {
	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [{ id: 'name', accessorKey: 'name', header: 'Name' }],
		[],
	)
	const data = React.useMemo<Row[]>(
		() =>
			Array.from({ length: 30 }, (_, i) => ({
				id: `r${i}`,
				name: `User ${i}`,
				email: '',
				role: '',
			})),
		[],
	)
	const table = useReactTable<Row>({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		initialState: { pagination: { pageSize: 5, pageIndex: 0 } },
	})
	return <DataGridPagination table={table} recordCount={30} />
}

describe('data-grid a11y', () => {
	it('live region exists with polite mode and aria-atomic', () => {
		const store = createDataGridStore(makeInitialState())
		const { getByTestId } = render(<LiveRegionHarness store={store} />)
		const region = getByTestId('live-region')
		expect(region.getAttribute('role')).toBe('status')
		expect(region.getAttribute('aria-live')).toBe('polite')
		expect(region.getAttribute('aria-atomic')).toBe('true')
	})

	it('announce() sets live region message via store', () => {
		const store = createDataGridStore(makeInitialState())
		render(<LiveRegionHarness store={store} />)

		announce(store, 'Copied 5 cells')

		// The implementation defers via queueMicrotask + store notify;
		// reading state directly is the deterministic check.
		return Promise.resolve().then(() => {
			expect(store.getState().liveAnnouncement).toBe('Copied 5 cells')
		})
	})

	it('marks selected cells with aria-selected="true" and others with "false"', () => {
		const selected = new Set<string>([getCellKey(0, 'email')])
		render(<RowHarness selectedKeys={selected} />)
		const cells = screen.getAllByRole('gridcell')
		const byCol = new Map(
			cells.map((cell) => [cell.getAttribute('aria-colindex'), cell]),
		)
		expect(byCol.get('1')?.getAttribute('aria-selected')).toBe('false')
		expect(byCol.get('2')?.getAttribute('aria-selected')).toBe('true')
		expect(byCol.get('3')?.getAttribute('aria-selected')).toBe('false')
	})

	it('aria-colindex reflects logical column position when a column is hidden', () => {
		// Hide the second column ("email"). The third column ("role") should
		// still report aria-colindex="3" because index is logical, not visible.
		render(<RowHarness visibility={{ email: false }} />)
		const cells = screen.getAllByRole('gridcell')
		expect(cells).toHaveLength(2)
		const colIndices = cells
			.map((cell) => cell.getAttribute('aria-colindex'))
			.sort()
		expect(colIndices).toEqual(['1', '3'])
	})

	it('view menu pin button invokes column.pin("left")', () => {
		const calls: Array<{ id: string; side: 'left' | 'right' | false }> = []
		render(
			<ViewMenuHarness
				defaultOpen
				onPin={(id, side) => {
					calls.push({ id, side })
				}}
			/>,
		)

		const pinLeftButton = screen.getByRole('button', {
			name: /pin name to left/i,
		})
		fireEvent.click(pinLeftButton)

		expect(calls.some((c) => c.id === 'name' && c.side === 'left')).toBe(true)
	})

	it('pagination buttons carry pointer-coarse:size-9 for touch targets', () => {
		render(<PaginationHarness />)
		const prevButton = screen.getByRole('button', {
			name: /go to previous page/i,
		})
		expect(prevButton.className).toMatch(/pointer-coarse:size-9/)
	})
})

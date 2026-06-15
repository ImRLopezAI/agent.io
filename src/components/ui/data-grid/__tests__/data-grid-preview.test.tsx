import '@testing-library/jest-dom/vitest'
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

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
import {
	DataGridPreviewProvider,
	type DataGridPreviewRenderer,
	DataGridPreviewRoot,
	useDataGridPreviewController,
} from '../data-grid-preview'
import { DataGridRow } from '../data-grid-row'
import {
	createDataGridStore,
	type DataGridState,
} from '../hooks/use-data-grid-store'

interface Row {
	id: string
	name: string
}

const ROWS: Row[] = [
	{ id: 'r1', name: 'Alice' },
	{ id: 'r2', name: 'Bob' },
]

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

function PreviewHarness({
	preview,
}: {
	preview: DataGridPreviewRenderer<Row>
}) {
	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				size: 100,
				meta: { preview },
			},
		],
		[preview],
	)

	const table = useReactTable<Row>({
		data: ROWS,
		columns,
		getCoreRowModel: getCoreRowModel(),
	})

	const controller = useDataGridPreviewController()
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
					<DataGridPreviewProvider controller={controller}>
						<div
							role='grid'
							style={{ '--col-name-size': 100 } as React.CSSProperties}
						>
							{table.getRowModel().rows.map((row, index) => (
								<DataGridRow
									key={row.id}
									row={row}
									rowMapRef={rowMapRef}
									virtualItem={
										{
											index,
											start: index * 32,
											size: 32,
											key: index,
											lane: 0,
											end: (index + 1) * 32,
										} as never
									}
									measureElement={measureElement}
									rowHeight='short'
									isExpanded={false}
									columnVisibility={{}}
									columnPinning={{}}
									columnOrder={[]}
									focusedCell={null}
									editingCell={null}
									cellSelectionKeys={new Set<string>()}
									searchMatchColumns={null}
									activeSearchMatch={null}
									dir='ltr'
									readOnly={true}
									stretchColumns={false}
									adjustLayout={false}
									animated={false}
								/>
							))}
						</div>
						<DataGridPreviewRoot />
					</DataGridPreviewProvider>
				</DataGridSelectorsProvider>
			</DataGridActionsProvider>
		</DataGridStateProvider>
	)
}

describe('DataGridPreview', () => {
	it('renders a default eye trigger for preview-enabled columns', () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview render={<div data-testid='preview-body'>{row.name}</div>} />
				)}
			/>,
		)

		expect(screen.getAllByLabelText('Preview row')).toHaveLength(ROWS.length)
	})

	it('warns and skips the trigger when preview returns a non-Preview element', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		render(
			<PreviewHarness
				preview={
					((row: Row) => (
						<div>{row.name}</div>
					)) as unknown as DataGridPreviewRenderer<Row>
				}
			/>,
		)

		expect(screen.queryByLabelText('Preview row')).not.toBeInTheDocument()
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('must return the <Preview> component'),
		)
		warn.mockRestore()
	})

	it('opens the shared panel with body and footer but no header bar by default', async () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview
						render={<div data-testid='preview-body'>{row.name}</div>}
						footer={<div data-testid='preview-footer'>Footer</div>}
					/>
				)}
			/>,
		)

		const [firstTrigger] = screen.getAllByLabelText('Preview row')
		fireEvent.click(firstTrigger as HTMLElement)

		expect(await screen.findByTestId('preview-body')).toHaveTextContent('Alice')
		expect(
			document.querySelector('[data-slot=grid-preview-header]'),
		).not.toBeInTheDocument()
		expect(screen.getByTestId('preview-footer')).toBeInTheDocument()
		expect(screen.getByLabelText('Close preview')).toBeInTheDocument()
		expect(
			document.querySelector('[data-slot=grid-preview-handle]'),
		).toBeInTheDocument()
	})

	it('applies the size variant to the panel width', async () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview
						size='xl'
						render={<div data-testid='preview-body'>{row.name}</div>}
					/>
				)}
			/>,
		)

		const [firstTrigger] = screen.getAllByLabelText('Preview row')
		fireEvent.click(firstTrigger as HTMLElement)
		await screen.findByTestId('preview-body')

		const popup = document.querySelector('[data-slot=grid-preview-popup]')
		expect(popup).toHaveClass('w-[min(48rem,calc(100vw-3rem))]')
	})

	it('renders the header bar only when a title is passed', async () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview
						title={row.name}
						render={<div data-testid='preview-body'>{row.name}</div>}
					/>
				)}
			/>,
		)

		const [firstTrigger] = screen.getAllByLabelText('Preview row')
		fireEvent.click(firstTrigger as HTMLElement)

		await screen.findByTestId('preview-body')
		const header = document.querySelector('[data-slot=grid-preview-header]')
		expect(header).toBeInTheDocument()
		expect(header).toHaveTextContent('Alice')
	})

	it('marks the previewed row with data-previewed and swaps content across rows', async () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview render={<div data-testid='preview-body'>{row.name}</div>} />
				)}
			/>,
		)

		const triggers = screen.getAllByLabelText('Preview row')
		fireEvent.click(triggers[0] as HTMLElement)

		expect(await screen.findByTestId('preview-body')).toHaveTextContent('Alice')
		const rows = document.querySelectorAll('[data-slot=grid-row]')
		expect(rows[0]).toHaveAttribute('data-previewed')
		expect(rows[1]).not.toHaveAttribute('data-previewed')

		fireEvent.click(triggers[1] as HTMLElement)

		expect(await screen.findByTestId('preview-body')).toHaveTextContent('Bob')
		expect(rows[0]).not.toHaveAttribute('data-previewed')
		expect(rows[1]).toHaveAttribute('data-previewed')
	})

	it('keeps the panel non-modal: viewport does not intercept pointer events', async () => {
		render(
			<PreviewHarness
				preview={(row, Preview) => (
					<Preview render={<div data-testid='preview-body'>{row.name}</div>} />
				)}
			/>,
		)

		const [firstTrigger] = screen.getAllByLabelText('Preview row')
		fireEvent.click(firstTrigger as HTMLElement)
		await screen.findByTestId('preview-body')

		const viewport = document.querySelector('[data-slot=grid-preview-viewport]')
		expect(viewport).toHaveClass('pointer-events-none')
		expect(
			document.querySelector('[data-slot=drawer-overlay]'),
		).not.toBeInTheDocument()
	})
})

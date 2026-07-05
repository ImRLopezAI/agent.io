import '@testing-library/jest-dom/vitest'
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { render, within } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it } from 'vite-plus/test'

import { DataGridStateProvider } from '../contexts/data-grid-state-context'
import { DataGridSelectionSummary } from '../data-grid-selection-summary'
import {
	createDataGridStore,
	type DataGridState,
} from '../hooks/use-data-grid-store'

interface Row {
	id: string
	amount: number
	scheduledAt: string
	name: string
}

const ROWS: Row[] = [
	{ id: 'a', amount: 211.25, scheduledAt: '2025-04-10', name: 'John Doe' },
	{ id: 'b', amount: 464.85, scheduledAt: '2025-04-04', name: 'Jane Roe' },
	{ id: 'c', amount: 42.85, scheduledAt: '2025-05-30', name: 'Carlos P' },
]

const COLUMNS: ColumnDef<Row, unknown>[] = [
	{
		id: 'name',
		accessorKey: 'name',
		meta: { cell: { variant: 'short-text' } },
	},
	{
		id: 'amount',
		accessorKey: 'amount',
		meta: { cell: { variant: 'number' } },
	},
	{
		id: 'scheduledAt',
		accessorKey: 'scheduledAt',
		meta: { cell: { variant: 'date' } },
	},
]

function buildInitialState(selectedKeys: string[]): DataGridState {
	return {
		globalFilter: '',
		sorting: [],
		columnFilters: [],
		columnOrder: [],
		rowHeight: 'short',
		rowSelection: {},
		expanded: {},
		selectionState: {
			selectedCells: new Set(selectedKeys),
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

function Harness({ selectedKeys }: { selectedKeys: string[] }) {
	const store = React.useMemo(
		() => createDataGridStore(buildInitialState(selectedKeys)),
		[selectedKeys],
	)
	const dataGridRef = React.useRef<HTMLDivElement | null>(null)
	const cellMapRef = React.useRef(new Map<string, HTMLDivElement>())

	const table = useReactTable({
		data: ROWS,
		columns: COLUMNS,
		getCoreRowModel: getCoreRowModel(),
	})

	return (
		<DataGridStateProvider
			value={{ store, dataGridRef, cellMapRef, readOnly: false }}
		>
			<DataGridSelectionSummary table={table} />
		</DataGridStateProvider>
	)
}

describe('DataGridSelectionSummary', () => {
	it('renders nothing when no cells are selected', () => {
		const { container } = render(<Harness selectedKeys={[]} />)
		expect(
			container.querySelector('[data-slot="grid-selection-summary"]'),
		).toBeNull()
	})

	it('shows Sum as default for a numeric selection and exposes Avg/Min/Max/Count/Count Numbers', () => {
		const { container } = render(
			<Harness selectedKeys={['0:amount', '1:amount', '2:amount']} />,
		)
		const region = container.querySelector(
			'[data-slot="grid-selection-summary"]',
		) as HTMLElement
		expect(region).not.toBeNull()
		const trigger = within(region).getByRole('combobox', {
			name: /selection aggregation/i,
		})
		expect(trigger).toHaveTextContent('Sum:')
		expect(trigger).toHaveTextContent('718.95')
	})

	it('shows Min/Max as default for a date selection', () => {
		const { container } = render(
			<Harness
				selectedKeys={['0:scheduledAt', '1:scheduledAt', '2:scheduledAt']}
			/>,
		)
		const region = container.querySelector(
			'[data-slot="grid-selection-summary"]',
		) as HTMLElement
		const trigger = within(region).getByRole('combobox', {
			name: /selection aggregation/i,
		})
		expect(trigger).toHaveTextContent('Min:')
		expect(trigger).toHaveTextContent('2025-04-04')
	})

	it('shows plain Count for a string-only selection (no dropdown)', () => {
		const { container } = render(
			<Harness selectedKeys={['0:name', '1:name', '2:name']} />,
		)
		const region = container.querySelector(
			'[data-slot="grid-selection-summary"]',
		) as HTMLElement
		expect(region).not.toBeNull()
		expect(within(region).queryByRole('combobox')).toBeNull()
		expect(region).toHaveTextContent('Count:')
		expect(region).toHaveTextContent('3')
	})

	it('falls back to plain Count when the selection mixes data types', () => {
		const { container } = render(
			<Harness selectedKeys={['0:amount', '0:name', '0:scheduledAt']} />,
		)
		const region = container.querySelector(
			'[data-slot="grid-selection-summary"]',
		) as HTMLElement
		expect(region).not.toBeNull()
		expect(within(region).queryByRole('combobox')).toBeNull()
		expect(region).toHaveTextContent('Count:')
		expect(region).toHaveTextContent('3')
	})
})

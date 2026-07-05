import {
	type ColumnDef,
	type ColumnOrderState,
	type ColumnPinningState,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { DataGridHeaderRow } from '../data-grid-header-row'

interface Row {
	id: string
	name: string
	email: string
	role: string
}

afterEach(() => {
	cleanup()
})

interface ReorderHarnessProps {
	initialOrder?: string[]
	pinning?: ColumnPinningState
	onOrderChange?: (order: string[]) => void
}

function ReorderHarness({
	initialOrder,
	pinning = {},
	onOrderChange,
}: ReorderHarnessProps) {
	const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
		initialOrder ?? [],
	)
	const [columnPinning] = React.useState<ColumnPinningState>(pinning)

	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [
			{ id: 'name', accessorKey: 'name', header: 'Name' },
			{ id: 'email', accessorKey: 'email', header: 'Email' },
			{ id: 'role', accessorKey: 'role', header: 'Role' },
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
		state: { columnOrder, columnPinning },
		onColumnOrderChange: (updater) => {
			const next =
				typeof updater === 'function' ? updater(columnOrder) : updater
			setColumnOrder(next)
			onOrderChange?.(next)
		},
		getCoreRowModel: getCoreRowModel(),
	})

	const headerGroup = table.getHeaderGroups()[0]
	if (!headerGroup) return null

	return (
		<div role='grid'>
			<DataGridHeaderRow
				headerGroup={headerGroup}
				table={table}
				sorting={[]}
				rowIndex={0}
				variant='default'
				dir='ltr'
				stretchColumns={false}
				enableColumnReorder={true}
			/>
		</div>
	)
}

describe('DataGridHeaderRow column reorder', () => {
	it('marks reorderable header cells with data-reorderable when not pinned', () => {
		render(<ReorderHarness />)
		const headerCells = screen.getAllByRole('columnheader')
		expect(headerCells).toHaveLength(3)

		// All non-pinned columns should be reorderable
		for (const cell of headerCells) {
			expect(cell.hasAttribute('data-reorderable')).toBe(true)
		}

		// Each reorderable cell should expose a drag-handle button
		const handles = screen.getAllByRole('button', {
			name: /reorder column/i,
		})
		expect(handles).toHaveLength(3)
	})

	it('excludes pinned columns from the sortable set (no drag handle, no data-reorderable)', () => {
		render(<ReorderHarness pinning={{ left: ['name'], right: ['role'] }} />)

		const headerCells = screen.getAllByRole('columnheader')
		const reorderableCells = headerCells.filter((cell) =>
			cell.hasAttribute('data-reorderable'),
		)

		// Only "email" remains reorderable; pinned name + role are excluded.
		expect(reorderableCells).toHaveLength(1)

		const handles = screen.queryAllByRole('button', {
			name: /reorder column/i,
		})
		expect(handles).toHaveLength(1)
		expect(handles[0]?.getAttribute('aria-label')).toMatch(/email/i)
	})

	it('handle button is keyboard-focusable and has dnd-kit activator wiring', () => {
		render(<ReorderHarness initialOrder={['name', 'email', 'role']} />)

		const handles = screen.getAllByRole('button', {
			name: /reorder column/i,
		})
		const nameHandle = handles[0]
		expect(nameHandle).toBeDefined()
		if (!nameHandle) return

		// Focusable
		nameHandle.focus()
		expect(document.activeElement).toBe(nameHandle)

		// dnd-kit attaches role="button" + tabIndex; SortableItemHandle wraps a
		// real <button>, which is intrinsically focusable. Pressing Space should
		// not throw and should be captured by the dnd-kit keyboard sensor (no
		// observable side effect in jsdom because layout rects are zero, but the
		// wiring exists). We assert the keydown dispatch does not error.
		expect(() =>
			fireEvent.keyDown(nameHandle, { key: ' ', code: 'Space' }),
		).not.toThrow()
		expect(() =>
			fireEvent.keyDown(nameHandle, {
				key: 'ArrowRight',
				code: 'ArrowRight',
			}),
		).not.toThrow()
		expect(() =>
			fireEvent.keyDown(nameHandle, { key: ' ', code: 'Space' }),
		).not.toThrow()

		// Handle exposes data-slot for sortable-item-handle (proves it's wired
		// via the @dnd-kit/sortable primitive, not a plain button).
		expect(nameHandle.getAttribute('data-slot')).toBe('sortable-item-handle')
	})

	it('attempting to drag a pinned column has no effect', () => {
		const onOrderChange = vi.fn<(order: string[]) => void>()
		render(
			<ReorderHarness
				initialOrder={['name', 'email', 'role']}
				pinning={{ left: ['name'] }}
				onOrderChange={onOrderChange}
			/>,
		)

		// Pinned "name" should not have a reorder handle.
		const nameHandle = screen.queryByRole('button', {
			name: /reorder column name/i,
		})
		expect(nameHandle).toBeNull()

		// Other handles still exist.
		const remainingHandles = screen.getAllByRole('button', {
			name: /reorder column/i,
		})
		expect(remainingHandles.length).toBe(2)

		// No order change occurred from rendering alone.
		expect(onOrderChange).not.toHaveBeenCalled()
	})
})

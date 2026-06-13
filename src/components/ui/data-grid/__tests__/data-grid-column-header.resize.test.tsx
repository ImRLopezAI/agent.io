import {
	type ColumnDef,
	type ColumnSizingState,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { DataGridColumnHeader } from '../data-grid-column-header'
import {
	MAX_COLUMN_SIZE,
	MIN_COLUMN_SIZE,
} from '../hooks/use-data-grid-table-options'

interface Row {
	id: string
	name: string
}

afterEach(() => {
	cleanup()
})

function ResizeHarness() {
	const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

	const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
		() => [
			{ id: 'name', accessorKey: 'name', header: 'Name', enableResizing: true },
			{ id: 'extra', accessorKey: 'id', header: 'Extra', enableResizing: true },
		],
		[],
	)

	const data = React.useMemo<Row[]>(() => [{ id: 'r1', name: 'Alice' }], [])

	const table = useReactTable<Row>({
		data,
		columns,
		state: { columnSizing },
		onColumnSizingChange: setColumnSizing,
		columnResizeMode: 'onChange',
		columnResizeDirection: 'ltr',
		defaultColumn: {
			minSize: MIN_COLUMN_SIZE,
			maxSize: MAX_COLUMN_SIZE,
			size: 150,
		},
		getCoreRowModel: getCoreRowModel(),
	})

	const headerGroup = table.getHeaderGroups()[0]
	if (!headerGroup) return null
	const firstHeader = headerGroup.headers[0]
	if (!firstHeader) return null

	return React.createElement(
		'div',
		{ role: 'columnheader' },
		React.createElement(
			DataGridColumnHeader as React.ComponentType<{
				header: typeof firstHeader
				table: typeof table
			}>,
			{
				header: firstHeader,
				table,
			},
		),
	)
}

function getResizeHandle(): HTMLElement {
	return screen.getByRole('separator', { name: /resize column name/i })
}

describe('DataGridColumnHeader resize keyboard', () => {
	it('ArrowRight increases column size by 1px', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		expect(handle.getAttribute('aria-valuenow')).toBe('150')
		fireEvent.keyDown(handle, { key: 'ArrowRight' })
		expect(getResizeHandle().getAttribute('aria-valuenow')).toBe('151')
	})

	it('Shift+ArrowRight increases column size by 10px', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
		expect(getResizeHandle().getAttribute('aria-valuenow')).toBe('160')
	})

	it('Home jumps to MIN_COLUMN_SIZE', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		fireEvent.keyDown(handle, { key: 'Home' })
		expect(getResizeHandle().getAttribute('aria-valuenow')).toBe(
			String(MIN_COLUMN_SIZE),
		)
	})

	it('End jumps to MAX_COLUMN_SIZE', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		fireEvent.keyDown(handle, { key: 'End' })
		expect(getResizeHandle().getAttribute('aria-valuenow')).toBe(
			String(MAX_COLUMN_SIZE),
		)
	})

	it('ArrowLeft decreases column size by 1px', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		fireEvent.keyDown(handle, { key: 'ArrowLeft' })
		expect(getResizeHandle().getAttribute('aria-valuenow')).toBe('149')
	})

	it('exposes correct ARIA pattern', () => {
		render(React.createElement(ResizeHarness))
		const handle = getResizeHandle()
		expect(handle.getAttribute('role')).toBe('separator')
		expect(handle.getAttribute('aria-orientation')).toBe('vertical')
		expect(handle.getAttribute('aria-valuemin')).toBe(String(MIN_COLUMN_SIZE))
		expect(handle.getAttribute('aria-valuemax')).toBe(String(MAX_COLUMN_SIZE))
		expect(handle.getAttribute('aria-valuetext')).toMatch(/^\d+ pixels$/)
		expect(handle.getAttribute('tabindex')).toBe('0')
	})
})

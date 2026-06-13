'use client'

import { DirectionProvider } from '@base-ui/react/direction-provider'
import type { ColumnDef, Row, Table } from '@tanstack/react-table'
import { DataGrid as DataGridBase } from '@ui/data-grid/data-grid'
import {
	DataGridExport,
	type DataGridExportProps,
} from '@ui/data-grid/data-grid-export'
import { DataGridFilterMenu } from '@ui/data-grid/data-grid-filter-menu'
import {
	DataGridPreviewProvider,
	type DataGridPreviewRenderer,
	DataGridPreviewRoot,
	useDataGridPreviewController,
} from '@ui/data-grid/data-grid-preview'
import { DataGridRowHeightMenu } from '@ui/data-grid/data-grid-row-height-menu'
import { DataGridSortMenu } from '@ui/data-grid/data-grid-sort-menu'
import {
	type UseDataGridProps,
	useDataGrid,
} from '@ui/data-grid/hooks/use-data-grid'
import { getFilterFn } from '@ui/data-grid/lib/data-grid-filters'
import type { RowContextMenuItem } from '@ui/data-grid/lib/data-grid-row-context'
import type { formatters } from '@ui/data-grid/lib/data-grid-utils'
import type {
	CellOpts,
	CellSelectOption,
	InfiniteScrollOptions,
	RowHeightValue,
	SearchState,
	SelectionState,
	TableVariant,
} from '@ui/data-grid/types/data-grid'
import { Search } from 'lucide-react'
import * as React from 'react'
import { cn } from '#/lib/utils'
import {
	ActionBar,
	ActionBarClose,
	ActionBarGroup,
	ActionBarItem,
	type ActionBarProps,
	ActionBarSelection,
	ActionBarSeparator,
} from '../ui/action-bar'
import { Kbd, KbdGroup } from '../ui/kbd'

type Formatters = typeof formatters

type CellVariantValue = CellOpts['variant'] | CellOpts
type CellVariantOptions = Partial<Omit<CellOpts, 'variant'>>
type RowClassName<TData extends object> =
	| string
	| ((row: TData, rowIndex: number) => string | undefined)

interface CreateDataGridProps<TData extends object>
	extends Omit<UseDataGridProps<TData>, 'columns'> {
	data: TData[]
	isLoading?: boolean
	emptyMessage?: React.ReactNode
	infiniteScroll?: InfiniteScrollOptions
}

interface DataGridCompositeProps {
	withSelect?: boolean
	variant?: TableVariant
	height?: number
	stretchColumns?: boolean
	adjustLayout?: boolean
	className?: string
	children?: React.ReactNode
}

interface DataGridHeaderSlotProps {
	children?: React.ReactNode
	className?: string
}

interface DataGridColumnsSlotProps<TData extends object = object> {
	children?: React.ReactNode
	rowContextMenu?: RowContextMenuItem<TData>[]
	cellContextMenu?: RowContextMenuItem<TData>[]
	className?: RowClassName<TData>
	variant?: TableVariant
	rowHeight?: RowHeightValue
}
type DataGridColumnComponent<TData extends object> = (
	props: DataGridColumnProps<TData>,
) => React.ReactElement | null

type DataGridColumnsComponent<TData extends object> = (
	props: DataGridColumnsSlotProps<TData>,
) => React.ReactElement | null

export type DataGridComponent<TData extends object> = ((
	props: DataGridCompositeProps,
) => React.ReactElement | null) & {
	Header: typeof DataGridHeaderSlot
	Columns: DataGridColumnsComponent<TData>
	Column: DataGridColumnComponent<TData>
	Toolbar: typeof DataGridToolbar
	ActionBar: DataGridActionBarComponent<TData>
}

type DataGridCompositeComponent<TData extends object> = DataGridComponent<TData>

export type ActionBarSelectionState<TData extends object> = SelectionState & {
	selectedRowIds: string[]
	selectedRows: TData[]
	selectedRowCount: number
	hasSelectedRows: boolean
	getSelectedRowIds: () => string[]
	getSelectedRows: () => TData[]
	getSelectedRowCount: () => number
}

type DataGridActionBarRenderState<TData extends object> = {
	tableState: ReturnType<Table<TData>['getState']>
	selectionState?: ActionBarSelectionState<TData>
	searchState?: SearchState
	enableSearch: boolean
}

type DataGridActionBarRenderFn<TData extends object> = (
	table: Table<TData>,
	state: DataGridActionBarRenderState<TData>,
) => React.ReactNode

type DataGridActionBarSelectionProps<TData extends object> = Omit<
	React.ComponentProps<typeof ActionBarSelection>,
	'children'
> & {
	children?: React.ReactNode | DataGridActionBarRenderFn<TData>
}

type DataGridActionBarGroupProps<TData extends object> = Omit<
	React.ComponentProps<typeof ActionBarGroup>,
	'children'
> & {
	children?: React.ReactNode | DataGridActionBarRenderFn<TData>
}

type DataGridActionBarComponent<TData extends object> = ((
	props: ActionBarProps,
) => React.ReactElement | null) & {
	Group: (
		props: DataGridActionBarGroupProps<TData>,
	) => React.ReactElement | null
	Item: typeof ActionBarItem
	Selection: (
		props: DataGridActionBarSelectionProps<TData>,
	) => React.ReactElement | null
	Separator: typeof ActionBarSeparator
	Close: typeof ActionBarClose
}

type DataGridToolbarToggleProps = {
	filter?: boolean
	sort?: boolean
	rowHeight?: boolean
	export?: boolean
	search?: boolean
}

interface DataGridToolbarProps<TData extends object>
	extends React.ComponentProps<'div'>,
		DataGridToolbarToggleProps {
	align?: 'start' | 'center' | 'end'
	exportProps?: Omit<DataGridExportProps<TData>, 'table'>
}

type DataGridColumnProps<TData extends object, TValue = unknown> = ColumnDef<
	TData,
	TValue
> & {
	id?: string
	accessorKey?: keyof TData | (string & {})
	accessorFn?: (row: TData, index: number) => TValue
	title?: string
	cellVariant?: CellVariantValue
	opts?: CellVariantOptions
	formatter?: (row: TData, formatters: Formatters) => React.ReactNode
	expandedContent?: (row: TData) => React.ReactNode
	handleEdit?: (row: TData) => void
	preview?: DataGridPreviewRenderer<TData>
	children?: React.ReactNode | ColumnDef<TData, TValue>['cell']
}

interface CompoundContextValue<TData extends object> {
	table: Table<TData>
	searchState?: SearchState
	enableSearch: boolean
	tableState: ReturnType<Table<TData>['getState']>
	selectionState?: SelectionState
}

/**
 * The compound-grid context is created at `unknown`. React contexts cannot be
 * parameterized at consumption time, so this file owns one narrowing cast
 * (`useCompoundGrid<TData>()`) and the provider write site simply hands a
 * `CompoundContextValue<TData>` in — `unknown` is contravariant enough for
 * that to typecheck without an `as unknown as` laundering cast.
 */
const DataGridCompoundContext = React.createContext<unknown>(null)

/**
 * Reads the compound-grid context and narrows it to `CompoundContextValue<TData>`.
 *
 * The context value is invariant in `TData` at runtime (the same `Table`
 * instance is shared by every consumer in the tree) but TypeScript cannot
 * see that: generic React contexts cannot be parameterized at consumption,
 * so we apply a single typed narrowing cast here. Throws if called outside a
 * `<TableComponent>` subtree.
 */
function useCompoundGrid<TData extends object>(): CompoundContextValue<TData> {
	const context = React.useContext(DataGridCompoundContext)
	if (!context) {
		throw new Error('useCompoundGrid must be used within a DataGrid provider')
	}
	return context as CompoundContextValue<TData>
}

function DataGridHeaderSlot(_props: DataGridHeaderSlotProps) {
	return null
}

function DataGridColumnsSlot<TData extends object>(
	_props: DataGridColumnsSlotProps<TData>,
) {
	return null
}

/**
 * Sentinel tag identifying a `<TableComponent.Column>` element regardless of
 * which `useGrid` call created it. The compound walker (`collectGridColumns`)
 * checks for this symbol on `child.type` instead of referential equality.
 */
const GRID_COLUMN_TAG: unique symbol = Symbol.for('sunday/grid-column')

interface GridColumnTagged {
	[GRID_COLUMN_TAG]: true
}

function createTaggedDataGridColumn<
	TData extends object,
>(): DataGridColumnComponent<TData> {
	function DataGridColumn(
		_props: DataGridColumnProps<TData>,
	): React.ReactElement | null {
		return null
	}
	Object.assign(DataGridColumn, { [GRID_COLUMN_TAG]: true })
	return DataGridColumn
}

function isDataGridColumnType(type: unknown): type is GridColumnTagged {
	return (
		typeof type === 'function' &&
		(type as Partial<GridColumnTagged>)[GRID_COLUMN_TAG] === true
	)
}

const EMPTY_SELECTION_STATE: SelectionState = {
	selectedCells: new Set<string>(),
	selectionRange: null,
	isSelecting: false,
}

function useSelectionStateSnapshot<TData extends object>(
	table: Table<TData>,
	fallback?: SelectionState,
) {
	const selectionStateStore = table.options.meta?.selectionStateStore
	const subscribe = React.useCallback(
		(listener: () => void) =>
			selectionStateStore?.subscribe(listener) ?? (() => undefined),
		[selectionStateStore],
	)
	const getSnapshot = React.useCallback(
		() =>
			selectionStateStore?.getSnapshot() ?? fallback ?? EMPTY_SELECTION_STATE,
		[selectionStateStore, fallback],
	)
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function resolveActionBarSelectedRows<TData extends object>(
	table: Table<TData>,
	selectionState: SelectionState,
): Row<TData>[] {
	const selectedRows = table.getSelectedRowModel().rows
	if (selectedRows.length > 0) {
		return selectedRows
	}

	if (selectionState.selectedCells.size === 0) {
		return []
	}

	const rowModel = table.getRowModel().rows
	const seenRowIds = new Set<string>()
	const rows: Row<TData>[] = []

	for (const cellKey of selectionState.selectedCells) {
		const [rowIndexRaw] = cellKey.split(':')
		const rowIndex = Number.parseInt(rowIndexRaw ?? '', 10)
		if (!Number.isFinite(rowIndex) || rowIndex < 0) continue

		const row = rowModel[rowIndex]
		if (!row || seenRowIds.has(row.id)) continue

		seenRowIds.add(row.id)
		rows.push(row)
	}

	return rows
}

function createActionBarSelectionState<TData extends object>(
	table: Table<TData>,
	selectionState: SelectionState,
): ActionBarSelectionState<TData> {
	const selectedRows = resolveActionBarSelectedRows(table, selectionState)
	const selectedRowIds = selectedRows.map((row) => row.id)
	const selectedRecords = selectedRows.map((row) => row.original)

	return {
		...selectionState,
		selectedRowIds,
		selectedRows: selectedRecords,
		selectedRowCount: selectedRows.length,
		hasSelectedRows: selectedRows.length > 0,
		getSelectedRowIds: () => selectedRowIds,
		getSelectedRows: () => selectedRecords,
		getSelectedRowCount: () => selectedRows.length,
	}
}

function DataGridActionBarSelection<TData extends object>({
	children,
	...props
}: DataGridActionBarSelectionProps<TData>) {
	const { table, tableState, selectionState, searchState, enableSearch } =
		useCompoundGrid<TData>()
	const selectionSnapshot = useSelectionStateSnapshot(table, selectionState)
	const resolvedSelectionState = React.useMemo(
		() => createActionBarSelectionState(table, selectionSnapshot),
		[table, selectionSnapshot],
	)
	const state = React.useMemo(
		() => ({
			tableState,
			selectionState: resolvedSelectionState,
			searchState,
			enableSearch,
		}),
		[tableState, resolvedSelectionState, searchState, enableSearch],
	)
	const resolvedChildren =
		typeof children === 'function' ? children(table, state) : children

	return <ActionBarSelection {...props}>{resolvedChildren}</ActionBarSelection>
}

function DataGridActionBarGroup<TData extends object>({
	children,
	...props
}: DataGridActionBarGroupProps<TData>) {
	const { table, tableState, selectionState, searchState, enableSearch } =
		useCompoundGrid<TData>()
	const selectionSnapshot = useSelectionStateSnapshot(table, selectionState)
	const resolvedSelectionState = React.useMemo(
		() => createActionBarSelectionState(table, selectionSnapshot),
		[table, selectionSnapshot],
	)
	const state = React.useMemo(
		() => ({
			tableState,
			selectionState: resolvedSelectionState,
			searchState,
			enableSearch,
		}),
		[tableState, resolvedSelectionState, searchState, enableSearch],
	)
	const resolvedChildren =
		typeof children === 'function' ? children(table, state) : children

	return <ActionBarGroup {...props}>{resolvedChildren}</ActionBarGroup>
}

function DataGridActionBar<TData extends object>(props: ActionBarProps) {
	const {
		open: openProp,
		onOpenChange: onOpenChangeProp,
		...actionBarProps
	} = props
	const { table, selectionState } = useCompoundGrid<TData>()
	const tableMeta = table.options.meta
	const selectionSnapshot = useSelectionStateSnapshot(table, selectionState)
	const selectedCellCount = selectionSnapshot.selectedCells.size
	const resolvedOpen = openProp ?? selectedCellCount > 0

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			onOpenChangeProp?.(open)
			if (!open) {
				table.toggleAllRowsSelected(false)
				tableMeta?.onSelectionClear?.()
			}
		},
		[onOpenChangeProp, table, tableMeta],
	)

	return (
		<ActionBar
			data-grid-popover=''
			{...actionBarProps}
			open={resolvedOpen}
			onOpenChange={onOpenChange}
		/>
	)
}

// Per-walker WeakSet of already-warned child component types. Each unique
// unrecognized component (e.g. a custom wrapper around `<TableComponent.Column>`)
// is warned once across the lifetime of the process — not once per render.
// Host strings (`'div'`, `'span'`, …) are deduped via a sibling Set since
// they can't key a WeakSet.
const warnedSlotTypes = new WeakSet<object>()
const warnedColumnTypes = new WeakSet<object>()
const warnedSlotStringTypes = new Set<string>()
const warnedColumnStringTypes = new Set<string>()

function isFragmentLike(type: unknown): boolean {
	return type === React.Fragment
}

function getChildTypeLabel(type: unknown): string {
	if (typeof type === 'string') return type
	if (typeof type === 'function') {
		return (
			(type as { displayName?: string; name?: string }).displayName ??
			(type as { name?: string }).name ??
			'<anonymous>'
		)
	}
	if (typeof type === 'symbol') return type.toString()
	return String(type)
}

/**
 * Dev-only warning emitted when the JSX walker encounters a child that is
 * neither one of the recognized compound slots nor a `React.Fragment`. The
 * walker silently skips such nodes (they could legitimately be arbitrary
 * DOM), but the silent skip historically hid real authoring bugs (e.g.
 * wrapping `<TableComponent.Column>` in a `<div>` so it never reaches the
 * column collector). We dedupe per unique offending type so the warning
 * fires once per unique component, not once per render.
 */
function warnUnrecognizedSlotChild(
	type: unknown,
	objectDedup: WeakSet<object>,
	stringDedup: Set<string>,
): void {
	if (process.env.NODE_ENV === 'production') return
	if (type == null) return

	if (typeof type === 'string') {
		if (stringDedup.has(type)) return
		stringDedup.add(type)
	} else if (typeof type === 'function' || typeof type === 'object') {
		if (objectDedup.has(type as object)) return
		objectDedup.add(type as object)
	} else {
		return
	}

	const name = getChildTypeLabel(type)
	console.warn(
		`[Grid] Unrecognized child wrapping a Grid slot. Wrap columns directly ` +
			`in <TableComponent>, not in <${name}>. Found: ${name}`,
	)
}

function collectGridSlots<TData extends object>(children: React.ReactNode) {
	const headers: Set<React.ReactNode> = new Set()
	let columns: React.ReactElement<DataGridColumnsSlotProps<TData>> | undefined
	let rowContextMenu: RowContextMenuItem<TData>[] | undefined
	let cellContextMenu: RowContextMenuItem<TData>[] | undefined
	let rowClassName: RowClassName<TData> | undefined
	let variant: TableVariant | undefined
	let rowHeight: RowHeightValue | undefined
	const walk = (nodes: React.ReactNode) => {
		React.Children.forEach(nodes, (child) => {
			if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return

			if (child.type === DataGridHeaderSlot) {
				headers.add(child.props.children)
				return
			}

			if (child.type === DataGridColumnsSlot && !columns) {
				columns = child as React.ReactElement<DataGridColumnsSlotProps<TData>>
				const slotProps = child.props as DataGridColumnsSlotProps<TData>
				if (slotProps.rowContextMenu) {
					rowContextMenu = slotProps.rowContextMenu
				}
				if (slotProps.cellContextMenu) {
					cellContextMenu = slotProps.cellContextMenu
				}
				if (slotProps.className) {
					rowClassName = slotProps.className
				}
				variant = slotProps.variant
				rowHeight = slotProps.rowHeight
				return
			}

			if (isFragmentLike(child.type)) {
				walk(child.props.children)
				return
			}

			warnUnrecognizedSlotChild(
				child.type,
				warnedSlotTypes,
				warnedSlotStringTypes,
			)
		})
	}

	walk(children)

	return {
		headers: Array.from(headers),
		columns,
		rowContextMenu,
		cellContextMenu,
		rowClassName,
		variant,
		rowHeight,
	}
}

function resolveAccessorValue<TData extends object>(
	row: TData,
	column: DataGridColumnProps<TData, unknown>,
	index: number,
): unknown {
	if ('accessorFn' in column && typeof column.accessorFn === 'function') {
		return column.accessorFn(row, index)
	}
	if ('accessorKey' in column && column.accessorKey) {
		const key = column.accessorKey as keyof TData
		return row[key]
	}
	return undefined
}

function inferSelectOptions<TData extends object>(
	data: TData[],
	column: DataGridColumnProps<TData, unknown>,
): CellSelectOption[] {
	const seen = new Set<string>()
	const options: CellSelectOption[] = []

	data.forEach((row, index) => {
		const value = resolveAccessorValue(row, column, index)
		if (value == null) return
		const values = Array.isArray(value) ? value : [value]
		values.forEach((item) => {
			if (item == null) return
			const stringValue = String(item)
			if (seen.has(stringValue)) return
			seen.add(stringValue)
			options.push({ label: stringValue, value: stringValue })
		})
	})

	return options
}

type InferredVariant = CellOpts['variant']

const ISO_DATE_RE =
	/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const URL_RE = /^https?:\/\/.+/

function detectValueType(value: unknown): InferredVariant {
	if (value == null) return 'short-text'
	if (value instanceof Date && !Number.isNaN(value.getTime())) return 'date'
	if (typeof value === 'number') return 'number'
	if (typeof value === 'boolean') return 'checkbox'
	if (Array.isArray(value)) return 'multi-select'
	if (typeof value === 'string') {
		if (URL_RE.test(value)) return 'url'
		if (ISO_DATE_RE.test(value) || value.includes('GMT')) return 'date'
	}
	return 'short-text'
}

function inferCellVariant<TData extends object>(
	data: TData[],
	column: DataGridColumnProps<TData, unknown>,
): CellOpts {
	const typesSeen = new Set<InferredVariant>()
	let detectedVariant: InferredVariant = 'short-text'

	for (let i = 0; i < data.length; i++) {
		const row = data[i]
		if (!row || typeof row !== 'object') continue
		const value = resolveAccessorValue(row, column, i)
		if (value == null) continue

		const variant = detectValueType(value)
		typesSeen.add(variant)

		if (typesSeen.size > 1) {
			return { variant: 'short-text' }
		}

		detectedVariant = variant
	}

	if (detectedVariant === 'multi-select' || detectedVariant === 'select') {
		const options = inferSelectOptions(data, column)
		return { variant: detectedVariant, options }
	}

	return { variant: detectedVariant } as CellOpts
}

function resolveCellVariant<TData extends object>(
	column: DataGridColumnProps<TData, unknown>,
	data: TData[],
): CellOpts | undefined {
	const { cellVariant, opts } = column
	if (!cellVariant) {
		return inferCellVariant(data, column)
	}

	let resolved: CellOpts
	if (typeof cellVariant === 'string') {
		resolved = { variant: cellVariant, ...(opts ?? {}) } as CellOpts
	} else {
		resolved = opts ? ({ ...cellVariant, ...opts } as CellOpts) : cellVariant
	}

	if (resolved.variant === 'select' || resolved.variant === 'multi-select') {
		const hasOptions =
			'options' in resolved &&
			Array.isArray(resolved.options) &&
			resolved.options.length > 0
		if (!hasOptions) {
			const inferredOptions = inferSelectOptions(data, column)
			return { ...resolved, options: inferredOptions }
		}
	}

	return resolved
}

function buildDataGridColumnDef<TData extends object, TValue = unknown>(
	column: DataGridColumnProps<TData, TValue>,
	config: {
		data: TData[]
		index: number
		filterFn: ReturnType<typeof getFilterFn<TData>>
	},
): ColumnDef<TData, TValue> {
	const {
		title,
		cellVariant,
		opts,
		formatter,
		expandedContent,
		handleEdit,
		preview,
		children,
		cell,
		header,
		meta,
		...rest
	} = column

	const resolvedCellVariant = resolveCellVariant(
		{ ...column, cellVariant, opts } as DataGridColumnProps<TData, unknown>,
		config.data,
	)

	let resolvedCell: ColumnDef<TData, TValue>['cell'] | undefined = cell
	if (!resolvedCell && typeof children === 'function') {
		resolvedCell = children
	} else if (!resolvedCell && children != null) {
		resolvedCell = () => children
	}
	const hasCustomCell =
		Boolean(cell) ||
		typeof children === 'function' ||
		(children != null && children !== false)

	const resolvedMeta = {
		...(meta ?? {}),
		...(title && !header ? { label: title } : {}),
		...(resolvedCellVariant ? { cell: resolvedCellVariant } : {}),
		...(formatter ? { formatter } : {}),
		...(expandedContent ? { expandedContent } : {}),
		...(handleEdit ? { handleEdit } : {}),
		...(preview ? { preview } : {}),
		...(hasCustomCell ? { customCell: true } : {}),
	}

	const columnDef = rest as ColumnDef<TData, TValue>
	if (header) {
		columnDef.header = header
	} else if (title) {
		columnDef.header = title
	}
	if (resolvedCell) {
		columnDef.cell = resolvedCell
	}
	columnDef.meta = resolvedMeta
	columnDef.filterFn = columnDef.filterFn ?? config.filterFn

	if (!columnDef.id) {
		const accessorKey =
			'accessorKey' in columnDef && columnDef.accessorKey
				? columnDef.accessorKey
				: undefined
		columnDef.id = accessorKey ? String(accessorKey) : `column-${config.index}`
	}

	return columnDef
}

function DataGridToolbar<TData extends object>({
	filter = false,
	sort = false,
	rowHeight = false,
	export: exportEnabled = false,
	search = false,
	align = 'end',
	exportProps,
	className,
	children,
	...props
}: DataGridToolbarProps<TData>) {
	const { table, searchState, enableSearch } = useCompoundGrid<TData>()
	const isMac =
		typeof navigator !== 'undefined' &&
		navigator.platform.toLowerCase().includes('mac')
	const shortcutKey = isMac ? 'Cmd' : 'Ctrl'

	const onSearchClick = React.useCallback(() => {
		searchState?.onSearchOpenChange?.(true)
	}, [searchState])

	return (
		<div
			className={cn('flex items-center gap-2 self-end', className)}
			{...props}
		>
			{search && enableSearch && searchState && (
				<button
					type='button'
					onClick={onSearchClick}
					className='inline-flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-foreground text-sm shadow-sm transition hover:bg-accent hover:text-accent-foreground'
				>
					<Search className='size-4 text-muted-foreground' />
					Find
					<KbdGroup className='ms-2'>
						<Kbd>{shortcutKey}</Kbd>
						<Kbd>F</Kbd>
					</KbdGroup>
				</button>
			)}
			{filter && <DataGridFilterMenu table={table} align={align} />}
			{sort && <DataGridSortMenu table={table} align={align} />}
			{rowHeight === true && <DataGridRowHeightMenu table={table} />}
			{exportEnabled && <DataGridExport table={table} {...exportProps} />}
			{children}
		</div>
	)
}

/**
 * Build a typed compound `<TableComponent>` bound to the data and columns
 * supplied by `factory`.
 *
 * ## Lifecycle
 *
 * - `factory` is memoized via `useMemo(factory, deps)`. With the **default**
 *   `deps = []`, `factory` runs **once** for the lifetime of the hosting
 *   component and the returned `TableComponent` identity is stable.
 * - The latest `config.data` (and every other field on `config`) flows
 *   **live** every render via `configRef.current = config`, so feeding the
 *   grid fresh rows does **not** require `deps` to change. The factory's
 *   data array is read directly from the ref inside the rendered Component,
 *   not snapshotted.
 * - Pass `deps` only when `factory`'s closure depends on values that change
 *   (e.g. you compute `data` from a piece of state, or you include
 *   handler closures that capture a changing prop). When in doubt, leave
 *   `deps` empty and reach for in-render data via the props you pass to
 *   `<TableComponent>` rather than re-running the factory.
 * - The `TableComponent` returned per-call is stable across renders of this
 *   hook — using it inside `React.memo` boundaries is safe.
 *
 * ## JSX shape
 *
 * Children of `<TableComponent>` must be one of `Header`, `Columns`, or
 * `Toolbar` (or a `React.Fragment` containing those). Wrapping
 * `<TableComponent.Column>` in arbitrary DOM (e.g. `<div>`) silently breaks
 * the JSX walker — the compound API logs a single dev-mode warning per
 * unique offending child type to surface that bug.
 *
 * ```tsx
 * const TableComponent = useGrid<Person>(() => ({
 *   data: people,
 *   onRowsDelete: (rows, rowIndices, rowIds) => deletePeople(rowIds),
 * }))
 *
 * return (
 *   <TableComponent>
 *     <TableComponent.Toolbar filter sort />
 *     <TableComponent.Columns>
 *       <TableComponent.Column accessorKey='name' title='Name' />
 *       <TableComponent.Column accessorKey='age' title='Age' />
 *     </TableComponent.Columns>
 *   </TableComponent>
 * )
 * ```
 */
export function useGrid<TData extends object>(
	factory: () => CreateDataGridProps<TData>,
	deps: React.DependencyList = [],
): DataGridComponent<TData> {
	const config = React.useMemo(factory, deps)
	const configRef = React.useRef(config)
	configRef.current = config

	// A non-generic Column per `useGrid` call so JSX attribute checking keeps
	// `TData` fixed — a shared generic stub widens `accessorKey` to `string`.
	const DataGridColumn = createTaggedDataGridColumn<TData>()

	const ActionBarComponent = Object.assign(DataGridActionBar, {
		Group: DataGridActionBarGroup,
		Item: ActionBarItem,
		Selection: DataGridActionBarSelection,
		Separator: ActionBarSeparator,
		Close: ActionBarClose,
	}) as DataGridActionBarComponent<TData>

	function collectGridColumns(
		children: React.ReactNode,
	): Array<React.ReactElement<DataGridColumnProps<TData, unknown>>> {
		const columns: Set<
			React.ReactElement<DataGridColumnProps<TData, unknown>>
		> = new Set()

		const walk = (nodes: React.ReactNode) => {
			React.Children.forEach(nodes, (child) => {
				if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return

				if (isDataGridColumnType(child.type)) {
					columns.add(
						child as React.ReactElement<DataGridColumnProps<TData, unknown>>,
					)
					return
				}

				if (isFragmentLike(child.type)) {
					walk(child.props.children)
					return
				}

				warnUnrecognizedSlotChild(
					child.type,
					warnedColumnTypes,
					warnedColumnStringTypes,
				)
			})
		}

		walk(children)

		return Array.from(columns)
	}

	const tableRef = React.useRef<DataGridComponent<TData> | null>(null)

	if (tableRef.current === null) {
		function GridRoot({
			children,
			withSelect,
			variant,
			height,
			stretchColumns,
			adjustLayout,
			className,
		}: DataGridCompositeProps) {
			const config = configRef.current
			const { infiniteScroll, ...gridConfig } = config
			const slots = React.useMemo(
				() => collectGridSlots<TData>(children),
				[children],
			)
			const columnElements = React.useMemo(
				() => collectGridColumns(slots.columns?.props.children),
				[slots.columns?.props.children],
			)
			const filterFn = React.useMemo(() => getFilterFn<TData>(), [])
			const baseColumns = React.useMemo(
				() =>
					columnElements.map((column, index) =>
						buildDataGridColumnDef<TData, unknown>(column.props, {
							data: config.data,
							index,
							filterFn,
						}),
					),
				[columnElements, config.data, filterFn],
			)

			const previewController = useDataGridPreviewController()
			const hasPreview = React.useMemo(
				() => baseColumns.some((columnDef) => columnDef.meta?.preview),
				[baseColumns],
			)

			const resolvedWithSelect = withSelect ?? config.withSelect
			const resolvedEnableSearch = config.enableSearch ?? true
			const resolvedVariant = variant ?? slots.variant
			const resolvedRowHeight = slots.rowHeight ?? gridConfig.rowHeight
			const hasRowContextMenu = Boolean(slots.rowContextMenu?.length)
			const { table, ...dataGridProps } = useDataGrid({
				readOnly: gridConfig.readOnly ?? true,
				...gridConfig,
				enableSearch: resolvedEnableSearch,
				withSelect: resolvedWithSelect,
				rowHeight: resolvedRowHeight,
				columns: baseColumns,
				data: gridConfig.data,
				enableCellContextMenu: !hasRowContextMenu,
				...(infiniteScroll
					? {
							enablePagination: false,
							showPagination: false,
							paginationProps: undefined,
						}
					: {}),
			})
			const tableState = table.getState()
			const selectionState = table.options.meta?.selectionState

			const contextValue = React.useMemo(
				() => ({
					table,
					searchState: dataGridProps.searchState,
					enableSearch: resolvedEnableSearch,
					tableState,
					selectionState,
				}),
				[
					resolvedEnableSearch,
					dataGridProps.searchState,
					table,
					tableState,
					selectionState,
				],
			)

			return (
				<DirectionProvider direction={dataGridProps.dir ?? 'ltr'}>
					<DataGridCompoundContext.Provider value={contextValue}>
						<DataGridPreviewProvider controller={previewController}>
							<div className='w-full space-y-2.5'>
								{slots.headers.map((header, index) => (
									<React.Fragment key={`header-${index}`}>
										{header}
									</React.Fragment>
								))}
								<DataGridBase
									{...dataGridProps}
									table={table}
									variant={resolvedVariant}
									height={height}
									stretchColumns={stretchColumns}
									adjustLayout={adjustLayout ?? false}
									className={cn(className)}
									rowContextMenu={slots.rowContextMenu}
									cellContextMenu={slots.cellContextMenu}
									rowClassName={slots.rowClassName}
									infiniteScroll={infiniteScroll}
									isLoading={config.isLoading}
									emptyMessage={config.emptyMessage}
								/>
								{hasPreview && <DataGridPreviewRoot />}
								{children}
							</div>
						</DataGridPreviewProvider>
					</DataGridCompoundContext.Provider>
				</DirectionProvider>
			)
		}

		tableRef.current = Object.assign(GridRoot, {
			Header: DataGridHeaderSlot,
			Columns: DataGridColumnsSlot as DataGridColumnsComponent<TData>,
			Column: DataGridColumn,
			Toolbar: DataGridToolbar,
			ActionBar: ActionBarComponent,
		}) as DataGridCompositeComponent<TData>
	}

	return tableRef.current
}

export type {
	CreateDataGridProps,
	DataGridColumnProps,
	DataGridToolbarProps,
	Formatters,
}
export { useCompoundGrid }

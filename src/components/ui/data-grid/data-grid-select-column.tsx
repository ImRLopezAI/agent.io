'use client'

import type {
	CellContext,
	ColumnDef,
	HeaderContext,
} from '@tanstack/react-table'
import { cn } from 'cnfast'
import * as React from 'react'

import { useDataGridActions } from './contexts/data-grid-actions-context'
import { useDataGridSelectors } from './contexts/data-grid-selectors-context'
import { useDataGridState } from './contexts/data-grid-state-context'
import { useStore } from './hooks/use-data-grid-store'
import { Checkbox } from './ui/checkbox'

type HitboxSize = 'default' | 'sm' | 'lg'

interface DataGridSelectHitboxProps {
	htmlFor: string
	children: React.ReactNode
	size?: HitboxSize
	debug?: boolean
	onHitboxClick?: React.MouseEventHandler<HTMLLabelElement>
}

function DataGridSelectHitbox({
	htmlFor,
	children,
	size,
	debug,
	onHitboxClick,
}: DataGridSelectHitboxProps) {
	return (
		<div
			className={cn(
				'group relative flex h-full w-full items-center justify-center',
				size === 'default' && 'p-0',
				size === 'sm' && 'p-0',
				size === 'lg' && 'p-0.5',
			)}
		>
			{children}
			<label
				htmlFor={htmlFor}
				className={cn(
					'absolute inset-0 cursor-pointer',
					debug && 'border border-red-500 border-dashed bg-red-500/20',
				)}
				onClick={onHitboxClick}
			/>
		</div>
	)
}

interface DataGridSelectCheckboxProps
	extends Omit<React.ComponentProps<typeof Checkbox>, 'id'> {
	rowNumber?: number
	hitboxSize?: HitboxSize
	debug?: boolean
	onHitboxClick?: React.MouseEventHandler<HTMLLabelElement>
}

function DataGridSelectCheckbox({
	rowNumber,
	hitboxSize,
	debug,
	checked,
	className,
	onHitboxClick,
	...props
}: DataGridSelectCheckboxProps) {
	const id = React.useId()

	if (rowNumber !== undefined) {
		return (
			<DataGridSelectHitbox
				htmlFor={id}
				size={hitboxSize}
				debug={debug}
				onHitboxClick={onHitboxClick}
			>
				<div
					aria-hidden='true'
					className={cn(
						'pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-xs tabular-nums transition-opacity group-hover:opacity-0',
						checked && 'opacity-0',
					)}
				>
					{rowNumber}
				</div>
				<Checkbox
					id={id}
					className={cn(
						'relative transition-[shadow,border,opacity] hover:border-primary/40',
						'opacity-0 group-hover:opacity-100 data-checked:opacity-100',
						className,
					)}
					checked={checked}
					{...props}
				/>
			</DataGridSelectHitbox>
		)
	}

	return (
		<DataGridSelectHitbox
			htmlFor={id}
			size={hitboxSize}
			debug={debug}
			onHitboxClick={onHitboxClick}
		>
			<Checkbox
				id={id}
				className={cn(
					'relative transition-[shadow,border] hover:border-primary/40',
					className,
				)}
				checked={checked}
				{...props}
			/>
		</DataGridSelectHitbox>
	)
}

interface DataGridSelectHeaderProps<TData>
	extends Pick<HeaderContext<TData, unknown>, 'table'> {
	hitboxSize?: HitboxSize
	readOnly?: boolean
	debug?: boolean
}

function DataGridSelectHeader<TData>({
	table,
	hitboxSize,
	readOnly,
	debug,
}: DataGridSelectHeaderProps<TData>) {
	const { store } = useDataGridState()
	const rowSelection = useStore(store, (state) => state.rowSelection)

	const pageRows = table.getRowModel().rows
	const selectedPageRowCount = React.useMemo(
		() => pageRows.filter((row) => rowSelection[row.id]).length,
		[pageRows, rowSelection],
	)
	const isAllPageRowsSelected =
		pageRows.length > 0 && selectedPageRowCount === pageRows.length
	const isSomePageRowsSelected =
		selectedPageRowCount > 0 && !isAllPageRowsSelected

	const onCheckedChange = React.useCallback(
		(value: boolean) => table.toggleAllPageRowsSelected(value),
		[table],
	)

	if (readOnly) {
		return (
			<div className='flex size-full items-center justify-center text-muted-foreground text-xs'>
				#
			</div>
		)
	}

	return (
		<DataGridSelectCheckbox
			aria-label='Select all'
			checked={isAllPageRowsSelected}
			indeterminate={isSomePageRowsSelected}
			onCheckedChange={onCheckedChange}
			hitboxSize={hitboxSize}
			debug={debug}
		/>
	)
}

interface DataGridSelectCellProps<TData>
	extends Pick<CellContext<TData, unknown>, 'row'> {
	hitboxSize?: HitboxSize
	enableRowMarkers?: boolean
	readOnly?: boolean
	debug?: boolean
}

function DataGridSelectCell<TData>({
	row,
	hitboxSize,
	enableRowMarkers,
	readOnly,
	debug,
}: DataGridSelectCellProps<TData>) {
	const actions = useDataGridActions()
	const selectors = useDataGridSelectors()
	const rowNumber = enableRowMarkers
		? (selectors.getVisualRowIndex(row.id) ?? row.index + 1)
		: undefined

	const onCheckedChange = React.useCallback(
		(value: boolean) => {
			actions.onRowSelect(row.index, value, false, row.id)
		},
		[actions, row],
	)

	const onClick = React.useCallback<
		NonNullable<React.ComponentProps<typeof Checkbox>['onClick']>
	>(
		(event) => {
			if (event.shiftKey) {
				event.preventDefault()
				actions.onRowSelect(row.index, !row.getIsSelected(), true, row.id)
			}
		},
		[actions, row],
	)

	const onHitboxClick = React.useCallback(
		(event: React.MouseEvent<HTMLLabelElement>) => {
			if (event.shiftKey) {
				event.preventDefault()
				actions.onRowSelect(row.index, !row.getIsSelected(), true, row.id)
			}
		},
		[actions, row],
	)

	if (readOnly) {
		return (
			<div className='flex size-full items-center justify-center text-muted-foreground text-xs tabular-nums'>
				{rowNumber ?? row.index + 1}
			</div>
		)
	}

	return (
		<DataGridSelectCheckbox
			aria-label={rowNumber ? `Select row ${rowNumber}` : 'Select row'}
			checked={row.getIsSelected()}
			onCheckedChange={onCheckedChange}
			onClick={onClick}
			onHitboxClick={onHitboxClick}
			rowNumber={rowNumber}
			hitboxSize={hitboxSize}
			debug={debug}
		/>
	)
}

interface GetDataGridSelectColumnOptions<TData>
	extends Omit<Partial<ColumnDef<TData>>, 'id' | 'header' | 'cell'> {
	enableRowMarkers?: boolean
	readOnly?: boolean
	hitboxSize?: HitboxSize
	debug?: boolean
}

export function getDataGridSelectColumn<TData>({
	size,
	hitboxSize = 'default',
	enableHiding = false,
	enableResizing = false,
	enableSorting = false,
	enableRowMarkers = false,
	readOnly = false,
	debug = false,
	...props
}: GetDataGridSelectColumnOptions<TData> = {}): ColumnDef<TData> {
	const resolvedSize = size ?? (enableRowMarkers ? 40 : 32)

	return {
		id: 'select',
		meta: {
			customCell: true,
			...props.meta,
		},
		header: ({ table }) => (
			<DataGridSelectHeader
				table={table}
				hitboxSize={hitboxSize}
				readOnly={readOnly}
				debug={debug}
			/>
		),
		cell: ({ row }) => (
			<DataGridSelectCell
				row={row}
				enableRowMarkers={enableRowMarkers}
				readOnly={readOnly}
				hitboxSize={hitboxSize}
				debug={debug}
			/>
		),
		size: resolvedSize,
		minSize: resolvedSize,
		maxSize: enableResizing ? undefined : resolvedSize,
		enableHiding,
		enableResizing,
		enableSorting,
		...props,
	}
}

'use client'

import { useDirection } from '@base-ui/react/direction-provider'
import { useHotkey } from '@tanstack/react-hotkeys'
import type { Column, ColumnFilter, Table } from '@tanstack/react-table'
import { cn } from 'cnfast'
import {
	CalendarIcon,
	Check,
	ChevronsUpDown,
	GripVertical,
	ListFilter,
	Trash2,
} from 'lucide-react'
import * as React from 'react'

import { useFilterMenuRequestBus } from './contexts/data-grid-actions-context'
import { safeParseFilterValue } from './lib/data-grid-filter-schema'
import {
	getDefaultOperator,
	getOperatorsForVariant,
} from './lib/data-grid-filters'
import { formatDate } from './lib/format'
import type { FilterOperator } from './types/data-grid'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from './ui/command'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import {
	Sortable,
	SortableContent,
	SortableItem,
	SortableItemHandle,
	SortableOverlay,
} from './ui/sortable'

const REMOVE_FILTER_SHORTCUTS = ['backspace', 'delete']
const OPERATORS_WITHOUT_VALUE = ['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse']
const FILTER_FOCUS_RETRY_LIMIT = 8

function escapeSelectorValue(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

interface DataGridFilterMenuProps<TData>
	extends React.ComponentProps<typeof PopoverContent> {
	table: Table<TData>
	disabled?: boolean
}

export function DataGridFilterMenu<TData>({
	table,
	disabled,
	className,
	...props
}: DataGridFilterMenuProps<TData>) {
	const dir = useDirection()
	const id = React.useId()
	const labelId = React.useId()
	const descriptionId = React.useId()
	const [open, setOpen] = React.useState(false)
	const [requestedColumnId, setRequestedColumnId] = React.useState<
		string | null
	>(null)
	const addButtonRef = React.useRef<HTMLButtonElement>(null)
	const popoverContentRef = React.useRef<HTMLDivElement>(null)

	const columnFilters = table.getState().columnFilters
	const filterMenuRequestBus = useFilterMenuRequestBus()

	const { columnLabels, columns, columnVariants } = React.useMemo(() => {
		const labels = new Map<string, string>()
		const variants = new Map<string, string>()
		const filteringIds = new Set(columnFilters.map((f) => f.id))
		const availableColumns: { id: string; label: string }[] = []

		for (const column of table.getAllColumns()) {
			if (!column.getCanFilter()) continue

			const label = column.columnDef.meta?.label ?? column.id
			const variant = column.columnDef.meta?.cell?.variant ?? 'short-text'

			labels.set(column.id, label)
			variants.set(column.id, variant)

			if (!filteringIds.has(column.id)) {
				availableColumns.push({ id: column.id, label })
			}
		}

		return {
			columnLabels: labels,
			columns: availableColumns,
			columnVariants: variants,
		}
	}, [columnFilters, table])

	const onFilterAdd = React.useCallback(() => {
		const firstColumn = columns[0]
		if (!firstColumn) return

		const variant = columnVariants.get(firstColumn.id) ?? 'short-text'
		const defaultOperator = getDefaultOperator(variant)

		table.setColumnFilters((prevFilters) => [
			...prevFilters,
			{
				id: firstColumn.id,
				value: {
					operator: defaultOperator,
					value: '',
				},
			},
		])
	}, [columns, columnVariants, table])

	const onFilterUpdate = React.useCallback(
		(
			filterId: string,
			updates: Partial<ColumnFilter> | ((filter: ColumnFilter) => ColumnFilter),
		) => {
			table.setColumnFilters((prevFilters) => {
				if (!prevFilters) return prevFilters
				return prevFilters.map((filter) =>
					filter.id === filterId
						? typeof updates === 'function'
							? updates(filter)
							: { ...filter, ...updates }
						: filter,
				)
			})
		},
		[table],
	)

	const onFilterRemove = React.useCallback(
		(filterId: string) => {
			table.setColumnFilters((prevFilters) =>
				prevFilters.filter((item: ColumnFilter) => item.id !== filterId),
			)
		},
		[table],
	)

	const onFiltersReset = React.useCallback(() => {
		table.setColumnFilters(table.initialState.columnFilters ?? [])
	}, [table])

	const onFilterMenuRequest = React.useCallback((columnId: string) => {
		setOpen(true)
		setRequestedColumnId(columnId)
	}, [])

	React.useEffect(() => {
		if (!filterMenuRequestBus) return
		return filterMenuRequestBus.subscribe(onFilterMenuRequest)
	}, [filterMenuRequestBus, onFilterMenuRequest])

	React.useEffect(() => {
		if (!open || !requestedColumnId) return

		let rafId = 0
		let attempts = 0

		const focusRequestedColumn = () => {
			const escapedColumnId = escapeSelectorValue(requestedColumnId)
			const rowSelector = `[data-filter-column-id="${escapedColumnId}"]`
			const rowElement =
				popoverContentRef.current?.querySelector<HTMLElement>(rowSelector)

			const valueControl = rowElement?.querySelector<HTMLElement>(
				'[data-filter-value-input]',
			)
			const fallbackControl = rowElement?.querySelector<HTMLElement>(
				'input,button,[role="combobox"],[tabindex]:not([tabindex="-1"])',
			)

			const focusTarget = valueControl ?? fallbackControl
			if (focusTarget) {
				focusTarget.focus()
				setRequestedColumnId(null)
				return
			}

			attempts += 1
			if (attempts < FILTER_FOCUS_RETRY_LIMIT) {
				rafId = requestAnimationFrame(focusRequestedColumn)
			}
		}

		rafId = requestAnimationFrame(focusRequestedColumn)

		return () => {
			cancelAnimationFrame(rafId)
		}
	}, [open, requestedColumnId, columnFilters])

	// Mod+Shift+F toggle migrated to @tanstack/react-hotkeys (Unit 8b).
	// `ignoreInputs: true` keeps native focus behavior in form fields.
	useHotkey(
		'Mod+Shift+F',
		() => {
			setOpen((prev) => !prev)
		},
		{
			ignoreInputs: true,
			preventDefault: true,
			meta: {
				name: 'Toggle filter menu',
				description: 'Toggle the filter menu',
				group: 'Search',
			},
		},
	)

	const onTriggerKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			if (
				REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase()) &&
				columnFilters.length > 0
			) {
				event.preventDefault()
				onFiltersReset()
			}
		},
		[columnFilters.length, onFiltersReset],
	)

	const onOpenChange = React.useCallback((nextOpen: boolean) => {
		setOpen(nextOpen)
		if (!nextOpen) {
			setRequestedColumnId(null)
		}
	}, [])

	return (
		<Sortable
			value={columnFilters}
			onValueChange={table.setColumnFilters}
			getItemValue={(item: ColumnFilter) => item.id}
		>
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger
					className='h-7 py-0'
					render={
						<Button
							dir={dir}
							variant='outline'
							size='sm'
							className='font-normal'
							onKeyDown={onTriggerKeyDown}
							disabled={disabled}
						>
							<ListFilter className='text-muted-foreground' />
							Filter
							{columnFilters.length > 0 && (
								<Badge
									variant='secondary'
									className='h-[18.24px] rounded-[3.2px] px-[5.12px] font-mono font-normal text-[10.4px]'
								>
									{columnFilters.length}
								</Badge>
							)}
						</Button>
					}
				/>
				<PopoverContent
					ref={popoverContentRef}
					aria-labelledby={labelId}
					aria-describedby={descriptionId}
					dir={dir}
					className={cn(
						'flex w-full max-w-(--available-width) flex-col gap-3.5 p-4 sm:min-w-120',
						className,
					)}
					{...props}
				>
					<div className='flex flex-col gap-1'>
						<h4 id={labelId} className='font-medium leading-none'>
							{columnFilters.length > 0 ? 'Filter by' : 'No filters applied'}
						</h4>
						<p
							id={descriptionId}
							className={cn(
								'text-muted-foreground text-sm',
								columnFilters.length > 0 && 'sr-only',
							)}
						>
							{columnFilters.length > 0
								? 'Modify filters to narrow down your data.'
								: 'Add filters to narrow down your data.'}
						</p>
					</div>
					{columnFilters.length > 0 && (
						<SortableContent asChild>
							<div
								role='list'
								className='flex max-h-[400px] flex-col gap-2 overflow-y-auto p-1'
							>
								{columnFilters.map((filter, index) => (
									<DataGridFilterItem
										key={filter.id}
										filter={filter}
										index={index}
										filterItemId={`${id}-filter-${filter.id}`}
										dir={dir}
										columns={columns}
										columnLabels={columnLabels}
										columnVariants={columnVariants}
										table={table}
										onFilterUpdate={onFilterUpdate}
										onFilterRemove={onFilterRemove}
									/>
								))}
							</div>
						</SortableContent>
					)}
					<div className='flex w-full items-center gap-2'>
						<Button
							size='sm'
							className='rounded'
							ref={addButtonRef}
							onClick={onFilterAdd}
							disabled={columns.length === 0}
						>
							Add filter
						</Button>
						{columnFilters.length > 0 && (
							<Button
								variant='outline'
								size='sm'
								className='rounded'
								onClick={onFiltersReset}
							>
								Reset filters
							</Button>
						)}
					</div>
				</PopoverContent>
			</Popover>
			<SortableOverlay>
				<div dir={dir} className='flex items-center gap-2'>
					<div className='h-8 min-w-[72px] rounded-sm bg-primary/10' />
					<div className='h-8 w-32 rounded-sm bg-primary/10' />
					<div className='h-8 w-32 rounded-sm bg-primary/10' />
					<div className='h-8 w-36 rounded-sm bg-primary/10' />
					<div className='size-8 shrink-0 rounded-sm bg-primary/10' />
					<div className='size-8 shrink-0 rounded-sm bg-primary/10' />
				</div>
			</SortableOverlay>
		</Sortable>
	)
}

interface DataGridFilterItemProps<TData> {
	filter: ColumnFilter
	index: number
	filterItemId: string
	dir: 'ltr' | 'rtl'
	columns: { id: string; label: string }[]
	columnLabels: Map<string, string>
	columnVariants: Map<string, string>
	table: Table<TData>
	onFilterUpdate: (
		filterId: string,
		updates: Partial<ColumnFilter> | ((filter: ColumnFilter) => ColumnFilter),
	) => void
	onFilterRemove: (filterId: string) => void
}

function DataGridFilterItem<TData>({
	filter,
	index,
	filterItemId,
	dir,
	columns,
	columnLabels,
	columnVariants,
	table,
	onFilterUpdate,
	onFilterRemove,
}: DataGridFilterItemProps<TData>) {
	const fieldListboxId = `${filterItemId}-field-listbox`
	const fieldTriggerId = `${filterItemId}-field-trigger`
	const operatorListboxId = `${filterItemId}-operator-listbox`
	const inputId = `${filterItemId}-input`

	const [showFieldSelector, setShowFieldSelector] = React.useState(false)
	const [showOperatorSelector, setShowOperatorSelector] = React.useState(false)

	const variant = columnVariants.get(filter.id) ?? 'short-text'
	const filterValue =
		filter.value === undefined
			? undefined
			: (safeParseFilterValue(filter.value) ?? undefined)
	const operator = filterValue?.operator ?? getDefaultOperator(variant)

	const operators = getOperatorsForVariant(variant)
	const needsValue = !OPERATORS_WITHOUT_VALUE.includes(operator)

	const column = table.getColumn(filter.id)

	const onItemKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement
			) {
				return
			}

			if (showFieldSelector || showOperatorSelector) {
				return
			}

			if (REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase())) {
				event.preventDefault()
				onFilterRemove(filter.id)
			}
		},
		[filter.id, showFieldSelector, showOperatorSelector, onFilterRemove],
	)

	const onOperatorChange = React.useCallback(
		(newOperator: FilterOperator | null) => {
			if (!newOperator) return
			onFilterUpdate(filter.id, (currentFilter) => {
				const currentValue =
					currentFilter.value === undefined
						? undefined
						: (safeParseFilterValue(currentFilter.value) ?? undefined)

				return {
					...currentFilter,
					value: {
						operator: newOperator,
						value: currentValue?.value,
						endValue: currentValue?.endValue,
					},
				}
			})
		},
		[filter.id, onFilterUpdate],
	)

	const onValueChange = React.useCallback(
		(newValue: string | number | string[] | undefined) => {
			onFilterUpdate(filter.id, (currentFilter) => {
				const currentValue =
					currentFilter.value === undefined
						? undefined
						: (safeParseFilterValue(currentFilter.value) ?? undefined)

				return {
					...currentFilter,
					value: {
						operator,
						value: newValue,
						endValue: currentValue?.endValue,
					},
				}
			})
		},
		[filter.id, operator, onFilterUpdate],
	)

	const onEndValueChange = React.useCallback(
		(newValue: string | number | string[] | undefined) => {
			onFilterUpdate(filter.id, (currentFilter) => {
				const currentValue =
					currentFilter.value === undefined
						? undefined
						: (safeParseFilterValue(currentFilter.value) ?? undefined)

				return {
					...currentFilter,
					value: {
						operator,
						value: currentValue?.value,
						endValue: newValue as string | number | undefined,
					},
				}
			})
		},
		[filter.id, operator, onFilterUpdate],
	)

	const onRangeChange = React.useCallback(
		(next: {
			value?: string | number | string[]
			endValue?: string | number
		}) => {
			onFilterUpdate(filter.id, (currentFilter) => ({
				...currentFilter,
				value: {
					operator,
					value: next.value,
					endValue: next.endValue,
				},
			}))
		},
		[filter.id, operator, onFilterUpdate],
	)

	return (
		<SortableItem value={filter.id} asChild>
			<div
				role='listitem'
				id={filterItemId}
				data-filter-column-id={filter.id}
				tabIndex={-1}
				className='flex items-center gap-2'
				onKeyDown={onItemKeyDown}
			>
				<div className='min-w-[72px] text-center'>
					{index === 0 ? (
						<span className='text-muted-foreground text-sm'>Where</span>
					) : (
						<span className='text-muted-foreground text-sm'>And</span>
					)}
				</div>
				<Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
					<PopoverTrigger
						className='py-0'
						render={
							<Button
								id={fieldTriggerId}
								aria-controls={fieldListboxId}
								dir={dir}
								variant='outline'
								size='sm'
								className='w-32 justify-between rounded font-normal'
							>
								<span className='truncate'>{columnLabels.get(filter.id)}</span>
								<ChevronsUpDown className='opacity-50' />
							</Button>
						}
					/>
					<PopoverContent
						id={fieldListboxId}
						dir={dir}
						align='start'
						className='w-40 p-0'
					>
						<Command>
							<CommandInput placeholder='Search fields...' />
							<CommandList>
								<CommandEmpty>No fields found.</CommandEmpty>
								<CommandGroup>
									{columns.map((column) => (
										<CommandItem
											key={column.id}
											value={column.id}
											onSelect={(value) => {
												const newVariant =
													columnVariants.get(value) ?? 'short-text'
												const newOperator = getDefaultOperator(newVariant)

												table.setColumnFilters((prevFilters) =>
													prevFilters.map((f) =>
														f.id === filter.id
															? {
																	id: value,
																	value: {
																		operator: newOperator,
																		value: '',
																	},
																}
															: f,
													),
												)
												setShowFieldSelector(false)
											}}
										>
											<span className='truncate'>{column.label}</span>
											<Check
												className={cn(
													'ms-auto',
													column.id === filter.id ? 'opacity-100' : 'opacity-0',
												)}
											/>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				<Select
					open={showOperatorSelector}
					onOpenChange={setShowOperatorSelector}
					value={operator}
					onValueChange={(value, _details) =>
						onOperatorChange(value as FilterOperator | null)
					}
				>
					<SelectTrigger
						aria-controls={operatorListboxId}
						size='sm'
						className='w-32 rounded lowercase'
					>
						<div className='truncate'>
							<SelectValue />
						</div>
					</SelectTrigger>
					<SelectContent id={operatorListboxId}>
						{operators.map((op) => (
							<SelectItem key={op.value} value={op.value} className='lowercase'>
								{op.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className='min-w-36 max-w-60 flex-1'>
					{needsValue && column ? (
						<DataGridFilterInput
							key={filter.id}
							variant={variant}
							operator={operator}
							column={column}
							inputId={inputId}
							dir={dir}
							value={filterValue?.value}
							endValue={filterValue?.endValue}
							onValueChange={onValueChange}
							onEndValueChange={onEndValueChange}
							onRangeChange={onRangeChange}
						/>
					) : (
						<div
							id={inputId}
							role='status'
							aria-label={`${columnLabels.get(filter.id)} filter is empty`}
							aria-live='polite'
							className='h-8 w-full rounded border bg-transparent dark:bg-input/30'
						/>
					)}
				</div>
				<Button
					aria-controls={filterItemId}
					variant='outline'
					size='icon'
					className='size-8 rounded'
					onClick={() => onFilterRemove(filter.id)}
				>
					<Trash2 />
				</Button>
				<SortableItemHandle asChild>
					<Button variant='outline' size='icon' className='size-8 rounded'>
						<GripVertical />
					</Button>
				</SortableItemHandle>
			</div>
		</SortableItem>
	)
}

interface DataGridFilterInputProps<TData> {
	variant: string
	operator: FilterOperator
	dir: 'ltr' | 'rtl'
	placeholder?: string
	value: string | number | string[] | undefined
	endValue?: string | number
	column: Column<TData>
	inputId: string
	onValueChange: (value: string | number | string[] | undefined) => void
	onEndValueChange?: (value: string | number | string[] | undefined) => void
	onRangeChange?: (next: {
		value?: string | number | string[]
		endValue?: string | number
	}) => void
}

function DataGridFilterInput<TData>({
	variant,
	operator,
	dir,
	placeholder = 'Value',
	value,
	endValue,
	column,
	inputId,
	onValueChange,
	onEndValueChange,
	onRangeChange,
}: DataGridFilterInputProps<TData>) {
	const [showValueSelector, setShowValueSelector] = React.useState(false)

	const cellVariant = column.columnDef.meta?.cell

	const selectOptions = React.useMemo(() => {
		return cellVariant?.variant === 'select' ||
			cellVariant?.variant === 'multi-select'
			? cellVariant.options
			: []
	}, [cellVariant])

	const isBetween = operator === 'isBetween'

	if (variant === 'number') {
		if (isBetween) {
			return (
				<div className='flex gap-2'>
					<Input
						id={inputId}
						data-filter-value-input=''
						type='number'
						inputMode='numeric'
						placeholder='Start'
						value={(value as number | undefined) ?? ''}
						onChange={(event) => {
							const val = event.target.value
							const newValue = val === '' ? undefined : Number(val)
							onValueChange(newValue)
						}}
						className='h-8 w-full flex-1 rounded'
					/>
					<Input
						id={`${inputId}-end`}
						type='number'
						inputMode='numeric'
						placeholder='End'
						value={(endValue as number | undefined) ?? ''}
						onChange={(event) => {
							const val = event.target.value
							const newValue = val === '' ? undefined : Number(val)
							onEndValueChange?.(newValue)
						}}
						className='h-8 w-full flex-1 rounded'
					/>
				</div>
			)
		}

		return (
			<Input
				id={inputId}
				data-filter-value-input=''
				type='number'
				inputMode='numeric'
				placeholder={placeholder}
				value={(value as number | undefined) ?? ''}
				onChange={(event) => {
					const val = event.target.value
					const newValue = val === '' ? undefined : Number(val)
					onValueChange(newValue)
				}}
				className='h-8 w-full rounded'
			/>
		)
	}

	if (variant === 'date') {
		const inputListboxId = `${inputId}-listbox`

		if (isBetween) {
			const startDate =
				value && typeof value === 'string' ? new Date(value) : undefined
			const endDate =
				endValue && typeof endValue === 'string'
					? new Date(endValue)
					: undefined

			const isSameDate =
				startDate &&
				endDate &&
				startDate.toDateString() === endDate.toDateString()

			let displayValue = 'Pick a range'

			if (startDate && endDate && !isSameDate) {
				displayValue = `${formatDate(startDate, { month: 'short' })} - ${formatDate(endDate, { month: 'short' })}`
			} else if (startDate && endDate) {
				displayValue = formatDate(startDate, { month: 'short' })
			} else if (startDate) {
				displayValue = `${formatDate(startDate, { month: 'short' })} - ...`
			} else if (endDate) {
				displayValue = `... - ${formatDate(endDate, { month: 'short' })}`
			}

			return (
				<Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
					<PopoverTrigger
						className='py-0'
						render={
							<Button
								id={inputId}
								data-filter-value-input=''
								aria-controls={inputListboxId}
								dir={dir}
								variant='outline'
								size='sm'
								className={cn(
									'h-8 w-full justify-start rounded font-normal',
									!startDate && 'text-muted-foreground',
								)}
							>
								<CalendarIcon />
								<span className='truncate'>{displayValue}</span>
							</Button>
						}
					/>
					<PopoverContent
						id={inputListboxId}
						dir={dir}
						align='start'
						className='w-auto p-0'
					>
						<Calendar
							autoFocus
							captionLayout='dropdown'
							mode='range'
							selected={
								startDate ? { from: startDate, to: endDate } : undefined
							}
							onSelect={(range) => {
								const fromValue = range?.from
									? range.from.toISOString()
									: undefined
								const toValue = range?.to ? range.to.toISOString() : undefined
								onRangeChange?.({
									value: fromValue,
									endValue: toValue,
								})
							}}
						/>
					</PopoverContent>
				</Popover>
			)
		}

		const dateValue =
			value && typeof value === 'string' ? new Date(value) : undefined

		return (
			<Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
				<PopoverTrigger
					className='py-0'
					render={
						<Button
							id={inputId}
							data-filter-value-input=''
							aria-controls={inputListboxId}
							dir={dir}
							variant='outline'
							size='sm'
							className={cn(
								'h-8 w-full justify-start rounded font-normal',
								!dateValue && 'text-muted-foreground',
							)}
						>
							<CalendarIcon />
							<span className='truncate'>
								{dateValue
									? formatDate(dateValue, { month: 'short' })
									: 'Pick a date'}
							</span>
						</Button>
					}
				/>
				<PopoverContent
					id={inputListboxId}
					dir={dir}
					align='start'
					className='w-auto p-0'
				>
					<Calendar
						autoFocus
						captionLayout='dropdown'
						mode='single'
						selected={dateValue}
						onSelect={(date) => {
							const newValue = date ? date.toISOString() : undefined
							onValueChange(newValue)
							setShowValueSelector(false)
						}}
					/>
				</PopoverContent>
			</Popover>
		)
	}

	const isSelectVariant = variant === 'select' || variant === 'multi-select'
	const isMultiValueOperator = operator === 'isAnyOf' || operator === 'isNoneOf'

	if (isSelectVariant && selectOptions.length > 0) {
		const inputListboxId = `${inputId}-listbox`

		if (isMultiValueOperator) {
			const selectedValues = Array.isArray(value) ? value : []
			const selectedOptions = selectOptions.filter((option) =>
				selectedValues.includes(option.value),
			)

			const selectedOptionsWithIcons = selectedOptions.filter(
				(selectedOption) => selectedOption.icon,
			)

			return (
				<Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
					<PopoverTrigger
						className='py-0'
						render={
							<Button
								id={inputId}
								data-filter-value-input=''
								aria-controls={inputListboxId}
								dir={dir}
								variant='outline'
								size='sm'
								className='h-8 w-full justify-start rounded font-normal'
							>
								{selectedOptions.length === 0 ? (
									<span className='text-muted-foreground'>{placeholder}</span>
								) : (
									<>
										{selectedOptionsWithIcons.length > 0 && (
											<div className='flex items-center -space-x-2 rtl:space-x-reverse'>
												{selectedOptionsWithIcons.map(
													(selectedOption) =>
														selectedOption.icon && (
															<div
																key={selectedOption.value}
																className='rounded-full border bg-background p-0.5'
															>
																<selectedOption.icon className='size-3.5' />
															</div>
														),
												)}
											</div>
										)}
										<span className='truncate'>
											{selectedOptions.length > 1
												? `${selectedOptions.length} selected`
												: selectedOptions[0]?.label}
										</span>
									</>
								)}
							</Button>
						}
					/>
					<PopoverContent
						id={inputListboxId}
						dir={dir}
						align='start'
						className='w-48 p-0'
					>
						<Command>
							<CommandInput placeholder='Search options...' />
							<CommandList>
								<CommandEmpty>No options found.</CommandEmpty>
								<CommandGroup>
									{selectOptions.map((option) => {
										const isSelected = selectedValues.includes(option.value)
										return (
											<CommandItem
												key={option.value}
												value={option.value}
												onSelect={() => {
													const newValues = isSelected
														? selectedValues.filter((v) => v !== option.value)
														: [...selectedValues, option.value]
													onValueChange(
														newValues.length > 0 ? newValues : undefined,
													)
												}}
											>
												{option.icon && <option.icon />}
												<span className='truncate'>{option.label}</span>
												{option.count && (
													<span className='ms-auto font-mono text-xs'>
														{option.count}
													</span>
												)}
												<Check
													className={cn(
														'ms-auto',
														isSelected ? 'opacity-100' : 'opacity-0',
													)}
												/>
											</CommandItem>
										)
									})}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)
		}

		const selectedOption = selectOptions.find(
			(opt) => opt.value === (value as string),
		)

		return (
			<Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
				<PopoverTrigger
					className='py-0'
					render={
						<Button
							id={inputId}
							data-filter-value-input=''
							aria-controls={inputListboxId}
							dir={dir}
							variant='outline'
							size='sm'
							className='h-8 w-full justify-start rounded font-normal'
						>
							{selectedOption ? (
								<>
									{selectedOption.icon && <selectedOption.icon />}
									<span className='truncate'>{selectedOption.label}</span>
								</>
							) : (
								<span className='text-muted-foreground'>{placeholder}</span>
							)}
						</Button>
					}
				/>
				<PopoverContent
					id={inputListboxId}
					dir={dir}
					align='start'
					className='w-[200px] p-0'
				>
					<Command>
						<CommandInput placeholder='Search options...' />
						<CommandList>
							<CommandEmpty>No options found.</CommandEmpty>
							<CommandGroup>
								{selectOptions.map((option) => (
									<CommandItem
										key={option.value}
										value={option.value}
										onSelect={() => {
											onValueChange(option.value)
											setShowValueSelector(false)
										}}
									>
										{option.icon && <option.icon />}
										<span className='truncate'>{option.label}</span>
										{option.count && (
											<span className='ms-auto font-mono text-xs'>
												{option.count}
											</span>
										)}
										<Check
											className={cn(
												'ms-auto',
												value === option.value ? 'opacity-100' : 'opacity-0',
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		)
	}

	if (isBetween) {
		return (
			<div className='flex gap-2'>
				<Input
					id={inputId}
					data-filter-value-input=''
					type='text'
					placeholder='Start'
					className='h-8 w-full flex-1 rounded'
					value={(value as string | undefined) ?? ''}
					onChange={(event) => {
						const val = event.target.value
						const newValue = val === '' ? undefined : val
						onValueChange(newValue)
					}}
				/>
				<Input
					id={`${inputId}-end`}
					type='text'
					placeholder='End'
					className='h-8 w-full flex-1 rounded'
					value={(endValue as string | undefined) ?? ''}
					onChange={(event) => {
						const val = event.target.value
						const newValue = val === '' ? undefined : val
						onEndValueChange?.(newValue)
					}}
				/>
			</div>
		)
	}

	return (
		<Input
			id={inputId}
			data-filter-value-input=''
			type='text'
			placeholder={placeholder}
			className='h-8 w-full rounded'
			value={(value as string | undefined) ?? ''}
			onChange={(event) => {
				const val = event.target.value
				const newValue = val === '' ? undefined : val
				onValueChange(newValue)
			}}
		/>
	)
}

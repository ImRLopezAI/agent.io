'use client'

import { cn } from 'cnfast'
import { Check, X } from 'lucide-react'
import * as React from 'react'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import { useBadgeOverflow } from '../hooks/use-badge-overflow'
import { getCellKey, getLineCount } from '../lib/data-grid'
import type { DataGridCellProps } from '../types/data-grid'
import { Badge } from '../ui/badge'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export function MultiSelectCell<TData>({
	cell,
	rowIndex,
	columnId,
	rowHeight,
	isFocused,
	isEditing,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	tableVariant,
}: DataGridCellProps<TData, 'multi-select'>) {
	const actions = useDataGridActions()
	const cellValue = React.useMemo(() => {
		const value = cell.getValue()
		return value ?? []
	}, [cell])

	const cellKey = getCellKey(rowIndex, columnId)
	const prevCellKeyRef = React.useRef(cellKey)

	const [selectedValues, setSelectedValues] =
		React.useState<string[]>(cellValue)
	const [searchValue, setSearchValue] = React.useState('')
	const containerRef = React.useRef<HTMLDivElement>(null)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const cellOpts = cell.column.columnDef.meta?.cell
	const options = cellOpts?.variant === 'multi-select' ? cellOpts.options : []
	const sideOffset = -(containerRef.current?.clientHeight ?? 0)

	const prevCellValueRef = React.useRef(cellValue)
	if (cellValue !== prevCellValueRef.current) {
		prevCellValueRef.current = cellValue
		setSelectedValues(cellValue)
	}

	if (prevCellKeyRef.current !== cellKey) {
		prevCellKeyRef.current = cellKey
		setSearchValue('')
	}

	const onValueChange = React.useCallback(
		(value: string) => {
			if (readOnly) return
			const newValues = selectedValues.includes(value)
				? selectedValues.filter((v) => v !== value)
				: [...selectedValues, value]

			setSelectedValues(newValues)
			actions.onDataUpdate({ rowIndex, columnId, value: newValues })
			setSearchValue('')
			queueMicrotask(() => inputRef.current?.focus())
		},
		[selectedValues, actions, rowIndex, columnId, readOnly],
	)

	const removeValue = React.useCallback(
		(valueToRemove: string, event?: React.MouseEvent) => {
			if (readOnly) return
			event?.stopPropagation()
			event?.preventDefault()
			const newValues = selectedValues.filter((v) => v !== valueToRemove)
			setSelectedValues(newValues)
			actions.onDataUpdate({ rowIndex, columnId, value: newValues })
			// Focus back on input after removing
			setTimeout(() => inputRef.current?.focus(), 0)
		},
		[selectedValues, actions, rowIndex, columnId, readOnly],
	)

	const clearAll = React.useCallback(() => {
		if (readOnly) return
		setSelectedValues([])
		actions.onDataUpdate({ rowIndex, columnId, value: [] })
		queueMicrotask(() => inputRef.current?.focus())
	}, [actions, rowIndex, columnId, readOnly])

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			if (open && !readOnly) {
				actions.onCellEditingStart(rowIndex, columnId)
			} else {
				setSearchValue('')
				actions.onCellEditingStop()
			}
		},
		[actions, rowIndex, columnId, readOnly],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (isEditing && event.key === 'Escape') {
				event.preventDefault()
				setSelectedValues(cellValue)
				setSearchValue('')
				actions.onCellEditingStop()
			} else if (isFocused && event.key === 'Tab') {
				event.preventDefault()
				setSearchValue('')
				actions.onCellEditingStop({
					direction: event.shiftKey ? 'left' : 'right',
				})
			}
		},
		[isEditing, isFocused, cellValue, actions],
	)

	const onInputKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			// Handle backspace when input is empty - remove last selected item
			if (
				event.key === 'Backspace' &&
				searchValue === '' &&
				selectedValues.length > 0
			) {
				event.preventDefault()
				const lastValue = selectedValues[selectedValues.length - 1]
				if (lastValue) {
					removeValue(lastValue)
				}
			}
			// Prevent escape from propagating to close the popover immediately
			// Let the command handle it first
			if (event.key === 'Escape') {
				event.stopPropagation()
			}
		},
		[searchValue, selectedValues, removeValue],
	)

	const displayLabels = selectedValues
		.map((val) => options.find((opt) => opt.value === val)?.label ?? val)
		.filter(Boolean)

	const lineCount = getLineCount(rowHeight)

	const { visibleItems: visibleLabels, hiddenCount: hiddenBadgeCount } =
		useBadgeOverflow({
			items: displayLabels,
			getLabel: (label) => label,
			containerRef,
			lineCount,
		})

	return (
		<DataGridCellWrapper<TData>
			ref={containerRef}
			cell={cell}
			rowIndex={rowIndex}
			columnId={columnId}
			rowHeight={rowHeight}
			tableVariant={tableVariant}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			isSearchMatch={isSearchMatch}
			isActiveSearchMatch={isActiveSearchMatch}
			readOnly={readOnly}
			onKeyDown={onWrapperKeyDown}
		>
			{isEditing ? (
				<Popover open={isEditing} onOpenChange={onOpenChange}>
					<PopoverTrigger
						className='py-0'
						nativeButton={false}
						render={<div className='absolute inset-0' />}
					/>
					<PopoverContent
						data-grid-cell-editor=''
						align='start'
						sideOffset={sideOffset}
						className='w-[300px] rounded-none p-0'
						initialFocus={inputRef}
					>
						<Command className='**:data-[slot=command-input-wrapper]:h-auto **:data-[slot=command-input-wrapper]:border-none **:data-[slot=command-input-wrapper]:p-0 [&_[data-slot=command-input-wrapper]_svg]:hidden'>
							<div className='flex min-h-9 flex-wrap items-center gap-1 border-b px-3 py-1.5'>
								{selectedValues.map((value) => {
									const option = options.find((opt) => opt.value === value)
									const label = option?.label ?? value

									return (
										<Badge
											key={value}
											variant='secondary'
											className='gap-1 px-1.5 py-px'
										>
											{label}
											<button
												type='button'
												onClick={(event) => removeValue(value, event)}
												onPointerDown={(event) => {
													event.preventDefault()
													event.stopPropagation()
												}}
											>
												<X className='size-3' />
											</button>
										</Badge>
									)
								})}
								<CommandInput
									ref={inputRef}
									value={searchValue}
									onValueChange={setSearchValue}
									onKeyDown={onInputKeyDown}
									placeholder='Search...'
									className='h-auto flex-1 p-0'
								/>
							</div>
							<CommandList className='max-h-full'>
								<CommandEmpty>No options found.</CommandEmpty>
								<CommandGroup className='max-h-[300px] scroll-py-1 overflow-y-auto overflow-x-hidden'>
									{options.map((option) => {
										const isSelected = selectedValues.includes(option.value)

										return (
											<CommandItem
												key={option.value}
												value={option.label}
												onSelect={() => onValueChange(option.value)}
											>
												<div
													className={cn(
														'flex size-4 items-center justify-center rounded-sm border border-primary',
														isSelected
															? 'bg-primary text-primary-foreground'
															: 'opacity-50 [&_svg]:invisible',
													)}
												>
													<Check className='size-3' />
												</div>
												<span>{option.label}</span>
											</CommandItem>
										)
									})}
								</CommandGroup>
								{selectedValues.length > 0 && (
									<>
										<CommandSeparator />
										<CommandGroup>
											<CommandItem
												onSelect={clearAll}
												className='justify-center text-muted-foreground'
											>
												Clear all
											</CommandItem>
										</CommandGroup>
									</>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			) : null}
			{displayLabels.length > 0 ? (
				<div className='flex flex-wrap items-center gap-1 overflow-hidden'>
					{visibleLabels.map((label, index) => (
						<Badge
							key={selectedValues[index]}
							variant='secondary'
							className='px-1.5 py-px'
						>
							{label}
						</Badge>
					))}
					{hiddenBadgeCount > 0 && (
						<Badge
							variant='outline'
							className='px-1.5 py-px text-muted-foreground'
						>
							+{hiddenBadgeCount}
						</Badge>
					)}
				</div>
			) : null}
		</DataGridCellWrapper>
	)
}

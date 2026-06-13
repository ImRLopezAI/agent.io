'use client'

import { useDirection } from '@base-ui/react/direction-provider'
import type { Column, Table } from '@tanstack/react-table'
import { Button } from './ui/button'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Check, PinIcon, PinOffIcon, Settings2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '#/lib/utils'

interface DataGridViewMenuProps<TData>
	extends React.ComponentProps<typeof PopoverContent> {
	table: Table<TData>
	disabled?: boolean
}

export function DataGridViewMenu<TData>({
	table,
	disabled,
	className,
	...props
}: DataGridViewMenuProps<TData>) {
	const dir = useDirection()

	const columns = React.useMemo(
		() =>
			table
				.getAllColumns()
				.filter(
					(column) =>
						typeof column.accessorFn !== 'undefined' && column.getCanHide(),
				),
		[table],
	)

	return (
		<Popover>
			<PopoverTrigger
				className='py-0'
				render={
					<Button
						aria-label='Toggle columns'
						role='combobox'
						dir={dir}
						variant='outline'
						size='sm'
						className='ms-auto hidden h-8 font-normal lg:flex'
						disabled={disabled}
					>
						<Settings2 className='text-muted-foreground' />
						View
					</Button>
				}
			/>
			<PopoverContent
				dir={dir}
				className={cn('w-60 p-0', className)}
				{...props}
			>
				<Command>
					<CommandInput placeholder='Search columns...' />
					<CommandList>
						<CommandEmpty>No columns found.</CommandEmpty>
						<CommandGroup>
							{columns.map((column) => (
								<DataGridViewMenuItem key={column.id} column={column} />
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

interface DataGridViewMenuItemProps<TData> {
	column: Column<TData, unknown>
}

function DataGridViewMenuItem<TData>({
	column,
}: DataGridViewMenuItemProps<TData>) {
	const canPin = column.getCanPin()
	const pinned = column.getIsPinned()

	const onToggleVisibility = React.useCallback(() => {
		column.toggleVisibility(!column.getIsVisible())
	}, [column])

	const onPinLeft = React.useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation()
			column.pin('left')
		},
		[column],
	)

	const onPinRight = React.useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation()
			column.pin('right')
		},
		[column],
	)

	const onUnpin = React.useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation()
			column.pin(false)
		},
		[column],
	)

	const label = column.columnDef.meta?.label ?? column.id

	return (
		<CommandItem onSelect={onToggleVisibility}>
			<span className='truncate'>{label}</span>
			<div className='ms-auto flex items-center gap-0.5'>
				{canPin && (
					<>
						{pinned === 'left' ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type='button'
											aria-label={`Unpin ${label}`}
											className='inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground'
											onClick={onUnpin}
										>
											<PinOffIcon className='size-3.5' />
										</button>
									}
								/>
								<TooltipContent>Unpin</TooltipContent>
							</Tooltip>
						) : (
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type='button'
											aria-label={`Pin ${label} to left`}
											className='inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground'
											onClick={onPinLeft}
										>
											<PinIcon className='size-3.5' />
										</button>
									}
								/>
								<TooltipContent>Pin left</TooltipContent>
							</Tooltip>
						)}
						{pinned === 'right' ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type='button'
											aria-label={`Unpin ${label}`}
											className='inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground'
											onClick={onUnpin}
										>
											<PinOffIcon className='size-3.5' />
										</button>
									}
								/>
								<TooltipContent>Unpin</TooltipContent>
							</Tooltip>
						) : (
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type='button'
											aria-label={`Pin ${label} to right`}
											className='inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground'
											onClick={onPinRight}
										>
											<PinIcon className='size-3.5 rotate-180' />
										</button>
									}
								/>
								<TooltipContent>Pin right</TooltipContent>
							</Tooltip>
						)}
					</>
				)}
				<Check
					className={cn(
						'size-4 shrink-0',
						column.getIsVisible() ? 'opacity-100' : 'opacity-0',
					)}
				/>
			</div>
		</CommandItem>
	)
}

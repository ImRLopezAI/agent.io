'use client'

import type { Table } from '@tanstack/react-table'
import { cn } from 'cnfast'
import { ChevronLeftIcon, ChevronRightIcon, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import * as React from 'react'

import { Button } from './ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import { Skeleton } from './ui/skeleton'

interface ManualPaginationOptions {
	onLoadMore: () => void | Promise<void>
	loadMoreLabel?: string
	hasMore?: boolean
}

interface DataGridPaginationProps<TData> {
	table: Table<TData>
	recordCount?: number
	isLoading?: boolean
	defaultPageSize?: number
	sizes?: number[]
	sizesInfo?: string
	sizesLabel?: string
	sizesDescription?: string
	sizesSkeleton?: React.ReactNode
	more?: boolean
	moreLimit?: number
	info?: string
	infoSkeleton?: React.ReactNode
	className?: string
	rowsPerPageLabel?: string
	previousPageLabel?: string
	nextPageLabel?: string
	ellipsisText?: string
	manual?: ManualPaginationOptions
}

function DataGridPagination<TData>({
	table,
	recordCount,
	isLoading = false,
	...props
}: DataGridPaginationProps<TData>) {
	const [isLoadingMore, setIsLoadingMore] = React.useState(false)
	const pendingNavigationRef = React.useRef(false)
	const prevRecordCountRef = React.useRef(recordCount ?? table.getRowCount())

	React.useEffect(() => {
		const currentRecordCount = recordCount ?? table.getRowCount()
		if (
			pendingNavigationRef.current &&
			currentRecordCount > prevRecordCountRef.current
		) {
			pendingNavigationRef.current = false
			if (table.getCanNextPage()) {
				table.nextPage()
			}
		}
		prevRecordCountRef.current = currentRecordCount
	}, [recordCount, table])

	const defaultProps: Partial<DataGridPaginationProps<TData>> = {
		defaultPageSize: 10,
		sizes: [5, 10, 25, 50, 100],
		sizesLabel: 'Show',
		sizesDescription: 'per page',
		sizesSkeleton: <Skeleton className='h-8 w-44' />,
		moreLimit: 5,
		more: false,
		info: '{from} - {to} of {count}',
		infoSkeleton: <Skeleton className='h-8 w-60' />,
		rowsPerPageLabel: 'Rows per page:',
		previousPageLabel: 'Go to previous page',
		nextPageLabel: 'Go to next page',
		ellipsisText: '...',
	}

	const mergedProps: DataGridPaginationProps<TData> = {
		...defaultProps,
		table,
		recordCount,
		isLoading,
		...props,
	}
	const { manual } = mergedProps
	const resolvedRecordCount = mergedProps.recordCount ?? table.getRowCount()

	const btnBaseClasses = 'size-7 p-0 text-sm pointer-coarse:size-9'
	const btnArrowClasses = `${btnBaseClasses} rtl:transform rtl:rotate-180`
	const pageIndex = table.getState().pagination.pageIndex
	const pageSize = table.getState().pagination.pageSize
	const from = resolvedRecordCount === 0 ? 0 : pageIndex * pageSize + 1
	const to = Math.min((pageIndex + 1) * pageSize, resolvedRecordCount)
	const pageCount = table.getPageCount()

	const handleLoadMore = React.useCallback(async () => {
		if (!manual?.onLoadMore || isLoadingMore) return
		setIsLoadingMore(true)
		try {
			await manual.onLoadMore()
		} finally {
			setIsLoadingMore(false)
		}
	}, [manual, isLoadingMore])

	const displayCount =
		manual && manual.hasMore !== false
			? `${resolvedRecordCount}+`
			: resolvedRecordCount.toString()
	const paginationInfo = mergedProps?.info
		? mergedProps.info
				.replace('{from}', from.toString())
				.replace('{to}', to.toString())
				.replace('{count}', displayCount)
		: `${from} - ${to} of ${displayCount}`

	const paginationMoreLimit = mergedProps?.moreLimit || 5
	const currentGroupStart =
		Math.floor(pageIndex / paginationMoreLimit) * paginationMoreLimit
	const currentGroupEnd = Math.min(
		currentGroupStart + paginationMoreLimit,
		pageCount,
	)

	const renderPageButtons = () => {
		const buttons = []
		for (let i = currentGroupStart; i < currentGroupEnd; i++) {
			buttons.push(
				<Button
					key={i}
					size='sm'
					variant='ghost'
					className={cn(btnBaseClasses, 'text-muted-foreground', {
						'bg-accent text-accent-foreground': pageIndex === i,
					})}
					onClick={() => {
						if (pageIndex !== i) {
							table.setPageIndex(i)
						}
					}}
				>
					{i + 1}
				</Button>,
			)
		}
		return buttons
	}

	const renderEllipsisPrevButton = () => {
		if (currentGroupStart > 0) {
			return (
				<Button
					size='sm'
					className={btnBaseClasses}
					variant='ghost'
					onClick={() => table.setPageIndex(currentGroupStart - 1)}
				>
					{mergedProps.ellipsisText}
				</Button>
			)
		}
		return null
	}

	const renderEllipsisNextButton = () => {
		if (currentGroupEnd < pageCount) {
			return (
				<Button
					className={btnBaseClasses}
					variant='ghost'
					size='sm'
					onClick={() => table.setPageIndex(currentGroupEnd)}
				>
					{mergedProps.ellipsisText}
				</Button>
			)
		}
		return null
	}

	return (
		<motion.div
			data-slot='data-grid-pagination'
			className={cn(
				'flex grow flex-col flex-wrap items-center justify-between gap-2.5 py-2.5 sm:flex-row sm:py-0',
				mergedProps?.className,
			)}
		>
			<motion.div className='order-2 flex flex-wrap items-center space-x-2.5 pb-2.5 sm:order-1 sm:pb-0'>
				{isLoading ? (
					mergedProps?.sizesSkeleton
				) : (
					<>
						<div className='text-muted-foreground text-sm'>
							{mergedProps.rowsPerPageLabel}
						</div>
						<Select
							value={`${pageSize}`}
							onValueChange={(value) => {
								const newPageSize = Number(value)
								table.setPageSize(newPageSize)
							}}
						>
							<SelectTrigger className='w-fit' size='sm'>
								<SelectValue aria-placeholder={`${pageSize}`} />
							</SelectTrigger>
							<SelectContent side='top' className='min-w-12.5'>
								{mergedProps?.sizes?.map((size: number) => (
									<SelectItem key={size} value={`${size}`}>
										{size}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</>
				)}
			</motion.div>
			<motion.div className='order-1 flex flex-col items-center justify-center gap-2.5 pt-2.5 sm:order-2 sm:flex-row sm:justify-end sm:pt-0'>
				{isLoading ? (
					mergedProps?.infoSkeleton
				) : (
					<>
						<div className='order-2 text-nowrap text-muted-foreground text-sm sm:order-1'>
							{paginationInfo}
						</div>
						{(pageCount > 1 || (manual && manual.hasMore !== false)) && (
							<div className='order-1 flex items-center space-x-1 sm:order-2'>
								<Button
									size='sm'
									variant='ghost'
									className={btnArrowClasses}
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<span className='sr-only'>
										{mergedProps.previousPageLabel}
									</span>
									<ChevronLeftIcon className='size-4' />
								</Button>

								{!manual && renderEllipsisPrevButton()}

								{!manual && renderPageButtons()}

								{!manual && renderEllipsisNextButton()}

								{manual ? (
									<Button
										size='sm'
										variant='ghost'
										className={btnArrowClasses}
										onClick={async () => {
											if (table.getCanNextPage()) {
												table.nextPage()
											} else if (manual.hasMore !== false) {
												pendingNavigationRef.current = true
												await handleLoadMore()
											}
										}}
										disabled={isLoadingMore || manual.hasMore === false}
									>
										<span className='sr-only'>
											{manual.hasMore !== false
												? (manual.loadMoreLabel ?? 'Load more')
												: mergedProps.nextPageLabel}
										</span>
										{isLoadingMore ? (
											<Loader2 className='size-4 animate-spin' />
										) : (
											<ChevronRightIcon className='size-4' />
										)}
									</Button>
								) : (
									<Button
										size='sm'
										variant='ghost'
										className={btnArrowClasses}
										onClick={() => table.nextPage()}
										disabled={!table.getCanNextPage()}
									>
										<span className='sr-only'>{mergedProps.nextPageLabel}</span>
										<ChevronRightIcon className='size-4' />
									</Button>
								)}
							</div>
						)}
					</>
				)}
			</motion.div>
		</motion.div>
	)
}

export {
	DataGridPagination,
	type DataGridPaginationProps,
	type ManualPaginationOptions,
}

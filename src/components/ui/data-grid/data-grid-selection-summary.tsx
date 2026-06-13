'use client'

import type { Table } from '@tanstack/react-table'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import * as React from 'react'
import { cn } from '#/lib/utils'

import { useDataGridSelectionState } from './contexts/data-grid-state-context'
import { parseLocalDate } from './lib/data-grid'
import type { CellOpts } from './types/data-grid'

type SelectionKind = 'number' | 'date' | 'text'

type AggregationId = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countNumbers'

interface AggregationOption {
	id: AggregationId
	label: string
	value: string
}

const NUMBER_VARIANTS = new Set(['number', 'progress'])
const DATE_VARIANTS = new Set(['date'])

function getColumnKind(
	variant: string | undefined,
	values: ReadonlyArray<unknown>,
): SelectionKind {
	if (variant && NUMBER_VARIANTS.has(variant)) return 'number'
	if (variant && DATE_VARIANTS.has(variant)) return 'date'
	if (variant) return 'text'

	if (values.length === 0) return 'text'

	let allNumber = true
	let allDate = true
	let sawAny = false

	for (const value of values) {
		if (value == null || value === '') continue
		sawAny = true
		const numeric =
			typeof value === 'number'
				? Number.isFinite(value)
				: typeof value === 'string' && value.trim() !== ''
					? Number.isFinite(Number(value))
					: false
		const dateLike =
			value instanceof Date
				? !Number.isNaN(value.getTime())
				: typeof value === 'string' && !Number.isNaN(Date.parse(value))
		if (!numeric) allNumber = false
		if (!dateLike) allDate = false
	}

	if (!sawAny) return 'text'
	if (allNumber) return 'number'
	if (allDate) return 'date'
	return 'text'
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value)
		return Number.isFinite(n) ? n : null
	}
	return null
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
	if (typeof value === 'string') {
		const local = parseLocalDate(value)
		if (local) return local
		const t = Date.parse(value)
		return Number.isNaN(t) ? null : new Date(t)
	}
	if (typeof value === 'number' && Number.isFinite(value))
		return new Date(value)
	return null
}

function formatNumber(n: number): string {
	if (Number.isInteger(n)) return n.toLocaleString()
	const rounded = Math.round(n * 1e7) / 1e7
	return rounded.toLocaleString(undefined, { maximumFractionDigits: 7 })
}

function formatDate(d: Date): string {
	const yyyy = d.getFullYear()
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const dd = String(d.getDate()).padStart(2, '0')
	return `${yyyy}-${mm}-${dd}`
}

function computeAggregations(
	kind: SelectionKind,
	values: ReadonlyArray<unknown>,
): AggregationOption[] {
	if (kind === 'number') {
		const numbers: number[] = []
		let totalCount = 0
		for (const v of values) {
			if (v == null || v === '') continue
			totalCount++
			const n = toNumber(v)
			if (n != null) numbers.push(n)
		}
		if (numbers.length === 0) {
			return totalCount > 0
				? [{ id: 'count', label: 'Count', value: String(totalCount) }]
				: []
		}
		const sum = numbers.reduce((a, b) => a + b, 0)
		const avg = sum / numbers.length
		const min = Math.min(...numbers)
		const max = Math.max(...numbers)
		return [
			{ id: 'sum', label: 'Sum', value: formatNumber(sum) },
			{ id: 'avg', label: 'Avg', value: formatNumber(avg) },
			{ id: 'min', label: 'Min', value: formatNumber(min) },
			{ id: 'max', label: 'Max', value: formatNumber(max) },
			{ id: 'count', label: 'Count', value: String(totalCount) },
			{
				id: 'countNumbers',
				label: 'Count Numbers',
				value: String(numbers.length),
			},
		]
	}

	if (kind === 'date') {
		const dates: Date[] = []
		let totalCount = 0
		for (const v of values) {
			if (v == null || v === '') continue
			totalCount++
			const d = toDate(v)
			if (d != null) dates.push(d)
		}
		if (dates.length === 0) {
			return totalCount > 0
				? [{ id: 'count', label: 'Count', value: String(totalCount) }]
				: []
		}
		const min = dates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
		const max = dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b))
		return [
			{ id: 'min', label: 'Min', value: formatDate(min) },
			{ id: 'max', label: 'Max', value: formatDate(max) },
			{ id: 'count', label: 'Count', value: String(totalCount) },
			{
				id: 'countNumbers',
				label: 'Count Numbers',
				value: String(dates.length),
			},
		]
	}

	let count = 0
	for (const v of values) {
		if (v == null || v === '') continue
		count++
	}
	return count > 0
		? [{ id: 'count', label: 'Count', value: String(count) }]
		: []
}

function defaultAggregationFor(kind: SelectionKind): AggregationId {
	if (kind === 'number') return 'sum'
	if (kind === 'date') return 'min'
	return 'count'
}

function parseCellKey(
	key: string,
): { rowIndex: number; columnId: string } | null {
	const colonIdx = key.indexOf(':')
	if (colonIdx === -1) return null
	const rowIndex = Number(key.slice(0, colonIdx))
	const columnId = key.slice(colonIdx + 1)
	if (!Number.isFinite(rowIndex) || columnId === '') return null
	return { rowIndex, columnId }
}

interface DataGridSelectionSummaryProps<TData> {
	table: Table<TData>
	className?: string
}

function DataGridSelectionSummary<TData>({
	table,
	className,
}: DataGridSelectionSummaryProps<TData>) {
	const selection = useDataGridSelectionState()
	const selectedCells = selection.selectedCells

	const summary = React.useMemo(() => {
		if (selectedCells.size === 0) return null

		const rows = table.getRowModel().rows
		const valuesByColumn = new Map<string, unknown[]>()

		for (const key of selectedCells) {
			const parsed = parseCellKey(key)
			if (!parsed) continue
			const row = rows[parsed.rowIndex]
			if (!row) continue
			const value = row.getValue(parsed.columnId)
			const bucket = valuesByColumn.get(parsed.columnId) ?? []
			bucket.push(value)
			valuesByColumn.set(parsed.columnId, bucket)
		}

		if (valuesByColumn.size === 0) return null

		let dominantKind: SelectionKind | null = null
		let mixed = false
		for (const [columnId, values] of valuesByColumn) {
			const column = table.getColumn(columnId)
			const cellOpts = column?.columnDef.meta?.cell as CellOpts | undefined
			const variant = cellOpts?.variant
			const colKind = getColumnKind(variant, values)
			if (dominantKind == null) dominantKind = colKind
			else if (dominantKind !== colKind) {
				mixed = true
				break
			}
		}

		const kind: SelectionKind = mixed ? 'text' : (dominantKind ?? 'text')

		const allValues: unknown[] = []
		for (const arr of valuesByColumn.values()) {
			for (const v of arr) allValues.push(v)
		}

		const options = computeAggregations(kind, allValues)
		if (options.length === 0) return null

		const totalSelected = selectedCells.size
		return { kind, options, totalSelected }
	}, [selectedCells, table])

	const [chosenAggregation, setChosenAggregation] =
		React.useState<AggregationId | null>(null)

	if (!summary) return null

	const activeId =
		chosenAggregation &&
		summary.options.some((option) => option.id === chosenAggregation)
			? chosenAggregation
			: defaultAggregationFor(summary.kind)
	const active =
		summary.options.find((option) => option.id === activeId) ??
		summary.options[0]
	if (!active) return null

	const showSelector = summary.options.length > 1

	return (
		<div
			role='status'
			aria-live='polite'
			aria-label='Selection summary'
			data-slot='grid-selection-summary'
			data-grid-popover=''
			className={cn(
				'flex h-8 w-full items-center justify-end gap-2 border-border border-t bg-card/40 px-3 py-1 text-foreground/80 text-xs',
				className,
			)}
		>
			{showSelector ? (
				<Select
					value={active.id}
					onValueChange={(next) => setChosenAggregation(next as AggregationId)}
				>
					<SelectTrigger
						size='sm'
						aria-label='Selection aggregation'
						className='h-7 gap-2 border-transparent bg-transparent px-2 font-medium text-foreground hover:bg-accent'
					>
						<SelectValue placeholder={`${active.label}: ${active.value}`}>
							<span className='tabular-nums'>
								<span className='font-medium'>{active.label}:</span>{' '}
								<span>{active.value}</span>
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent
						side='top'
						align='end'
						alignItemWithTrigger={false}
						data-grid-popover=''
					>
						<SelectGroup>
							{summary.options.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									<span className='tabular-nums'>
										<span className='font-medium'>{option.label}:</span>{' '}
										<span>{option.value}</span>
									</span>
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			) : (
				<span className='px-2 font-medium tabular-nums'>
					{active.label}: <span className='font-normal'>{active.value}</span>
				</span>
			)}
		</div>
	)
}

export {
	//
	DataGridSelectionSummary,
	type DataGridSelectionSummaryProps,
}

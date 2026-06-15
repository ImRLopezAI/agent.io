import type { ColumnFiltersState } from '@tanstack/react-table'

import { safeParseFilterValue } from '../lib/data-grid-filter-schema'

type FilterPayload = {
	operator: string
	value?: unknown
	endValue?: unknown
}

const OPERATORS_WITHOUT_VALUE = new Set([
	'isEmpty',
	'isNotEmpty',
	'isTrue',
	'isFalse',
])

const DATE_FILTER_SHORT_OPERATORS = new Set([
	'bef',
	'aft',
	'obef',
	'oaft',
	'bt',
])
const SHORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const OP_TO_SHORT: Record<string, string> = {
	contains: 'co',
	notContains: 'nco',
	equals: 'eq',
	notEquals: 'neq',
	startsWith: 'sw',
	endsWith: 'ew',
	isEmpty: 'empty',
	isNotEmpty: 'nempty',
	lessThan: 'lt',
	lessThanOrEqual: 'lte',
	greaterThan: 'gt',
	greaterThanOrEqual: 'gte',
	isBetween: 'bt',
	before: 'bef',
	after: 'aft',
	onOrBefore: 'obef',
	onOrAfter: 'oaft',
	is: 'is',
	isNot: 'not',
	isAnyOf: 'anyof',
	isNoneOf: 'noneof',
	isTrue: 'true',
	isFalse: 'false',
}

export const SHORT_TO_OP = Object.fromEntries(
	Object.entries(OP_TO_SHORT).map(([operator, short]) => [short, operator]),
)

function encodeFilterToken(value: string) {
	return encodeURIComponent(value).replaceAll('.', '%2E')
}

function decodeFilterToken(value: string) {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

function hasFilterValue(value: unknown) {
	if (Array.isArray(value)) return value.length > 0
	return value !== undefined && value !== null && value !== ''
}

function toShortDateToken(value: string) {
	const date = new Date(value)

	if (Number.isNaN(date.getTime())) {
		return null
	}

	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')

	return `${year}-${month}-${day}`
}

function toLocalMidnightIso(value: string) {
	if (!SHORT_DATE_PATTERN.test(value)) {
		return value
	}

	const date = new Date(`${value}T00:00:00`)

	if (Number.isNaN(date.getTime())) {
		return value
	}

	return date.toISOString()
}

export function parseFilterValue(
	value: string,
	operator: string,
): string | number | string[] | undefined {
	if (!value) return undefined

	if (operator === 'anyof' || operator === 'noneof') {
		return value
			.split(',')
			.map((item) => decodeFilterToken(item))
			.filter((item) => item.length > 0)
	}

	const decodedValue = decodeFilterToken(value)

	if (DATE_FILTER_SHORT_OPERATORS.has(operator)) {
		return toLocalMidnightIso(decodedValue)
	}

	const numericValue = Number(decodedValue)

	if (!Number.isNaN(numericValue) && decodedValue !== '') {
		return numericValue
	}

	return decodedValue
}

export function serializeFilterValue(
	value: unknown,
	operator?: string,
): string {
	if (Array.isArray(value)) {
		return value.map((item) => encodeFilterToken(String(item))).join(',')
	}

	if (
		typeof value === 'string' &&
		operator &&
		DATE_FILTER_SHORT_OPERATORS.has(operator)
	) {
		const shortDateToken = toShortDateToken(value)

		if (shortDateToken) {
			return encodeFilterToken(shortDateToken)
		}
	}

	return encodeFilterToken(String(value ?? ''))
}

function pushValidatedFilter(
	filters: ColumnFiltersState,
	id: string,
	candidate: unknown,
) {
	const parsed = safeParseFilterValue(candidate)
	if (!parsed) return
	filters.push({ id, value: parsed })
}

export function parseFilters(raw: string): ColumnFiltersState {
	if (!raw) return []

	const filters: ColumnFiltersState = []

	for (const segment of raw.split('~')) {
		const dotIndex = segment.indexOf('.')
		if (dotIndex === -1) continue

		const field = segment.slice(0, dotIndex)
		const rest = segment.slice(dotIndex + 1)
		const operatorIndex = rest.indexOf('.')
		const shortOperator =
			operatorIndex === -1 ? rest : rest.slice(0, operatorIndex)
		const operator = SHORT_TO_OP[shortOperator]

		if (!operator) continue

		const valuePart = operatorIndex === -1 ? '' : rest.slice(operatorIndex + 1)

		if (operator === 'isBetween' && valuePart) {
			const separatorIndex = valuePart.indexOf('.')
			if (separatorIndex >= 0) {
				const value = parseFilterValue(
					valuePart.slice(0, separatorIndex),
					shortOperator,
				)
				const endValue = parseFilterValue(
					valuePart.slice(separatorIndex + 1),
					shortOperator,
				)
				pushValidatedFilter(filters, field, {
					operator,
					...(value !== undefined ? { value } : {}),
					...(endValue !== undefined ? { endValue } : {}),
				})
				continue
			}

			const value = parseFilterValue(valuePart, shortOperator)
			pushValidatedFilter(filters, field, { operator, value })
			continue
		}

		const value = valuePart
			? parseFilterValue(valuePart, shortOperator)
			: undefined
		pushValidatedFilter(filters, field, { operator, value })
	}

	return filters
}

export function serializeFilters(filters: ColumnFiltersState): string {
	if (!filters || filters.length === 0) return ''

	return filters
		.map((filter) => {
			const filterValue = filter.value as FilterPayload
			const shortOperator =
				OP_TO_SHORT[filterValue.operator] ?? filterValue.operator

			let serialized = `${filter.id}.${shortOperator}`

			if (filterValue.operator === 'isBetween') {
				const startValue = hasFilterValue(filterValue.value)
					? serializeFilterValue(filterValue.value, shortOperator)
					: ''
				const endValue = hasFilterValue(filterValue.endValue)
					? serializeFilterValue(filterValue.endValue, shortOperator)
					: ''

				if (startValue || endValue) {
					serialized += `.${startValue}.${endValue}`
				}

				return serialized
			}

			if (hasFilterValue(filterValue.value)) {
				serialized += `.${serializeFilterValue(filterValue.value, shortOperator)}`
			}

			return serialized
		})
		.join('~')
}

export function getServerReadyFilters(
	columnFilters: ColumnFiltersState,
): ColumnFiltersState {
	return columnFilters.flatMap((filter) => {
		const parsed = safeParseFilterValue(filter.value)
		if (!parsed) return []

		const { operator } = parsed

		if (OPERATORS_WITHOUT_VALUE.has(operator)) {
			return [{ ...filter, value: parsed }]
		}

		if (operator === 'isBetween') {
			return hasFilterValue(parsed.value) && hasFilterValue(parsed.endValue)
				? [{ ...filter, value: parsed }]
				: []
		}

		return hasFilterValue(parsed.value) ? [{ ...filter, value: parsed }] : []
	})
}

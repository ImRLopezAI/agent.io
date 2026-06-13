import { describe, expect, it } from 'vitest'

import {
	filterValueSchema,
	safeParseFilterValue,
} from '../data-grid-filter-schema'

describe('filterValueSchema', () => {
	it('accepts a string-value branch (contains)', () => {
		const result = filterValueSchema.safeParse({
			operator: 'contains',
			value: 'foo',
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.operator).toBe('contains')
		}
	})

	it('accepts a comparison branch with a numeric value (greaterThan)', () => {
		const result = filterValueSchema.safeParse({
			operator: 'greaterThan',
			value: 12,
		})
		expect(result.success).toBe(true)
	})

	it('accepts an isBetween branch with both endpoints', () => {
		const result = filterValueSchema.safeParse({
			operator: 'isBetween',
			value: 1,
			endValue: 10,
		})
		expect(result.success).toBe(true)
	})

	it('accepts a multi-select branch (isAnyOf) with string array value', () => {
		const result = filterValueSchema.safeParse({
			operator: 'isAnyOf',
			value: ['a', 'b', 'c'],
		})
		expect(result.success).toBe(true)
	})

	it('accepts a date range branch (before) with iso date string', () => {
		const result = filterValueSchema.safeParse({
			operator: 'before',
			value: '2026-04-28',
		})
		expect(result.success).toBe(true)
	})

	it('accepts a valueless branch (isEmpty)', () => {
		const result = filterValueSchema.safeParse({ operator: 'isEmpty' })
		expect(result.success).toBe(true)
	})

	it('accepts a boolean branch (isTrue)', () => {
		const result = filterValueSchema.safeParse({ operator: 'isTrue' })
		expect(result.success).toBe(true)
	})

	it('drops malformed operator values', () => {
		expect(filterValueSchema.safeParse({ operator: 'nope' }).success).toBe(
			false,
		)
		expect(filterValueSchema.safeParse({ value: 'x' }).success).toBe(false)
		expect(filterValueSchema.safeParse(null).success).toBe(false)
		expect(filterValueSchema.safeParse(undefined).success).toBe(false)
	})

	it('drops a multi-select with the wrong value shape', () => {
		// isAnyOf requires array of strings, not a scalar string
		const result = filterValueSchema.safeParse({
			operator: 'isAnyOf',
			value: 'oops',
		})
		expect(result.success).toBe(false)
	})

	it('drops a comparison branch with a non-scalar value', () => {
		// greaterThan requires string|number, not an array
		const result = filterValueSchema.safeParse({
			operator: 'greaterThan',
			value: ['oops'],
		})
		expect(result.success).toBe(false)
	})
})

describe('safeParseFilterValue', () => {
	it('returns the parsed payload on success', () => {
		const parsed = safeParseFilterValue({ operator: 'equals', value: 'x' })
		expect(parsed).toEqual({ operator: 'equals', value: 'x' })
	})

	it('returns null on failure', () => {
		expect(safeParseFilterValue({ operator: 'unknown' })).toBeNull()
		expect(safeParseFilterValue('not-an-object')).toBeNull()
	})
})

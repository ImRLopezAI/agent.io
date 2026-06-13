import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { getCellKey, parseCellKey, parseLocalDate } from '../data-grid'

afterEach(() => {
	cleanup()
})

describe('parseLocalDate', () => {
	it('returns null for falsy or non-string input', () => {
		expect(parseLocalDate(null)).toBeNull()
		expect(parseLocalDate(undefined)).toBeNull()
		expect(parseLocalDate('')).toBeNull()
		expect(parseLocalDate(123)).toBeNull()
	})

	it('parses a YYYY-MM-DD string into a local Date', () => {
		const result = parseLocalDate('2026-04-28')
		expect(result).toBeInstanceOf(Date)
		expect(result?.getFullYear()).toBe(2026)
		expect(result?.getMonth()).toBe(3)
		expect(result?.getDate()).toBe(28)
	})

	it('returns null for invalid calendar dates', () => {
		expect(parseLocalDate('2026-02-30')).toBeNull()
		expect(parseLocalDate('not-a-date')).toBeNull()
	})

	it('passes through a Date instance unchanged', () => {
		const input = new Date(2026, 3, 28)
		expect(parseLocalDate(input)).toBe(input)
	})
})

describe('cell key round-trip', () => {
	it('serializes and parses back to the original position', () => {
		const key = getCellKey(7, 'amount')
		expect(key).toBe('7:amount')
		const parsed = parseCellKey(key)
		expect(parsed).toEqual({ rowIndex: 7, columnId: 'amount' })
	})

	it('returns the empty fallback for malformed keys', () => {
		expect(parseCellKey('garbage')).toEqual({ rowIndex: 0, columnId: '' })
	})
})

describe('react testing-library harness', () => {
	it('mounts a trivial component and finds it in the DOM', () => {
		render(createElement('div', { 'data-testid': 'smoke' }, 'hello'))
		expect(screen.getByTestId('smoke')).toHaveTextContent('hello')
	})
})

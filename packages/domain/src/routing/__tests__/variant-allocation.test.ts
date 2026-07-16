import { describe, expect, test } from 'vite-plus/test'

import {
	hashConversationKey,
	selectVariantForConversation,
	validateVariantAllocation,
} from '../variant-allocation.ts'

const allocation = [
	{ variantId: 'main', allocationOrdinal: 1, weightBps: 5_000 },
	{ variantId: 'variant-a', allocationOrdinal: 2, weightBps: 5_000 },
	{ variantId: 'variant-zero', allocationOrdinal: 3, weightBps: 0 },
]

describe('Variant allocation', () => {
	test('is deterministic for the same conversation key', () => {
		const first = selectVariantForConversation('conversation-123', allocation)
		const second = selectVariantForConversation('conversation-123', allocation)
		expect(second).toEqual(first)
		expect(first.bucket).toBe(hashConversationKey('conversation-123'))
	})

	test('uses immutable allocation ordinal rather than input order', () => {
		expect(
			selectVariantForConversation(
				'conversation-123',
				[...allocation].reverse(),
			),
		).toEqual(selectVariantForConversation('conversation-123', allocation))
	})

	test('never selects a zero-weight Variant', () => {
		for (let index = 0; index < 1_000; index += 1) {
			expect(
				selectVariantForConversation(`conversation-${index}`, allocation)
					.variantId,
			).not.toBe('variant-zero')
		}
	})

	test('rejects incomplete totals, duplicate ids, and duplicate ordinals', () => {
		expect(
			validateVariantAllocation([
				{ variantId: 'main', allocationOrdinal: 1, weightBps: 9_999 },
			]),
		).toMatch(/10,000/)
		expect(
			validateVariantAllocation([
				{ variantId: 'main', allocationOrdinal: 1, weightBps: 5_000 },
				{ variantId: 'main', allocationOrdinal: 2, weightBps: 5_000 },
			]),
		).toMatch(/duplicate Variant/)
		expect(
			validateVariantAllocation([
				{ variantId: 'main', allocationOrdinal: 1, weightBps: 5_000 },
				{ variantId: 'variant-a', allocationOrdinal: 1, weightBps: 5_000 },
			]),
		).toMatch(/duplicate allocation ordinal/)
	})

	test('rejects invalid weights and ordinals', () => {
		for (const invalid of [
			[{ variantId: 'main', allocationOrdinal: 0, weightBps: 10_000 }],
			[{ variantId: 'main', allocationOrdinal: 1, weightBps: -1 }],
			[{ variantId: 'main', allocationOrdinal: 1, weightBps: 10_001 }],
			[{ variantId: 'main', allocationOrdinal: 1, weightBps: 9_999.5 }],
		]) {
			expect(validateVariantAllocation(invalid)).toBeTruthy()
		}
		expect(validateVariantAllocation([])).toMatch(/include a Variant/)
	})

	test('selects exact cumulative bucket boundaries', () => {
		const keyForBucket = (wanted: number) => {
			for (let index = 0; index < 200_000; index += 1) {
				const key = `boundary-${wanted}-${index}`
				if (hashConversationKey(key) === wanted) return key
			}
			throw new Error(`bucket ${wanted} not found`)
		}
		expect(
			selectVariantForConversation(keyForBucket(0), allocation).variantId,
		).toBe('main')
		expect(
			selectVariantForConversation(keyForBucket(4_999), allocation).variantId,
		).toBe('main')
		expect(
			selectVariantForConversation(keyForBucket(5_000), allocation).variantId,
		).toBe('variant-a')
		expect(
			selectVariantForConversation(keyForBucket(9_999), allocation).variantId,
		).toBe('variant-a')
	})
})

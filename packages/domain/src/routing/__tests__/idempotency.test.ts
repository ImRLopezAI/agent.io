import { describe, expect, test } from 'vite-plus/test'

import { conversationFingerprint } from '../idempotency'

describe('conversationFingerprint', () => {
	test('is independent of field order', () => {
		expect(
			conversationFingerprint({
				direction: 'inbound',
				ownerId: 'p1',
				provider: 'openai',
			}),
		).toBe(
			conversationFingerprint({
				provider: 'openai',
				direction: 'inbound',
				ownerId: 'p1',
			}),
		)
	})

	test('drops undefined values so optional omission matches explicit undefined', () => {
		expect(
			conversationFingerprint({
				direction: 'outbound',
				ownerId: 'r1',
				provider: 'openai',
				destinationCountryCode: undefined,
			}),
		).toBe(
			conversationFingerprint({
				direction: 'outbound',
				ownerId: 'r1',
				provider: 'openai',
			}),
		)
	})

	test('differs when durable identity differs', () => {
		const base = { direction: 'inbound', ownerId: 'p1', provider: 'openai' }
		expect(conversationFingerprint(base)).not.toBe(
			conversationFingerprint({ ...base, ownerId: 'p2' }),
		)
		expect(conversationFingerprint(base)).not.toBe(
			conversationFingerprint({ ...base, direction: 'outbound' }),
		)
	})

	test('present optional fields participate in the fingerprint', () => {
		const base = { direction: 'outbound', ownerId: 'r1', provider: 'openai' }
		expect(conversationFingerprint(base)).not.toBe(
			conversationFingerprint({ ...base, destinationCountryCode: 'US' }),
		)
	})
})

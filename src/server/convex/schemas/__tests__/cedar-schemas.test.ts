// Unit 1 — Cedar Support Platform schema parse tests.
//
// These don't hit Convex. They just round-trip representative documents
// through each table's `insertSchema` to lock the invariants the rest of
// the platform relies on (optional fields stay optional, enums accept the
// constants in src/lib/constants.ts, IDs serialize as strings).

import { describe, expect, it } from 'vitest'
import {
	customers,
	emailMessages,
	inboundEmailAttachments,
	issues,
	roadmapEdges,
	roadmapItems,
	slaPolicies,
} from '../index'

const ORG = 'org_test_1'

describe('Cedar schema — customers', () => {
	it('parses a representative customer row', () => {
		const parsed = customers.insertSchema.parse({
			key: 'CUS-acme123456789012',
			name: 'Acme',
			organization: ORG,
			domain: 'acme.com',
			tier: 'ENTERPRISE',
			arr: 210000,
			healthScore: 82,
			tags: ['strategic', 'high-arr'],
			logoColor: '#14432a',
		})
		expect(parsed.name).toBe('Acme')
		expect(parsed.tier).toBe('ENTERPRISE')
	})

	it('accepts a customer with no domain (edge case from plan)', () => {
		const parsed = customers.insertSchema.parse({
			key: 'CUS-no-domain123456789',
			name: 'Anonymous Inbound',
			organization: ORG,
		})
		expect(parsed.domain).toBeUndefined()
	})

	it('rejects a healthScore above 100', () => {
		expect(() =>
			customers.insertSchema.parse({
				key: 'CUS-bad12345678901234567',
				name: 'Bad',
				organization: ORG,
				healthScore: 150,
			}),
		).toThrow()
	})
})

describe('Cedar schema — emailMessages', () => {
	it('parses a pending inbound row (webhook landing)', () => {
		const parsed = emailMessages.insertSchema.parse({
			key: 'EML-pending12345678901',
			name: 'Login not working on SSO',
			organization: ORG,
			messageId: 'msg_abc',
			threadKey: 'msg_abc',
			bodyFetchStatus: 'PENDING',
			kind: 'CUSTOMER',
			fromAddress: 'sarah@acme.com',
			toAddresses: ['support@cedar.app'],
			subject: 'Login not working on SSO',
			receivedAt: '2026-05-21T10:21:00.000Z',
		})
		expect(parsed.bodyFetchStatus).toBe('PENDING')
		expect(parsed.html).toBeUndefined()
		expect(parsed.ticket).toBeUndefined()
	})

	it('parses a fetched row with body and AI suggestion', () => {
		const parsed = emailMessages.insertSchema.parse({
			key: 'EML-fetched1234567890',
			name: 'Re: Login not working on SSO',
			organization: ORG,
			messageId: 'msg_def',
			threadKey: 'msg_abc',
			bodyFetchStatus: 'FETCHED',
			kind: 'CUSTOMER',
			fromAddress: 'sarah@acme.com',
			toAddresses: ['support@cedar.app'],
			receivedAt: '2026-05-21T10:21:00.000Z',
			html: '<p>Hi team,</p>',
			text: 'Hi team,',
			rawMimeStorageId: 'kg2example',
			attachmentCount: 2,
			aiSuggestion: {
				project: 'Platform',
				type: 'BUG',
				priority: 'HIGH',
				sentiment: 'NEGATIVE',
				confidence: 0.92,
			},
		})
		expect(parsed.bodyFetchStatus).toBe('FETCHED')
		expect(parsed.aiSuggestion?.confidence).toBe(0.92)
	})
})

describe('Cedar schema — inboundEmailAttachments', () => {
	it('parses a stored attachment row', () => {
		const parsed = inboundEmailAttachments.insertSchema.parse({
			organization: ORG,
			emailMessage: 'jh7em' as never,
			filename: 'screenshot.png',
			contentType: 'image/png',
			size: 1024 * 50,
			storageId: 'kg2att',
		})
		expect(parsed.filename).toBe('screenshot.png')
	})
})

describe('Cedar schema — slaPolicies', () => {
	it('parses a policy', () => {
		const parsed = slaPolicies.insertSchema.parse({
			key: 'SLA-high1234567890',
			name: 'High priority',
			organization: ORG,
			priority: 'HIGH',
			firstResponseMinutes: 60,
			resolutionMinutes: 60 * 8,
		})
		expect(parsed.priority).toBe('HIGH')
	})
})

describe('Cedar schema — roadmapItems + roadmapEdges', () => {
	it('parses a commit-lane item', () => {
		const parsed = roadmapItems.insertSchema.parse({
			key: 'RMI-c1011aaaaaaaaaaaaaa',
			name: 'Search returning incorrect results',
			organization: ORG,
			project: 'jh7proj' as never,
			lane: 'COMMIT',
			sprintIndex: 0,
			title: 'Search returning incorrect results',
			priority: 'CRITICAL',
		})
		expect(parsed.lane).toBe('COMMIT')
		expect(parsed.sprintIndex).toBe(0)
	})

	it('rejects a negative sprintIndex', () => {
		expect(() =>
			roadmapItems.insertSchema.parse({
				key: 'RMI-bad1aaaaaaaaaaaaaaa',
				name: 'X',
				organization: ORG,
				project: 'jh7proj' as never,
				lane: 'WORK',
				sprintIndex: -1,
				title: 'X',
			}),
		).toThrow()
	})

	it('parses an edge between two items', () => {
		const parsed = roadmapEdges.insertSchema.parse({
			organization: ORG,
			project: 'jh7proj' as never,
			source: 'jh7src' as never,
			target: 'jh7tgt' as never,
			style: 'DASHED',
		})
		expect(parsed.style).toBe('DASHED')
	})
})

describe('issues — Cedar field extensions', () => {
	it('still parses a legacy row with all support fields undefined (backward compat)', () => {
		const parsed = issues.insertSchema.parse({
			key: 'ISS-legacy123456789012',
			name: 'Legacy row',
			project: 'jh7proj' as never,
			status: 'BACKLOG',
			priority: 'MEDIUM',
		})
		expect(parsed.customer).toBeUndefined()
		expect(parsed.source).toBeUndefined()
		expect(parsed.slaState).toBeUndefined()
		expect(parsed.checklist).toBeUndefined()
	})

	it('parses a support-flavored row with every Cedar field set', () => {
		const parsed = issues.insertSchema.parse({
			key: 'ISS-T482100000000000000',
			name: 'Login not working on SSO',
			project: 'jh7proj' as never,
			status: 'IN_PROGRESS',
			priority: 'CRITICAL',
			customer: 'jh7cus' as never,
			contactEmail: 'sarah@acme.com',
			source: 'EMAIL',
			slaState: 'WARN',
			slaDueAt: '2026-05-21T16:00:00.000Z',
			checklist: [
				{ id: 'cl1', text: 'Reproduce on staging', done: true },
				{ id: 'cl2', text: 'Identify root cause', done: false },
			],
		})
		expect(parsed.source).toBe('EMAIL')
		expect(parsed.contactEmail).toBe('sarah@acme.com')
		expect(parsed.slaState).toBe('WARN')
		expect(parsed.checklist).toHaveLength(2)
	})
})

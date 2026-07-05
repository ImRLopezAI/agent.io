import { describe, expect, test } from 'vite-plus/test'

import {
	BatchCallRecipients,
	ComposioSessions,
	ConversationMessages,
	Conversations,
	KbChunks,
	KbDocuments,
	KbEmbeddings,
	McpConnections,
	PhoneNumbers,
	validateKbDocument,
	validateMcpConnection,
} from '../index.ts'

describe('McpConnections', () => {
	const base = {
		tenant: 'org_1',
		name: 'Composio',
		transport: 'sse',
		approvalPolicy: 'require_approval_all',
		toolApprovals: [],
		toolConfigOverrides: [],
		responseTimeoutSecs: 30,
		status: 'active',
	}

	test('composio and byo variants parse; cross-field validator enforces kind', () => {
		expect(
			McpConnections.insertSchema.safeParse({
				...base,
				kind: 'composio',
				composioAccountId: 'ca_1',
				toolkitSlugs: ['gmail', 'hubspot'],
			}).success,
		).toBe(true)
		expect(
			McpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://mcp.example.com',
			}).success,
		).toBe(true)
		expect(validateMcpConnection({ kind: 'byo' })).toMatch(/require url/)
		expect(validateMcpConnection({ kind: 'composio' })).toMatch(
			/composioAccountId/,
		)
	})

	test('responseTimeoutSecs bounds: 5/300 pass, 4/301 reject', () => {
		const mk = (secs: number) =>
			McpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://x',
				responseTimeoutSecs: secs,
			}).success
		expect(mk(5)).toBe(true)
		expect(mk(300)).toBe(true)
		expect(mk(4)).toBe(false)
		expect(mk(301)).toBe(false)
	})

	test('secret headers accept literal or secretRef pointer only', () => {
		const mk = (headers: unknown) =>
			McpConnections.insertSchema.safeParse({
				...base,
				kind: 'byo',
				url: 'https://x',
				requestHeaders: headers,
			}).success
		expect(mk({ authorization: { secretRef: 'sec_1' } })).toBe(true)
		expect(mk({ authorization: 'Bearer literal' })).toBe(true)
		expect(mk({ authorization: { raw: 'nope' } })).toBe(false)
	})
})

describe('Knowledge Base', () => {
	test('document cross-field validation per type', () => {
		expect(validateKbDocument({ type: 'url' })).toMatch(/sourceUrl/)
		expect(validateKbDocument({ type: 'file' })).toMatch(/storageId/)
		expect(validateKbDocument({ type: 'text' })).toMatch(/content/)
		expect(validateKbDocument({ type: 'text', content: 'hello' })).toBeNull()
	})

	test('chunk without embeddingId is valid (pre-embedding state)', () => {
		expect(
			KbChunks.insertSchema.safeParse({
				tenant: 'org_1',
				documentId: 'kbDocuments_1',
				order: 0,
				text: 'chunk',
			}).success,
		).toBe(true)
	})

	test('vector index carries tenant + documentId filterFields at 1536 dims', () => {
		const exported = (
			KbEmbeddings.table() as unknown as {
				export: () => {
					vectorIndexes: {
						indexDescriptor: string
						dimensions: number
						filterFields: string[]
					}[]
				}
			}
		).export()
		const idx = exported.vectorIndexes[0]
		expect(idx?.dimensions).toBe(1536)
		expect(idx?.filterFields).toEqual(
			expect.arrayContaining(['tenant', 'documentId']),
		)
	})

	test('kbDocuments + kbChunks search indexes present', () => {
		const exp = (t: { table: () => unknown }) =>
			(
				t.table() as {
					export: () => { searchIndexes: { indexDescriptor: string }[] }
				}
			).export()
		expect(exp(KbDocuments).searchIndexes[0]?.indexDescriptor).toBe(
			'search_name',
		)
		expect(exp(KbChunks).searchIndexes[0]?.indexDescriptor).toBe('search_text')
	})
})

describe('Conversations substrate', () => {
	const conversation = {
		tenant: 'org_1',
		agentId: 'agents_1',
		agentVersionId: 'agentVersions_1',
		provider: 'openai',
		channel: 'voice_inbound',
		direction: 'inbound',
		status: 'initiated',
		startedAt: '2026-07-05T00:00:00Z',
		hasAudio: false,
		messageCount: 0,
	}

	test('full conversation parses; unknown channel rejects', () => {
		expect(Conversations.insertSchema.safeParse(conversation).success).toBe(
			true,
		)
		expect(
			Conversations.insertSchema.safeParse({
				...conversation,
				channel: 'carrier_pigeon',
			}).success,
		).toBe(false)
	})

	test('tool-only turn (no text) is valid', () => {
		expect(
			ConversationMessages.insertSchema.safeParse({
				tenant: 'org_1',
				conversationId: 'conversations_1',
				agentId: 'agents_1',
				sequence: 1,
				role: 'agent',
				toolCalls: [{ callId: 'c1', name: 'end_call', argsJson: '{}' }],
				interrupted: false,
			}).success,
		).toBe(true)
	})
})

describe('Telephony + batch + operational', () => {
	test('phone number must be E.164', () => {
		const mk = (number: string) =>
			PhoneNumbers.insertSchema.safeParse({
				tenant: 'org_1',
				number,
				provider: 'twilio',
				label: '',
				status: 'active',
			}).success
		expect(mk('+15551234567')).toBe(true)
		expect(mk('5551234567')).toBe(false)
	})

	test('recipient status covers the full lifecycle', () => {
		for (const status of [
			'pending',
			'dispatched',
			'initiated',
			'in_progress',
			'completed',
			'failed',
			'cancelled',
			'voicemail',
		]) {
			expect(
				BatchCallRecipients.insertSchema.safeParse({
					tenant: 'org_1',
					batchId: 'batchCallJobs_1',
					phoneNumber: '+15550001111',
					status,
				}).success,
			).toBe(true)
		}
	})

	test('composioSessions keyed by connection + configHash', () => {
		const exported = (
			ComposioSessions.table() as unknown as {
				export: () => {
					indexes: { indexDescriptor: string; fields: string[] }[]
				}
			}
		).export()
		const idx = exported.indexes.find(
			(i) => i.indexDescriptor === 'by_connection_hash',
		)
		expect(idx?.fields).toEqual(['connectionId', 'configHash'])
	})
})

import ragTest from '@convex-dev/rag/test'
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { v } from 'convex/values'
import { describe, expect, test } from 'vite-plus/test'

import { action, mutation } from '../../_generated/server'
import { rag, RAG_EMBEDDING } from '../../rag'
import schema from '../../schema'
import { modules } from '../../testModules.test'

const vector = (axis: number) =>
	Array.from({ length: RAG_EMBEDDING.dimensions }, (_, index) =>
		index === axis ? 1 : 0,
	)

export const addEntryForTest = mutation({
	args: {
		namespace: v.string(),
		key: v.string(),
		documentId: v.string(),
		text: v.string(),
		embedding: v.array(v.number()),
	},
	handler: async (ctx, args) =>
		rag.add(ctx, {
			namespace: args.namespace,
			key: args.key,
			title: args.documentId,
			metadata: {
				title: args.documentId,
				sourceType: 'text',
				sourceUrl: null,
			},
			filterValues: [{ name: 'documentId', value: args.documentId }],
			chunks: [{ text: args.text, embedding: args.embedding }],
		}),
})

export const searchEntryForTest = action({
	args: {
		namespace: v.string(),
		documentIds: v.array(v.string()),
		embedding: v.array(v.number()),
	},
	handler: async (ctx, args) =>
		rag.search(ctx, {
			namespace: args.namespace,
			query: args.embedding,
			filters: args.documentIds.map((documentId) => ({
				name: 'documentId' as const,
				value: documentId,
			})),
			limit: 8,
			vectorScoreThreshold: 0.5,
		}),
})

const testApi = anyApi['api/__tests__/knowledgeBase.test']
const kbSearchApi = anyApi['api/kbSearch']

const setup = () => {
	const t = convexTest(schema, modules)
	ragTest.register(t)
	return t
}

describe('Convex RAG component boundary (U1-U2)', () => {
	test('inventory projection degrades unavailable component entries per row', async () => {
		const { toKnowledgeDocumentDto } = await import('../knowledgeBase')
		const registry = {
			_id: 'document_1' as never,
			_creationTime: 10,
			tenant: 'org_secret',
			activeEntryId: 'entry_1',
			archived: false,
			createdAt: '2026-07-15T00:00:00Z',
		}
		const ready = toKnowledgeDocumentDto(registry, {
			entryId: 'entry_1' as never,
			key: 'kb:document_1',
			title: 'Returns policy',
			metadata: {
				title: 'Returns policy',
				sourceType: 'text',
				sourceUrl: null,
			},
			importance: 1,
			filterValues: [{ name: 'documentId', value: 'document_1' }],
			status: 'ready',
		})
		expect(ready).toMatchObject({
			id: 'document_1',
			availability: 'ready',
			entryId: 'entry_1',
			title: 'Returns policy',
		})
		expect(ready).not.toHaveProperty('tenant')
		expect(ready).not.toHaveProperty('key')
		expect(ready).not.toHaveProperty('filterValues')

		const unavailable = toKnowledgeDocumentDto(registry, null)
		expect(unavailable).toMatchObject({
			id: 'document_1',
			availability: 'unavailable',
			entryId: undefined,
		})
	})

	test('keyed replacement keeps one ready result and returns component output', async () => {
		const t = setup()
		const first = await t.mutation(testApi.addEntryForTest, {
			namespace: 'org_a',
			key: 'kb:doc_1',
			documentId: 'doc_1',
			text: 'old pricing',
			embedding: vector(0),
		})
		expect(first.status).toBe('ready')

		const replacement = await t.mutation(testApi.addEntryForTest, {
			namespace: 'org_a',
			key: 'kb:doc_1',
			documentId: 'doc_1',
			text: 'new pricing',
			embedding: vector(0),
		})
		expect(replacement.status).toBe('ready')
		expect(replacement.replacedEntry?.entryId).toBe(first.entryId)

		const result = await t.action(testApi.searchEntryForTest, {
			namespace: 'org_a',
			documentIds: ['doc_1'],
			embedding: vector(0),
		})
		expect(result.text).toContain('new pricing')
		expect(result.text).not.toContain('old pricing')
		expect(result.entries).toHaveLength(1)
		expect(result.entries[0]?.entryId).toBe(replacement.entryId)
	})

	test('namespace and document filters prevent cross-scope retrieval', async () => {
		const t = setup()
		for (const entry of [
			{ namespace: 'org_a', documentId: 'allowed', text: 'allowed text' },
			{ namespace: 'org_a', documentId: 'unattached', text: 'tenant secret' },
			{ namespace: 'org_b', documentId: 'other', text: 'other org secret' },
		]) {
			await t.mutation(testApi.addEntryForTest, {
				...entry,
				key: `kb:${entry.documentId}`,
				embedding: vector(0),
			})
		}

		const result = await t.action(testApi.searchEntryForTest, {
			namespace: 'org_a',
			documentIds: ['allowed'],
			embedding: vector(0),
		})
		expect(result.text).toContain('allowed text')
		expect(result.text).not.toContain('tenant secret')
		expect(result.text).not.toContain('other org secret')
	})

	test('loads complete prompt documents from conversation attachments in order', async () => {
		const t = setup()
		const readyEntry = await t.mutation(testApi.addEntryForTest, {
			namespace: 'org_a',
			key: 'kb:ready',
			documentId: 'Policy',
			text: 'Refunds are available within 30 days.',
			embedding: vector(0),
		})
		const ids = await t.run(async (ctx) => {
			const readyDocumentId = await ctx.db.insert('kbDocuments', {
				tenant: 'org_a',
				activeEntryId: readyEntry.entryId,
				archived: false,
				createdAt: '2026-07-15T00:00:00Z',
			})
			const unavailableDocumentId = await ctx.db.insert('kbDocuments', {
				tenant: 'org_a',
				archived: false,
				createdAt: '2026-07-15T00:00:00Z',
			})
			const agentId = await ctx.db.insert('agents', {
				tenant: 'org_a',
				name: 'Support',
				allocationRevision: 1,
				archived: false,
				createdAt: '2026-07-15T00:00:00Z',
			})
			const draft = {
				instructions: 'Help the caller.',
				model: { provider: 'openai' as const, model: 'gpt-realtime' },
				voice: 'marin',
				vad: { mode: 'server_vad' as const },
				systemTools: {},
				mcp: [],
				knowledgeBase: [
					{ documentId: readyDocumentId, usageMode: 'prompt' as const },
					{
						documentId: unavailableDocumentId,
						usageMode: 'prompt' as const,
					},
				],
				inboundWorkflow: { enabled: true, firstSpeaker: 'caller' as const },
				outboundWorkflow: { enabled: true, firstSpeaker: 'agent' as const },
			}
			const agentVariantId = await ctx.db.insert('agentVariants', {
				tenant: 'org_a',
				agentId,
				name: 'Main',
				isMain: true,
				allocationOrdinal: 1,
				trafficWeightBps: 10_000,
				draft,
				archived: false,
				createdAt: '2026-07-15T00:00:00Z',
			})
			const versionId = await ctx.db.insert('agentVersions', {
				tenant: 'org_a',
				agentId,
				agentVariantId,
				version: 1,
				publishedBy: 'user',
				config: {
					...draft,
					procedures: { kind: 'inline' as const, items: [] },
				},
				createdAt: '2026-07-15T00:00:00Z',
			})
			await ctx.db.patch(agentId, { mainVariantId: agentVariantId })
			await ctx.db.patch(agentVariantId, { publishedVersionId: versionId })
			const conversationId = await ctx.db.insert('conversations', {
				tenant: 'org_a',
				conversationKey: 'web:conversation_1',
				idempotencyFingerprint: 'web:conversation_1:start',
				agentId,
				agentVariantId,
				agentVersionId: versionId,
				allocationMode: 'direct' as const,
				allocationRevision: 1,
				workflow: 'inbound' as const,
				provider: 'openai' as const,
				channel: 'web' as const,
				direction: 'inbound' as const,
				status: 'in_progress' as const,
				startedAt: '2026-07-15T00:00:00Z',
				hasAudio: false,
				messageCount: 0,
				createdAt: '2026-07-15T00:00:00Z',
			})
			return { conversationId, unavailableDocumentId }
		})

		const result = await t.action(kbSearchApi.loadPromptKnowledge, {
			conversationId: ids.conversationId,
		})
		expect(result.documents).toEqual([
			{
				documentId: expect.any(String),
				name: 'Policy',
				content: 'Refunds are available within 30 days.',
			},
		])
		expect(result.warnings.join(' ')).toContain(ids.unavailableDocumentId)
	})
})

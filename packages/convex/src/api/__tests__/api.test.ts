/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../testModules'
import { buildVersionSnapshot } from '../publishCore'

const ORG_A = 'org_aaaa'
const ORG_B = 'org_bbbb'
const T0 = '2026-07-05T00:00:00Z'

const agentDoc = (tenant: string, name: string) => ({
	tenant,
	name,
	instructions: 'You help.',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: {},
	mcp: [],
	knowledgeBase: [],
	archived: false,
	createdAt: T0,
})

const draftFields = (name: string) => {
	const {
		tenant: _t,
		archived: _a,
		createdAt: _c,
		...rest
	} = agentDoc('x', name)
	return rest
}

const seedAgentWithVersion = async (
	t: ReturnType<typeof convexTest>,
	tenant: string,
) =>
	t.run(async (ctx) => {
		const agentId = await ctx.db.insert('agents', agentDoc(tenant, 'A'))
		const versionId = await ctx.db.insert('agentVersions', {
			tenant,
			agentId,
			version: 1,
			publishedBy: 'user',
			config: {
				...draftFields('A'),
				procedures: { kind: 'inline' as const, items: [] },
			},
			createdAt: T0,
		})
		return { agentId, versionId }
	})

describe('publish core (Unit 8)', () => {
	test('snapshot embeds active procedures and skips archived', () => {
		const config = buildVersionSnapshot(draftFields('A'), [
			{
				_id: 'p1',
				name: 'Refunds',
				type: 'free_form',
				trigger: 'refunds',
				content: '# refunds',
				references: [],
				status: 'active',
			},
			{
				_id: 'p2',
				name: 'Old',
				type: 'free_form',
				trigger: 'old',
				content: 'x',
				references: [],
				status: 'archived',
			},
		])
		expect(config.procedures.kind).toBe('inline')
		if (config.procedures.kind === 'inline') {
			expect(config.procedures.items).toHaveLength(1)
			expect(config.procedures.items[0]?.sourceProcedureId).toBe('p1')
		}
	})

	test('invalid procedure blocks the publish atomically', () => {
		expect(() =>
			buildVersionSnapshot(draftFields('A'), [
				{
					_id: 'p1',
					name: 'Broken',
					type: 'structured',
					trigger: 't',
					steps: undefined,
					references: [],
					status: 'active',
				},
			]),
		).toThrow(/require steps/)
	})

	test('size budget produces a typed error naming the limit', () => {
		expect(() =>
			buildVersionSnapshot(draftFields('A'), [
				{
					_id: 'p1',
					name: 'Huge',
					type: 'free_form',
					trigger: 't',
					content: 'x'.repeat(900_000),
					references: [],
					status: 'active',
				},
			]),
		).toThrow(/over the 800000-byte budget/)
	})
})

describe('crud tier + triggers (Units 8-9)', () => {
	test('crud.destroy on an agent fires the cascade trigger', async () => {
		const t = convexTest(schema, modules)
		const { agentId } = await seedAgentWithVersion(t, ORG_A)
		await t.run(async (ctx) => {
			await ctx.db.insert('procedures', {
				tenant: ORG_A,
				agentId,
				name: 'P',
				type: 'free_form' as const,
				trigger: 'x',
				content: 'body',
				references: [],
				source: 'manual' as const,
				status: 'active' as const,
				createdAt: T0,
			})
		})
		await t.mutation(internal.api.crud.agents.destroy, { id: agentId })
		const leftovers = await t.run(async (ctx) => ({
			procedures: await ctx.db.query('procedures').collect(),
			versions: await ctx.db.query('agentVersions').collect(),
		}))
		expect(leftovers.procedures).toHaveLength(0)
		expect(leftovers.versions).toHaveLength(0)
	})

	test('kb chunk writes maintain chunkCount; document delete cascades', async () => {
		const t = convexTest(schema, modules)
		const documentId = await t.run(async (ctx) =>
			ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				name: 'FAQ',
				type: 'text' as const,
				content: 'a\n\nb',
				usageMode: 'auto' as const,
				status: 'processing' as const,
				sizeBytes: 4,
				chunkCount: 0,
				createdAt: T0,
			}),
		)
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId,
			chunks: [
				{ order: 0, text: 'a', embedding: [0.1, 0.2] },
				{ order: 1, text: 'b', embedding: [0.3, 0.4] },
			],
		})
		const afterWrite = await t.run(async (ctx) => ctx.db.get(documentId))
		expect(afterWrite?.status).toBe('indexed')
		expect(afterWrite?.chunkCount).toBe(2)

		// idempotent re-entry: same write again does not duplicate
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId,
			chunks: [{ order: 0, text: 'a2', embedding: [0.5, 0.6] }],
		})
		const rewritten = await t.run(async (ctx) => ({
			doc: await ctx.db.get(documentId),
			chunks: await ctx.db.query('kbChunks').collect(),
			embeddings: await ctx.db.query('kbEmbeddings').collect(),
		}))
		expect(rewritten.doc?.chunkCount).toBe(1)
		expect(rewritten.chunks).toHaveLength(1)
		expect(rewritten.embeddings).toHaveLength(1)

		await t.mutation(internal.api.crud.kbDocuments.destroy, { id: documentId })
		const afterDelete = await t.run(async (ctx) => ({
			chunks: await ctx.db.query('kbChunks').collect(),
			embeddings: await ctx.db.query('kbEmbeddings').collect(),
		}))
		expect(afterDelete.chunks).toHaveLength(0)
		expect(afterDelete.embeddings).toHaveLength(0)
	})

	test('deleting a referenced procedure flips the referrer to invalid', async () => {
		const t = convexTest(schema, modules)
		const { agentId } = await seedAgentWithVersion(t, ORG_A)
		const { targetId, referrerId } = await t.run(async (ctx) => {
			const targetId = await ctx.db.insert('procedures', {
				tenant: ORG_A,
				agentId,
				name: 'Verify identity',
				type: 'structured' as const,
				trigger: 'verify',
				steps: [{ type: 'ask' as const, instruction: 'id?' }],
				references: [],
				source: 'manual' as const,
				status: 'active' as const,
				createdAt: T0,
			})
			const referrerId = await ctx.db.insert('procedures', {
				tenant: ORG_A,
				agentId,
				name: 'Refunds',
				type: 'free_form' as const,
				trigger: 'refunds',
				content: 'verify first',
				references: [
					{
						location: 'content' as const,
						targetType: 'procedure' as const,
						targetId,
						health: 'valid' as const,
					},
				],
				source: 'manual' as const,
				status: 'active' as const,
				createdAt: T0,
			})
			return { targetId, referrerId }
		})
		await t.mutation(internal.api.crud.procedures.destroy, { id: targetId })
		const referrer = await t.run(async (ctx) => ctx.db.get(referrerId))
		expect(referrer?.references[0]?.health).toBe('invalid')
	})
})

describe('conversation machine path (Unit 10)', () => {
	test('start from phone → appends with gapless sequences → finish', async () => {
		const t = convexTest(schema, modules)
		const { agentId, versionId } = await seedAgentWithVersion(t, ORG_A)
		const phoneId = await t.run(async (ctx) =>
			ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				number: '+15551234567',
				provider: 'twilio' as const,
				label: '',
				status: 'active' as const,
				assignedAgentId: agentId,
				createdAt: T0,
			}),
		)
		const conversationId = await t.mutation(
			internal.api.conversations.startFromPhoneNumber,
			{
				ownerId: phoneId,
				agentVersionId: versionId,
				provider: 'openai',
				channel: 'voice_inbound',
				direction: 'inbound',
			},
		)
		for (let i = 0; i < 3; i++) {
			const { sequence } = await t.mutation(
				internal.api.conversations.appendMessage,
				{
					ownerId: conversationId,
					role: i % 2 === 0 ? 'user' : 'agent',
					text: `turn ${i}`,
					interrupted: false,
				},
			)
			expect(sequence).toBe(i + 1)
		}
		await t.mutation(internal.api.conversations.finish, {
			ownerId: conversationId,
			status: 'done',
			durationSecs: 42,
		})
		const conversation = await t.run(async (ctx) => ctx.db.get(conversationId))
		expect(conversation?.tenant).toBe(ORG_A)
		expect(conversation?.status).toBe('done')
		expect(conversation?.messageCount).toBe(3)

		// append to a done conversation rejects
		await expect(
			t.mutation(internal.api.conversations.appendMessage, {
				ownerId: conversationId,
				role: 'user',
				text: 'late',
				interrupted: false,
			}),
		).rejects.toThrow(/done conversation/)
	})

	test('cross-tenant start rejects: phone from org A + version from org B', async () => {
		const t = convexTest(schema, modules)
		const a = await seedAgentWithVersion(t, ORG_A)
		const b = await seedAgentWithVersion(t, ORG_B)
		const phoneA = await t.run(async (ctx) =>
			ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				number: '+15550000001',
				provider: 'twilio' as const,
				label: '',
				status: 'active' as const,
				assignedAgentId: a.agentId,
				createdAt: T0,
			}),
		)
		await expect(
			t.mutation(internal.api.conversations.startFromPhoneNumber, {
				ownerId: phoneA,
				agentVersionId: b.versionId,
				provider: 'openai',
				channel: 'voice_inbound',
				direction: 'inbound',
			}),
		).rejects.toThrow(/tenant mismatch/)
		const conversations = await t.run(async (ctx) =>
			ctx.db.query('conversations').collect(),
		)
		expect(conversations).toHaveLength(0)
	})
})

describe('kb search scoping (Unit 9)', () => {
	test('vector search stays inside the version KB scope and tenant', async () => {
		const t = convexTest(schema, modules)
		// org A: agent version scoped to doc1 only; doc2 same tenant, unscoped;
		// org B: doc3 with an identical vector — must never surface
		const seeded = await t.run(async (ctx) => {
			const mkDoc = async (tenant: string, name: string) =>
				ctx.db.insert('kbDocuments', {
					tenant,
					name,
					type: 'text' as const,
					content: name,
					usageMode: 'auto' as const,
					status: 'indexed' as const,
					sizeBytes: 1,
					chunkCount: 0,
					createdAt: T0,
				})
			const doc1 = await mkDoc(ORG_A, 'scoped')
			const doc2 = await mkDoc(ORG_A, 'unscoped')
			const doc3 = await mkDoc(ORG_B, 'other-org')
			const agentId = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
			const versionId = await ctx.db.insert('agentVersions', {
				tenant: ORG_A,
				agentId,
				version: 1,
				publishedBy: 'user',
				config: {
					...draftFields('A'),
					knowledgeBase: [{ documentId: doc1, usageMode: 'auto' as const }],
					procedures: { kind: 'inline' as const, items: [] },
				},
				createdAt: T0,
			})
			const conversationId = await ctx.db.insert('conversations', {
				tenant: ORG_A,
				agentId,
				agentVersionId: versionId,
				provider: 'openai' as const,
				channel: 'web' as const,
				direction: 'inbound' as const,
				status: 'in_progress' as const,
				startedAt: T0,
				hasAudio: false,
				messageCount: 0,
				createdAt: T0,
			})
			return { doc1, doc2, doc3, conversationId }
		})
		const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId: seeded.doc1,
			chunks: [{ order: 0, text: 'SKU-12345 pricing', embedding: vector }],
		})
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId: seeded.doc2,
			chunks: [{ order: 0, text: 'unscoped secret', embedding: vector }],
		})
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId: seeded.doc3,
			chunks: [{ order: 0, text: 'org-b secret', embedding: vector }],
		})

		const results = await t.action(internal.api.kbSearch.searchWithVector, {
			conversationId: seeded.conversationId,
			vector,
			query: 'SKU-12345',
		})
		expect(results.length).toBeGreaterThan(0)
		const texts = results.map((r: { text: string }) => r.text).join(' ')
		expect(texts).toContain('SKU-12345')
		expect(texts).not.toContain('unscoped secret')
		expect(texts).not.toContain('org-b secret')
	})
})

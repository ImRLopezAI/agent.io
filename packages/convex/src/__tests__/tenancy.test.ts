/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import schema from '../schema'
import { modules } from '../testModules.test'

const ORG_A = 'org_aaaa'
const ORG_B = 'org_bbbb'

const agentDoc = (tenant: string, name: string) => ({
	tenant,
	name,
	instructions: '',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: {},
	mcp: [],
	knowledgeBase: [],
	archived: false,
	createdAt: '2026-07-05T00:00:00Z',
})

describe('tenant isolation at the schema/db layer', () => {
	test('by_tenant index scoping returns only the caller org rows', async () => {
		const t = convexTest(schema, modules)
		await t.run(async (ctx) => {
			await ctx.db.insert('agents', agentDoc(ORG_A, 'A1'))
			await ctx.db.insert('agents', agentDoc(ORG_A, 'A2'))
			await ctx.db.insert('agents', agentDoc(ORG_B, 'B1'))
		})
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query('agents')
				.withIndex('by_tenant', (q) => q.eq('tenant', ORG_A))
				.collect(),
		)
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => r.tenant === ORG_A)).toBe(true)
	})

	test('machine-path derivation: conversation copies tenant from phone number', async () => {
		const t = convexTest(schema, modules)
		const { phoneId, agentId, versionId } = await t.run(async (ctx) => {
			const agentId = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
			const versionId = await ctx.db.insert('agentVersions', {
				tenant: ORG_A,
				agentId,
				version: 1,
				publishedBy: 'user_1',
				config: {
					...agentDoc(ORG_A, 'A'),
					tenant: undefined,
					archived: undefined,
					createdAt: undefined,
					procedures: { kind: 'inline' as const, items: [] },
				} as never,
				createdAt: '2026-07-05T00:00:00Z',
			})
			const phoneId = await ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				number: '+15551234567',
				provider: 'twilio' as const,
				label: '',
				status: 'active' as const,
				assignedAgentId: agentId,
				createdAt: '2026-07-05T00:00:00Z',
			})
			return { phoneId, agentId, versionId }
		})

		// derive tenant the machineMutation way: load owner, copy tenant
		const derived = await t.run(async (ctx) => {
			const owner = await ctx.db.get(phoneId)
			if (!owner?.tenant) throw new Error('no tenant on owner')
			const conversationId = await ctx.db.insert('conversations', {
				tenant: owner.tenant,
				agentId,
				agentVersionId: versionId,
				provider: 'openai' as const,
				channel: 'voice_inbound' as const,
				direction: 'inbound' as const,
				status: 'initiated' as const,
				startedAt: '2026-07-05T00:00:01Z',
				phoneNumberId: phoneId,
				hasAudio: false,
				messageCount: 0,
				createdAt: '2026-07-05T00:00:01Z',
			})
			return ctx.db.get(conversationId)
		})
		expect(derived?.tenant).toBe(ORG_A)
	})

	test('tenant mismatch across referenced resources is detectable', async () => {
		const t = convexTest(schema, modules)
		const { phoneA, versionB } = await t.run(async (ctx) => {
			const agentA = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
			const agentB = await ctx.db.insert('agents', agentDoc(ORG_B, 'B'))
			const versionB = await ctx.db.insert('agentVersions', {
				tenant: ORG_B,
				agentId: agentB,
				version: 1,
				publishedBy: 'user_b',
				config: {
					...agentDoc(ORG_B, 'B'),
					tenant: undefined,
					archived: undefined,
					createdAt: undefined,
					procedures: { kind: 'inline' as const, items: [] },
				} as never,
				createdAt: '2026-07-05T00:00:00Z',
			})
			const phoneA = await ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				number: '+15550000001',
				provider: 'twilio' as const,
				label: '',
				status: 'active' as const,
				assignedAgentId: agentA,
				createdAt: '2026-07-05T00:00:00Z',
			})
			return { phoneA, versionB }
		})

		const { assertSameTenant } = await import('../tenancy')
		await t.run(async (ctx) => {
			const phone = await ctx.db.get(phoneA)
			const version = await ctx.db.get(versionB)
			expect(() => assertSameTenant(phone!.tenant, [phone, version])).toThrow(
				/tenant mismatch/,
			)
		})
	})

	test('vector + search index definitions survive schema wiring', async () => {
		// convexTest(schema) validates the schema shape — reaching here means
		// vector/search index declarations from the domain helper are accepted.
		const t = convexTest(schema, modules)
		await t.run(async (ctx) => {
			const docId = await ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				name: 'FAQ',
				type: 'text' as const,
				content: 'hello world',
				usageMode: 'auto' as const,
				status: 'processing' as const,
				sizeBytes: 11,
				chunkCount: 0,
				createdAt: '2026-07-05T00:00:00Z',
			})
			await ctx.db.insert('kbChunks', {
				tenant: ORG_A,
				documentId: docId,
				order: 0,
				text: 'hello world',
				createdAt: '2026-07-05T00:00:00Z',
			})
		})
		const chunks = await t.run(async (ctx) =>
			ctx.db
				.query('kbChunks')
				.withSearchIndex('search_text', (q) =>
					q.search('text', 'hello').eq('tenant', ORG_A),
				)
				.collect(),
		)
		expect(chunks).toHaveLength(1)
	})
})

/// <reference types="vite/client" />
/**
 * Unit 14 — cross-package contract suite. Imports the REAL TranscriptRecorder
 * and resolver from @agent.io/agent (dev-only dependency edge; the agent
 * package never imports convex) and drives them against the ACTUAL Convex
 * functions via convex-test. Zero mocked Convex surfaces: arg-shape drift
 * between the recorder and the machine-path validators is caught HERE, not
 * in the app plans.
 */
import {
	type CallControl,
	type ConvexIngest,
	expand,
	type NormalizedEvent,
	TranscriptRecorder,
} from '@agent.io/agent'
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import schema from '../schema'
import { modules } from '../testModules.test'

const ORG_A = 'org_aaaa'
const T0 = '2026-07-05T00:00:00Z'

const noopControl: CallControl = {
	hangup: async () => {},
	transfer: async () => {},
	playDtmf: async () => {},
	markVoicemail: async () => {},
	skipTurn: async () => {},
	detectLanguage: async () => {},
	transferToAgent: async () => {},
}

const draftFields = {
	name: 'Support',
	instructions: 'You help {{user_name}}.',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: { end_call: { enabled: true } },
	mcp: [],
	knowledgeBase: [],
}

const seed = async (t: ReturnType<typeof convexTest>) =>
	t.run(async (ctx) => {
		const agentId = await ctx.db.insert('agents', {
			...draftFields,
			tenant: ORG_A,
			archived: false,
			createdAt: T0,
		})
		const versionId = await ctx.db.insert('agentVersions', {
			tenant: ORG_A,
			agentId,
			version: 1,
			publishedBy: 'user',
			config: {
				...draftFields,
				procedures: { kind: 'inline' as const, items: [] },
			},
			createdAt: T0,
		})
		const phoneId = await ctx.db.insert('phoneNumbers', {
			tenant: ORG_A,
			number: '+15551234567',
			provider: 'twilio' as const,
			label: '',
			status: 'active' as const,
			assignedAgentId: agentId,
			createdAt: T0,
		})
		return { agentId, versionId, phoneId }
	})

/** Bind the agent package's injected interface to the REAL functions. */
const bindIngest = (
	t: ReturnType<typeof convexTest>,
	ids: { phoneId: Id<'phoneNumbers'>; versionId: Id<'agentVersions'> },
): ConvexIngest => ({
	start: async (args) =>
		args.ownerKind === 'phoneNumber'
			? t.mutation(internal.api.conversations.startFromPhoneNumber, {
					ownerId: ids.phoneId,
					agentVersionId: ids.versionId,
					provider: args.provider,
					channel: args.channel,
					direction: args.direction,
				})
			: t.mutation(internal.api.conversations.startFromVersion, {
					ownerId: ids.versionId,
					provider: args.provider,
					channel: args.channel,
					direction: args.direction,
				}),
	append: async ({ conversationId, ...args }) =>
		t.mutation(internal.api.conversations.appendMessage, {
			ownerId: conversationId as Id<'conversations'>,
			...args,
		}),
	finish: async ({ conversationId, ...args }) => {
		await t.mutation(internal.api.conversations.finish, {
			ownerId: conversationId as Id<'conversations'>,
			...args,
		})
	},
	searchKnowledgeBase: async ({ conversationId, query }) =>
		t.action(internal.api.kbSearch.searchWithVector, {
			conversationId: conversationId as Id<'conversations'>,
			vector: Array.from({ length: 1536 }, () => 0),
			query,
		}),
})

describe('agent ↔ convex contract (Unit 14)', () => {
	test('recorder drives the real machine path: rows, tenant, gapless sequences', async () => {
		const t = convexTest(schema, modules)
		const ids = await seed(t)
		const ingest = bindIngest(t, ids)

		const conversationId = await ingest.start({
			ownerKind: 'phoneNumber',
			ownerId: ids.phoneId,
			provider: 'openai',
			channel: 'voice_inbound',
			direction: 'inbound',
		})
		const recorder = new TranscriptRecorder(ingest)
		recorder.bind(conversationId)

		const stream: NormalizedEvent[] = [
			{ type: 'session.ready' },
			{
				type: 'user.transcript',
				text: 'I need help with my order',
				final: true,
			},
			{ type: 'agent.response_started', responseId: 'r1' },
			{ type: 'tool.call', callId: 'c1', name: 'end_call', argsJson: '{}' },
			{
				type: 'agent.transcript',
				text: 'Happy to help. Goodbye!',
				final: true,
				itemId: 'i1',
			},
			{ type: 'agent.response_done', responseId: 'r1', status: 'completed' },
			{ type: 'closed', reason: 'hangup' },
		]
		for (const event of stream) recorder.onEvent(event)
		await recorder.flush()

		const state = await t.run(async (ctx) => {
			const conversation = await ctx.db.get(
				conversationId as Id<'conversations'>,
			)
			const messages = await ctx.db
				.query('conversationMessages')
				.withIndex('by_conversation', (q) =>
					q.eq('conversationId', conversationId as Id<'conversations'>),
				)
				.collect()
			return { conversation, messages }
		})
		expect(state.conversation?.tenant).toBe(ORG_A)
		expect(state.conversation?.status).toBe('done')
		expect(state.messages.map((m) => m.sequence)).toEqual([1, 2])
		expect(state.messages[1]?.toolCalls?.[0]?.name).toBe('end_call')
	})

	test('resolver KB tool hits the real search action within scope', async () => {
		const t = convexTest(schema, modules)
		const base = await seed(t)
		// version with a scoped auto KB doc + seeded chunk
		const scoped = await t.run(async (ctx) => {
			const documentId = await ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				name: 'Pricing',
				type: 'text' as const,
				content: 'SKU-99 costs $10',
				usageMode: 'auto' as const,
				status: 'indexed' as const,
				sizeBytes: 16,
				chunkCount: 0,
				createdAt: T0,
			})
			const versionId = await ctx.db.insert('agentVersions', {
				tenant: ORG_A,
				agentId: base.agentId,
				version: 2,
				publishedBy: 'user',
				config: {
					...draftFields,
					knowledgeBase: [{ documentId, usageMode: 'auto' as const }],
					procedures: { kind: 'inline' as const, items: [] },
				},
				createdAt: T0,
			})
			return { documentId, versionId }
		})
		const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))
		await t.mutation(internal.api.knowledgeBase.writeChunks, {
			documentId: scoped.documentId,
			chunks: [{ order: 0, text: 'SKU-99 costs $10', embedding: vector }],
		})
		const ingest = bindIngest(t, {
			phoneId: base.phoneId,
			versionId: scoped.versionId,
		})
		const conversationId = await ingest.start({
			ownerKind: 'agentVersion',
			ownerId: scoped.versionId,
			provider: 'openai',
			channel: 'web',
			direction: 'inbound',
		})

		const version = await t.run(async (ctx) => ctx.db.get(scoped.versionId))
		const cfg = await expand({
			version: {
				versionId: scoped.versionId,
				agentId: base.agentId,
				tenant: ORG_A,
				config: version!.config,
			},
			conversationId,
			control: noopControl,
			deps: {
				ingest,
				composio: {
					create: async () => {
						throw new Error('not used')
					},
					use: async () => {
						throw new Error('not used')
					},
				},
				sessionCache: { get: async () => null, put: async () => {} },
				loadConnection: async () => null,
				loadKbPromptDocs: async () => [],
			},
		})
		const kbTool = cfg.tools.find(
			(tool) => tool.name === 'search_knowledge_base',
		)
		expect(kbTool).toBeDefined()
		const result = await ingest.searchKnowledgeBase({
			conversationId,
			query: 'SKU-99',
		})
		expect(result.map((r) => r.text).join(' ')).toContain('SKU-99')
	})

	test('arg-shape drift is caught: bad payload fails the real validator', async () => {
		const t = convexTest(schema, modules)
		const ids = await seed(t)
		await expect(
			t.mutation(internal.api.conversations.appendMessage, {
				ownerId: ids.versionId as never, // wrong owner table id
				role: 'user',
				text: 'x',
				interrupted: false,
			}),
		).rejects.toThrow()
	})
})

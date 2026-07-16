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
import ragTest from '@convex-dev/rag/test'
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { v } from 'convex/values'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { action, mutation } from '../_generated/server'
import { rag, RAG_EMBEDDING } from '../rag'
import schema from '../schema'
import { modules } from '../testModules.test'

const ORG_A = 'org_aaaa'
const T0 = '2026-07-05T00:00:00Z'
const contractTestApi = anyApi['__tests__/agent-contract.test']
const testVector = Array.from(
	{ length: RAG_EMBEDDING.dimensions },
	(_, index) => (index === 0 ? 1 : 0),
)

export const addContractEntryForTest = mutation({
	args: {
		namespace: v.string(),
		documentId: v.string(),
		text: v.string(),
	},
	handler: async (ctx, args) =>
		rag.add(ctx, {
			namespace: args.namespace,
			key: `kb:${args.documentId}`,
			title: 'Pricing',
			metadata: { title: 'Pricing', sourceType: 'text', sourceUrl: null },
			filterValues: [{ name: 'documentId', value: args.documentId }],
			chunks: [{ text: args.text, embedding: testVector }],
		}),
})

export const searchScopedEntryForTest = action({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const scope = await ctx.runQuery(
			internal.api.kbSearch.scopeForConversation,
			{ conversationId },
		)
		if (scope.documentIds.length === 0) {
			return { text: '', results: [], entries: [], usage: { tokens: 0 } }
		}
		return rag.search(ctx, {
			namespace: scope.tenant,
			query: testVector,
			filters: scope.documentIds.map((documentId: string) => ({
				name: 'documentId' as const,
				value: documentId,
			})),
			vectorScoreThreshold: 0.5,
		})
	},
})

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
	instructions: 'You help {{user_name}}.',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: { end_call: { enabled: true } },
	mcp: [],
	knowledgeBase: [],
	inboundWorkflow: { enabled: true, firstSpeaker: 'caller' as const },
	outboundWorkflow: { enabled: true, firstSpeaker: 'agent' as const },
}

const seed = async (t: ReturnType<typeof convexTest>) =>
	t.run(async (ctx) => {
		const agentId = await ctx.db.insert('agents', {
			tenant: ORG_A,
			name: 'Support',
			allocationRevision: 0,
			archived: false,
			createdAt: T0,
		})
		const variantId = await ctx.db.insert('agentVariants', {
			tenant: ORG_A,
			agentId,
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 10_000,
			draft: draftFields,
			archived: false,
			createdAt: T0,
		})
		const versionId = await ctx.db.insert('agentVersions', {
			tenant: ORG_A,
			agentId,
			agentVariantId: variantId,
			version: 1,
			publishedBy: 'user',
			config: {
				...draftFields,
				procedures: { kind: 'inline' as const, items: [] },
			},
			createdAt: T0,
		})
		await ctx.db.patch(agentId, { mainVariantId: variantId })
		await ctx.db.patch(variantId, { publishedVersionId: versionId })
		const telephonyConnectionId = await ctx.db.insert('telephonyConnections', {
			tenant: ORG_A,
			provider: 'twilio',
			label: 'Test',
			providerAccountId: 'AC_TEST',
			credentialSecretRef: 'secret_test',
			status: 'active',
			createdAt: T0,
		})
		const phoneId = await ctx.db.insert('phoneNumbers', {
			tenant: ORG_A,
			telephonyConnectionId,
			providerNumberId: 'PN_TEST',
			number: '+15551234567',
			provider: 'twilio' as const,
			label: '',
			countryCode: 'US',
			capabilities: {
				inboundVoice: true,
				outboundVoice: true,
				inboundSms: false,
				outboundSms: false,
			},
			inboundSmsEnabled: false,
			status: 'active' as const,
			assignedAgentId: agentId,
			createdAt: T0,
		})
		return { agentId, variantId, versionId, phoneId }
	})

/** Bind the agent package's injected interface to the REAL functions. */
const bindIngest = (t: ReturnType<typeof convexTest>): ConvexIngest => ({
	start: async (args) => {
		let conversationId: Promise<Id<'conversations'>>
		switch (args.ownerKind) {
			case 'phoneNumber':
				conversationId = t.mutation(
					internal.api.conversations.startFromPhoneNumber,
					{
						ownerId: args.ownerId as Id<'phoneNumbers'>,
						conversationKey: args.conversationKey,
						provider: args.provider,
						externalNumber: args.externalNumber,
					},
				)
				break
			case 'batchCallRecipient':
				conversationId = t.mutation(
					internal.api.conversations.startOutboundFromRecipient,
					{
						ownerId: args.ownerId as Id<'batchCallRecipients'>,
						conversationKey: args.conversationKey,
						provider: args.provider,
						destinationCountryCode: args.destinationCountryCode,
						destinationRegionCode: args.destinationRegionCode,
					},
				)
				break
			case 'whatsappAccount':
				conversationId = t.mutation(
					internal.api.conversations.startFromWhatsappAccount,
					{
						ownerId: args.ownerId as Id<'whatsappAccounts'>,
						conversationKey: args.conversationKey,
						provider: args.provider,
						direction: args.direction,
						externalNumber: args.externalNumber,
					},
				)
				break
			case 'agentVersion':
				conversationId = t.mutation(
					internal.api.conversations.startFromVersion,
					{
						ownerId: args.ownerId as Id<'agentVersions'>,
						conversationKey: args.conversationKey,
						provider: args.provider,
						channel: args.channel,
						direction: args.direction,
					},
				)
				break
		}
		const id = await conversationId
		return t.query(internal.api.conversations.getMachineStartResult, {
			conversationId: id,
		})
	},
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
	searchKnowledgeBase: async ({ conversationId }) =>
		t.action(contractTestApi.searchScopedEntryForTest, {
			conversationId: conversationId as Id<'conversations'>,
		}),
})

describe('agent ↔ convex contract (Unit 14)', () => {
	test('recorder drives the real machine path: rows, tenant, gapless sequences', async () => {
		const t = convexTest(schema, modules)
		const ids = await seed(t)
		const ingest = bindIngest(t)

		const start = await ingest.start({
			ownerKind: 'phoneNumber',
			ownerId: ids.phoneId,
			conversationKey: 'contract-recorder-1',
			provider: 'openai',
			channel: 'voice_inbound',
			direction: 'inbound',
		})
		const conversationId = start.conversationId
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
		expect(state.conversation?.agentVariantId).toBe(ids.variantId)
		expect(state.conversation?.status).toBe('done')
		expect(state.messages.map((m) => m.sequence)).toEqual([1, 2])
		expect(
			state.messages.every((m) => m.agentVariantId === ids.variantId),
		).toBe(true)
		expect(state.messages[1]?.toolCalls?.[0]?.name).toBe('end_call')
	})

	test('resolver KB tool hits the real search action within scope', async () => {
		const t = convexTest(schema, modules)
		ragTest.register(t)
		const base = await seed(t)
		const documentId = await t.run(async (ctx) =>
			ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				archived: false,
				createdAt: T0,
			}),
		)
		const entry = await t.mutation(contractTestApi.addContractEntryForTest, {
			namespace: ORG_A,
			documentId,
			text: 'SKU-99 costs $10',
		})
		await t.run(async (ctx) => {
			await ctx.db.patch(documentId, { activeEntryId: entry.entryId })
		})
		// version with a scoped auto KB document
		const scoped = await t.run(async (ctx) => {
			const versionId = await ctx.db.insert('agentVersions', {
				tenant: ORG_A,
				agentId: base.agentId,
				agentVariantId: base.variantId,
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
		const ingest = bindIngest(t)
		const start = await ingest.start({
			ownerKind: 'agentVersion',
			ownerId: scoped.versionId,
			conversationKey: 'contract-kb-1',
			provider: 'openai',
			channel: 'web',
			direction: 'inbound',
		})
		const conversationId = start.conversationId

		const version = await t.run(async (ctx) => ctx.db.get(scoped.versionId))
		const cfg = await expand({
			version: {
				versionId: scoped.versionId,
				agentId: base.agentId,
				agentVariantId: base.variantId,
				tenant: ORG_A,
				config: version!.config,
			},
			conversationId,
			control: noopControl,
			deps: {
				ingest,
				composio: () => ({
					createSession: async () => {
						throw new Error('not used')
					},
					useSession: async () => {
						throw new Error('not used')
					},
				}),
				sessionCache: { get: async () => null, put: async () => {} },
				loadConnection: async () => null,
				loadKbPromptDocs: async () => ({ documents: [], warnings: [] }),
			},
		})
		const kbTool = cfg.tools.find(
			(tool) => tool.name === 'search_knowledge_base',
		)
		expect(kbTool).toBeDefined()
		const result = await kbTool!.invoke(
			{} as never,
			JSON.stringify({ query: 'SKU-99' }),
		)
		expect(result).toContain('SKU-99')
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
		).rejects.toThrow(/Expected ID for table "conversations"/)
	})
})

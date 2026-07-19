/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import { modules } from '../../testModules.test'
import {
	maskExternalNumber,
	toConversationDetailDto,
	toConversationMessageDto,
	toConversationSummaryDto,
} from '../conversations'
import { buildVersionSnapshot } from '../publishCore'

const ORG_A = 'org_aaaa'
const ORG_B = 'org_bbbb'
const T0 = '2026-07-05T00:00:00Z'

const agentDoc = (tenant: string, name: string) => ({
	tenant,
	name,
	allocationRevision: 0,
	archived: false,
	createdAt: T0,
})

const draftFields = () => ({
	instructions: 'You help.',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: {},
	mcp: [],
	knowledgeBase: [],
	inboundWorkflow: { enabled: true, firstSpeaker: 'caller' as const },
	outboundWorkflow: { enabled: true, firstSpeaker: 'agent' as const },
})

const seedAgentWithVersion = async (
	t: ReturnType<typeof convexTest>,
	tenant: string,
) =>
	t.run(async (ctx) => {
		const agentId = await ctx.db.insert('agents', agentDoc(tenant, 'A'))
		const variantId = await ctx.db.insert('agentVariants', {
			tenant,
			agentId,
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 10_000,
			draft: draftFields(),
			archived: false,
			createdAt: T0,
		})
		const versionId = await ctx.db.insert('agentVersions', {
			tenant,
			agentId,
			agentVariantId: variantId,
			version: 1,
			publishedBy: 'user',
			config: {
				...draftFields(),
				procedures: { kind: 'inline' as const, items: [] },
			},
			createdAt: T0,
		})
		await ctx.db.patch(agentId, { mainVariantId: variantId })
		await ctx.db.patch(variantId, { publishedVersionId: versionId })
		return { agentId, variantId, versionId }
	})

describe('publish core (Unit 8)', () => {
	test('snapshot embeds active procedures and skips archived', () => {
		const config = buildVersionSnapshot(draftFields(), [
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
		expect(
			config.procedures.kind === 'inline' ? config.procedures.items : [],
		).toHaveLength(1)
		expect(
			config.procedures.kind === 'inline'
				? config.procedures.items[0]?.sourceProcedureId
				: undefined,
		).toBe('p1')
	})

	test('invalid procedure blocks the publish atomically', () => {
		expect(() =>
			buildVersionSnapshot(draftFields(), [
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
			buildVersionSnapshot(draftFields(), [
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
		const { agentId, variantId } = await seedAgentWithVersion(t, ORG_A)
		await t.run(async (ctx) => {
			await ctx.db.insert('procedures', {
				tenant: ORG_A,
				agentVariantId: variantId,
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
		await t.mutation(internal.api.internals.agents.destroy, { id: agentId })
		const leftovers = await t.run(async (ctx) => ({
			variants: await ctx.db.query('agentVariants').collect(),
			procedures: await ctx.db.query('procedures').collect(),
			versions: await ctx.db.query('agentVersions').collect(),
		}))
		expect(leftovers.variants).toHaveLength(0)
		expect(leftovers.procedures).toHaveLength(0)
		expect(leftovers.versions).toHaveLength(0)
	})

	test('knowledge registry activates, records failures, and archives', async () => {
		const t = convexTest(schema, modules)
		const documentId = await t.run(async (ctx) =>
			ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				archived: false,
				createdAt: T0,
			}),
		)
		expect(
			await t.mutation(internal.api.knowledgeBase.activateEntry, {
				documentId,
				entryId: 'entry_1',
			}),
		).toBe(true)
		await t.mutation(internal.api.knowledgeBase.recordFailure, {
			documentId,
			message: 'sanitized failure',
		})
		const failed = await t.run(async (ctx) => ctx.db.get(documentId))
		expect(failed?.activeEntryId).toBe('entry_1')
		expect(failed?.lastError).toBe('sanitized failure')

		await t.mutation(internal.api.knowledgeBase.markArchived, {
			documentId,
		})
		const archived = await t.run(async (ctx) => ctx.db.get(documentId))
		expect(archived?.activeEntryId).toBeUndefined()
		expect(archived?.archivedAt).toBeTruthy()
		expect(
			await t.mutation(internal.api.knowledgeBase.activateEntry, {
				documentId,
				entryId: 'entry_2',
			}),
		).toBe(false)
	})

	test('deleting a referenced procedure flips the referrer to invalid', async () => {
		const t = convexTest(schema, modules)
		const { variantId } = await seedAgentWithVersion(t, ORG_A)
		const { targetId, referrerId } = await t.run(async (ctx) => {
			const targetId = await ctx.db.insert('procedures', {
				tenant: ORG_A,
				agentVariantId: variantId,
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
				agentVariantId: variantId,
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
		await t.mutation(internal.api.internals.procedures.destroy, {
			id: targetId,
		})
		const referrer = await t.run(async (ctx) => ctx.db.get(referrerId))
		expect(referrer?.references[0]?.health).toBe('invalid')
	})
})

describe('retention and erasure (hardening U8)', () => {
	const conversationDoc = (
		ids: { agentId: unknown; variantId: unknown; versionId: unknown },
		overrides: Record<string, unknown>,
	) => ({
		tenant: ORG_A,
		conversationKey: 'ret-default',
		idempotencyFingerprint: 'fp',
		agentId: ids.agentId as never,
		agentVariantId: ids.variantId as never,
		agentVersionId: ids.versionId as never,
		allocationMode: 'weighted' as const,
		workflow: 'inbound' as const,
		provider: 'openai' as const,
		channel: 'voice_inbound' as const,
		direction: 'inbound' as const,
		status: 'done' as const,
		startedAt: T0,
		hasAudio: false,
		messageCount: 1,
		createdAt: T0,
		externalNumber: '+18095550001',
		...overrides,
	})

	test('purge redacts expired conversations, keeps recent, sweeps abandoned', async () => {
		const t = convexTest(schema, modules)
		const ids = await seedAgentWithVersion(t, ORG_A)
		const { expiredId, recentId, abandonedId } = await t.run(async (ctx) => {
			const expiredId = await ctx.db.insert(
				'conversations',
				conversationDoc(ids, {
					conversationKey: 'ret-expired-1',
					endedAt: '2026-01-01T00:00:00.000Z',
				}) as never,
			)
			await ctx.db.insert('conversationMessages', {
				tenant: ORG_A,
				conversationId: expiredId,
				agentId: ids.agentId as never,
				agentVariantId: ids.variantId as never,
				sequence: 1,
				role: 'user',
				text: 'sensitive transcript',
				interrupted: false,
				createdAt: T0,
			} as never)
			const recentId = await ctx.db.insert(
				'conversations',
				conversationDoc(ids, {
					conversationKey: 'ret-recent-1',
					endedAt: new Date().toISOString(),
				}) as never,
			)
			const abandonedId = await ctx.db.insert(
				'conversations',
				conversationDoc(ids, {
					conversationKey: 'ret-abandoned-1',
					status: 'initiated',
					endedAt: undefined,
				}) as never,
			)
			return { expiredId, recentId, abandonedId }
		})
		await t.mutation(
			internal.api.internals.retention.purgeExpiredConversationData,
			{ retentionDays: 30 },
		)
		const [expired, recent, abandoned, messages] = await t.run(async (ctx) => [
			await ctx.db.get(expiredId),
			await ctx.db.get(recentId),
			await ctx.db.get(abandonedId),
			await ctx.db
				.query('conversationMessages')
				.withIndex('by_conversation', (q) => q.eq('conversationId', expiredId))
				.collect(),
		])
		expect((expired as { redactedAt?: string })?.redactedAt).toBeDefined()
		expect(
			(expired as { externalNumber?: string })?.externalNumber,
		).toBeUndefined()
		expect((expired as { conversationKey?: string })?.conversationKey).toBe(
			`redacted:${expiredId}`,
		)
		expect((expired as { agentVariantId?: string })?.agentVariantId).toBe(
			ids.variantId,
		)
		expect(messages).toHaveLength(0)
		expect((recent as { redactedAt?: string })?.redactedAt).toBeUndefined()
		expect((recent as { externalNumber?: string })?.externalNumber).toBe(
			'+18095550001',
		)
		// _creationTime is set at insert, so the abandoned row is not yet past
		// the window — a purge with a future cutoff exercises Sweep B.
		expect((abandoned as { status?: string })?.status).toBe('initiated')
		await t.mutation(
			internal.api.internals.retention.purgeExpiredConversationData,
			{ retentionDays: -1 },
		)
		const abandonedAfter = await t.run(async (ctx) => ctx.db.get(abandonedId))
		expect((abandonedAfter as { status?: string })?.status).toBe('failed')
		expect(
			(abandonedAfter as { terminationReason?: string })?.terminationReason,
		).toBe('never_dialed')
	})

	test('erasure primitive redacts named conversations, tenant-guarded', async () => {
		const t = convexTest(schema, modules)
		const ids = await seedAgentWithVersion(t, ORG_A)
		const conversationId = await t.run(async (ctx) =>
			ctx.db.insert(
				'conversations',
				conversationDoc(ids, {
					conversationKey: 'ret-erase-1',
					endedAt: new Date().toISOString(),
				}) as never,
			),
		)
		const wrongTenant = await t.mutation(
			internal.api.internals.retention.deleteConversationData,
			{ tenant: ORG_B, conversationIds: [conversationId] },
		)
		expect(wrongTenant.redacted).toBe(0)
		const result = await t.mutation(
			internal.api.internals.retention.deleteConversationData,
			{ tenant: ORG_A, conversationIds: [conversationId] },
		)
		expect(result.redacted).toBe(1)
		const row = await t.run(async (ctx) => ctx.db.get(conversationId))
		expect((row as { redactedAt?: string })?.redactedAt).toBeDefined()
	})
})

describe('conversation machine path (Unit 10)', () => {
	test('start from phone → appends with gapless sequences → finish', async () => {
		const t = convexTest(schema, modules)
		const { agentId, variantId, versionId } = await seedAgentWithVersion(
			t,
			ORG_A,
		)
		const phoneId = await t.run(async (ctx) => {
			const telephonyConnectionId = await ctx.db.insert(
				'telephonyConnections',
				{
					tenant: ORG_A,
					provider: 'twilio',
					label: 'Test',
					providerAccountId: 'AC_A',
					credentialSecretRef: 'secret_a',
					status: 'active',
					createdAt: T0,
				},
			)
			return ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				telephonyConnectionId,
				providerNumberId: 'PN_A_1',
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
		})
		const conversationId = await t.mutation(
			internal.api.conversations.startFromPhoneNumber,
			{
				ownerId: phoneId,
				conversationKey: 'api-inbound-1',
				provider: 'openai',
			},
		)
		const conversationKey = 'api-inbound-1'
		const retriedConversationId = await t.mutation(
			internal.api.conversations.startFromPhoneNumber,
			{
				ownerId: phoneId,
				conversationKey: 'api-inbound-1',
				provider: 'openai',
			},
		)
		expect(retriedConversationId).toBe(conversationId)
		await expect(
			t.mutation(internal.api.conversations.startFromPhoneNumber, {
				ownerId: phoneId,
				conversationKey: 'api-inbound-1',
				provider: 'xai',
			}),
		).rejects.toThrow(/idempotency_conflict/)
		// Stateless-caller redelivery: fresh key, same provider session → same row.
		const sessionConversationId = await t.mutation(
			internal.api.conversations.startFromPhoneNumber,
			{
				ownerId: phoneId,
				conversationKey: 'api-inbound-session-1',
				provider: 'openai',
				providerSessionId: 'CA_redelivery_1',
			},
		)
		const redeliveredConversationId = await t.mutation(
			internal.api.conversations.startFromPhoneNumber,
			{
				ownerId: phoneId,
				conversationKey: 'api-inbound-session-2',
				provider: 'openai',
				providerSessionId: 'CA_redelivery_1',
			},
		)
		expect(redeliveredConversationId).toBe(sessionConversationId)
		let firstRetrySequence: number | undefined
		for (let i = 0; i < 3; i++) {
			const appendArgs = {
				ownerId: conversationId,
				conversationKey,
				messageKey: `turn:${i}`,
				role: i % 2 === 0 ? ('user' as const) : ('agent' as const),
				text: `turn ${i}`,
				interrupted: false,
			}
			const { sequence } = await t.mutation(
				internal.api.conversations.appendMessage,
				appendArgs,
			)
			expect(sequence).toBe(i + 1)
			if (i === 0) {
				const retry = await t.mutation(
					internal.api.conversations.appendMessage,
					appendArgs,
				)
				firstRetrySequence = retry.sequence
			}
		}
		expect(firstRetrySequence).toBe(1)
		const retrieval = await t.mutation(
			internal.api.conversations.appendMessage,
			{
				ownerId: conversationId,
				conversationKey,
				role: 'agent',
				toolResults: [
					{
						callId: 'kb_1',
						output: 'The current policy text',
						isError: false,
						retrievalEntryIds: ['entry_ready_1'],
					},
				],
				interrupted: false,
			},
		)
		expect(retrieval.sequence).toBe(4)
		await expect(
			t.mutation(internal.api.conversations.finish, {
				ownerId: conversationId,
				conversationKey: 'wrong-key',
				status: 'done',
				durationSecs: 42,
			}),
		).rejects.toThrow(/conversation_key_mismatch/)
		await t.mutation(internal.api.conversations.finish, {
			ownerId: conversationId,
			conversationKey,
			status: 'done',
			durationSecs: 42,
		})
		expect(
			await t.mutation(internal.api.conversations.finish, {
				ownerId: conversationId,
				conversationKey,
				status: 'done',
				durationSecs: 42,
			}),
		).toEqual({ status: 'already_finished' })
		await expect(
			t.mutation(internal.api.conversations.finish, {
				ownerId: conversationId,
				conversationKey,
				status: 'done',
				durationSecs: 43,
			}),
		).rejects.toThrow(/terminal_state_conflict/)
		const conversation = await t.run(async (ctx) =>
			ctx.db.get(conversationId as Id<'conversations'>),
		)
		expect(conversation?.tenant).toBe(ORG_A)
		expect(conversation?.agentVariantId).toBe(variantId)
		expect(conversation?.allocationMode).toBe('weighted')
		const variantAfter = await t.run(async (ctx) =>
			ctx.db.get(variantId as Id<'agentVariants'>),
		)
		// 1 keyed conversation + 1 session-dedupe conversation; one finish
		expect(variantAfter?.conversationCount).toBe(2)
		expect(variantAfter?.doneCount).toBe(1)
		expect(variantAfter?.failedCount ?? 0).toBe(0)
		expect(conversation?.status).toBe('done')
		expect(conversation?.messageCount).toBe(4)
		expect(conversation?.phoneNumberSnapshot?.number).toBe('+15551234567')
		const runtime = await t.query(
			internal.api.conversations.getMachineStartResult,
			{ conversationId },
		)
		expect(runtime).toMatchObject({
			conversationId,
			agentVariantId: variantId,
			agentVersionId: versionId,
			workflow: 'inbound',
			phone: { number: '+15551234567', provider: 'twilio' },
		})
		const messages = await t.run(async (ctx) =>
			ctx.db
				.query('conversationMessages')
				.withIndex('by_conversation', (q) =>
					q.eq('conversationId', conversationId),
				)
				.collect(),
		)
		expect(
			messages.every((message) => message.agentVariantId === variantId),
		).toBe(true)
		expect(messages[3]?.toolResults?.[0]).toMatchObject({
			output: 'The current policy text',
			retrievalEntryIds: ['entry_ready_1'],
		})

		// append to a done conversation rejects
		await expect(
			t.mutation(internal.api.conversations.appendMessage, {
				ownerId: conversationId,
				conversationKey,
				role: 'user',
				text: 'late',
				interrupted: false,
			}),
		).rejects.toThrow(/done conversation/)
		await expect(
			t.mutation(internal.api.conversations.startFromVersion, {
				ownerId: versionId,
				conversationKey: 'invalid-direct-voice',
				provider: 'openai',
				channel: 'voice_inbound' as never,
				direction: 'inbound',
			}),
		).rejects.toThrow(/Expected one of literal/)
	})

	test('cross-tenant derived routing rejects an agent from another org', async () => {
		const t = convexTest(schema, modules)
		const b = await seedAgentWithVersion(t, ORG_B)
		const phoneA = await t.run(async (ctx) => {
			const telephonyConnectionId = await ctx.db.insert(
				'telephonyConnections',
				{
					tenant: ORG_A,
					provider: 'twilio',
					label: 'Test',
					providerAccountId: 'AC_A',
					credentialSecretRef: 'secret_a',
					status: 'active',
					createdAt: T0,
				},
			)
			return ctx.db.insert('phoneNumbers', {
				tenant: ORG_A,
				telephonyConnectionId,
				providerNumberId: 'PN_A_2',
				number: '+15550000001',
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
				assignedAgentId: b.agentId,
				createdAt: T0,
			})
		})
		await expect(
			t.mutation(internal.api.conversations.startFromPhoneNumber, {
				ownerId: phoneA,
				conversationKey: 'api-cross-tenant-1',
				provider: 'openai',
			}),
		).rejects.toThrow(/agent_not_routable/)
		const conversations = await t.run(async (ctx) =>
			ctx.db.query('conversations').collect(),
		)
		expect(conversations).toHaveLength(0)
	})
})

describe('conversation back-office DTOs', () => {
	test('masks participant PII and keeps detail-only fields out of summaries', () => {
		const row = {
			_id: 'conversation_1',
			_creationTime: 1,
			tenant: ORG_A,
			agentId: 'agent_1',
			agentVariantId: 'variant_1',
			agentVersionId: 'version_1',
			provider: 'openai',
			providerSessionId: 'provider-session-secret',
			channel: 'voice_inbound',
			direction: 'inbound',
			status: 'done',
			startedAt: T0,
			acceptedAt: T0,
			externalNumber: '+18095551234',
			usage: { inputTokens: 10, outputTokens: 5 },
			hasAudio: true,
			messageCount: 2,
			summary: 'Customer requested an appointment.',
			createdAt: T0,
		} as never
		const summary = toConversationSummaryDto(row)
		const detail = toConversationDetailDto(row)

		expect(maskExternalNumber('+18095551234')).toBe('********1234')
		expect(summary.externalNumber).toBe('********1234')
		expect(summary.agentVariantId).toBe('variant_1')
		expect(summary).not.toHaveProperty('summary')
		expect(summary).not.toHaveProperty('providerSessionId')
		expect(summary).not.toHaveProperty('tenant')
		expect(summary).not.toHaveProperty('createdAt')
		expect(detail.summary).toBe('Customer requested an appointment.')
		expect(detail.hasAudio).toBe(true)
	})

	test('message DTO strips tool payloads, retrieval ids, and audio storage ids', () => {
		const dto = toConversationMessageDto({
			_id: 'message_1',
			_creationTime: 1,
			tenant: ORG_A,
			conversationId: 'conversation_1',
			agentId: 'agent_1',
			agentVariantId: 'variant_1',
			sequence: 1,
			role: 'agent',
			text: 'Done',
			toolCalls: [
				{ callId: 'call_1', name: 'orders', argsJson: '{"ssn":"x"}' },
			],
			toolResults: [
				{
					callId: 'call_1',
					output: 'raw order payload',
					isError: false,
					latencyMs: 12,
					retrievalEntryIds: ['entry_1'],
				},
			],
			interrupted: false,
			audioStorageId: 'storage_secret',
			createdAt: T0,
		} as never)

		expect(dto.toolCalls).toEqual([{ callId: 'call_1', name: 'orders' }])
		expect(dto.toolResults).toEqual([
			{
				callId: 'call_1',
				isError: false,
				latencyMs: 12,
				errorState: 'success',
			},
		])
		expect(JSON.stringify(dto)).not.toContain('raw order payload')
		expect(JSON.stringify(dto)).not.toContain('entry_1')
		expect(JSON.stringify(dto)).not.toContain('storage_secret')
		expect(dto).not.toHaveProperty('id')
		expect(dto).not.toHaveProperty('createdAt')
	})
})

describe('kb search scoping (U2)', () => {
	test('scope includes only ready auto attachments in the conversation tenant', async () => {
		const t = convexTest(schema, modules)
		const seeded = await t.run(async (ctx) => {
			const mkDoc = async (tenant: string, activeEntryId?: string) =>
				ctx.db.insert('kbDocuments', {
					tenant,
					activeEntryId,
					archived: false,
					createdAt: T0,
				})
			const readyAuto = await mkDoc(ORG_A, 'entry_auto')
			const readyPrompt = await mkDoc(ORG_A, 'entry_prompt')
			const unavailable = await mkDoc(ORG_A)
			const otherTenant = await mkDoc(ORG_B, 'entry_other')
			const agentId = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
			const variantId = await ctx.db.insert('agentVariants', {
				tenant: ORG_A,
				agentId,
				name: 'Main',
				isMain: true,
				allocationOrdinal: 1,
				trafficWeightBps: 10_000,
				draft: draftFields(),
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
					...draftFields(),
					knowledgeBase: [
						{ documentId: readyAuto, usageMode: 'auto' as const },
						{ documentId: readyPrompt, usageMode: 'prompt' as const },
						{ documentId: unavailable, usageMode: 'auto' as const },
						{ documentId: otherTenant, usageMode: 'auto' as const },
					],
					procedures: { kind: 'inline' as const, items: [] },
				},
				createdAt: T0,
			})
			const conversationId = await ctx.db.insert('conversations', {
				tenant: ORG_A,
				conversationKey: 'kb-scope-1',
				idempotencyFingerprint: 'kb-scope-1',
				agentId,
				agentVariantId: variantId,
				agentVersionId: versionId,
				allocationMode: 'direct' as const,
				workflow: 'none' as const,
				provider: 'openai' as const,
				channel: 'web' as const,
				direction: 'inbound' as const,
				status: 'in_progress' as const,
				startedAt: T0,
				hasAudio: false,
				messageCount: 0,
				createdAt: T0,
			})
			return { readyAuto, conversationId }
		})
		const scope = await t.query(internal.api.kbSearch.scopeForConversation, {
			conversationId: seeded.conversationId,
		})
		expect(scope).toEqual({
			tenant: ORG_A,
			conversationKey: 'kb-scope-1',
			documentIds: [seeded.readyAuto],
		})
	})
})

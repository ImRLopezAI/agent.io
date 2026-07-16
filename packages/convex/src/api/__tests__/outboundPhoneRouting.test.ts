import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import { modules } from '../../testModules.test'

const T0 = '2026-07-15T00:00:00Z'

const draft = {
	instructions: '',
	model: { provider: 'openai' as const, model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad' as const },
	systemTools: {},
	mcp: [],
	knowledgeBase: [],
	inboundWorkflow: { enabled: true, firstSpeaker: 'caller' as const },
	outboundWorkflow: { enabled: true, firstSpeaker: 'agent' as const },
}

const seed = async (t: ReturnType<typeof convexTest>) =>
	t.run(async (ctx) => {
		const agentId = await ctx.db.insert('agents', {
			tenant: 'org_a',
			name: 'Outbound',
			allocationRevision: 1,
			archived: false,
			createdAt: T0,
		})
		const agentVariantId = await ctx.db.insert('agentVariants', {
			tenant: 'org_a',
			agentId,
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 10_000,
			draft,
			archived: false,
			createdAt: T0,
		})
		const agentVersionId = await ctx.db.insert('agentVersions', {
			tenant: 'org_a',
			agentId,
			agentVariantId,
			version: 1,
			publishedBy: 'user',
			config: {
				...draft,
				procedures: { kind: 'inline' as const, items: [] },
			},
			createdAt: T0,
		})
		await ctx.db.patch(agentId, { mainVariantId: agentVariantId })
		await ctx.db.patch(agentVariantId, { publishedVersionId: agentVersionId })
		const otherAgentId = await ctx.db.insert('agents', {
			tenant: 'org_a',
			name: 'Other',
			allocationRevision: 0,
			archived: false,
			createdAt: T0,
		})
		const connectionId = await ctx.db.insert('telephonyConnections', {
			tenant: 'org_a',
			provider: 'twilio',
			label: 'Twilio',
			providerAccountId: 'AC_A',
			credentialSecretRef: 'secret_a',
			status: 'active',
			createdAt: T0,
		})
		const addNumber = (input: {
			providerNumberId: string
			number: string
			countryCode: string
			regionCode?: string
			assignedAgentId?: typeof otherAgentId
		}) =>
			ctx.db.insert('phoneNumbers', {
				tenant: 'org_a',
				telephonyConnectionId: connectionId,
				provider: 'twilio',
				label: input.regionCode ?? input.countryCode,
				regionCode: input.regionCode,
				capabilities: {
					inboundVoice: true,
					outboundVoice: true,
					inboundSms: false,
					outboundSms: false,
				},
				inboundSmsEnabled: false,
				status: 'active',
				createdAt: T0,
				...input,
			})
		const newYorkId = await addNumber({
			providerNumberId: 'PN_NY',
			number: '+12125550100',
			countryCode: 'US',
			regionCode: 'NY',
			assignedAgentId: otherAgentId,
		})
		const defaultId = await addNumber({
			providerNumberId: 'PN_DEFAULT',
			number: '+18005550100',
			countryCode: 'US',
		})
		const batchId = await ctx.db.insert('batchCallJobs', {
			tenant: 'org_a',
			name: 'Campaign',
			agentId,
			agentVariantOverrideId: agentVariantId,
			callerIdPolicy: {
				rules: [
					{
						id: 'new_york',
						destinationCountryCode: 'US',
						destinationRegionCode: 'NY',
						phoneNumberId: newYorkId,
					},
				],
				defaultPhoneNumberId: defaultId,
			},
			status: 'pending',
			ringingTimeoutSecs: 60,
			totalScheduled: 0,
			totalDispatched: 0,
			totalFinished: 0,
			createdAt: T0,
		})
		return {
			newYorkId,
			defaultId,
			connectionId,
			batchId,
		}
	})

const addRecipient = (
	t: ReturnType<typeof convexTest>,
	batchId: string,
	phoneNumber: string,
) =>
	t.run((ctx) =>
		ctx.db.insert('batchCallRecipients', {
			tenant: 'org_a',
			batchId: batchId as never,
			phoneNumber,
			status: 'pending',
			createdAt: T0,
		}),
	)

describe('outbound phone routing (U7)', () => {
	test('uses the first matching condition and stages the decision', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+12125550999')
		const selected = await t.mutation(
			internal.api.phoneRouting.selectOutboundForRecipient,
			{
				recipientId,
				destinationCountryCode: 'US',
				destinationRegionCode: 'NY',
			},
		)
		expect(selected).toEqual({
			phoneNumberId: state.newYorkId,
			reason: 'matched_rule:new_york',
		})
		const staged = await t.run((ctx) => ctx.db.get(recipientId))
		expect(staged?.selectedPhoneNumberId).toBe(state.newYorkId)
	})

	test('uses only the explicit default when no condition matches', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+18095550999')
		const selected = await t.mutation(
			internal.api.phoneRouting.selectOutboundForRecipient,
			{
				recipientId,
				destinationCountryCode: 'DO',
			},
		)
		expect(selected).toEqual({
			phoneNumberId: state.defaultId,
			reason: 'default',
		})
	})

	test('rejects an ineligible default before staging', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+18095550999')
		await t.run((ctx) => ctx.db.patch(state.defaultId, { status: 'disabled' }))
		await expect(
			t.mutation(internal.api.phoneRouting.selectOutboundForRecipient, {
				recipientId,
				destinationCountryCode: 'DO',
			}),
		).rejects.toThrow(/no_eligible_number/)
		const recipient = await t.run((ctx) => ctx.db.get(recipientId))
		expect(recipient?.selectedPhoneNumberId).toBeUndefined()
	})

	test('inbound assignment does not reserve a number for outbound use', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+12125550999')
		const selected = await t.mutation(
			internal.api.phoneRouting.selectOutboundForRecipient,
			{
				recipientId,
				destinationCountryCode: 'US',
				destinationRegionCode: 'NY',
			},
		)
		expect(selected.phoneNumberId).toBe(state.newYorkId)
	})

	test('revalidates a staged number before the dialer consumes it', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+18095550999')
		await t.mutation(internal.api.phoneRouting.selectOutboundForRecipient, {
			recipientId,
			destinationCountryCode: 'DO',
		})
		await t.run((ctx) =>
			ctx.db.patch(state.defaultId, { status: 'provider_missing' }),
		)
		await expect(
			t.mutation(internal.api.phoneRouting.selectOutboundForRecipient, {
				recipientId,
				destinationCountryCode: 'DO',
			}),
		).rejects.toThrow(/no_eligible_number/)
	})

	test('starts one immutable recipient attempt across retries and config changes', async () => {
		const t = convexTest(schema, modules)
		const state = await seed(t)
		const recipientId = await addRecipient(t, state.batchId, '+18095550999')
		const first = await t.mutation(
			internal.api.conversations.startOutboundFromRecipient,
			{
				ownerId: recipientId,
				conversationKey: 'outbound-attempt-1',
				provider: 'openai',
				destinationCountryCode: 'DO',
			},
		)
		await t.run((ctx) =>
			ctx.db.patch(state.batchId as never, {
				agentVariantOverrideId: undefined,
			}),
		)
		const retry = await t.mutation(
			internal.api.conversations.startOutboundFromRecipient,
			{
				ownerId: recipientId,
				conversationKey: 'outbound-attempt-1',
				provider: 'openai',
				destinationCountryCode: 'DO',
			},
		)
		expect(retry).toBe(first)
		await expect(
			t.mutation(internal.api.conversations.startOutboundFromRecipient, {
				ownerId: recipientId,
				conversationKey: 'outbound-attempt-2',
				provider: 'openai',
				destinationCountryCode: 'DO',
			}),
		).rejects.toThrow(/recipient_already_started/)
		const conversation = await t.run((ctx) =>
			ctx.db.get(first as Id<'conversations'>),
		)
		expect(conversation?.phoneNumberSnapshot?.number).toBe('+18005550100')
	})
})

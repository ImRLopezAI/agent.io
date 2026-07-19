/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import schema from '../schema'
import { modules } from '../testModules.test'

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

const variantDraft = {
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
		const { phoneId, agentId, variantId, versionId } = await t.run(
			async (ctx) => {
				const agentId = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
				const variantId = await ctx.db.insert('agentVariants', {
					tenant: ORG_A,
					agentId,
					name: 'Main',
					isMain: true,
					allocationOrdinal: 1,
					trafficWeightBps: 10_000,
					draft: variantDraft,
					archived: false,
					createdAt: T0,
				})
				const versionId = await ctx.db.insert('agentVersions', {
					tenant: ORG_A,
					agentId,
					agentVariantId: variantId,
					version: 1,
					publishedBy: 'user_1',
					config: {
						...variantDraft,
						procedures: { kind: 'inline' as const, items: [] },
					},
					createdAt: T0,
				})
				await ctx.db.patch(agentId, { mainVariantId: variantId })
				await ctx.db.patch(variantId, { publishedVersionId: versionId })
				const telephonyConnectionId = await ctx.db.insert(
					'telephonyConnections',
					{
						tenant: ORG_A,
						provider: 'twilio',
						label: 'Test',
						providerAccountId: 'AC_A',
						credentialSecretRef: 'secret_a',
						status: 'active',
						createdAt: '2026-07-05T00:00:00Z',
					},
				)
				const phoneId = await ctx.db.insert('phoneNumbers', {
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
					createdAt: '2026-07-05T00:00:00Z',
				})
				return { phoneId, agentId, variantId, versionId }
			},
		)

		// derive tenant the machineMutation way: load owner, copy tenant
		const derived = await t.run(async (ctx) => {
			const owner = await ctx.db.get(phoneId)
			if (!owner?.tenant) throw new Error('no tenant on owner')
			const conversationId = await ctx.db.insert('conversations', {
				tenant: owner.tenant,
				conversationKey: 'tenant-derivation-1',
				idempotencyFingerprint: 'tenant-derivation-1',
				agentId,
				agentVariantId: variantId,
				agentVersionId: versionId,
				allocationMode: 'direct' as const,
				workflow: 'inbound' as const,
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
		expect(derived?.agentVariantId).toBe(variantId)
	})

	test('tenant mismatch across referenced resources is detectable', async () => {
		const t = convexTest(schema, modules)
		const { phoneA, versionB } = await t.run(async (ctx) => {
			const agentA = await ctx.db.insert('agents', agentDoc(ORG_A, 'A'))
			const agentB = await ctx.db.insert('agents', agentDoc(ORG_B, 'B'))
			const variantB = await ctx.db.insert('agentVariants', {
				tenant: ORG_B,
				agentId: agentB,
				name: 'Main',
				isMain: true,
				allocationOrdinal: 1,
				trafficWeightBps: 10_000,
				draft: variantDraft,
				archived: false,
				createdAt: T0,
			})
			const versionB = await ctx.db.insert('agentVersions', {
				tenant: ORG_B,
				agentId: agentB,
				agentVariantId: variantB,
				version: 1,
				publishedBy: 'user_b',
				config: {
					...variantDraft,
					procedures: { kind: 'inline' as const, items: [] },
				},
				createdAt: T0,
			})
			const telephonyConnectionId = await ctx.db.insert(
				'telephonyConnections',
				{
					tenant: ORG_A,
					provider: 'twilio',
					label: 'Test',
					providerAccountId: 'AC_A',
					credentialSecretRef: 'secret_a',
					status: 'active',
					createdAt: '2026-07-05T00:00:00Z',
				},
			)
			const phoneA = await ctx.db.insert('phoneNumbers', {
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

	test('minimal knowledge registry survives schema wiring', async () => {
		const t = convexTest(schema, modules)
		const documentId = await t.run(async (ctx) =>
			ctx.db.insert('kbDocuments', {
				tenant: ORG_A,
				activeEntryId: 'entry_1',
				archived: false,
				createdAt: '2026-07-05T00:00:00Z',
			}),
		)
		const document = await t.run(async (ctx) => ctx.db.get(documentId))
		expect(document?.activeEntryId).toBe('entry_1')
	})
})

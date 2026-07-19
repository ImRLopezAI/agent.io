import { stream } from 'convex-helpers/server/stream'
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vite-plus/test'

import { internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../testModules.test'
import { requireTenantAdmin } from '../../utils'
import * as phoneNumberApi from '../phoneNumbers'
import { toNativePhonePagination, toPhoneNumberDto } from '../phoneNumbers'
import { toPublicTelephonyConnection } from '../telephonyConnections'

const T0 = '2026-07-15T00:00:00Z'

const seedConnection = async (
	t: ReturnType<typeof convexTest>,
	tenant: string,
	providerAccountId: string,
) =>
	t.run((ctx) =>
		ctx.db.insert('telephonyConnections', {
			tenant,
			provider: 'twilio',
			label: 'Twilio',
			providerAccountId,
			credentialSecretRef: `secret_${providerAccountId}`,
			status: 'active',
			createdAt: T0,
		}),
	)

const snapshot = (
	telephonyConnectionId: string,
	providerNumberId = 'PN1',
	number = '+15551234567',
) => ({
	telephonyConnectionId: telephonyConnectionId as never,
	providerNumberId,
	number,
	label: 'New York',
	countryCode: 'US',
	regionCode: 'NY',
	locality: 'New York',
	capabilities: {
		inboundVoice: true,
		outboundVoice: true,
		inboundSms: true,
		outboundSms: true,
	},
	inboundSmsEnabled: true,
	status: 'active' as const,
})

describe('phone number inventory operations (U5)', () => {
	test('provider import is idempotent, including concurrent attempts', async () => {
		const t = convexTest(schema, modules)
		const connectionId = await seedConnection(t, 'org_a', 'AC_A')
		const [first, second] = await Promise.all([
			t.mutation(
				internal.api.phoneNumbers.upsertImportedNumber,
				snapshot(connectionId),
			),
			t.mutation(
				internal.api.phoneNumbers.upsertImportedNumber,
				snapshot(connectionId),
			),
		])
		expect(first.id).toBe(second.id)
		const rows = await t.run((ctx) => ctx.db.query('phoneNumbers').collect())
		expect(rows).toHaveLength(1)
	})

	test('the same E.164 remains isolated across verified connections', async () => {
		const t = convexTest(schema, modules)
		const connectionA = await seedConnection(t, 'org_a', 'AC_A')
		const connectionB = await seedConnection(t, 'org_b', 'AC_B')
		await t.mutation(
			internal.api.phoneNumbers.upsertImportedNumber,
			snapshot(connectionA, 'PN_A'),
		)
		await t.mutation(
			internal.api.phoneNumbers.upsertImportedNumber,
			snapshot(connectionB, 'PN_B'),
		)
		const rows = await t.run((ctx) => ctx.db.query('phoneNumbers').collect())
		expect(rows.map((row) => row.tenant).sort()).toEqual(['org_a', 'org_b'])
	})

	test('a mixed provider batch preserves successful number imports', async () => {
		const t = convexTest(schema, modules)
		const connectionId = await seedConnection(t, 'org_a', 'AC_A')
		const results = await Promise.allSettled([
			t.mutation(
				internal.api.phoneNumbers.upsertImportedNumber,
				snapshot(connectionId, 'PN_VALID'),
			),
			t.mutation(internal.api.phoneNumbers.upsertImportedNumber, {
				...snapshot(connectionId, 'PN_INVALID'),
				number: 'not-e164',
			}),
		])
		expect(results.map((result) => result.status).sort()).toEqual([
			'fulfilled',
			'rejected',
		])
		const rows = await t.run((ctx) => ctx.db.query('phoneNumbers').collect())
		expect(rows).toHaveLength(1)
		expect(rows[0]?.providerNumberId).toBe('PN_VALID')
	})

	test('successful refresh marks omitted provider numbers missing', async () => {
		const t = convexTest(schema, modules)
		const connectionId = await seedConnection(t, 'org_a', 'AC_A')
		for (const [providerNumberId, number] of [
			['PN1', '+15551234567'],
			['PN2', '+15557654321'],
		] as const) {
			await t.mutation(
				internal.api.phoneNumbers.upsertImportedNumber,
				snapshot(connectionId, providerNumberId, number),
			)
		}
		await t.mutation(internal.api.phoneNumbers.markMissingAfterRefresh, {
			telephonyConnectionId: connectionId,
			seenProviderNumberIds: ['PN1'],
		})
		const rows = await t.run((ctx) => ctx.db.query('phoneNumbers').collect())
		expect(rows.find((row) => row.providerNumberId === 'PN1')?.status).toBe(
			'active',
		)
		expect(rows.find((row) => row.providerNumberId === 'PN2')?.status).toBe(
			'provider_missing',
		)
	})

	test('tenant-leading indexes paginate a 200-number geography page', async () => {
		const t = convexTest(schema, modules)
		const connectionId = await seedConnection(t, 'org_a', 'AC_A')
		await t.run(async (ctx) => {
			for (let index = 0; index < 200; index += 1) {
				await ctx.db.insert('phoneNumbers', {
					tenant: 'org_a',
					telephonyConnectionId: connectionId,
					providerNumberId: `PN${index}`,
					number: `+1555${String(index).padStart(7, '0')}`,
					provider: 'twilio',
					label: `Number ${index}`,
					countryCode: 'US',
					regionCode: index < 120 ? 'NY' : 'CA',
					capabilities: {
						inboundVoice: true,
						outboundVoice: true,
						inboundSms: false,
						outboundSms: false,
					},
					inboundSmsEnabled: false,
					status: 'active',
					createdAt: T0,
				})
			}
		})
		const page = await t.run((ctx) =>
			ctx.db
				.query('phoneNumbers')
				.withIndex('by_tenant_country_region', (q) =>
					q
						.eq('tenant', 'org_a')
						.eq('countryCode', 'US')
						.eq('regionCode', 'NY'),
				)
				.take(25),
		)
		expect(page).toHaveLength(25)
		expect(page.every((row) => row.regionCode === 'NY')).toBe(true)
	})

	test('composed stream filters paginate without short-page holes', async () => {
		const t = convexTest(schema, modules)
		const connectionId = await seedConnection(t, 'org_a', 'AC_A')
		await t.run(async (ctx) => {
			for (let index = 0; index < 160; index += 1) {
				await ctx.db.insert('phoneNumbers', {
					tenant: 'org_a',
					telephonyConnectionId: connectionId,
					providerNumberId: `PN${index}`,
					number: `+1666${String(index).padStart(7, '0')}`,
					provider: 'twilio',
					label: `Number ${index}`,
					countryCode: index % 2 === 0 ? 'US' : 'CA',
					regionCode: index % 4 === 0 ? 'NY' : 'ON',
					capabilities: {
						inboundVoice: true,
						outboundVoice: true,
						inboundSms: false,
						outboundSms: false,
					},
					inboundSmsEnabled: false,
					status: index % 3 === 0 ? 'active' : 'disabled',
					createdAt: T0,
				})
			}
		})

		const ids: string[] = []
		let cursor: string | null = null
		let done = false
		while (!done) {
			const result = await t.run((ctx) =>
				stream(ctx.db, schema)
					.query('phoneNumbers')
					.withIndex('by_tenant', (q) => q.eq('tenant', 'org_a'))
					.order('desc')
					.filterWith(
						async (row) => row.status === 'active' && row.countryCode === 'US',
					)
					.paginate({
						cursor,
						numItems: 11,
						maximumRowsRead: 2_000,
						maximumBytesRead: 4_000_000,
					}),
			)
			ids.push(...result.page.map((row) => row._id))
			cursor = result.continueCursor
			done = result.isDone
		}
		expect(ids).toHaveLength(27)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test('admin guard rejects ordinary members and public rows omit secret refs', () => {
		expect(() => requireTenantAdmin({ role: 'member' })).toThrow(
			/administrator/,
		)
		expect(() => requireTenantAdmin({ role: 'admin' })).not.toThrow()
		const publicRow = toPublicTelephonyConnection({
			_id: 'connection_1',
			_creationTime: 1,
			provider: 'twilio',
			label: 'Primary',
			providerAccountId: 'AC123',
			credentialSecretRef: 'secret_never_return',
			status: 'active',
			lastError: 'Twilio token rejected: super-secret-token',
			createdAt: T0,
		})
		expect(publicRow).toMatchObject({
			id: 'connection_1',
			provider: 'twilio',
			providerAccountConfigured: true,
			lastError: 'Provider synchronization failed',
		})
		expect(publicRow).not.toHaveProperty('providerAccountId')
		expect(publicRow).not.toHaveProperty('credentialSecretRef')
		expect(JSON.stringify(publicRow)).not.toContain('super-secret-token')
	})

	test('phone DTO omits tenant and provider identity internals', () => {
		const publicRow = toPhoneNumberDto({
			_id: 'phone_1' as never,
			_creationTime: 1,
			tenant: 'org_a',
			telephonyConnectionId: 'connection_1' as never,
			providerNumberId: 'PN_secret_provider_identity',
			number: '+15551234567',
			provider: 'twilio',
			label: 'New York',
			countryCode: 'US',
			capabilities: {
				inboundVoice: true,
				outboundVoice: true,
				inboundSms: false,
				outboundSms: false,
			},
			inboundSmsEnabled: false,
			status: 'active',
			lastError: 'raw provider error',
			createdAt: T0,
		})
		expect(publicRow).not.toHaveProperty('tenant')
		expect(publicRow).not.toHaveProperty('providerNumberId')
		expect(publicRow.lastError).toBe('Provider synchronization failed')
	})

	test('Convex exports persistence only and no provider import command', () => {
		expect(phoneNumberApi).not.toHaveProperty('importFromProvider')
	})

	test('native phone paths strip the QueryStream-only end cursor', () => {
		expect(
			toNativePhonePagination({
				cursor: 'cursor',
				numItems: 25,
				endCursor: 'helper-only',
			}),
		).toEqual({ cursor: 'cursor', numItems: 25 })
	})
})

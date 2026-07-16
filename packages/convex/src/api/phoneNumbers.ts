import {
	PHONE_PROVIDERS,
	PHONE_STATUSES,
	phoneNumberInput,
} from '@agent.io/domain/schemas'
import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'
import { z } from 'zod'

import type { Doc } from '../_generated/dataModel'
import {
	now,
	queryStreamPaginationOpts,
	stampCreate,
	stampUpdate,
} from '../lib'
import schema from '../schema'
import {
	requireTenantAdmin,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
	triggeredInternalMutation,
} from '../utils'

const capabilitiesValidator = v.object({
	inboundVoice: v.boolean(),
	outboundVoice: v.boolean(),
	inboundSms: v.boolean(),
	outboundSms: v.boolean(),
})

const importArgs = {
	telephonyConnectionId: v.id('telephonyConnections'),
	providerNumberId: v.string(),
	number: v.string(),
	label: v.string(),
	countryCode: v.string(),
	regionCode: v.optional(v.string()),
	locality: v.optional(v.string()),
	capabilities: capabilitiesValidator,
	routingRegion: v.optional(v.string()),
	inboundSmsEnabled: v.boolean(),
	status: v.union(v.literal('pending'), v.literal('active')),
}

/** Trusted provider-snapshot transaction. Public clients never call this directly. */
export const upsertImportedNumber = triggeredInternalMutation({
	args: importArgs,
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.telephonyConnectionId)
		if (!connection || connection.status === 'archived') {
			throw new Error('telephony connection not found')
		}
		const parsed = phoneNumberInput.safeParse({
			...args,
			tenant: connection.tenant,
			provider: connection.provider,
		})
		if (!parsed.success) throw new Error(parsed.error.issues[0]?.message)

		const existing = await ctx.db
			.query('phoneNumbers')
			.withIndex('by_connection_provider_number', (q) =>
				q
					.eq('telephonyConnectionId', args.telephonyConnectionId)
					.eq('providerNumberId', args.providerNumberId),
			)
			.unique()
		const numberConflict = await ctx.db
			.query('phoneNumbers')
			.withIndex('by_connection_number', (q) =>
				q
					.eq('telephonyConnectionId', args.telephonyConnectionId)
					.eq('number', args.number),
			)
			.unique()
		if (numberConflict && numberConflict._id !== existing?._id) {
			throw new Error('phone number conflicts with another provider identity')
		}

		const snapshot = {
			providerNumberId: args.providerNumberId,
			number: args.number,
			label: args.label,
			countryCode: args.countryCode,
			regionCode: args.regionCode,
			locality: args.locality,
			capabilities: args.capabilities,
			routingRegion: args.routingRegion,
			inboundSmsEnabled: args.inboundSmsEnabled,
			lastSyncedAt: now(),
			lastError: undefined,
		}
		if (existing) {
			await ctx.db.patch(
				existing._id,
				stampUpdate({
					...snapshot,
					status:
						existing.status === 'archived' ? existing.status : args.status,
				}),
			)
			return { id: existing._id, outcome: 'updated' as const }
		}
		const id = await ctx.db.insert(
			'phoneNumbers',
			stampCreate(connection.tenant, {
				...snapshot,
				telephonyConnectionId: connection._id,
				provider: connection.provider,
				status: args.status,
			}),
		)
		return { id, outcome: 'created' as const }
	},
})

export const markMissingAfterRefresh = triggeredInternalMutation({
	args: {
		telephonyConnectionId: v.id('telephonyConnections'),
		seenProviderNumberIds: v.array(v.string()),
	},
	handler: async (ctx, { telephonyConnectionId, seenProviderNumberIds }) => {
		const connection = await ctx.db.get(telephonyConnectionId)
		if (!connection) throw new Error('telephony connection not found')
		const seen = new Set(seenProviderNumberIds)
		const rows = await ctx.db
			.query('phoneNumbers')
			.withIndex('by_tenant_connection', (q) =>
				q
					.eq('tenant', connection.tenant)
					.eq('telephonyConnectionId', telephonyConnectionId),
			)
			.collect()
		for (const row of rows) {
			if (row.status !== 'archived' && !seen.has(row.providerNumberId)) {
				await ctx.db.patch(
					row._id,
					stampUpdate({ status: 'provider_missing' as const }),
				)
			}
		}
	},
})

const listArgs = {
	paginationOpts: queryStreamPaginationOpts,
	status: z.enum(PHONE_STATUSES).optional(),
	agentId: z.string().optional(),
	countryCode: z
		.string()
		.regex(/^[A-Z]{2}$/)
		.optional(),
	regionCode: z.string().optional(),
	provider: z.enum(PHONE_PROVIDERS).optional(),
	connectionId: z.string().optional(),
}

export const toNativePhonePagination = (
	paginationOpts: z.infer<typeof queryStreamPaginationOpts>,
) => ({
	cursor: paginationOpts.cursor,
	numItems: paginationOpts.numItems,
})

export const toPhoneNumberDto = (row: Doc<'phoneNumbers'>) => ({
	id: row._id,
	number: row.number,
	provider: row.provider,
	label: row.label,
	countryCode: row.countryCode,
	regionCode: row.regionCode,
	locality: row.locality,
	capabilities: row.capabilities,
	assignedAgentId: row.assignedAgentId,
	telephonyConnectionId: row.telephonyConnectionId,
	routingRegion: row.routingRegion,
	inboundSmsEnabled: row.inboundSmsEnabled,
	status: row.status,
	lastSyncedAt: row.lastSyncedAt,
	lastError: row.lastError ? 'Provider synchronization failed' : undefined,
	archivedAt: row.archivedAt,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
})

export const list = tenantQuery({
	args: listArgs,
	handler: async (ctx, args) => {
		const { paginationOpts } = args
		const agentId = args.agentId
			? await resolveTenantId(ctx, 'agents', args.agentId, 'agent')
			: null
		const connectionId = args.connectionId
			? await resolveTenantId(
					ctx,
					'telephonyConnections',
					args.connectionId,
					'connection',
				)
			: null

		const filters = [
			args.status,
			agentId,
			args.countryCode,
			args.regionCode,
			args.provider,
			connectionId,
		].filter(Boolean).length
		const hasExactGeography =
			filters === 2 && Boolean(args.countryCode && args.regionCode)

		if (filters > 1 && !hasExactGeography) {
			const result = await stream(ctx.db, schema)
				.query('phoneNumbers')
				.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
				.order('desc')
				.filterWith(async (row) =>
					Boolean(
						(!args.status || row.status === args.status) &&
						(!agentId || row.assignedAgentId === agentId) &&
						(!args.countryCode || row.countryCode === args.countryCode) &&
						(!args.regionCode || row.regionCode === args.regionCode) &&
						(!args.provider || row.provider === args.provider) &&
						(!connectionId || row.telephonyConnectionId === connectionId),
					),
				)
				.paginate({
					...paginationOpts,
					maximumRowsRead: 2_000,
					maximumBytesRead: 4_000_000,
				})
			return { ...result, page: result.page.map(toPhoneNumberDto) }
		}
		const nativePagination = toNativePhonePagination(paginationOpts)

		const result =
			args.countryCode && args.regionCode
				? await ctx.db
						.query('phoneNumbers')
						.withIndex('by_tenant_country_region', (q) =>
							q
								.eq('tenant', ctx.tenant)
								.eq('countryCode', args.countryCode!)
								.eq('regionCode', args.regionCode),
						)
						.order('desc')
						.paginate(nativePagination)
				: args.status
					? await ctx.db
							.query('phoneNumbers')
							.withIndex('by_tenant_status', (q) =>
								q.eq('tenant', ctx.tenant).eq('status', args.status!),
							)
							.order('desc')
							.paginate(nativePagination)
					: agentId
						? await ctx.db
								.query('phoneNumbers')
								.withIndex('by_tenant_agent', (q) =>
									q.eq('tenant', ctx.tenant).eq('assignedAgentId', agentId),
								)
								.order('desc')
								.paginate(nativePagination)
						: args.countryCode
							? await ctx.db
									.query('phoneNumbers')
									.withIndex('by_tenant_country', (q) =>
										q
											.eq('tenant', ctx.tenant)
											.eq('countryCode', args.countryCode!),
									)
									.order('desc')
									.paginate(nativePagination)
							: args.regionCode
								? await ctx.db
										.query('phoneNumbers')
										.withIndex('by_tenant_region', (q) =>
											q
												.eq('tenant', ctx.tenant)
												.eq('regionCode', args.regionCode),
										)
										.order('desc')
										.paginate(nativePagination)
								: args.provider
									? await ctx.db
											.query('phoneNumbers')
											.withIndex('by_tenant_provider', (q) =>
												q
													.eq('tenant', ctx.tenant)
													.eq('provider', args.provider!),
											)
											.order('desc')
											.paginate(nativePagination)
									: connectionId
										? await ctx.db
												.query('phoneNumbers')
												.withIndex('by_tenant_connection', (q) =>
													q
														.eq('tenant', ctx.tenant)
														.eq('telephonyConnectionId', connectionId),
												)
												.order('desc')
												.paginate(nativePagination)
										: await ctx.db
												.query('phoneNumbers')
												.withIndex('by_tenant', (q) =>
													q.eq('tenant', ctx.tenant),
												)
												.order('desc')
												.paginate(nativePagination)

		return { ...result, page: result.page.map(toPhoneNumberDto) }
	},
})

export const get = tenantQuery({
	args: { phoneNumberId: z.string() },
	handler: async (ctx, { phoneNumberId }) => {
		const id = await resolveTenantId(
			ctx,
			'phoneNumbers',
			phoneNumberId,
			'phone number',
		)
		const row = await ctx.db.get(id)
		if (!row) throw new Error('phone number not found')
		return toPhoneNumberDto(row)
	},
})

export const updateConfiguration = tenantMutation({
	args: {
		phoneNumberId: z.string(),
		patch: z
			.object({
				label: z.string().max(120).optional(),
				routingRegion: z.string().min(1).max(120).nullable().optional(),
				inboundSmsEnabled: z.boolean().optional(),
			})
			.strict(),
	},
	handler: async (ctx, { phoneNumberId, patch }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'phoneNumbers',
			phoneNumberId,
			'phone number',
		)
		const row = await ctx.db.get(id)
		if (!row) throw new Error('phone number not found')
		if (patch.inboundSmsEnabled && !row.capabilities.inboundSms) {
			throw new Error(
				'inbound SMS cannot be enabled without provider capability',
			)
		}
		await ctx.db.patch(
			id,
			stampUpdate({
				...patch,
				routingRegion:
					patch.routingRegion === null ? undefined : patch.routingRegion,
			}),
		)
	},
})

export const assign = tenantMutation({
	args: { phoneNumberId: z.string(), agentId: z.string().nullable() },
	handler: async (ctx, { phoneNumberId, agentId }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'phoneNumbers',
			phoneNumberId,
			'phone number',
		)
		const assignedAgentId = agentId
			? await resolveTenantId(ctx, 'agents', agentId, 'agent')
			: null
		await ctx.db.patch(
			id,
			stampUpdate({ assignedAgentId: assignedAgentId ?? undefined }),
		)
	},
})

export const setStatus = tenantMutation({
	args: { phoneNumberId: z.string(), status: z.enum(PHONE_STATUSES) },
	handler: async (ctx, { phoneNumberId, status }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'phoneNumbers',
			phoneNumberId,
			'phone number',
		)
		await ctx.db.patch(
			id,
			stampUpdate({
				status,
				archivedAt: status === 'archived' ? now() : undefined,
			}),
		)
	},
})

export const archive = tenantMutation({
	args: { phoneNumberId: z.string() },
	handler: async (ctx, { phoneNumberId }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'phoneNumbers',
			phoneNumberId,
			'phone number',
		)
		await ctx.db.patch(
			id,
			stampUpdate({ status: 'archived' as const, archivedAt: now() }),
		)
	},
})

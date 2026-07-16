import {
	PHONE_PROVIDERS,
	TELEPHONY_CONNECTION_STATUSES,
	telephonyConnections,
} from '@agent.io/domain/schemas'
import { v } from 'convex/values'
import { z } from 'zod'

import { nativePaginationOpts, now, stampCreate, stampUpdate } from '../lib'
import {
	internalQuery,
	requireTenantAdmin,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
	triggeredInternalMutation,
} from '../utils'

export const resolveForProviderSync = internalQuery({
	args: { connectionId: v.id('telephonyConnections') },
	handler: (ctx, { connectionId }) => ctx.db.get(connectionId),
})

export const recordProviderSync = triggeredInternalMutation({
	args: {
		connectionId: v.id('telephonyConnections'),
		error: v.optional(v.string()),
	},
	handler: async (ctx, { connectionId, error }) => {
		const connection = await ctx.db.get(connectionId)
		if (!connection) throw new Error('connection not found')
		await ctx.db.patch(
			connectionId,
			stampUpdate({
				lastSyncedAt: error ? connection.lastSyncedAt : now(),
				lastError: error,
				status: error ? ('error' as const) : ('active' as const),
			}),
		)
	},
})

type TelephonyConnectionRecord = {
	_id: string
	_creationTime: number
	provider: (typeof PHONE_PROVIDERS)[number]
	label: string
	providerAccountId: string
	credentialSecretRef: string
	defaultRoutingRegion?: string
	status: (typeof TELEPHONY_CONNECTION_STATUSES)[number]
	lastSyncedAt?: string
	lastError?: string
	createdAt: string
	updatedAt?: string
}

export const toPublicTelephonyConnection = (
	connection: TelephonyConnectionRecord,
) => ({
	id: connection._id,
	provider: connection.provider,
	label: connection.label,
	status: connection.status,
	defaultRoutingRegion: connection.defaultRoutingRegion,
	lastSyncedAt: connection.lastSyncedAt,
	lastError: connection.lastError
		? 'Provider synchronization failed'
		: undefined,
	createdAt: connection.createdAt,
	updatedAt: connection.updatedAt,
	providerAccountConfigured: connection.providerAccountId.length > 0,
})

export const create = tenantMutation({
	args: telephonyConnections.insert({ tenant: true }).shape,
	handler: async (ctx, args) => {
		requireTenantAdmin(ctx.org)
		const duplicate = await ctx.db
			.query('telephonyConnections')
			.withIndex('by_tenant_provider_account', (q) =>
				q
					.eq('tenant', ctx.tenant)
					.eq('provider', args.provider)
					.eq('providerAccountId', args.providerAccountId),
			)
			.unique()
		if (duplicate) throw new Error('provider account is already connected')
		return ctx.db.insert('telephonyConnections', stampCreate(ctx.tenant, args))
	},
})

export const list = tenantQuery({
	args: {
		paginationOpts: nativePaginationOpts,
		provider: z.enum(PHONE_PROVIDERS).optional(),
		status: z.enum(TELEPHONY_CONNECTION_STATUSES).optional(),
	},
	handler: async (ctx, { paginationOpts, provider, status }) => {
		const query =
			provider && status
				? ctx.db
						.query('telephonyConnections')
						.withIndex('by_tenant_provider_status', (q) =>
							q
								.eq('tenant', ctx.tenant)
								.eq('provider', provider)
								.eq('status', status),
						)
				: provider
					? ctx.db
							.query('telephonyConnections')
							.withIndex('by_tenant_provider', (q) =>
								q.eq('tenant', ctx.tenant).eq('provider', provider),
							)
					: status
						? ctx.db
								.query('telephonyConnections')
								.withIndex('by_tenant_status', (q) =>
									q.eq('tenant', ctx.tenant).eq('status', status),
								)
						: ctx.db
								.query('telephonyConnections')
								.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
		const result = await query.order('desc').paginate(paginationOpts)
		return { ...result, page: result.page.map(toPublicTelephonyConnection) }
	},
})

export const get = tenantQuery({
	args: { connectionId: z.string() },
	handler: async (ctx, { connectionId }) => {
		const id = await resolveTenantId(
			ctx,
			'telephonyConnections',
			connectionId,
			'connection',
		)
		const connection = await ctx.db.get(id)
		if (!connection) throw new Error('connection not found')
		return toPublicTelephonyConnection(connection)
	},
})

export const update = tenantMutation({
	args: {
		connectionId: z.string(),
		patch: z
			.object({
				label: z.string().max(120).optional(),
				defaultRoutingRegion: z.string().min(1).max(120).nullable().optional(),
			})
			.strict(),
	},
	handler: async (ctx, { connectionId, patch }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'telephonyConnections',
			connectionId,
			'connection',
		)
		await ctx.db.patch(
			id,
			stampUpdate({
				...patch,
				defaultRoutingRegion:
					patch.defaultRoutingRegion === null
						? undefined
						: patch.defaultRoutingRegion,
			}),
		)
	},
})

export const setStatus = tenantMutation({
	args: {
		connectionId: z.string(),
		status: z.enum(TELEPHONY_CONNECTION_STATUSES),
	},
	handler: async (ctx, { connectionId, status }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'telephonyConnections',
			connectionId,
			'connection',
		)
		await ctx.db.patch(
			id,
			stampUpdate({
				status,
				...(status === 'archived' ? { lastError: undefined } : {}),
			}),
		)
	},
})

export const archive = tenantMutation({
	args: { connectionId: z.string() },
	handler: async (ctx, { connectionId }) => {
		requireTenantAdmin(ctx.org)
		const id = await resolveTenantId(
			ctx,
			'telephonyConnections',
			connectionId,
			'connection',
		)
		await ctx.db.patch(
			id,
			stampUpdate({ status: 'archived' as const, lastError: undefined }),
		)
	},
})

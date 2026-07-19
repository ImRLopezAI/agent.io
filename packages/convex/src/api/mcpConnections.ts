import { mcpConnections, validateMcpConnection } from '@agent.io/domain/schemas'
import { z } from 'zod'

import { internal } from '../_generated/api'
import { nativePaginationOpts, stampCreate, stampUpdate } from '../lib'
import {
	requireTenantAdmin,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
} from '../utils'

type McpConnectionRecord = z.infer<typeof mcpConnections.schema> & {
	_id: string
	_creationTime: number
}

const MCP_ATTACHMENT_SCAN_LIMIT = 2_000

export const publicMcpCreateInput = mcpConnections
	.insert({ tenant: true, secretRef: true, requestHeaders: true })
	.strict()

export const publicMcpUpdatePatch = mcpConnections
	.update({ tenant: true, secretRef: true, requestHeaders: true })
	.strict()

export const mergeAndValidateMcpConnection = <
	Existing extends object,
	Patch extends object,
>(
	existing: Existing,
	patch: Patch,
) => {
	const merged = { ...existing, ...patch } as Existing &
		Patch & {
			kind: 'byo' | 'composio'
			url?: string
			composioAccountId?: string
		}
	const violation = validateMcpConnection(merged)
	if (violation) throw new Error(violation)
	return merged
}

const sanitizedEndpoint = (value?: string) => {
	if (!value) return undefined
	try {
		const url = new URL(value)
		url.username = ''
		url.password = ''
		url.search = ''
		url.hash = ''
		return url.toString()
	} catch {
		return undefined
	}
}

export const toMcpConnectionDto = (connection: McpConnectionRecord) => ({
	id: connection._id,
	kind: connection.kind,
	name: connection.name,
	description: connection.description,
	status: connection.status,
	url: sanitizedEndpoint(connection.url),
	endpointConfigured: Boolean(connection.url),
	transport: connection.transport,
	providerAccountConfigured: Boolean(connection.composioAccountId),
	credentialConfigured: Boolean(
		connection.secretRef ||
		Object.values(connection.requestHeaders ?? {}).some(
			(value) => typeof value !== 'string',
		),
	),
	headers: Object.entries(connection.requestHeaders ?? {})
		.map(([name, value]) => ({
			name,
			configured: true as const,
			source: (typeof value === 'string' ? 'literal' : 'secret') as
				| 'literal'
				| 'secret',
		}))
		.sort((left, right) => left.name.localeCompare(right.name)),
	toolkitSlugs: connection.toolkitSlugs,
	approvalPolicy: connection.approvalPolicy,
	toolApprovals: connection.toolApprovals,
	allowedTools: connection.allowedTools,
	responseTimeoutSecs: connection.responseTimeoutSecs,
	toolConfigOverrides: connection.toolConfigOverrides.map((override) => ({
		toolName: override.toolName,
		inputs: Object.entries(override.inputOverrides ?? {})
			.map(([name, input]) => ({ name, source: input.source }))
			.sort((left, right) => left.name.localeCompare(right.name)),
	})),
	createdAt: connection.createdAt,
	updatedAt: connection.updatedAt,
	creationTime: connection._creationTime,
})

export const create = tenantMutation({
	args: publicMcpCreateInput.shape,
	handler: async (ctx, args) => {
		requireTenantAdmin(ctx.org)
		const merged = mergeAndValidateMcpConnection({}, args)
		const created: McpConnectionRecord = await ctx.runMutation(
			internal.api.internals.mcpConnections.create,
			stampCreate(ctx.tenant, merged),
		)
		return toMcpConnectionDto(created)
	},
})

export const update = tenantMutation({
	args: { id: z.string(), patch: publicMcpUpdatePatch },
	handler: async (ctx, { id, patch }) => {
		requireTenantAdmin(ctx.org)
		const connectionId = await resolveTenantId(
			ctx,
			'mcpConnections',
			id,
			'MCP connection',
		)
		const existing = await ctx.db.get(connectionId)
		if (!existing) throw new Error('MCP connection not found')
		mergeAndValidateMcpConnection(existing, patch)
		await ctx.runMutation(internal.api.internals.mcpConnections.update, {
			id: connectionId,
			patch: stampUpdate(patch),
		})
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requireTenantAdmin(ctx.org)
		const connectionId = await resolveTenantId(
			ctx,
			'mcpConnections',
			id,
			'MCP connection',
		)
		const variants = await ctx.db
			.query('agentVariants')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.take(MCP_ATTACHMENT_SCAN_LIMIT)
		const attachedVariant = variants.find((variant) =>
			variant.draft.mcp.some((scope) => scope.connectionId === connectionId),
		)
		if (attachedVariant) {
			throw new Error(
				`MCP connection is attached to Agent Variant "${attachedVariant.name}"`,
			)
		}
		if (variants.length === MCP_ATTACHMENT_SCAN_LIMIT) {
			throw new Error(
				'MCP attachment check reached its scan limit; detach through indexed maintenance',
			)
		}
		await ctx.runMutation(internal.api.internals.mcpConnections.update, {
			id: connectionId,
			patch: stampUpdate({ status: 'disabled' as const }),
		})
	},
})

export const get = tenantQuery({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const connectionId = await resolveTenantId(
			ctx,
			'mcpConnections',
			id,
			'MCP connection',
		)
		const connection = await ctx.db.get(connectionId)
		if (!connection) throw new Error('MCP connection not found')
		return toMcpConnectionDto(connection)
	},
})

export const list = tenantQuery({
	args: {
		paginationOpts: nativePaginationOpts,
		kind: z.enum(['composio', 'byo']).optional(),
		status: z.enum(['active', 'disabled', 'error']).optional(),
	},
	handler: async (ctx, { paginationOpts, kind, status }) => {
		const query =
			kind && status
				? ctx.db
						.query('mcpConnections')
						.withIndex('by_tenant_and_kind_and_status', (q) =>
							q.eq('tenant', ctx.tenant).eq('kind', kind).eq('status', status),
						)
				: kind
					? ctx.db
							.query('mcpConnections')
							.withIndex('by_tenant_and_kind', (q) =>
								q.eq('tenant', ctx.tenant).eq('kind', kind),
							)
					: status
						? ctx.db
								.query('mcpConnections')
								.withIndex('by_tenant_and_status', (q) =>
									q.eq('tenant', ctx.tenant).eq('status', status),
								)
						: ctx.db
								.query('mcpConnections')
								.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
		const result = await query.order('desc').paginate(paginationOpts)
		return { ...result, page: result.page.map(toMcpConnectionDto) }
	},
})

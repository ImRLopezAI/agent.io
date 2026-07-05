import { McpConnections, validateMcpConnection } from '@agent.io/domain/schemas'
import { z } from 'zod'

import { now } from '../lib'
import { tenantMutation, tenantQuery } from '../utils'

export const create = tenantMutation({
	args: McpConnections.insert({ tenant: true }).shape,
	handler: async (ctx, args) => {
		const violation = validateMcpConnection(args)
		if (violation) throw new Error(violation)
		return ctx.db.insert('mcpConnections', {
			...args,
			tenant: ctx.tenant,
			createdAt: now(),
		})
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: McpConnections.update({ tenant: true, kind: true }),
	},
	handler: async (ctx, { id, patch }) => {
		const connectionId = ctx.db.normalizeId('mcpConnections', id)
		if (!connectionId) throw new Error('invalid connection id')
		await ctx.db.patch(connectionId, { ...patch, updatedAt: now() })
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const connectionId = ctx.db.normalizeId('mcpConnections', id)
		if (!connectionId) throw new Error('invalid connection id')
		await ctx.db.delete(connectionId)
	},
})

export const list = tenantQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query('mcpConnections')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.collect(),
})

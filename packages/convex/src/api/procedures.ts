import { procedures, validateProcedureBody } from '@agent.io/domain/schemas'
import { internal } from '@convex/api'
import { z } from 'zod'

import { stampCreate, stampUpdate } from '../lib'
import { tenantMutation, tenantQuery } from '../utils'

export const create = tenantMutation({
	args: procedures.insert({ tenant: true }).shape,
	handler: async (ctx, args) => {
		const violation = validateProcedureBody(args)
		if (violation) throw new Error(violation)
		return ctx.runMutation(
			internal.api.internals.procedures.create,
			stampCreate(ctx.tenant, args),
		)
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: procedures.update({ tenant: true, type: true, agentId: true }),
	},
	handler: async (ctx, { id, patch }) => {
		const procedureId = ctx.db.normalizeId('procedures', id)
		if (!procedureId) throw new Error('invalid procedure id')
		const existing = await ctx.db.get(procedureId)
		if (!existing) throw new Error('procedure not found')
		// type is NOT convertible after creation (vendor rule)
		const merged = { ...existing, ...patch }
		const violation = validateProcedureBody(merged)
		if (violation) throw new Error(violation)
		await ctx.runMutation(internal.api.internals.procedures.update, {
			id: procedureId,
			patch: stampUpdate(patch),
		})
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const procedureId = ctx.db.normalizeId('procedures', id)
		if (!procedureId) throw new Error('invalid procedure id')
		const existing = await ctx.db.get(procedureId)
		if (!existing) throw new Error('procedure not found')
		await ctx.runMutation(internal.api.internals.procedures.destroy, {
			id: procedureId,
		})
	},
})

export const listByAgent = tenantQuery({
	args: { agentId: z.string() },
	handler: async (ctx, { agentId }) => {
		const id = ctx.db.normalizeId('agents', agentId)
		if (!id) return []
		return ctx.db
			.query('procedures')
			.withIndex('by_agent', (q) => q.eq('agentId', id))
			.collect()
	},
})

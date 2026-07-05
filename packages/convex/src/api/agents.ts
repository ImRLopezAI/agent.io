import { agents } from '@agent.io/domain/schemas'
import { getManyFrom } from 'convex-helpers/server/relationships'
import { z } from 'zod'

import { now } from '../lib'
import { tenantMutation, tenantQuery } from '../utils'
import { buildVersionSnapshot } from './publishCore'

export const create = tenantMutation({
	args: agents.insert({ tenant: true }).shape,
	handler: async (ctx, args) => {
		return ctx.db.insert('agents', {
			...args,
			tenant: ctx.tenant,
			createdAt: now(),
		})
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: agents.update({ tenant: true }),
	},
	handler: async (ctx, { id, patch }) => {
		const agentId = ctx.db.normalizeId('agents', id)
		if (!agentId) throw new Error('invalid agent id')
		await ctx.db.patch(agentId, { ...patch, updatedAt: now() })
	},
})

export const get = tenantQuery({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const agentId = ctx.db.normalizeId('agents', id)
		return agentId ? ctx.db.get(agentId) : null
	},
})

export const list = tenantQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query('agents')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.collect(),
})

/**
 * Publish (plan Unit 8): draft + active procedures → immutable agentVersions
 * snapshot with procedures embedded. Atomic — validation or budget failure
 * writes nothing.
 */
export const publish = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const agentId = ctx.db.normalizeId('agents', id)
		if (!agentId) throw new Error('invalid agent id')
		const draft = await ctx.db.get(agentId)
		if (!draft) throw new Error('agent not found')

		const procedures = await getManyFrom(
			ctx.db,
			'procedures',
			'by_agent',
			agentId,
			'agentId',
		)
		const config = buildVersionSnapshot(draft, procedures)

		const versions = await getManyFrom(
			ctx.db,
			'agentVersions',
			'by_agent',
			agentId,
			'agentId',
		)
		const version = versions.reduce((max, v) => Math.max(max, v.version), 0) + 1

		const versionId = await ctx.db.insert('agentVersions', {
			tenant: ctx.tenant,
			agentId,
			version,
			publishedBy: ctx.user.externalId ?? ctx.user.id,
			config,
			createdAt: now(),
		})
		await ctx.db.patch(agentId, {
			publishedVersionId: versionId,
			updatedAt: now(),
		})
		return { versionId, version }
	},
})

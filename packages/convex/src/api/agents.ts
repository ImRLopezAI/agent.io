import { agents } from '@agent.io/domain/schemas'
import { internal } from '@convex/api'
import { getManyFrom } from 'convex-helpers/server/relationships'
import { z } from 'zod'

import { tenantMutation, tenantQuery } from '@/utils'

import { stampCreate, stampUpdate } from '../lib'
import { buildVersionSnapshot } from './publishCore'

/**
 * Business tier: validations/asserts here, writes delegated to the internal
 * crud tier (sub-transactions — triggers fire through the wrapped builder).
 */

export const create = tenantMutation({
	args: agents.insert({ tenant: true, publishedVersionId: true }).shape,
	handler: async (ctx, args) => {
		// drafts are born unpublished — publishedVersionId only moves via publish()
		const created: z.infer<typeof agents.schema> = await ctx.runMutation(
			internal.api.internals.agents.create,
			stampCreate(ctx.tenant, args),
		)
		return created
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: agents.update({ tenant: true, publishedVersionId: true }),
	},
	handler: async (ctx, { id, patch }) => {
		const agentId = ctx.db.normalizeId('agents', id)
		if (!agentId) throw new Error('invalid agent id')
		const existing = await ctx.db.get(agentId)
		if (!existing) throw new Error('agent not found')
		// business rule: archived drafts are read-only until unarchived
		if (existing.archived && patch.archived !== false) {
			throw new Error('agent is archived — unarchive it before editing')
		}
		await ctx.runMutation(internal.api.internals.agents.update, {
			id: agentId,
			patch: stampUpdate(patch),
		})
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const agentId = ctx.db.normalizeId('agents', id)
		if (!agentId) throw new Error('invalid agent id')
		// tenant check through the RLS-wrapped read before the internal destroy
		const existing = await ctx.db.get(agentId)
		if (!existing) throw new Error('agent not found')
		await ctx.runMutation(internal.api.internals.agents.destroy, {
			id: agentId,
		})
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
 * writes nothing (sub-mutations share the transaction).
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

		const created = await ctx.runMutation(
			internal.api.internals.agentVersions.create,
			stampCreate(ctx.tenant, {
				agentId,
				version,
				publishedBy: ctx.user.externalId ?? ctx.user.id,
				config,
			}),
		)
		await ctx.runMutation(internal.api.internals.agents.update, {
			id: agentId,
			patch: stampUpdate({ publishedVersionId: created._id }),
		})
		return { versionId: created._id, version }
	},
})

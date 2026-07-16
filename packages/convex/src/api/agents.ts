import { agents, agentVariantDraftConfig } from '@agent.io/domain/schemas'
import { z } from 'zod'

import { nativePaginationOpts, now, stampUpdate } from '../lib'
import {
	requirePermission,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
} from '../utils'
import { toVariantSummary } from './agentVariantDtos'
import { publishVariantForContext } from './agentVariants'
import { validateAgentAttachments } from './internals/agentAttachments'

export const toAgentSummary = (agent: {
	_id: string
	_creationTime: number
	name: string
	mainVariantId?: string
	allocationRevision: number
	archived: boolean
	createdAt: string
	updatedAt?: string
}) => ({
	id: agent._id,
	name: agent.name,
	mainVariantId: agent.mainVariantId,
	allocationRevision: agent.allocationRevision,
	archived: agent.archived,
	createdAt: agent.createdAt,
	updatedAt: agent.updatedAt,
	creationTime: agent._creationTime,
})

export const toAgentDetail = toAgentSummary

export const create = tenantMutation({
	args: {
		name: z.string().min(1).max(120),
		draft: agentVariantDraftConfig,
	},
	handler: async (ctx, { name, draft }) => {
		requirePermission(ctx.org, 'prompts:write')
		await validateAgentAttachments(ctx, draft)
		const timestamp = now()
		const agentId = await ctx.db.insert('agents', {
			tenant: ctx.tenant,
			name,
			allocationRevision: 0,
			archived: false,
			createdAt: timestamp,
		})
		const mainVariantId = await ctx.db.insert('agentVariants', {
			tenant: ctx.tenant,
			agentId,
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 0,
			draft,
			archived: false,
			createdAt: timestamp,
		})
		await ctx.db.patch(agentId, { mainVariantId, updatedAt: timestamp })
		const agent = await ctx.db.get(agentId)
		if (!agent) throw new Error('agent creation failed')
		const mainVariant = await ctx.db.get(mainVariantId)
		if (!mainVariant) throw new Error('Main Variant creation failed')
		return {
			...toAgentDetail(agent),
			mainVariant: toVariantSummary(mainVariant),
		}
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: agents.update({ tenant: true, mainVariantId: true }),
	},
	handler: async (ctx, { id, patch }) => {
		requirePermission(ctx.org, 'prompts:write')
		const agentId = await resolveTenantId(ctx, 'agents', id, 'agent')
		const existing = await ctx.db.get(agentId)
		if (!existing) throw new Error('agent not found')
		if (existing.archived && patch.archived !== false) {
			throw new Error('agent is archived - unarchive it before editing')
		}
		await ctx.db.patch(agentId, stampUpdate(patch))
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:write')
		const agentId = await resolveTenantId(ctx, 'agents', id, 'agent')
		await ctx.db.patch(agentId, stampUpdate({ archived: true }))
	},
})

export const get = tenantQuery({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:read')
		const agentId = await resolveTenantId(ctx, 'agents', id, 'agent')
		const agent = await ctx.db.get(agentId)
		if (!agent) throw new Error('agent not found')
		const mainVariant = agent.mainVariantId
			? await ctx.db.get(agent.mainVariantId)
			: null
		return {
			...toAgentDetail(agent),
			mainVariant: mainVariant ? toVariantSummary(mainVariant) : undefined,
		}
	},
})

export const list = tenantQuery({
	args: {
		paginationOpts: nativePaginationOpts,
		archived: z.boolean().optional(),
	},
	handler: async (ctx, { paginationOpts, archived }) => {
		requirePermission(ctx.org, 'prompts:read')
		const result =
			archived === undefined
				? await ctx.db
						.query('agents')
						.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
						.order('desc')
						.paginate(paginationOpts)
				: await ctx.db
						.query('agents')
						.withIndex('by_tenant_and_archived', (q) =>
							q.eq('tenant', ctx.tenant).eq('archived', archived),
						)
						.order('desc')
						.paginate(paginationOpts)
		return {
			...result,
			page: await Promise.all(
				result.page.map(async (agent) => {
					const mainVariant = agent.mainVariantId
						? await ctx.db.get(agent.mainVariantId)
						: null
					return {
						...toAgentSummary(agent),
						mainVariant: mainVariant
							? toVariantSummary(mainVariant)
							: undefined,
					}
				}),
			),
		}
	},
})

/** Backwards-compatible convenience: publish the Agent's Main Variant. */
export const publish = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:write')
		const agentId = await resolveTenantId(ctx, 'agents', id, 'agent')
		const agent = await ctx.db.get(agentId)
		if (!agent?.mainVariantId) throw new Error('agent Main Variant not found')
		return publishVariantForContext(ctx, agent.mainVariantId)
	},
})

export { validateAgentAttachments } from './internals/agentAttachments'

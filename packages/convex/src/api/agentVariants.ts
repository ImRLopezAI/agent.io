import {
	AGENT_TRAFFIC_BPS_TOTAL,
	agentVariantDraftConfig,
	validateVariantAllocation,
} from '@agent.io/domain'
import { z } from 'zod'

import type { Id } from '../_generated/dataModel'
import { nativePaginationOpts, now, stampUpdate } from '../lib'
import {
	requirePermission,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
	type TenantMutationCtx,
} from '../utils'
import {
	toVariantDetail,
	toVariantSummary,
	type VariantDoc,
} from './agentVariantDtos'
import { validateAgentAttachments } from './internals/agentAttachments'
import { MAX_AGENT_VARIANTS } from './internals/agentRouting'
import { buildVersionSnapshot } from './publishCore'

const cloneVariantProcedures = async (
	ctx: TenantMutationCtx,
	sourceVariantId: VariantDoc['_id'],
	targetVariantId: VariantDoc['_id'],
) => {
	const sourceProcedures = await ctx.db
		.query('procedures')
		.withIndex('by_variant', (q) => q.eq('agentVariantId', sourceVariantId))
		.collect()
	const clonedIds = new Map<string, Id<'procedures'>>()
	for (const procedure of sourceProcedures) {
		const { _id, _creationTime, tenant, createdAt, updatedAt, ...copy } =
			procedure
		void _id
		void _creationTime
		void tenant
		void createdAt
		void updatedAt
		const clonedId = await ctx.db.insert('procedures', {
			...copy,
			agentVariantId: targetVariantId,
			tenant: ctx.tenant,
			createdAt: now(),
		})
		clonedIds.set(procedure._id, clonedId)
	}
	for (const procedure of sourceProcedures) {
		const clonedId = clonedIds.get(procedure._id)
		if (!clonedId) throw new Error('Procedure clone failed')
		await ctx.db.patch(clonedId, {
			references: procedure.references.map((reference) => ({
				...reference,
				targetId:
					reference.targetType === 'procedure'
						? (clonedIds.get(reference.targetId) ?? reference.targetId)
						: reference.targetId,
			})),
		})
	}
}

const getVariant = async (ctx: TenantMutationCtx, rawId: string) => {
	const id = await resolveTenantId(ctx, 'agentVariants', rawId, 'Agent Variant')
	const variant = await ctx.db.get(id)
	if (!variant) throw new Error('Agent Variant not found')
	return variant
}

export const publishVariantForContext = async (
	ctx: TenantMutationCtx,
	variantId: string,
) => {
	const variant = await ctx.db.get(
		variantId as Parameters<TenantMutationCtx['db']['get']>[0],
	)
	if (!variant || !('draft' in variant))
		throw new Error('Agent Variant not found')
	const agent = await ctx.db.get(variant.agentId)
	if (!agent || agent.archived)
		throw new Error('archived agents cannot publish')
	if (variant.archived) throw new Error('archived Variants cannot publish')
	await validateAgentAttachments(ctx, variant.draft)
	const [procedures, latest] = await Promise.all([
		ctx.db
			.query('procedures')
			.withIndex('by_variant', (q) => q.eq('agentVariantId', variant._id))
			.collect(),
		ctx.db
			.query('agentVersions')
			.withIndex('by_variant_and_version', (q) =>
				q.eq('agentVariantId', variant._id),
			)
			.order('desc')
			.first(),
	])
	const version = (latest?.version ?? 0) + 1
	const versionId = await ctx.db.insert('agentVersions', {
		tenant: ctx.tenant,
		agentId: variant.agentId,
		agentVariantId: variant._id,
		version,
		publishedBy: ctx.user.externalId ?? ctx.user.id,
		config: buildVersionSnapshot(variant.draft, procedures),
		createdAt: now(),
	})
	const initializeMain =
		variant.isMain &&
		variant.trafficWeightBps === 0 &&
		agent.allocationRevision === 0
	await ctx.db.patch(variant._id, {
		publishedVersionId: versionId,
		...(initializeMain ? { trafficWeightBps: AGENT_TRAFFIC_BPS_TOTAL } : {}),
		updatedAt: now(),
	})
	if (initializeMain) {
		await ctx.db.patch(agent._id, { allocationRevision: 1, updatedAt: now() })
	}
	return { versionId, version }
}

export const create = tenantMutation({
	args: { agentId: z.string(), name: z.string().min(1).max(120) },
	handler: async (ctx, { agentId: rawAgentId, name }) => {
		requirePermission(ctx.org, 'prompts:write')
		const agentId = await resolveTenantId(ctx, 'agents', rawAgentId, 'agent')
		const agent = await ctx.db.get(agentId)
		if (!agent?.mainVariantId) throw new Error('agent Main Variant not found')
		if (agent.archived) throw new Error('archived agents cannot add Variants')
		const main = await ctx.db.get(agent.mainVariantId)
		if (!main) throw new Error('agent Main Variant not found')
		const activeVariants = await ctx.db
			.query('agentVariants')
			.withIndex('by_agent_and_archived', (q) =>
				q.eq('agentId', agentId).eq('archived', false),
			)
			.take(MAX_AGENT_VARIANTS)
		if (activeVariants.length >= MAX_AGENT_VARIANTS) {
			throw new Error('agent_variant_limit_exceeded')
		}
		const latestVariant = await ctx.db
			.query('agentVariants')
			.withIndex('by_agent_and_allocationOrdinal', (q) =>
				q.eq('agentId', agentId),
			)
			.order('desc')
			.first()
		const allocationOrdinal = (latestVariant?.allocationOrdinal ?? 0) + 1
		const variantId = await ctx.db.insert('agentVariants', {
			tenant: ctx.tenant,
			agentId,
			name,
			isMain: false,
			allocationOrdinal,
			trafficWeightBps: 0,
			conversationCount: 0,
			doneCount: 0,
			failedCount: 0,
			draft: main.draft,
			archived: false,
			createdAt: now(),
		})
		await cloneVariantProcedures(ctx, main._id, variantId)
		const created = await ctx.db.get(variantId)
		if (!created) throw new Error('Agent Variant creation failed')
		return toVariantDetail(created as VariantDoc)
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: z.object({
			name: z.string().min(1).max(120).optional(),
			draft: agentVariantDraftConfig.partial().optional(),
		}),
	},
	handler: async (ctx, { id, patch }) => {
		requirePermission(ctx.org, 'prompts:write')
		const variant = await getVariant(ctx, id)
		if (variant.archived) throw new Error('archived Variants cannot be edited')
		const draft = patch.draft
			? { ...variant.draft, ...patch.draft }
			: variant.draft
		await validateAgentAttachments(ctx, draft)
		await ctx.db.patch(
			variant._id,
			stampUpdate({
				...(patch.name ? { name: patch.name } : {}),
				...(patch.draft ? { draft } : {}),
			}),
		)
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:write')
		const variant = await getVariant(ctx, id)
		if (variant.isMain) throw new Error('Main Variant cannot be archived')
		if (variant.trafficWeightBps > 0) {
			throw new Error('reallocate traffic before archiving this Variant')
		}
		await ctx.db.patch(variant._id, stampUpdate({ archived: true }))
	},
})

export const get = tenantQuery({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:read')
		const variantId = await resolveTenantId(
			ctx,
			'agentVariants',
			id,
			'Agent Variant',
		)
		const variant = await ctx.db.get(variantId)
		if (!variant) throw new Error('Agent Variant not found')
		return toVariantDetail(variant as VariantDoc)
	},
})

export const listByAgent = tenantQuery({
	args: { agentId: z.string(), paginationOpts: nativePaginationOpts },
	handler: async (ctx, { agentId, paginationOpts }) => {
		requirePermission(ctx.org, 'prompts:read')
		const id = await resolveTenantId(ctx, 'agents', agentId, 'agent')
		const result = await ctx.db
			.query('agentVariants')
			.withIndex('by_agent', (q) => q.eq('agentId', id))
			.order('asc')
			.paginate(paginationOpts)
		return {
			...result,
			page: result.page.map((row) => toVariantSummary(row as VariantDoc)),
		}
	},
})

export const publish = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:write')
		const variantId = await resolveTenantId(
			ctx,
			'agentVariants',
			id,
			'Agent Variant',
		)
		return publishVariantForContext(ctx, variantId)
	},
})

/**
 * Emergency rollback for a bad publish or merge: repoints the Variant to any
 * of its existing immutable Versions. No new Version row, no draft mutation,
 * no allocation change — nothing new can enter the deployment through this
 * path, so it cannot act as a publish bypass.
 */
export const republishVersion = tenantMutation({
	args: { agentVariantId: z.string(), versionId: z.string() },
	handler: async (ctx, args) => {
		requirePermission(ctx.org, 'prompts:write')
		const variant = await getVariant(ctx, args.agentVariantId)
		if (variant.archived) {
			throw new Error('archived Variants cannot republish')
		}
		const versionId = await resolveTenantId(
			ctx,
			'agentVersions',
			args.versionId,
			'Agent Version',
		)
		const version = await ctx.db.get(versionId)
		if (!version || version.agentVariantId !== variant._id) {
			throw new Error('Agent Version not found')
		}
		await ctx.db.patch(variant._id, {
			publishedVersionId: versionId,
			updatedAt: now(),
		})
		return { publishedVersionId: versionId, version: version.version }
	},
})

export const setTrafficAllocation = tenantMutation({
	args: {
		agentId: z.string(),
		allocation: z.array(
			z.object({ variantId: z.string(), weightBps: z.number().int() }),
		),
	},
	handler: async (ctx, { agentId: rawAgentId, allocation }) => {
		requirePermission(ctx.org, 'prompts:write')
		const agentId = await resolveTenantId(ctx, 'agents', rawAgentId, 'agent')
		const agent = await ctx.db.get(agentId)
		if (!agent) throw new Error('agent not found')
		const variants = await ctx.db
			.query('agentVariants')
			.withIndex('by_agent_and_archived', (q) =>
				q.eq('agentId', agentId).eq('archived', false),
			)
			.collect()
		const published = variants.filter((variant) => variant.publishedVersionId)
		const publishedById = new Map(
			published.map((variant) => [variant._id as string, variant]),
		)
		const requestedIds = new Set(allocation.map((item) => item.variantId))
		if (
			allocation.length !== published.length ||
			requestedIds.size !== allocation.length ||
			published.some((variant) => !requestedIds.has(variant._id))
		) {
			throw new Error(
				'allocation must contain every active published Variant exactly once',
			)
		}
		const normalized = allocation.map((item) => {
			const variant = publishedById.get(item.variantId)
			if (!variant) throw new Error('Agent Variant not found')
			return {
				variantId: variant._id,
				allocationOrdinal: variant.allocationOrdinal,
				weightBps: item.weightBps,
			}
		})
		const violation = validateVariantAllocation(normalized)
		if (violation) throw new Error(violation)
		for (const item of normalized) {
			await ctx.db.patch(item.variantId, {
				trafficWeightBps: item.weightBps,
				updatedAt: now(),
			})
		}
		const allocationRevision = agent.allocationRevision + 1
		await ctx.db.patch(agentId, { allocationRevision, updatedAt: now() })
		return { allocationRevision }
	},
})

export const mergeToMain = tenantMutation({
	args: { sourceVariantId: z.string() },
	handler: async (ctx, { sourceVariantId }) => {
		requirePermission(ctx.org, 'prompts:write')
		const source = await getVariant(ctx, sourceVariantId)
		if (source.isMain) throw new Error('Main Variant cannot merge into itself')
		const agent = await ctx.db.get(source.agentId)
		if (!agent?.mainVariantId) throw new Error('agent Main Variant not found')
		const main = await ctx.db.get(agent.mainVariantId)
		if (!main) throw new Error('agent Main Variant not found')
		await ctx.db.patch(main._id, stampUpdate({ draft: source.draft }))
		const mainProcedures = await ctx.db
			.query('procedures')
			.withIndex('by_variant', (q) => q.eq('agentVariantId', main._id))
			.collect()
		for (const procedure of mainProcedures) await ctx.db.delete(procedure._id)
		await cloneVariantProcedures(ctx, source._id, main._id)
		return publishVariantForContext(ctx, main._id)
	},
})

export { toVariantDetail, toVariantSummary } from './agentVariantDtos'

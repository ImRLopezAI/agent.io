import { selectVariantForConversation } from '@agent.io/domain'

import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'

export const MAX_AGENT_VARIANTS = 50

export type WorkflowAttribution = 'inbound' | 'outbound' | 'none'

export interface ResolvedDeployment {
	agent: Doc<'agents'>
	variant: Doc<'agentVariants'>
	version: Doc<'agentVersions'>
	allocationMode: 'weighted' | 'override'
	allocationBucket?: number
	allocationRevision: number
	workflow: WorkflowAttribution
}

export const resolveAgentDeployment = async (
	ctx: Pick<MutationCtx, 'db'> & { tenant: string },
	args: {
		agentId: Id<'agents'>
		conversationKey: string
		workflow: WorkflowAttribution
		variantOverrideId?: string
	},
): Promise<ResolvedDeployment> => {
	const agent = await ctx.db.get(args.agentId)
	if (!agent || agent.tenant !== ctx.tenant || agent.archived) {
		throw new Error('agent_not_routable')
	}
	let variant: Doc<'agentVariants'>
	let allocationMode: 'weighted' | 'override'
	let allocationBucket: number | undefined
	if (args.variantOverrideId) {
		const overrideId = ctx.db.normalizeId(
			'agentVariants',
			args.variantOverrideId,
		)
		const override = overrideId ? await ctx.db.get(overrideId) : null
		if (
			!override ||
			override.tenant !== ctx.tenant ||
			override.agentId !== agent._id ||
			override.archived ||
			!override.publishedVersionId
		) {
			throw new Error('variant_override_not_allowed')
		}
		variant = override
		allocationMode = 'override'
	} else {
		const variants = await ctx.db
			.query('agentVariants')
			.withIndex('by_agent_and_archived', (q) =>
				q.eq('agentId', agent._id).eq('archived', false),
			)
			.take(MAX_AGENT_VARIANTS + 1)
		if (variants.length > MAX_AGENT_VARIANTS) {
			throw new Error('agent_variant_limit_exceeded')
		}
		const published = variants.filter(
			(
				item,
			): item is typeof item & { publishedVersionId: Id<'agentVersions'> } =>
				Boolean(item.publishedVersionId),
		)
		const selection = selectVariantForConversation(
			args.conversationKey,
			published.map((item) => ({
				variantId: item._id,
				allocationOrdinal: item.allocationOrdinal,
				weightBps: item.trafficWeightBps,
			})),
		)
		const selected = published.find((item) => item._id === selection.variantId)
		if (!selected) throw new Error('agent_allocation_invalid')
		variant = selected
		allocationMode = 'weighted'
		allocationBucket = selection.bucket
	}
	if (!variant.publishedVersionId) throw new Error('variant_not_published')
	const version = await ctx.db.get(variant.publishedVersionId)
	if (
		!version ||
		version.tenant !== ctx.tenant ||
		version.agentId !== agent._id ||
		version.agentVariantId !== variant._id
	) {
		throw new Error('published_version_invalid')
	}
	if (
		(args.workflow === 'inbound' && !version.config.inboundWorkflow.enabled) ||
		(args.workflow === 'outbound' && !version.config.outboundWorkflow.enabled)
	) {
		throw new Error(`${args.workflow}_workflow_disabled`)
	}
	return {
		agent,
		variant,
		version,
		allocationMode,
		allocationBucket,
		allocationRevision: agent.allocationRevision,
		workflow: args.workflow,
	}
}

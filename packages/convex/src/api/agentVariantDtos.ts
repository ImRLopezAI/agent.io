import type { Doc } from '../_generated/dataModel'

export type VariantDoc = Doc<'agentVariants'>

export const toVariantSummary = (variant: VariantDoc) => ({
	id: variant._id,
	agentId: variant.agentId,
	name: variant.name,
	isMain: variant.isMain,
	allocationOrdinal: variant.allocationOrdinal,
	trafficWeightBps: variant.trafficWeightBps,
	publishedVersionId: variant.publishedVersionId,
	hasPublishedVersion: Boolean(variant.publishedVersionId),
	workflowReadiness: {
		inbound: variant.draft.inboundWorkflow.enabled,
		outbound: variant.draft.outboundWorkflow.enabled,
	},
	configurationHealth: {
		knowledgeBaseAttachments: variant.draft.knowledgeBase.length,
		mcpConnections: variant.draft.mcp.length,
	},
	archived: variant.archived,
	createdAt: variant.createdAt,
	updatedAt: variant.updatedAt,
	creationTime: variant._creationTime,
})

export const toVariantDetail = (variant: VariantDoc) => ({
	...toVariantSummary(variant),
	draft: variant.draft,
})

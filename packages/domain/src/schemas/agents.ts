import { z } from 'zod'

import { tenantTable } from './helper.ts'
import { procedureSnapshot } from './procedures.ts'
import {
	audioConfig,
	dynamicVariables,
	kbAttachment,
	mcpScope,
	modelRef,
	systemToolsConfig,
	vadConfig,
} from './shared.ts'

export const AGENT_TRAFFIC_BPS_TOTAL = 10_000

const workflowBase = {
	enabled: z.boolean().default(true),
	firstSpeaker: z.enum(['agent', 'caller']),
	openingMessage: z.string().max(4_000).optional(),
	maxDurationSecs: z.number().int().positive().optional(),
	idleTimeoutSecs: z.number().int().positive().optional(),
}

export const inboundWorkflow = z.object(workflowBase)
export const outboundWorkflow = z.object({
	...workflowBase,
	firstSpeaker: z.literal('agent').default('agent'),
})

export const agentVariantDraftConfig = z.object({
	instructions: z.string().default(''),
	model: modelRef,
	voice: z.string(),
	vad: vadConfig,
	audio: audioConfig.optional(),
	systemTools: systemToolsConfig.default({}),
	mcp: z.array(mcpScope).default([]),
	knowledgeBase: z.array(kbAttachment).default([]),
	dynamicVariableDefaults: dynamicVariables.optional(),
	inboundWorkflow,
	outboundWorkflow,
})
export type AgentVariantDraftConfig = z.infer<typeof agentVariantDraftConfig>

/** Stable deployment identity. Mutable runtime configuration belongs to Variants. */
export const agents = tenantTable('agents', (id) => ({
	name: z.string().min(1).max(120),
	mainVariantId: id('agentVariants').optional(),
	allocationRevision: z.number().int().nonnegative().default(0),
	archived: z.boolean().default(false),
}))

/** Independent mutable deployment lane such as Main or an experiment. */
export const agentVariants = tenantTable('agentVariants', (id) => ({
	agentId: id('agents'),
	name: z.string().min(1).max(120),
	isMain: z.boolean().default(false),
	allocationOrdinal: z.number().int().positive(),
	trafficWeightBps: z
		.number()
		.int()
		.min(0)
		.max(AGENT_TRAFFIC_BPS_TOTAL)
		.default(0),
	publishedVersionId: id('agentVersions').optional(),
	draft: agentVariantDraftConfig,
	archived: z.boolean().default(false),
}))

/** Fully expanded immutable configuration embedded in an Agent Version. */
export const versionConfig = agentVariantDraftConfig.extend({
	procedures: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('inline'), items: z.array(procedureSnapshot) }),
		z.object({
			kind: z.literal('refs'),
			procedureVersionIds: z.array(z.string()),
		}),
	]),
})
export type VersionConfig = z.infer<typeof versionConfig>

const agentVersionsTable = tenantTable('agentVersions', (id) => ({
	agentId: id('agents'),
	agentVariantId: id('agentVariants'),
	version: z.number().int().positive(),
	publishedBy: z.string(),
	config: versionConfig,
}))

/** Immutable: the narrowed export intentionally has no update surface. */
export const agentVersions = {
	tableName: agentVersionsTable.tableName,
	schema: agentVersionsTable.schema,
	insertSchema: agentVersionsTable.insertSchema,
	insert: agentVersionsTable.insert,
	table: agentVersionsTable.table,
	tools: {
		insert: agentVersionsTable.tools.insert,
		id: agentVersionsTable.tools.id,
	},
}

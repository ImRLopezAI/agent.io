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

/**
 * Agents — the mutable DRAFT (CONTEXT.md: Agent Draft). Calls never run a
 * draft; publishing writes an immutable agentVersions snapshot.
 */

const agentConfigShape = {
	name: z.string().min(1).max(120),
	instructions: z.string().default(''),
	model: modelRef,
	voice: z.string(),
	vad: vadConfig,
	audio: audioConfig.optional(),
	systemTools: systemToolsConfig.default({}),
	/** Per-agent conditional tool exposure (R6): subset per MCP connection. */
	mcp: z.array(mcpScope).default([]),
	knowledgeBase: z.array(kbAttachment).default([]),
	dynamicVariableDefaults: dynamicVariables.optional(),
}

export const agents = tenantTable('agents', (id) => ({
	...agentConfigShape,
	publishedVersionId: id('agentVersions').optional(),
	archived: z.boolean().default(false),
}))

/**
 * The fully expanded config embedded in a version. `procedures` discriminates
 * on `kind`: inline snapshots (normal) or references (reserved overflow
 * variant for the publish size budget — unused initially).
 */
export const versionConfig = z.object({
	...agentConfigShape,
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
	version: z.number().int().positive(),
	publishedBy: z.string(),
	config: versionConfig,
}))

/**
 * Immutable: the narrowed re-export drops the update surface entirely
 * (sanctioned pattern — zodTable's own return contract stays unchanged).
 */
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

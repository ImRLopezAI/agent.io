import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * MCP Connections (ERD §1c, CONTEXT.md): a tenant's link to external tools —
 * Composio (customer-managed toolkits) or a bring-your-own MCP server. There
 * is no generic tools table; external tooling is always MCP.
 */

export const MCP_KINDS = ['composio', 'byo'] as const
export const MCP_TRANSPORTS = ['sse', 'streamable_http'] as const
export const MCP_APPROVAL_POLICIES = [
	'auto_approve_all',
	'require_approval_all',
	'require_approval_per_tool',
] as const
export const TOOL_APPROVAL_POLICIES = [
	'auto_approved',
	'requires_approval',
] as const
export const MCP_CONNECTION_STATUSES = ['active', 'disabled', 'error'] as const

/** Header value: literal string or a pointer into the (future) secret store. */
export const headerValue = z.union([
	z.string(),
	z.strictObject({ secretRef: z.string() }),
])

export const toolApproval = z.object({
	toolName: z.string(),
	/** Pins the approved tool schema; mismatch downgrades to requires_approval. */
	toolHash: z.string(),
	policy: z.enum(TOOL_APPROVAL_POLICIES),
})
export type ToolApproval = z.infer<typeof toolApproval>

export const inputOverride = z.discriminatedUnion('source', [
	z.strictObject({ source: z.literal('constant'), value: z.string() }),
	z.strictObject({ source: z.literal('dynamic_variable'), name: z.string() }),
	z.strictObject({ source: z.literal('llm'), prompt: z.string().optional() }),
	z.strictObject({ source: z.literal('omit') }),
])

export const mcpConnections = tenantTable('mcpConnections', () => ({
	kind: z.enum(MCP_KINDS),
	name: z.string().min(1).max(120),
	description: z.string().optional(),
	// -- byo ------------------------------------------------------------
	url: z.string().optional(),
	transport: z.enum(MCP_TRANSPORTS).default('sse'),
	secretRef: z.string().optional(),
	requestHeaders: z.record(z.string(), headerValue).optional(),
	// -- composio --------------------------------------------------------
	composioAccountId: z.string().optional(),
	toolkitSlugs: z.array(z.string()).optional(),
	// -- governance (both kinds) ------------------------------------------
	approvalPolicy: z.enum(MCP_APPROVAL_POLICIES).default('require_approval_all'),
	toolApprovals: z.array(toolApproval).default([]),
	allowedTools: z.array(z.string()).optional(),
	responseTimeoutSecs: z.number().int().min(5).max(300).default(30),
	toolConfigOverrides: z
		.array(
			z.object({
				toolName: z.string(),
				inputOverrides: z.record(z.string(), inputOverride).optional(),
			}),
		)
		.default([]),
	status: z.enum(MCP_CONNECTION_STATUSES).default('active'),
}))

/** Cross-field rule (mutation boundary): body must match the declared kind. */
export const validateMcpConnection = (c: {
	kind: (typeof MCP_KINDS)[number]
	url?: string
	composioAccountId?: string
}): string | null => {
	if (c.kind === 'byo' && !c.url) return 'byo connections require url'
	if (c.kind === 'composio' && !c.composioAccountId)
		return 'composio connections require composioAccountId'
	return null
}

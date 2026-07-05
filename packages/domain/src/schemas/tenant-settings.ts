import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Tenant Settings (CONTEXT.md): per-tenant PRODUCT configuration — not an
 * identity/org record (identity lives in WorkOS). One row per tenant; absence
 * means platform defaults; agent-level overrides win.
 */
export const TenantSettings = tenantTable('tenantSettings', () => ({
	recordingEnabled: z.boolean().default(false),
	transcriptRetentionDays: z.number().int().positive().optional(),
	defaultVoice: z.string().optional(),
	defaultModel: z
		.object({ provider: z.enum(['openai', 'xai']), model: z.string() })
		.optional(),
	concurrencyLimit: z.number().int().positive().optional(),
	dailyCallLimit: z.number().int().positive().optional(),
}))

/**
 * Composio session resume-cache (plan Key Decisions): operational state, not
 * part of the ERD ownership matrix. configHash covers the agent subset AND
 * connection governance so policy changes roll the cache.
 */
export const ComposioSessions = tenantTable(
	'composioSessions',
	(id) => ({
		connectionId: id('mcpConnections'),
		configHash: z.string(),
		sessionId: z.string(),
	}),
	{ indexes: { by_connection_hash: ['connectionId', 'configHash'] } },
)

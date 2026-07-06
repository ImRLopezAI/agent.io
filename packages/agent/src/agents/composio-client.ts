import { Composio, SessionPreset } from '@composio/core'

import type { TenantComposioClient } from './composio'

/**
 * One platform-level Composio instance — COMPOSIO_API_KEY comes from the
 * environment (ours, never per-tenant). Tenant identity enters at the CLIENT
 * level: `composioClient(tenant)` returns operations bound to that tenant's
 * Composio user (userId = tenant), whose connected accounts hold the actual
 * integration credentials. Composio auto-creates the user on first call.
 */
let instance: Composio | undefined
const sdk = () => {
	// lazy: importing the package must not require COMPOSIO_API_KEY —
	// the env check runs on first actual Composio call
	instance ??= new Composio()
	return instance
}

export const composioClient = (tenant: string): TenantComposioClient => ({
	createSession: async (options) => {
		const session = await sdk().create(tenant, {
			toolkits: options.toolkits,
			tools: options.tools,
			sessionPreset: SessionPreset.DIRECT_TOOLS,
			mcp: true,
		})
		return {
			sessionId: session.sessionId,
			mcp: { url: session.mcp.url, headers: session.mcp.headers ?? {} },
		}
	},
	useSession: async (sessionId) => {
		const session = await sdk().use(sessionId, { mcp: true })
		return {
			sessionId: session.sessionId,
			mcp: { url: session.mcp.url, headers: session.mcp.headers ?? {} },
		}
	},
})

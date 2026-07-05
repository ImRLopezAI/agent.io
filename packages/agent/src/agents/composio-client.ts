import { Composio, SessionPreset } from '@composio/core'

import type { ComposioClient } from './composio'

/**
 * Real @composio/core adapter (docs/.references/composio/sessions-via-mcp.md,
 * configuring-sessions.md). MCP-only usage: no provider package needed —
 * `session.mcp.url/headers` plug straight into the realtime session as a
 * hosted MCP tool. Reads COMPOSIO_API_KEY from the environment when apiKey
 * is not passed.
 */
export const createComposioClient = (apiKey?: string): ComposioClient => {
	const composio = new Composio(apiKey ? { apiKey } : undefined)
	return {
		create: async (userId, options) => {
			const session = await composio.create(userId, {
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
		use: async (sessionId) => {
			const session = await composio.use(sessionId, { mcp: true })
			return {
				sessionId: session.sessionId,
				mcp: { url: session.mcp.url, headers: session.mcp.headers ?? {} },
			}
		},
	}
}

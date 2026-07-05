import type { McpScope } from '@agent.io/domain/schemas'

import type { HostedMcpTool } from '../types'

/** The subset of the Composio SDK the resolver needs (mock-friendly). */
export interface ComposioClient {
	create(
		userId: string,
		options: {
			toolkits?: { enable: string[] } | { disable: string[] } | string[]
			tools?: Record<string, { enable: string[] } | { disable: string[] }>
			sessionPreset?: string
			mcp: true
		},
	): Promise<{
		id: string
		mcp: { url: string; headers: Record<string, string> }
	}>
	use(
		sessionId: string,
		options: { mcp: true },
	): Promise<{
		id: string
		mcp: { url: string; headers: Record<string, string> }
	}>
}

export interface McpConnectionRow {
	_id: string
	kind: 'composio' | 'byo'
	name: string
	status: 'active' | 'disabled' | 'error'
	toolkitSlugs?: string[]
	allowedTools?: string[]
	approvalPolicy:
		| 'auto_approve_all'
		| 'require_approval_all'
		| 'require_approval_per_tool'
	url?: string
	requestHeaders?: Record<string, string | { secretRef: string }>
}

export interface SessionCache {
	get(key: {
		tenant: string
		connectionId: string
		configHash: string
	}): Promise<string | null>
	put(key: {
		tenant: string
		connectionId: string
		configHash: string
		sessionId: string
	}): Promise<void>
}

/** Deterministic hash covering agent subset AND connection governance. */
export const configHash = (
	scope: McpScope,
	connection: McpConnectionRow,
): string => {
	const payload = JSON.stringify({
		toolkits: scope.toolkits ?? null,
		tools: scope.tools ?? null,
		connectionToolkits: [...(connection.toolkitSlugs ?? [])].sort(),
		allowedTools: [...(connection.allowedTools ?? [])].sort(),
		approvalPolicy: connection.approvalPolicy,
	})
	let hash = 5381
	for (let i = 0; i < payload.length; i++) {
		hash = ((hash << 5) + hash + payload.charCodeAt(i)) | 0
	}
	return `h${(hash >>> 0).toString(36)}`
}

/** Intersect the agent's subset with connection governance (governance wins). */
export const effectiveToolkits = (
	scope: McpScope,
	connection: McpConnectionRow,
): { toolkits: string[]; dropped: string[] } => {
	const connectionToolkits = new Set(connection.toolkitSlugs ?? [])
	const requested =
		scope.toolkits && 'enable' in scope.toolkits
			? scope.toolkits.enable
			: [...connectionToolkits].filter(
					(slug) =>
						!(
							scope.toolkits &&
							'disable' in scope.toolkits &&
							scope.toolkits.disable.includes(slug)
						),
				)
	const toolkits = requested.filter((slug) => connectionToolkits.has(slug))
	const dropped = requested.filter((slug) => !connectionToolkits.has(slug))
	return { toolkits, dropped }
}

export const requireApprovalFor = (
	scope: McpScope,
	connection: McpConnectionRow,
): 'never' | 'always' => {
	if (scope.requireApproval) return scope.requireApproval
	return connection.approvalPolicy === 'auto_approve_all' ? 'never' : 'always'
}

/**
 * Resolve one agent mcp[] entry to a HostedMcpTool. Resume-or-create with the
 * persisted session cache; Composio failure degrades per-connection (returns
 * null + warning) — a tool vendor outage never blocks answering a call.
 */
export const resolveComposioEntry = async (opts: {
	tenant: string
	scope: McpScope
	connection: McpConnectionRow
	client: ComposioClient
	cache: SessionCache
	warnings: string[]
}): Promise<HostedMcpTool | null> => {
	const { tenant, scope, connection, client, cache, warnings } = opts
	if (connection.status !== 'active') {
		warnings.push(
			`mcp connection ${connection.name} is ${connection.status} — skipped`,
		)
		return null
	}
	const { toolkits, dropped } = effectiveToolkits(scope, connection)
	if (dropped.length > 0) {
		warnings.push(
			`agent requests toolkits not on connection ${connection.name}: ${dropped.join(', ')} — dropped`,
		)
	}
	if (toolkits.length === 0) {
		warnings.push(
			`no effective toolkits for connection ${connection.name} — skipped`,
		)
		return null
	}
	const hash = configHash(scope, connection)
	try {
		const cachedSessionId = await cache.get({
			tenant,
			connectionId: connection._id,
			configHash: hash,
		})
		const session = cachedSessionId
			? await client.use(cachedSessionId, { mcp: true })
			: await client.create(tenant, {
					toolkits: { enable: toolkits },
					tools: scope.tools,
					sessionPreset: 'DIRECT_TOOLS',
					mcp: true,
				})
		if (!cachedSessionId) {
			await cache.put({
				tenant,
				connectionId: connection._id,
				configHash: hash,
				sessionId: session.id,
			})
		}
		return {
			type: 'mcp',
			server_label: connection.name,
			server_url: session.mcp.url,
			headers: session.mcp.headers, // ephemeral — never persisted or logged
			allowed_tools: connection.allowedTools,
			require_approval: requireApprovalFor(scope, connection),
		}
	} catch (error) {
		warnings.push(
			`composio degraded for connection ${connection.name}: ${String(error)} — call continues without its tools`,
		)
		return null
	}
}

/** BYO MCP passthrough (secretRef headers feature-gated until tenantSecrets). */
export const resolveByoEntry = (opts: {
	scope: McpScope
	connection: McpConnectionRow
	warnings: string[]
}): HostedMcpTool | null => {
	const { scope, connection, warnings } = opts
	if (connection.status !== 'active' || !connection.url) {
		warnings.push(`byo connection ${connection.name} unavailable — skipped`)
		return null
	}
	const headers: Record<string, string> = {}
	for (const [name, value] of Object.entries(connection.requestHeaders ?? {})) {
		if (typeof value === 'string') headers[name] = value
		else
			warnings.push(
				`byo header ${name} uses secretRef — gated until tenantSecrets exists`,
			)
	}
	return {
		type: 'mcp',
		server_label: connection.name,
		server_url: connection.url,
		headers,
		allowed_tools: connection.allowedTools,
		require_approval: requireApprovalFor(scope, connection),
	}
}

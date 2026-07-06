import { hostedMcpTool } from '@openai/agents'
import { RealtimeAgent, tool } from '@openai/agents-realtime'
import { z } from 'zod'

import type {
	CallControl,
	ConvexIngest,
	HostedMcpTool,
	ResolvedAgentVersion,
	SessionConfig,
} from '../types'
import {
	type ComposioClient,
	type McpConnectionRow,
	resolveByoEntry,
	resolveComposioEntry,
	type SessionCache,
} from './composio'
import { compileProcedures } from './procedure-engine'
import { buildSystemTools } from './system-tools'

export interface ResolverDeps {
	ingest: ConvexIngest
	composio: ComposioClient
	sessionCache: SessionCache
	loadConnection(connectionId: string): Promise<McpConnectionRow | null>
	loadKbPromptDocs(
		documentIds: string[],
	): Promise<{ name: string; content: string }[]>
}

/** {{var}} template rendering for instructions (EL dynamic variables). */
export const renderTemplate = (
	template: string,
	variables: Record<string, string>,
): string =>
	template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
		Object.hasOwn(variables, name) ? String(variables[name]) : match,
	)

/**
 * Expansion (plan Unit 12) — our replacement for what ElevenLabs does
 * server-side: version snapshot → full SessionConfig. Dynamic variables
 * render into instructions; prompt-mode KB docs inject verbatim; procedures
 * compile to a trigger index + start/end tools; MCP entries resolve to
 * scoped hosted tools (Composio resume-or-create, per-connection degrade).
 */
export const expand = async (opts: {
	version: ResolvedAgentVersion
	conversationId: string
	control: CallControl
	deps: ResolverDeps
	dynamicVariables?: Record<string, string>
}): Promise<SessionConfig> => {
	const { version, conversationId, control, deps } = opts
	const config = version.config
	const warnings: string[] = []

	const variables = {
		...config.dynamicVariableDefaults,
		...opts.dynamicVariables,
	}
	let instructions = renderTemplate(config.instructions, variables)

	// prompt-mode KB docs are appended verbatim (delimited as data)
	const promptDocIds = config.knowledgeBase
		.filter((k) => k.usageMode === 'prompt')
		.map((k) => k.documentId)
	if (promptDocIds.length > 0) {
		const docs = await deps.loadKbPromptDocs(promptDocIds)
		for (const doc of docs) {
			instructions += `\n\n<knowledge_base_document name="${doc.name}">\n${doc.content}\n</knowledge_base_document>`
		}
	}

	// procedures: trigger index + engine tools
	const procedures =
		config.procedures.kind === 'inline' ? config.procedures.items : []
	const compiled = compileProcedures(procedures)
	instructions += compiled.instructionSuffix

	// tools
	const tools = [
		...buildSystemTools(config.systemTools, control),
		...compiled.tools,
	]
	const autoKbDocs = config.knowledgeBase.filter((k) => k.usageMode === 'auto')
	if (autoKbDocs.length > 0) {
		tools.push(
			tool({
				name: 'search_knowledge_base',
				description:
					'Search the knowledge base for relevant information before answering factual questions about products, policies, or procedures.',
				parameters: z.object({ query: z.string() }),
				execute: async ({ query }) => {
					const results = await deps.ingest.searchKnowledgeBase({
						conversationId,
						query,
					})
					if (results.length === 0) return 'no relevant documents found'
					return results
						.map(
							(r) => `<result score="${r.score.toFixed(2)}">${r.text}</result>`,
						)
						.join('\n')
				},
			}),
		)
	}

	// MCP: per-agent conditional exposure (R6)
	const mcpTools: HostedMcpTool[] = []
	for (const scope of config.mcp) {
		const connection = await deps.loadConnection(scope.connectionId)
		if (!connection) {
			warnings.push(`mcp connection ${scope.connectionId} not found — skipped`)
			continue
		}
		const resolved =
			connection.kind === 'composio'
				? await resolveComposioEntry({
						tenant: version.tenant,
						scope,
						connection,
						client: deps.composio,
						cache: deps.sessionCache,
						warnings,
					})
				: resolveByoEntry({ scope, connection, warnings })
		if (resolved) mcpTools.push(resolved)
	}

	return {
		agentRef: { agentId: version.agentId, versionId: version.versionId },
		model: config.model,
		instructions,
		voice: config.voice,
		vad: config.vad,
		tools,
		mcpTools,
		audio: config.audio ?? {
			input: { format: 'pcm16', transcription: true },
			output: { format: 'pcm16' },
		},
		dynamicVariables: variables,
		warnings,
	}
}

/**
 * The expanded SessionConfig materialized as an SDK RealtimeAgent — the
 * object RealtimeSession actually runs. Function tools AND the Composio/BYO
 * MCP servers ride the same tools array: hostedMcpTool() produces the SDK's
 * HostedMCPTool (a first-class RealtimeTool the model provider connects to —
 * no local connect lifecycle to manage for hosted servers).
 */
export const buildRealtimeAgent = (cfg: SessionConfig): RealtimeAgent =>
	new RealtimeAgent({
		name: cfg.agentRef?.agentId ?? 'agent',
		instructions: cfg.instructions,
		voice: cfg.voice,
		tools: [
			...cfg.tools,
			...cfg.mcpTools.map((mcp) =>
				mcp.require_approval === 'never'
					? hostedMcpTool({
							serverLabel: mcp.server_label,
							serverUrl: mcp.server_url,
							headers: mcp.headers,
							allowedTools: mcp.allowed_tools,
							requireApproval: 'never',
						})
					: hostedMcpTool({
							serverLabel: mcp.server_label,
							serverUrl: mcp.server_url,
							headers: mcp.headers,
							allowedTools: mcp.allowed_tools,
							requireApproval: 'always',
						}),
			),
		],
	})

import { gateway } from '@ai-sdk/gateway'
import {
	streamText,
	tool,
	type UIMessage,
	type UIMessageStreamWriter,
} from 'ai'
import { z } from 'zod'

import type { Models } from '../../constants'
import { forwardSubAgentStream } from './forward-subagent'

/**
 * Custom data parts the orchestrator + sub-agents stream to the chat UI. The
 * client groups everything between `data-agent-boundary` start/end markers into
 * one collapsible agent run and renders `data-agent-step` rows — see
 * `src/components/ai/segment-parts.ts` (the contract lives there).
 */
export type AgentDataParts = {
	'agent-boundary': {
		agent: string
		toolCallId?: string
		phase: 'start' | 'end'
	}
	'agent-step': {
		agent: string
		toolName: string
		toolCallId: string
		state: string
		input?: unknown
		output?: unknown
		cached?: boolean
	}
}

export type AgentUIMessage = UIMessage<unknown, AgentDataParts>

export interface SpecialistConfig {
	key: string
	description: string
	instructions: string
	model?: Models
}

/**
 * Starter specialist registry. Extend here, or later load per-tenant from the
 * Convex `agents.specialists[]` config. Each entry becomes ONE routing-tool on
 * the orchestrator; the orchestrator routes to a specialist instead of doing
 * the work itself (the "one agent with all tools" anti-pattern the rebuild
 * design calls out).
 */
export const SPECIALISTS: SpecialistConfig[] = [
	{
		key: 'researcher',
		description:
			'Researches a topic and returns a concise, well-structured summary.',
		instructions:
			'You are a research specialist. Investigate the task and return a concise, well-structured summary. Make reasonable assumptions instead of asking clarifying questions.',
	},
	{
		key: 'writer',
		description: 'Drafts and edits prose, documents, and messages.',
		instructions:
			'You are a writing specialist. Produce clear, well-structured prose for the task in the requested format.',
	},
]

/**
 * Builds one routing-tool per specialist. The orchestrator sees these as its
 * tools; each runs its specialist via `streamText` and forwards the sub-agent
 * stream into the parent UI stream (agent boundary + narration), returning the
 * accumulated text for the orchestrator to compose its final answer from.
 */
export function buildRoutingTools({
	writer,
	model,
	signal,
}: {
	writer: UIMessageStreamWriter<AgentUIMessage>
	model: string
	signal?: AbortSignal
}) {
	return Object.fromEntries(
		SPECIALISTS.map((spec) => [
			spec.key,
			tool({
				description: spec.description,
				inputSchema: z.object({
					task: z
						.string()
						.describe('A clear, self-contained task for this specialist.'),
				}),
				execute: async ({ task }, { toolCallId }) => {
					const sub = streamText({
						model: gateway(spec.model ?? model),
						instructions: spec.instructions,
						prompt: task,
						abortSignal: signal,
					})
					const { ok, text } = await forwardSubAgentStream({
						agent: spec.key,
						toolCallId,
						writer,
						result: sub,
						signal,
					})
					return ok
						? { success: true, text }
						: { success: false, error: `${spec.key} specialist failed` }
				},
			}),
		]),
	)
}

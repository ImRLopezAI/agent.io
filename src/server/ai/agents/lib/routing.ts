import { gateway } from '@ai-sdk/gateway'
import {
	ToolLoopAgent,
	tool,
	toUIMessageStream,
	type UIMessageChunk,
	type UIMessageStreamWriter,
	type ToolSet,
} from 'ai'
import { z } from 'zod'

import { drainIntoWriter, prefixTextPartIds } from './drain'
import type { Models } from '../../constants'

export interface SpecialistConfig {
	key: string
	description: string
	instructions: string
	model?: Models
	tools?: ToolSet
}

/**
 * Starter specialist registry. Extend here, or later load per-tenant from the
 * Convex `agents.specialists[]` config. Each becomes its own built-in
 * `ToolLoopAgent` sub-agent (give it its own `tools` as needed), wrapped as one
 * routing-tool on the orchestrator.
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

/** Build a specialist as its own built-in `ToolLoopAgent` (ontology pattern). */
export function createSpecialistAgent(spec: SpecialistConfig, model?: Models) {
	return new ToolLoopAgent({
		id: spec.key,
		model: gateway(model ?? spec.model ?? 'anthropic/claude-haiku-4.5'),
		instructions: spec.instructions,
		tools: spec.tools ?? {},
	})
}

export type SpecialistAgent = ReturnType<typeof createSpecialistAgent>

const routingInputSchema = z.object({ prompt: z.string().min(1) })
const routingOutputSchema = z.object({ ok: z.literal(true), text: z.string() })

/**
 * Wrap a sub-agent `ToolLoopAgent` as a routing-tool the orchestrator registers.
 * Mirrors ontology's `dbDoctorRoutingTool` / `rendererRoutingTool`: writes paired
 * `data-agent-boundary` markers around the sub-agent run, namespaces its part
 * ids, drains the sub-agent stream into the outer writer (AWAITING EOS so the
 * closing marker stays ordered), and returns the sub-agent's prose so the
 * orchestrator can compose follow-up delegations. The chat UI groups everything
 * between the boundary markers into one collapsible agent run.
 */
export function subAgentRoutingTool(opts: {
	agentName: string
	description: string
	agent: SpecialistAgent
	writer: UIMessageStreamWriter
	abortSignal?: AbortSignal
}) {
	return tool({
		description: opts.description,
		inputSchema: routingInputSchema,
		outputSchema: routingOutputSchema,
		execute: async ({ prompt }, { toolCallId, abortSignal }) => {
			const signal = abortSignal ?? opts.abortSignal

			opts.writer.write({
				type: 'data-agent-boundary',
				id: `${toolCallId}-start`,
				data: { agent: opts.agentName, toolCallId, phase: 'start' },
			} as unknown as Parameters<typeof opts.writer.write>[0])

			let text = ''
			try {
				const result = await opts.agent.stream({ prompt, abortSignal: signal })
				const subStream = toUIMessageStream({
					stream: result.stream,
					sendStart: false,
					sendFinish: false,
				}) as unknown as ReadableStream<UIMessageChunk>
				const namespaced = prefixTextPartIds(
					subStream,
					`${opts.agentName}-${toolCallId}`,
				)
				await drainIntoWriter(namespaced, opts.writer, signal, {
					onText: (delta) => {
						text += delta
					},
				})
				return { ok: true as const, text }
			} finally {
				opts.writer.write({
					type: 'data-agent-boundary',
					id: `${toolCallId}-end`,
					data: { agent: opts.agentName, toolCallId, phase: 'end' },
				} as unknown as Parameters<typeof opts.writer.write>[0])
			}
		},
	})
}

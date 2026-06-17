import { gateway } from '@ai-sdk/gateway'
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	isStepCount,
	streamText,
	type ToolSet,
	toUIMessageStream,
} from 'ai'

import {
	type AgentUIMessage,
	buildRoutingTools,
	SPECIALISTS,
} from './agents/lib/routing'
import type { Models } from './constants'

const ORCHESTRATOR_INSTRUCTIONS = `You are an orchestrator. Choose the right specialist for the user's request and call its tool with a clear, self-contained task — do not do the specialists' work yourself. Specialists: ${SPECIALISTS.map(
	(s) => `${s.key} — ${s.description}`,
).join(
	'; ',
)}. After specialists return, synthesize a single final answer for the user.`

/**
 * Chat request handler — a v7 orchestrator that routes to specialist sub-agents.
 * The orchestrator `streamText` loop calls one routing-tool per specialist; each
 * runs its specialist and forwards the sub-agent stream into the parent UI
 * stream as `data-agent-*` parts (the chat UI renders these as collapsible agent
 * runs). The request `AbortSignal` threads straight through (v7).
 */
export async function agentRequestHandler(req: Request) {
	const body = (await req.json()) as {
		messages?: AgentUIMessage[]
		model?: string
	}
	const messages = body.messages ?? []

	const model =
		(typeof body.model === 'string' ? body.model : undefined) ??
		('anthropic/claude-haiku-4.5' satisfies Models)

	const stream = createUIMessageStream<AgentUIMessage>({
		originalMessages: messages,
		execute: async ({ writer }) => {
			const orchestrator = streamText({
				model: gateway(model),
				instructions: ORCHESTRATOR_INSTRUCTIONS,
				messages: await convertToModelMessages(messages),
				stopWhen: isStepCount(10),
				tools: buildRoutingTools({ writer, model, signal: req.signal }),
				abortSignal: req.signal,
				reasoning: 'medium',
			})
			writer.merge(
				toUIMessageStream<ToolSet, AgentUIMessage>({
					stream: orchestrator.stream,
					sendStart: false,
				}),
			)
		},
	})

	return createUIMessageStreamResponse({
		stream,
		headers: {
			'x-agent.io': 'orchestrator',
			'x-model': model,
		},
	})
}

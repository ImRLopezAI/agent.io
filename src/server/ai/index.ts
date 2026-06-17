import { gateway } from '@ai-sdk/gateway'
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	ToolLoopAgent,
	toUIMessageStream,
	type UIMessage,
	type UIMessageChunk,
} from 'ai'

import { drainIntoWriter } from './agents/lib/drain'
import {
	createSpecialistAgent,
	SPECIALISTS,
	subAgentRoutingTool,
} from './agents/lib/routing'
import type { Models } from './constants'

const ORCHESTRATOR_INSTRUCTIONS = `You are an orchestrator. Choose the right specialist for the user's request and call its tool with a clear, self-contained prompt — do not do the specialists' work yourself. Specialists: ${SPECIALISTS.map(
	(s) => `${s.key} — ${s.description}`,
).join(
	'; ',
)}. After specialists return, synthesize a single final answer for the user.`

/**
 * Chat request handler — a built-in-`ToolLoopAgent` orchestrator that routes to
 * specialist sub-agents (ontology pattern). The orchestrator is a `ToolLoopAgent`
 * whose tools are one routing-tool per specialist; each routing-tool runs its
 * own `ToolLoopAgent` sub-agent and drains it into the shared UI stream as
 * `data-agent-*` parts (the chat UI renders these as collapsible agent runs).
 */
export async function agentRequestHandler(req: Request) {
	const body: { messages?: UIMessage[]; model?: string } = await req.json()
	const messages = body.messages ?? []

	const model =
		(typeof body.model === 'string' ? body.model : undefined) ??
		('anthropic/claude-haiku-4.5' satisfies Models)

	const stream = createUIMessageStream({
		originalMessages: messages,
		execute: async ({ writer }) => {
			const tools = Object.fromEntries(
				SPECIALISTS.map((spec) => [
					spec.key,
					subAgentRoutingTool({
						agentName: spec.key,
						description: spec.description,
						agent: createSpecialistAgent(spec, model),
						writer,
						abortSignal: req.signal,
					}),
				]),
			)

			const orchestrator = new ToolLoopAgent({
				id: 'agentio-orchestrator',
				model: gateway(model),
				instructions: ORCHESTRATOR_INSTRUCTIONS,
				tools,
			})

			const result = await orchestrator.stream({
				messages: await convertToModelMessages(messages),
				abortSignal: req.signal,
			})

			await drainIntoWriter(
				toUIMessageStream({
					stream: result.stream,
					sendStart: false,
					sendFinish: false,
				}) as unknown as ReadableStream<UIMessageChunk>,
				writer,
				req.signal,
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

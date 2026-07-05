import { gateway } from '@ai-sdk/gateway'
import { createAgentUIStreamResponse, ToolLoopAgent, type UIMessage } from 'ai'

import type { Models } from './constants'

export async function agentRequestHandler(req: Request) {
	const { messages = [], model = 'anthropic/claude-haiku-4.5' } =
		(await req.json()) as { messages?: UIMessage[]; model?: Models }

	return createAgentUIStreamResponse({
		agent: new ToolLoopAgent({
			id: 'agent.io-orchestrator',
			model: gateway(model),
			reasoning: 'medium',
			instructions:
				'You are the orchestrator. Route research and information-lookup tasks to the researcher agent, and writing/drafting/editing tasks to the writer agent. Do not do their work yourself; after they return, synthesize a single final answer for the user.',
		}),
		uiMessages: messages,
		sendStart: true,
		sendFinish: true,
		sendReasoning: true,
		headers: {
			'x-agent.io': 'orchestrator',
			'x-model': model,
		},
		abortSignal: req.signal,
	})
}

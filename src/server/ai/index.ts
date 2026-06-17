import { gateway } from '@ai-sdk/gateway'
import { createAgentUIStreamResponse, ToolLoopAgent, type UIMessage } from 'ai'

import { routing } from './agents/routing'
import type { Models } from './constants'

/**
 * Sub-agents — each a built-in `ToolLoopAgent` with its own tools. Add real
 * tools per agent (or split into `agents/<name>/agent.ts` like sunday) as they
 * grow; load per-tenant from Convex `agents.specialists[]` later.
 */
const researcher = (model: string) =>
	new ToolLoopAgent({
		id: 'researcher',
		model: gateway(model),
		instructions:
			'You are a research specialist. Investigate the task and return a concise, well-structured summary.',
		tools: {},
	})

const writer = (model: string) =>
	new ToolLoopAgent({
		id: 'writer',
		model: gateway(model),
		instructions:
			'You are a writing specialist. Produce clear, well-structured prose for the task.',
		tools: {},
	})

/**
 * Chat request handler — a built-in-`ToolLoopAgent` orchestrator that routes to
 * specialist sub-agents (sunday pattern). Each `routing(...)` tool runs its
 * sub-agent and yields its UIMessages into the response;
 * `createAgentUIStreamResponse` drives the loop and streams it back.
 */
export async function agentRequestHandler(req: Request) {
	const {
		messages = [],
		model = 'anthropic/claude-haiku-4.5',
	}: { messages?: UIMessage[]; model?: Models } = await req.json()

	return createAgentUIStreamResponse({
		agent: new ToolLoopAgent({
			id: 'agent.io-orchestrator',
			model: gateway(model),
			reasoning: 'medium',
			instructions:
				'You are the orchestrator. Route research and information-lookup tasks to the researcher agent, and writing/drafting/editing tasks to the writer agent. Do not do their work yourself; after they return, synthesize a single final answer for the user.',
			tools: {
				researcher: routing({
					description:
						'Route research and information-lookup tasks to the researcher agent.',
					agent: researcher(model),
				}),
				writer: routing({
					description:
						'Route writing, drafting, and editing tasks to the writer agent.',
					agent: writer(model),
				}),
			},
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

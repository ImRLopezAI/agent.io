import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai'

import type { Models } from './constants'
import { gatewayText } from './gateway'

/**
 * Chat request handler — drives the Vercel AI Gateway through `@tanstack/ai`'s
 * `chat()` and streams AG-UI Server-Sent Events back to the client.
 *
 * Replaces the previous `ToolLoopAgent` + `createUIMessageStream` path. The
 * agent loop, tool execution, and message handling are owned by `chat()`; the
 * gateway adapter (`gatewayText`) is the transport.
 */
export async function agentRequestHandler(req: Request) {
	const {
		messages,
		model = 'anthropic/claude-haiku-4.5',
	}: {
		messages: Array<UIMessage>
		model?: Models
	} = await req.json()

	// Bridge the request's AbortSignal to an AbortController for chat() + the
	// SSE response (both accept an AbortController, not a raw signal).
	const abortController = new AbortController()
	if (req.signal.aborted) {
		abortController.abort()
	} else {
		req.signal.addEventListener('abort', () => abortController.abort(), {
			once: true,
		})
	}

	const stream = chat({
		adapter: gatewayText(model),
		systemPrompts: ['You are a helpful assistant.'],
		messages,
		agentLoopStrategy: maxIterations(10),
		abortController,
	})

	return toServerSentEventsResponse(stream, {
		headers: {
			'x-sunday-agent': 'orchestrator',
			'x-model': model,
		},
		abortController,
	})
}

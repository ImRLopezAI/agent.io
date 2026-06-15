import {
	chat,
	chatParamsFromRequestBody,
	maxIterations,
	toServerSentEventsResponse,
} from '@tanstack/ai'

import type { Models } from './constants'
import { gatewayText } from './gateway'

/**
 * Chat request handler — drives the Vercel AI Gateway through `@tanstack/ai`'s
 * `chat()` and streams AG-UI Server-Sent Events back to the client.
 *
 * Parses the AG-UI `RunAgentInput` body from `@tanstack/ai-client` so the
 * full message thread (with `parts`) is preserved on every turn.
 */
export async function agentRequestHandler(req: Request) {
	const rawBody: unknown = await req.json()
	const { messages, forwardedProps } = await chatParamsFromRequestBody(rawBody)

	const model =
		(typeof forwardedProps.model === 'string'
			? forwardedProps.model
			: undefined) ?? ('anthropic/claude-haiku-4.5' satisfies Models)

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
		adapter: gatewayText(model as Models),
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

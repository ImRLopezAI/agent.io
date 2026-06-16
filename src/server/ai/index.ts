import { gateway } from '@ai-sdk/gateway'
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isStepCount,
	streamText,
	toUIMessageStream,
	type UIMessage,
} from 'ai'

import type { Models } from './constants'

/**
 * Chat request handler — drives the Vercel AI Gateway through the Vercel AI SDK
 * (v7) `streamText` loop and streams a UI message stream back to the client.
 *
 * The client (`@ai-sdk/react` `useChat` + `DefaultChatTransport`) POSTs
 * `{ messages: UIMessage[], model? }`; we convert the UI thread to model
 * messages, run the model through the gateway, and return a UI-message-stream
 * `Response`. The request's `AbortSignal` is threaded straight into
 * `streamText` (v7 takes a signal directly — no AbortController bridge needed).
 */
export async function agentRequestHandler(req: Request) {
	const body = (await req.json()) as { messages?: UIMessage[]; model?: string }
	const messages = body.messages ?? []

	const model =
		(typeof body.model === 'string' ? body.model : undefined) ??
		('anthropic/claude-haiku-4.5' satisfies Models)

	const result = streamText({
		model: gateway(model),
		instructions: 'You are a helpful assistant.',
		messages: await convertToModelMessages(messages),
		stopWhen: isStepCount(10),
		abortSignal: req.signal,
	})

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({
			stream: result.stream,
			originalMessages: messages,
		}),
		headers: {
			'x-sunday-agent': 'orchestrator',
			'x-model': model,
		},
	})
}

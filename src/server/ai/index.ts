import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	ToolLoopAgent,
	type UIMessage,
} from 'ai'

import type { Models } from './constants'

export async function agentRequestHandler(req: Request) {
	const {
		messages,
		model = 'google/gemini-3-flash',
	}: {
		messages: UIMessage[]
		model?: Models
	} = await req.json()

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			const orchestrator = new ToolLoopAgent({
				id: 'orchestrator',
				instructions: 'You are a helpful assistant.',
				model: 'anthropic/claude-haiku-4.5',
				tools: {},
			})

			const result = await orchestrator.stream({
				messages: await convertToModelMessages(messages, {
					ignoreIncompleteToolCalls: true,
				}),
				abortSignal: req.signal,
			})

			writer.merge(
				result.toUIMessageStream({
					sendStart: false,
					sendFinish: false,
				}) as unknown as Parameters<typeof writer.merge>[0],
			)
		},
		onError: (error) => {
			console.error('[ontology] agent stream error', error)
			return error instanceof Error ? error.message : 'Unknown stream error'
		},
	})

	return createUIMessageStreamResponse({
		stream,
		headers: {
			'x-sunday-agent': 'orchestrator',
			'x-model': model,
		},
	})
}

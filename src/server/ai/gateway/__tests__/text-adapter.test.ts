import { chat, EventType } from '@tanstack/ai'
import { describe, expect, it, vi } from 'vitest'

// Mock the shared provider so no network is hit. The fake LanguageModelV3
// streams "Hello" then finishes, and doGenerate returns a JSON object.
vi.mock('../provider', () => {
	const usage = {
		inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
		outputTokens: { total: 1, text: 1, reasoning: 0 },
	}
	const streamOf = (parts: ReadonlyArray<unknown>) =>
		new ReadableStream({
			start(c) {
				for (const p of parts) c.enqueue(p)
				c.close()
			},
		})
	return {
		createGatewayProvider: () => ({
			languageModel: () => ({
				async doStream() {
					return {
						stream: streamOf([
							{ type: 'stream-start', warnings: [] },
							{ type: 'text-start', id: 'm1' },
							{ type: 'text-delta', id: 'm1', delta: 'Hello' },
							{ type: 'text-end', id: 'm1' },
							{
								type: 'finish',
								usage,
								finishReason: { unified: 'stop', raw: 'stop' },
							},
						]),
					}
				},
				async doGenerate() {
					return {
						content: [{ type: 'text', text: '{"answer":"42"}' }],
						usage,
						finishReason: { unified: 'stop', raw: 'stop' },
						warnings: [],
					}
				},
			}),
		}),
	}
})

const { gatewayText } = await import('../text/adapter')

describe('GatewayTextAdapter', () => {
	it('chatStream wires options -> doStream -> AG-UI events', async () => {
		const adapter = gatewayText('anthropic/claude-haiku-4.5')
		const events: Array<Record<string, unknown>> = []
		for await (const e of adapter.chatStream({
			model: 'anthropic/claude-haiku-4.5',
			messages: [{ role: 'user', content: 'hi' }],
		} as never)) {
			events.push(e as Record<string, unknown>)
		}
		const text = events
			.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
			.map((e) => e.delta)
			.join('')
		expect(text).toBe('Hello')
		expect(events.at(-1)!.type).toBe(EventType.RUN_FINISHED)
	})

	it('chat() accepts the adapter and streams text end-to-end', async () => {
		const out: Array<Record<string, unknown>> = []
		for await (const e of chat({
			adapter: gatewayText('anthropic/claude-haiku-4.5'),
			messages: [{ role: 'user', content: 'hi' }],
		})) {
			out.push(e as Record<string, unknown>)
		}
		const text = out
			.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
			.map((e) => e.delta)
			.join('')
		expect(text).toBe('Hello')
	})

	it('structuredOutput returns parsed object', async () => {
		const adapter = gatewayText('anthropic/claude-haiku-4.5')
		const res = await adapter.structuredOutput({
			chatOptions: {
				model: 'anthropic/claude-haiku-4.5',
				messages: [{ role: 'user', content: 'give me 42' }],
			},
			outputSchema: {
				type: 'object',
				properties: { answer: { type: 'string' } },
				required: ['answer'],
			},
		} as never)
		expect(res.data).toEqual({ answer: '42' })
		expect(res.rawText).toBe('{"answer":"42"}')
	})
})

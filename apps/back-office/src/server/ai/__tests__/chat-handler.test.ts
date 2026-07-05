import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { describe, expect, it, vi } from 'vite-plus/test'

// Mock the gateway so the v7 `streamText` loop runs against a fake V4 model
// (no network). `gateway(model)` returns the mock; the real `ai` helpers
// (streamText -> toUIMessageStream -> createUIMessageStreamResponse) run for real.
vi.mock('@ai-sdk/gateway', async () => {
	const { MockLanguageModelV4, simulateReadableStream } = await import(
		'ai/test'
	)
	const chunks: LanguageModelV4StreamPart[] = [
		{ type: 'stream-start', warnings: [] },
		{ type: 'text-start', id: '0' },
		{ type: 'text-delta', id: '0', delta: 'Hello' },
		{ type: 'text-end', id: '0' },
		{
			type: 'finish',
			finishReason: { unified: 'stop', raw: 'stop' },
			usage: {
				inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
				outputTokens: { total: 1, text: 1, reasoning: 0 },
			},
		},
	]
	return {
		gateway: () =>
			new MockLanguageModelV4({
				doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
			}),
	}
})

const { agentRequestHandler } = await import('../index')

function chatRequest(body: Record<string, unknown>): Request {
	return new Request('http://localhost/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

const userMessage = {
	id: '1',
	role: 'user',
	parts: [{ type: 'text', text: 'hi' }],
}

describe('agentRequestHandler', () => {
	it('streams a UI message stream response with text + headers', async () => {
		const res = await agentRequestHandler(
			chatRequest({
				messages: [userMessage],
				model: 'anthropic/claude-haiku-4.5',
			}),
		)
		expect(res.headers.get('content-type')).toContain('text/event-stream')
		expect(res.headers.get('x-model')).toBe('anthropic/claude-haiku-4.5')
		expect(res.headers.get('x-agent.io')).toBe('orchestrator')
		const body = await res.text()
		expect(body).toContain('Hello')
	})

	it('defaults the model when omitted', async () => {
		const res = await agentRequestHandler(
			chatRequest({ messages: [userMessage] }),
		)
		expect(res.headers.get('x-model')).toBe('anthropic/claude-haiku-4.5')
		const body = await res.text()
		expect(body).toContain('Hello')
	})
})

import { describe, expect, it, vi } from 'vitest'

// Mock the gateway provider so the handler runs chat() end-to-end with a fake
// LanguageModelV3 stream (no network).
vi.mock('../gateway/provider', () => {
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
							{ type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
						]),
					}
				},
			}),
		}),
	}
})

const { agentRequestHandler } = await import('../index')

function aguiChatRequest(body: Record<string, unknown>): Request {
	return new Request('http://localhost/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

function baseRunInput(
	messages: Array<Record<string, unknown>>,
	forwardedProps: Record<string, unknown> = {},
) {
	return {
		threadId: 'thread-1',
		runId: 'run-1',
		state: {},
		messages,
		tools: [],
		context: [],
		forwardedProps,
	}
}

describe('agentRequestHandler', () => {
	it('streams an AG-UI SSE response with text + headers', async () => {
		const res = await agentRequestHandler(
			aguiChatRequest(
				baseRunInput(
					[
						{
							id: '1',
							role: 'user',
							content: 'hi',
							parts: [{ type: 'text', content: 'hi' }],
						},
					],
					{ model: 'anthropic/claude-haiku-4.5' },
				),
			),
		)
		expect(res.headers.get('content-type')).toContain('text/event-stream')
		expect(res.headers.get('x-model')).toBe('anthropic/claude-haiku-4.5')
		expect(res.headers.get('x-sunday-agent')).toBe('orchestrator')
		const body = await res.text()
		expect(body).toContain('Hello')
		expect(body).toContain('RUN_FINISHED')
	})

	it('defaults the model when omitted from forwardedProps', async () => {
		const res = await agentRequestHandler(
			aguiChatRequest(
				baseRunInput([
					{
						id: '1',
						role: 'user',
						content: 'hi',
						parts: [{ type: 'text', content: 'hi' }],
					},
				]),
			),
		)
		expect(res.headers.get('x-model')).toBe('anthropic/claude-haiku-4.5')
		const body = await res.text()
		expect(body).toContain('Hello')
	})
})

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { EventType } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { type StreamToAguiContext, streamToAgui } from '../text/stream-to-agui'

function streamOf(
	parts: ReadonlyArray<Partial<LanguageModelV3StreamPart>>,
): ReadableStream<LanguageModelV3StreamPart> {
	return new ReadableStream({
		start(controller) {
			for (const p of parts) controller.enqueue(p as LanguageModelV3StreamPart)
			controller.close()
		},
	})
}

async function collect(
	gen: AsyncIterable<{ type: EventType }>,
): Promise<Array<Record<string, unknown>>> {
	const out: Array<Record<string, unknown>> = []
	for await (const e of gen) out.push(e as Record<string, unknown>)
	return out
}

const ctx: StreamToAguiContext = {
	runId: 'run-1',
	threadId: 'thread-1',
	model: 'anthropic/claude-haiku-4.5',
	generateId: () => 'gen-id',
}

const usage = {
	inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 5, text: 5, reasoning: 0 },
}

describe('streamToAgui', () => {
	it('happy path: text stream maps to ordered AG-UI lifecycle', async () => {
		const events = await collect(
			streamToAgui(
				streamOf([
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 'm1' },
					{ type: 'text-delta', id: 'm1', delta: 'Hel' },
					{ type: 'text-delta', id: 'm1', delta: 'lo' },
					{ type: 'text-end', id: 'm1' },
					{
						type: 'finish',
						usage,
						finishReason: { unified: 'stop', raw: 'stop' },
					},
				]),
				ctx,
			),
		)
		expect(events.map((e) => e.type)).toEqual([
			EventType.RUN_STARTED,
			EventType.TEXT_MESSAGE_START,
			EventType.TEXT_MESSAGE_CONTENT,
			EventType.TEXT_MESSAGE_CONTENT,
			EventType.TEXT_MESSAGE_END,
			EventType.RUN_FINISHED,
		])
		expect(events[0]).toMatchObject({ runId: 'run-1', threadId: 'thread-1' })
		const finish = events.at(-1)!
		expect(finish.finishReason).toBe('stop')
		expect((finish.usage as { totalTokens: number }).totalTokens).toBe(15)
	})

	it('reasoning parts map to REASONING_MESSAGE_* events', async () => {
		const events = await collect(
			streamToAgui(
				streamOf([
					{ type: 'reasoning-start', id: 'r1' },
					{ type: 'reasoning-delta', id: 'r1', delta: 'think' },
					{ type: 'reasoning-end', id: 'r1' },
					{
						type: 'finish',
						usage,
						finishReason: { unified: 'stop', raw: 'stop' },
					},
				]),
				ctx,
			),
		)
		expect(events.map((e) => e.type)).toEqual([
			EventType.RUN_STARTED,
			EventType.REASONING_MESSAGE_START,
			EventType.REASONING_MESSAGE_CONTENT,
			EventType.REASONING_MESSAGE_END,
			EventType.RUN_FINISHED,
		])
	})

	it('streamed tool input emits one START/ARGS/END, no dup on tool-call', async () => {
		const events = await collect(
			streamToAgui(
				streamOf([
					{ type: 'tool-input-start', id: 'tc1', toolName: 'search' },
					{ type: 'tool-input-delta', id: 'tc1', delta: '{"q":' },
					{ type: 'tool-input-delta', id: 'tc1', delta: '"hi"}' },
					{ type: 'tool-input-end', id: 'tc1' },
					{
						type: 'tool-call',
						toolCallId: 'tc1',
						toolName: 'search',
						input: '{"q":"hi"}',
					},
					{
						type: 'finish',
						usage,
						finishReason: { unified: 'tool-calls', raw: 'tool_use' },
					},
				]),
				ctx,
			),
		)
		const types = events.map((e) => e.type)
		expect(types.filter((t) => t === EventType.TOOL_CALL_START)).toHaveLength(1)
		expect(types.filter((t) => t === EventType.TOOL_CALL_END)).toHaveLength(1)
		const start = events.find((e) => e.type === EventType.TOOL_CALL_START)!
		expect(start).toMatchObject({ toolCallId: 'tc1', toolCallName: 'search' })
		expect(events.at(-1)!.finishReason).toBe('tool_calls')
	})

	it('non-streamed tool-call synthesizes START/ARGS/END', async () => {
		const events = await collect(
			streamToAgui(
				streamOf([
					{
						type: 'tool-call',
						toolCallId: 'tc9',
						toolName: 'calc',
						input: '{"a":1}',
					},
					{
						type: 'finish',
						usage,
						finishReason: { unified: 'tool-calls', raw: 'x' },
					},
				]),
				ctx,
			),
		)
		expect(events.map((e) => e.type)).toEqual([
			EventType.RUN_STARTED,
			EventType.TOOL_CALL_START,
			EventType.TOOL_CALL_ARGS,
			EventType.TOOL_CALL_END,
			EventType.RUN_FINISHED,
		])
		const args = events.find((e) => e.type === EventType.TOOL_CALL_ARGS)!
		expect(args.delta).toBe('{"a":1}')
	})

	it('error part maps to RUN_ERROR and suppresses RUN_FINISHED', async () => {
		const events = await collect(
			streamToAgui(
				streamOf([
					{ type: 'text-start', id: 'm1' },
					{ type: 'error', error: new Error('boom') },
				]),
				ctx,
			),
		)
		const types = events.map((e) => e.type)
		expect(types).toContain(EventType.RUN_ERROR)
		expect(types).not.toContain(EventType.RUN_FINISHED)
		expect(events.find((e) => e.type === EventType.RUN_ERROR)?.message).toBe(
			'boom',
		)
	})

	it('empty stream still emits RUN_STARTED + RUN_FINISHED', async () => {
		const events = await collect(streamToAgui(streamOf([]), ctx))
		expect(events.map((e) => e.type)).toEqual([
			EventType.RUN_STARTED,
			EventType.RUN_FINISHED,
		])
	})

	it('aborted signal terminates without dangling open message', async () => {
		const controller = new AbortController()
		controller.abort()
		const events = await collect(
			streamToAgui(streamOf([{ type: 'text-start', id: 'm1' }]), {
				...ctx,
				abortSignal: controller.signal,
			}),
		)
		// Aborted before reading any part -> loop breaks, run closed cleanly.
		expect(events.map((e) => e.type)).toEqual([
			EventType.RUN_STARTED,
			EventType.RUN_FINISHED,
		])
	})
})

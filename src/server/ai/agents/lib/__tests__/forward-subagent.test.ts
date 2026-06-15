import type { StreamChunk } from '@tanstack/ai'
import { EventType } from '@tanstack/ai'
import { describe, expect, it } from 'vite-plus/test'

import { forwardSubAgentStream } from '../forward-subagent'

async function* streamOf(
	chunks: ReadonlyArray<StreamChunk>,
	onIterate?: () => void,
): AsyncIterable<StreamChunk> {
	for (const chunk of chunks) {
		onIterate?.()
		yield chunk
	}
}

function createHarness() {
	const emitted: Array<[string, any]> = []
	const emit = (name: string, value: Record<string, any>) => {
		emitted.push([name, value])
	}

	return { emitted, emit }
}

describe('forwardSubAgentStream', () => {
	it('forwards text deltas between start and end boundaries', async () => {
		const { emitted, emit } = createHarness()

		const result = await forwardSubAgentStream({
			agent: 'db-doctor',
			toolCallId: 'parent-tool-call',
			stream: streamOf([
				{
					type: EventType.TEXT_MESSAGE_CONTENT,
					messageId: 'message-1',
					delta: 'Hel',
				},
				{
					type: EventType.TEXT_MESSAGE_CONTENT,
					messageId: 'message-1',
					delta: 'lo',
				},
			]),
			emit,
		})

		expect(result).toEqual({ ok: true, text: 'Hello' })
		expect(emitted).toEqual([
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'start' },
			],
			['agent.text', { toolCallId: 'parent-tool-call', delta: 'Hel' }],
			['agent.text', { toolCallId: 'parent-tool-call', delta: 'lo' }],
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'end' },
			],
		])
	})

	it('forwards tool-call lifecycle chunks as agent.step events', async () => {
		const { emitted, emit } = createHarness()

		const result = await forwardSubAgentStream({
			agent: 'db-doctor',
			toolCallId: 'parent-tool-call',
			stream: streamOf([
				{
					type: EventType.TOOL_CALL_START,
					toolCallId: 'sub-tool-call',
					toolCallName: 'queryDatabase',
					toolName: 'queryDatabase',
				},
				{
					type: EventType.TOOL_CALL_ARGS,
					toolCallId: 'sub-tool-call',
					delta: '{"sql":',
				},
				{
					type: EventType.TOOL_CALL_END,
					toolCallId: 'sub-tool-call',
				},
				{
					type: EventType.TOOL_CALL_RESULT,
					messageId: 'tool-message-1',
					toolCallId: 'sub-tool-call',
					content: '{"rows":[]}',
					role: 'tool',
				},
			]),
			emit,
		})

		expect(result).toEqual({ ok: true, text: '' })
		expect(emitted.map(([name]) => name)).toEqual([
			'agent.boundary',
			'agent.step',
			'agent.step',
			'agent.step',
			'agent.step',
			'agent.boundary',
		])
		expect(emitted[1]?.[1]).toMatchObject({
			toolCallId: 'parent-tool-call',
			subToolCallId: 'sub-tool-call',
			toolName: 'queryDatabase',
			state: EventType.TOOL_CALL_START,
		})
		expect(emitted[2]?.[1]).toMatchObject({
			toolCallId: 'parent-tool-call',
			subToolCallId: 'sub-tool-call',
			delta: '{"sql":',
			state: EventType.TOOL_CALL_ARGS,
		})
		expect(emitted.at(-1)).toEqual([
			'agent.boundary',
			{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'end' },
		])
	})

	it('emits only start and end boundaries for an empty stream', async () => {
		const { emitted, emit } = createHarness()

		const result = await forwardSubAgentStream({
			agent: 'db-doctor',
			toolCallId: 'parent-tool-call',
			stream: streamOf([]),
			emit,
		})

		expect(result).toEqual({ ok: true, text: '' })
		expect(emitted).toEqual([
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'start' },
			],
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'end' },
			],
		])
	})

	it('closes the boundary and returns ok false on RUN_ERROR', async () => {
		const { emitted, emit } = createHarness()

		const result = await forwardSubAgentStream({
			agent: 'db-doctor',
			toolCallId: 'parent-tool-call',
			stream: streamOf([
				{
					type: EventType.TEXT_MESSAGE_CONTENT,
					messageId: 'message-1',
					delta: 'partial',
				},
				{
					type: EventType.RUN_ERROR,
					message: 'sub-agent failed',
				},
			]),
			emit,
		})

		expect(result).toEqual({ ok: false, text: 'partial' })
		expect(emitted.filter(([name]) => name === 'agent.boundary')).toEqual([
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'start' },
			],
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'end' },
			],
		])
	})

	it('treats a pre-aborted signal as clean cancellation without iterating', async () => {
		const { emitted, emit } = createHarness()
		const abortController = new AbortController()
		let iterations = 0
		abortController.abort()

		const result = await forwardSubAgentStream({
			agent: 'db-doctor',
			toolCallId: 'parent-tool-call',
			stream: streamOf(
				[
					{
						type: EventType.TEXT_MESSAGE_CONTENT,
						messageId: 'message-1',
						delta: 'should not emit',
					},
				],
				() => {
					iterations += 1
				},
			),
			emit,
			signal: abortController.signal,
		})

		expect(result).toEqual({ ok: true, text: '' })
		expect(iterations).toBe(0)
		expect(emitted).toEqual([
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'start' },
			],
			[
				'agent.boundary',
				{ agent: 'db-doctor', toolCallId: 'parent-tool-call', phase: 'end' },
			],
		])
	})
})

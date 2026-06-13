import type { StreamChunk } from '@tanstack/ai'
import { EventType } from '@tanstack/ai'

type ForwardSubAgentStreamOptions = {
	agent: string
	toolCallId: string
	stream: AsyncIterable<StreamChunk>
	emit: (name: string, value: Record<string, any>) => void
	signal?: AbortSignal
}

type ForwardSubAgentStreamResult = {
	ok: boolean
	text: string
}

const TOOL_STEP_EVENTS = new Set<EventType>([
	EventType.TOOL_CALL_START,
	EventType.TOOL_CALL_ARGS,
	EventType.TOOL_CALL_END,
	EventType.TOOL_CALL_RESULT,
])

export async function forwardSubAgentStream({
	agent,
	toolCallId,
	stream,
	emit,
	signal,
}: ForwardSubAgentStreamOptions): Promise<ForwardSubAgentStreamResult> {
	let text = ''
	let emittedEndBoundary = false

	const emitEndBoundary = () => {
		if (emittedEndBoundary) return
		emittedEndBoundary = true
		emit('agent.boundary', { agent, toolCallId, phase: 'end' })
	}

	emit('agent.boundary', { agent, toolCallId, phase: 'start' })

	try {
		if (signal?.aborted) {
			return { ok: true, text }
		}

		for await (const chunk of stream) {
			if (signal?.aborted) break

			if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
				text += chunk.delta
				emit('agent.text', { toolCallId, delta: chunk.delta })
				continue
			}

			if (chunk.type === EventType.RUN_ERROR) {
				emitEndBoundary()
				return { ok: false, text }
			}

			if (TOOL_STEP_EVENTS.has(chunk.type)) {
				emit('agent.step', toAgentStepPayload(toolCallId, chunk))
			}
		}

		return { ok: true, text }
	} finally {
		emitEndBoundary()
	}
}

function toAgentStepPayload(
	toolCallId: string,
	chunk: StreamChunk,
): Record<string, any> {
	const chunkRecord = chunk as Record<string, any>
	const subToolCallId =
		typeof chunkRecord.toolCallId === 'string'
			? chunkRecord.toolCallId
			: undefined
	const toolName =
		typeof chunkRecord.toolName === 'string'
			? chunkRecord.toolName
			: typeof chunkRecord.toolCallName === 'string'
				? chunkRecord.toolCallName
				: undefined

	return {
		...chunkRecord,
		toolCallId,
		subToolCallId,
		toolName,
		state: chunk.type,
	}
}

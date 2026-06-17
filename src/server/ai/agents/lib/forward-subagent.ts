import {
	type StreamTextResult,
	type ToolSet,
	toUIMessageStream,
	type UIMessageStreamWriter,
} from 'ai'

import type { AgentUIMessage } from './routing'

interface ForwardSubAgentArgs<TOOLS extends ToolSet> {
	agent: string
	toolCallId: string
	writer: UIMessageStreamWriter<AgentUIMessage>
	// biome-ignore lint/suspicious/noExplicitAny: forwards any specialist streamText result; only `.stream` is consumed, so the runtime-context / output generics are irrelevant here.
	result: StreamTextResult<TOOLS, any, any>
	signal?: AbortSignal
}

/**
 * Runs a specialist `streamText` result inside an agent boundary and forwards
 * its UI chunks to the parent stream: a `data-agent-boundary` start, the
 * specialist's narration (text/reasoning/tool chunks), then a
 * `data-agent-boundary` end — accumulating the final text to hand back to the
 * orchestrator loop. The chat UI groups everything between the boundary markers
 * into one collapsible agent run (see `src/components/ai/segment-parts.ts`).
 *
 * v7 note: we drain the SDK-produced UIMessageChunk stream via a reader (a
 * `ReadableStream` is not guaranteed async-iterable under every TS lib config)
 * so the chunk shapes are guaranteed correct and the closing boundary is written
 * strictly AFTER the sub-agent's last chunk.
 */
export async function forwardSubAgentStream<TOOLS extends ToolSet>({
	agent,
	toolCallId,
	writer,
	result,
	signal,
}: ForwardSubAgentArgs<TOOLS>): Promise<{ ok: boolean; text: string }> {
	writer.write({
		type: 'data-agent-boundary',
		data: { agent, toolCallId, phase: 'start' },
	})

	let ok = true
	let text = ''
	const reader = toUIMessageStream<TOOLS, AgentUIMessage>({
		stream: result.stream,
		sendStart: false,
		sendFinish: false,
	}).getReader()
	try {
		while (true) {
			if (signal?.aborted) break
			const { done, value } = await reader.read()
			if (done || value === undefined) break
			if (value.type === 'text-delta') text += value.delta
			if (value.type === 'error') ok = false
			writer.write(value)
		}
	} catch {
		ok = false
	} finally {
		reader.releaseLock()
		writer.write({
			type: 'data-agent-boundary',
			data: { agent, toolCallId, phase: 'end' },
		})
	}

	return { ok, text }
}

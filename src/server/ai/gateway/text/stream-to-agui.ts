/**
 * The core bridge: translate an AI SDK `LanguageModelV3` stream into TanStack
 * AI's AG-UI `StreamChunk` lifecycle. The adapter OWNS the lifecycle — it emits
 * `RUN_STARTED` once before the first content and exactly one terminal event
 * (`RUN_FINISHED` or `RUN_ERROR`).
 *
 * Mapping (see plan §High-Level Technical Design):
 *   stream-start            -> RUN_STARTED (lazy, on first part)
 *   text-start/delta/end    -> TEXT_MESSAGE_START / _CONTENT / _END
 *   reasoning-start/delta/end -> REASONING_MESSAGE_START / _CONTENT / _END
 *   tool-input-start/delta/end + tool-call -> TOOL_CALL_START / _ARGS / _END
 *   tool-result             -> TOOL_CALL_RESULT
 *   finish                  -> RUN_FINISHED (+ usage, finishReason)
 *   error / thrown          -> RUN_ERROR
 */

import type {
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from '@ai-sdk/provider'
import type { StreamChunk } from '@tanstack/ai'
import { buildBaseUsage, EventType } from '@tanstack/ai'

export interface StreamToAguiContext {
	runId: string
	threadId: string
	model: string
	generateId: () => string
	abortSignal?: AbortSignal
}

type AguiFinishReason =
	| 'stop'
	| 'length'
	| 'content_filter'
	| 'tool_calls'
	| null

function mapFinishReason(
	reason: LanguageModelV3FinishReason,
): AguiFinishReason {
	switch (reason.unified) {
		case 'stop':
			return 'stop'
		case 'length':
			return 'length'
		case 'content-filter':
			return 'content_filter'
		case 'tool-calls':
			return 'tool_calls'
		default:
			return null
	}
}

function mapUsage(usage: LanguageModelV3Usage) {
	const promptTokens = usage.inputTokens.total ?? 0
	const completionTokens = usage.outputTokens.total ?? 0
	return buildBaseUsage({
		promptTokens,
		completionTokens,
		totalTokens: promptTokens + completionTokens,
	})
}

export async function* streamToAgui(
	stream: ReadableStream<LanguageModelV3StreamPart>,
	ctx: StreamToAguiContext,
): AsyncGenerator<StreamChunk, void, unknown> {
	const reader = stream.getReader()
	const { runId, threadId, model } = ctx
	let runStarted = false
	let finished = false
	// Map provider stream part ids → unique AG-UI message ids for this run.
	// Many models reuse the same part id every turn (e.g. "0"); the client
	// StreamProcessor dedupes by messageId and would overwrite an earlier
	// assistant turn in place, leaving the new user message below the reply.
	const messageIdsByPartId = new Map<string, string>()
	const resolveMessageId = (partId: string): string => {
		const existing = messageIdsByPartId.get(partId)
		if (existing) return existing
		const next = ctx.generateId()
		messageIdsByPartId.set(partId, next)
		return next
	}
	// tool-call ids that arrived via streamed `tool-input-*` parts, so a
	// terminal `tool-call` part for the same id is not re-emitted as START/END.
	const streamedToolIds = new Set<string>()

	const runStartedEvent = (): StreamChunk =>
		({
			type: EventType.RUN_STARTED,
			threadId,
			runId,
			model,
		}) satisfies StreamChunk

	try {
		while (true) {
			if (ctx.abortSignal?.aborted) break
			const { done, value } = await reader.read()
			if (done) break
			const part = value

			switch (part.type) {
				case 'stream-start': {
					if (!runStarted) {
						runStarted = true
						yield runStartedEvent()
					}
					break
				}
				case 'text-start': {
					if (!runStarted) {
						runStarted = true
						yield runStartedEvent()
					}
					yield {
						type: EventType.TEXT_MESSAGE_START,
						messageId: resolveMessageId(part.id),
						role: 'assistant',
					} satisfies StreamChunk
					break
				}
				case 'text-delta': {
					yield {
						type: EventType.TEXT_MESSAGE_CONTENT,
						messageId: resolveMessageId(part.id),
						delta: part.delta,
					} satisfies StreamChunk
					break
				}
				case 'text-end': {
					yield {
						type: EventType.TEXT_MESSAGE_END,
						messageId: resolveMessageId(part.id),
					} satisfies StreamChunk
					break
				}
				case 'reasoning-start': {
					if (!runStarted) {
						runStarted = true
						yield runStartedEvent()
					}
					yield {
						type: EventType.REASONING_MESSAGE_START,
						messageId: resolveMessageId(part.id),
						role: 'reasoning',
					} satisfies StreamChunk
					break
				}
				case 'reasoning-delta': {
					yield {
						type: EventType.REASONING_MESSAGE_CONTENT,
						messageId: resolveMessageId(part.id),
						delta: part.delta,
					} satisfies StreamChunk
					break
				}
				case 'reasoning-end': {
					yield {
						type: EventType.REASONING_MESSAGE_END,
						messageId: resolveMessageId(part.id),
					} satisfies StreamChunk
					break
				}
				case 'tool-input-start': {
					if (!runStarted) {
						runStarted = true
						yield runStartedEvent()
					}
					streamedToolIds.add(part.id)
					yield {
						type: EventType.TOOL_CALL_START,
						toolCallId: part.id,
						toolCallName: part.toolName,
						toolName: part.toolName,
					} satisfies StreamChunk
					break
				}
				case 'tool-input-delta': {
					yield {
						type: EventType.TOOL_CALL_ARGS,
						toolCallId: part.id,
						delta: part.delta,
					} satisfies StreamChunk
					break
				}
				case 'tool-input-end': {
					yield {
						type: EventType.TOOL_CALL_END,
						toolCallId: part.id,
					} satisfies StreamChunk
					break
				}
				case 'tool-call': {
					// Non-streamed tool call (args arrived whole). Synthesize the
					// START/ARGS/END trio only if it wasn't already streamed.
					if (!streamedToolIds.has(part.toolCallId)) {
						if (!runStarted) {
							runStarted = true
							yield runStartedEvent()
						}
						yield {
							type: EventType.TOOL_CALL_START,
							toolCallId: part.toolCallId,
							toolCallName: part.toolName,
							toolName: part.toolName,
						} satisfies StreamChunk
						yield {
							type: EventType.TOOL_CALL_ARGS,
							toolCallId: part.toolCallId,
							delta: part.input,
						} satisfies StreamChunk
						yield {
							type: EventType.TOOL_CALL_END,
							toolCallId: part.toolCallId,
						} satisfies StreamChunk
					}
					break
				}
				case 'tool-result': {
					yield {
						type: EventType.TOOL_CALL_RESULT,
						messageId: ctx.generateId(),
						toolCallId: part.toolCallId,
						content:
							typeof part.result === 'string'
								? part.result
								: JSON.stringify(part.result),
					} satisfies StreamChunk
					break
				}
				case 'finish': {
					if (!runStarted) {
						runStarted = true
						yield runStartedEvent()
					}
					finished = true
					yield {
						type: EventType.RUN_FINISHED,
						threadId,
						runId,
						model,
						finishReason: mapFinishReason(part.finishReason),
						usage: mapUsage(part.usage),
					} satisfies StreamChunk
					break
				}
				case 'error': {
					finished = true
					yield {
						type: EventType.RUN_ERROR,
						message:
							part.error instanceof Error
								? part.error.message
								: String(part.error),
						model,
					} satisfies StreamChunk
					break
				}
				default:
					// Ignore other parts (response-metadata, file, source, raw).
					break
			}
		}

		// Stream ended without an explicit finish part — close the run.
		if (!finished) {
			if (!runStarted) yield runStartedEvent()
			yield {
				type: EventType.RUN_FINISHED,
				threadId,
				runId,
				model,
			} satisfies StreamChunk
		}
	} catch (error) {
		yield {
			type: EventType.RUN_ERROR,
			message: error instanceof Error ? error.message : String(error),
			code: (error as { code?: string })?.code,
			model,
		} satisfies StreamChunk
	} finally {
		reader.releaseLock()
	}
}

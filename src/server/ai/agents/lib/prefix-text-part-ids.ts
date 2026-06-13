/**
 * Namespacing transform for sub-agent UIMessage streams that share an outer
 * `createUIMessageStream` writer.
 *
 * Background
 * ----------
 * Each sub-agent's `toUIMessageStream(...)` numbers its `text-*` (and
 * `reasoning-*`) parts starting at id `"0"` because the LLM provider returns a
 * stream-local counter. When two sub-agents (e.g. db-doctor then renderer)
 * both merge into the same outer message in the same turn, the outer message
 * sees two independent `text-start id="0"` events for unrelated text parts.
 * The AI SDK enforces one open text part per id, so the second emitter
 * triggers:
 *
 *     Received text-delta for missing text part with ID "0".
 *     Ensure a "text-start" chunk is sent before any "text-delta" chunks.
 *
 * Fix
 * ---
 * Wrap each sub-agent's stream in `prefixTextPartIds(stream, prefix)` before
 * merging. The transform rewrites every `text-start` / `text-delta` /
 * `text-end` / `reasoning-start` / `reasoning-delta` / `reasoning-end`
 * `chunk.id` to `${prefix}-${id}`, leaving the original chunk untouched
 * (structural clone). All other chunk types pass through by identity.
 *
 * Callers supply a per-invocation `prefix` (e.g. `dbd-${toolCallId}`,
 * `rnd-${toolCallId}`) so different sub-agent invocations within the same
 * outer message never collide.
 */
import type { UIMessageChunk } from 'ai'

/** Chunk types whose `id` field addresses a text/reasoning part on the outer message. */
const REWRITABLE_TYPES: ReadonlySet<string> = new Set([
	'text-start',
	'text-delta',
	'text-end',
	'reasoning-start',
	'reasoning-delta',
	'reasoning-end',
])

/**
 * Rewrites text- and reasoning-part ids in `stream` to a per-source namespace
 * so multiple sub-agent streams can merge into the same outer message without
 * id collisions.
 *
 * Implementation notes:
 *   - Non-rewritable chunks pass through by reference (no clone).
 *   - Rewritable chunks are shallow-cloned (`{ ...chunk, id }`); the original
 *     input chunk is never mutated.
 *   - Cancellation propagates upstream through the standard ReadableStream
 *     cancellation protocol (pipeThrough → cancel → TransformStream readable
 *     cancel → writable abort → upstream reader cancel).
 */
export function prefixTextPartIds(
	stream: ReadableStream<UIMessageChunk>,
	prefix: string,
): ReadableStream<UIMessageChunk> {
	const transform = new TransformStream<UIMessageChunk, UIMessageChunk>({
		transform(chunk, controller) {
			const type = (chunk as { type: string }).type
			if (REWRITABLE_TYPES.has(type)) {
				const withId = chunk as UIMessageChunk & { id: string }
				const next = {
					...(chunk as object),
					id: `${prefix}-${withId.id}`,
				} as UIMessageChunk
				controller.enqueue(next)
				return
			}
			controller.enqueue(chunk)
		},
	})

	return stream.pipeThrough(transform)
}

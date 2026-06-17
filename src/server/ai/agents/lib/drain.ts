import type { UIMessageChunk, UIMessageStreamWriter } from 'ai'

/**
 * Drain a `ReadableStream<UIMessageChunk>` into a `UIMessageStreamWriter`,
 * AWAITING end-of-stream. Ported from ontology's `agents/routing.ts`.
 *
 * Why not `writer.merge(stream)`? `merge` enqueues the inner stream and returns
 * synchronously, so any `writer.write(...)` placed AFTER it (e.g. a closing
 * `data-agent-boundary` marker) races ahead of the merged chunks and breaks
 * on-wire ordering. `drainIntoWriter` resolves only after EOS, so paired
 * boundary markers stay correctly ordered.
 *
 * `onText` fires for every `text-delta` so callers can assemble the sub-agent's
 * prose as the tool result the orchestrator's loop reads.
 */
export async function drainIntoWriter(
	stream: ReadableStream<UIMessageChunk>,
	writer: UIMessageStreamWriter,
	abortSignal?: AbortSignal,
	options?: { onText?: (delta: string) => void },
): Promise<void> {
	const reader = stream.getReader()
	const onText = options?.onText
	try {
		while (true) {
			if (abortSignal?.aborted) {
				await reader.cancel()
				return
			}
			const { done, value } = await reader.read()
			if (done) return
			if (onText && value) {
				const chunk = value as { type?: string; delta?: unknown }
				if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
					onText(chunk.delta)
				}
			}
			writer.write(value as Parameters<typeof writer.write>[0])
		}
	} finally {
		reader.releaseLock()
	}
}

/** Chunk types whose `id` addresses a text/reasoning part on the outer message. */
const REWRITABLE_TYPES: ReadonlySet<string> = new Set([
	'text-start',
	'text-delta',
	'text-end',
	'reasoning-start',
	'reasoning-delta',
	'reasoning-end',
])

/**
 * Namespace each sub-agent stream's text/reasoning part ids (which the provider
 * numbers from `"0"`) so two sub-agents merging into the same outer message in
 * one turn don't collide on `id="0"`. Ported verbatim from ontology's
 * `prefix-text-part-ids.ts`. Non-rewritable chunks pass through by reference.
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
				controller.enqueue({
					...(chunk as object),
					id: `${prefix}-${withId.id}`,
				} as UIMessageChunk)
				return
			}
			controller.enqueue(chunk)
		},
	})
	return stream.pipeThrough(transform)
}

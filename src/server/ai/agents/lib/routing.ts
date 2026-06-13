/**
 * Sub-agent routing primitives for the orchestrator `ToolLoopAgent`.
 *
 * History: a previous revision replaced the orchestrator with a deterministic
 * regex-based router (see deleted `route-decision.ts` / `run-subagent.ts`).
 * That version had been introduced to work around bugs inside the
 * orchestrator, but it removed the dynamic-composition behaviour we relied on
 * (mid-turn pivots, chained calls, "renderer needs more schema → call
 * db-doctor again"). The orchestrator has been restored; what stays from the
 * deterministic-router era are the safety transforms below (id prefixing,
 * synchronous drain, agent-step rewrite, db-doctor cache), which had been
 * built to plug the actual bugs.
 *
 * This module exposes:
 *
 *   - `dbDoctorRoutingTool` — `tool({ inputSchema, execute })` factory that
 *     drains the db-doctor sub-agent into the outer writer with text-part-id
 *     prefixing AND per-request caching.
 *   - `rendererRoutingTool` — same shape for the renderer; also rewrites
 *     renderer-internal `tool-*` chunks into `data-agent-step` data parts and
 *     wraps the drain in paired `data-agent-boundary` markers.
 *   - `drainIntoWriter` — copies a `ReadableStream<UIMessageChunk>` into a
 *     `UIMessageStreamWriter` while AWAITING end-of-stream (NOT
 *     `writer.merge`, which races).
 *   - `createDbDoctorCache` — per-request cache so the orchestrator can call
 *     db-doctor twice in one turn without re-streaming the sub-agent.
 */
import { pipeJsonRender } from '@json-render/core'
import {
	convertToModelMessages,
	type ToolLoopAgent,
	type ToolSet,
	tool,
	type UIMessage,
	type UIMessageChunk,
	type UIMessageStreamWriter,
} from 'ai'
import { z } from 'zod'

import { prefixTextPartIds } from './prefix-text-part-ids'
import { rewriteAgentToolParts } from './rewrite-renderer-parts'

/* ─── drainIntoWriter ───────────────────────────────────────────────────── */

/**
 * Drain a `ReadableStream<UIMessageChunk>` into a `UIMessageStreamWriter` by
 * awaiting each chunk and forwarding it to `writer.write(...)`.
 *
 * Why not `writer.merge(stream)`? `merge` enqueues the inner stream as a
 * merge source on the outer writer and returns `void` synchronously. The
 * caller has no way to know when (or even *if*) the inner chunks have been
 * pulled — so any `writer.write(...)` placed **after** `merge` runs *before*
 * the merged chunks, breaking on-wire ordering. That breaks paired markers
 * like the renderer's `data-agent-boundary` start/end, which the chat UI
 * relies on to group sub-tool steps under one collapsible header.
 *
 * `drainIntoWriter` is the synchronous-from-the-caller's-POV alternative:
 * it returns a `Promise<void>` that resolves only after the upstream signals
 * end-of-stream, so callers can safely write follow-up frames knowing every
 * inner chunk has already hit the writer.
 *
 * On abort: cancels the upstream reader and returns. The writer is left
 * untouched (outer writer cancellation is the caller's job).
 *
 * Optional `onText` callback: fires for every `text-delta` chunk with the
 * incremental `delta` string. Callers use this to assemble a plain-text
 * transcript of the sub-agent's prose so the orchestrator's tool-loop model
 * can read what the sub-agent actually said as the tool result, instead of a
 * stripped-down `{ ok: true }`. This is the synchronization fix that lets the
 * orchestrator compose downstream delegation prompts using upstream output
 * (e.g. db-doctor's schema digest → renderer's authoring prompt).
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

/**
 * Walk a recorded chunk array (e.g. from `DbDoctorCache`) and concatenate
 * every `text-delta` `delta` in source order. Used on cache-hit replays so
 * the tool's return value still carries the sub-agent's prose, mirroring the
 * fresh-stream path that captures text via `drainIntoWriter`'s `onText`.
 */
export function extractTextFromChunks(
	chunks: ReadonlyArray<UIMessageChunk>,
): string {
	let out = ''
	for (const chunk of chunks) {
		const c = chunk as { type?: string; delta?: unknown }
		if (c.type === 'text-delta' && typeof c.delta === 'string') {
			out += c.delta
		}
	}
	return out
}

/* ─── DbDoctorCache ─────────────────────────────────────────────────────── */

/**
 * Request-scoped cache used by `dbDoctorRoutingTool`. The orchestrator may
 * call db-doctor more than once in a single turn (e.g. the renderer requests
 * more schema details mid-turn); the cache replays the recorded chunks for
 * subsequent calls so the sub-agent isn't re-streamed. The cache lives for
 * exactly one POST handler invocation and is garbage-collected after.
 *
 * Keys are normalized to lowercase + trimmed so trivial prompt variations hit
 * the same entry.
 */
export interface DbDoctorCache {
	get(prompt: string): ReadonlyArray<UIMessageChunk> | undefined
	set(prompt: string, chunks: ReadonlyArray<UIMessageChunk>): void
}

const normalizePrompt = (prompt: string): string => prompt.trim().toLowerCase()

/**
 * Factory for a per-request `DbDoctorCache` backed by a Map. Do NOT call this
 * at module scope; one instance per `agentRequestHandler` call.
 */
export const createDbDoctorCache = (): DbDoctorCache => {
	const store = new Map<string, ReadonlyArray<UIMessageChunk>>()
	return {
		get(prompt) {
			return store.get(normalizePrompt(prompt))
		},
		set(prompt, chunks) {
			store.set(normalizePrompt(prompt), chunks)
		},
	}
}

/* ─── Routing tools ─────────────────────────────────────────────────────── */

const RENDERER_AGENT_ID = 'ontology-renderer' as const
const DB_DOCTOR_AGENT_ID = 'db-doctor' as const

/**
 * Sentinel `toolName` for the synthetic `data-agent-step` emitted when the
 * db-doctor cache hits. The chat UI watches for either this sentinel or a
 * truthy `data.cached` flag and renders a "Returned from cache" badge in
 * place of the standard tool-call row.
 */
export const DB_DOCTOR_CACHE_HIT_TOOL_NAME = '__cache_hit' as const

const routingInputSchema = z.object({
	prompt: z.string().min(1),
})

/**
 * Output schema for both routing tools. The `text` field is the sub-agent's
 * prose (text-delta chunks concatenated) that the orchestrator's tool-loop
 * model reads as the tool result. Without this, the orchestrator only sees
 * `{ ok: true }` and cannot compose follow-up delegations from the sub-agent's
 * output (e.g. handing db-doctor's schema digest to the renderer).
 */
const routingOutputSchema = z.object({
	ok: z.literal(true),
	text: z.string(),
})

/**
 * Build the `tool({ ... })` the orchestrator registers as `db-doctor`.
 *
 * Behaviour:
 *   - Emits a paired `data-agent-boundary` start/end marker around the inner
 *     drain so the chat UI groups db-doctor's chunks under a collapsible
 *     "DB Doctor" header (mirroring `rendererRoutingTool`).
 *   - On cache HIT: writes a synthetic `data-agent-step` with
 *     `toolName: '__cache_hit'` and `cached: true` BEFORE replaying the
 *     recorded chunks, so the operator sees a visible "Returned from cache"
 *     badge at the top of the db-doctor group.
 *   - On cache MISS: streams the sub-agent normally; the chat UI sees the
 *     standard tool-call rows between the boundaries.
 *   - In both cases the closing boundary marker lands after every chunk has
 *     hit the writer (paired with the start marker via `drainIntoWriter`).
 *
 * Execution:
 *   1. Write the `start` boundary marker.
 *   2. If `cache?.get(normalizedPrompt)` hits, emit the `__cache_hit` step
 *      marker, then replay the recorded chunks directly into the outer
 *      writer and fall through to the `finally` that writes `end`.
 *   3. Otherwise stream the sub-agent with the orchestrator-supplied prompt,
 *      namespace text/reasoning part ids with `dbd-<toolCallId>` (so the
 *      next sub-agent in the same turn can't collide on `id="0"`), tee the
 *      stream through a collector, await the drain, then record the
 *      collected chunks in the cache for future replays this turn.
 */
export const dbDoctorRoutingTool = <TOOLS extends ToolSet>(opts: {
	description: string
	agentId?: string
	agent: ToolLoopAgent<never, TOOLS>
	writer: UIMessageStreamWriter
	abortSignal?: AbortSignal
	cache?: DbDoctorCache
}) =>
	tool({
		description: opts.description,
		inputSchema: routingInputSchema,
		outputSchema: routingOutputSchema,
		execute: async ({ prompt }, { abortSignal, toolCallId }) => {
			const signal = abortSignal ?? opts.abortSignal
			const agentName = opts.agentId ?? DB_DOCTOR_AGENT_ID

			opts.writer.write({
				type: 'data-agent-boundary',
				id: `${toolCallId}-start`,
				data: {
					agent: agentName,
					toolCallId,
					phase: 'start',
				},
			} as unknown as Parameters<typeof opts.writer.write>[0])

			// Buffer for the sub-agent's prose. We assemble this from
			// `text-delta` chunks so the orchestrator's tool-loop model can
			// read what db-doctor produced (schema digest) and compose a
			// follow-up delegation prompt for the renderer.
			let capturedText = ''
			const onText = (delta: string) => {
				capturedText += delta
			}

			try {
				const cached = opts.cache?.get(prompt)
				if (cached) {
					// Emit a synthetic step marker BEFORE the replayed chunks so
					// the UI shows a "Returned from cache" badge at the top of
					// the db-doctor group. Stable unique id prevents the SDK's
					// `(type, id)`-keyed merge from collapsing this with other
					// `data-agent-step` parts.
					opts.writer.write({
						type: 'data-agent-step',
						id: `${toolCallId}-cache-hit`,
						data: {
							agent: agentName,
							toolName: DB_DOCTOR_CACHE_HIT_TOOL_NAME,
							toolCallId: `${toolCallId}-cache-hit`,
							state: 'output-available',
							input: { hits: cached.length },
							cached: true,
						},
					} as unknown as Parameters<typeof opts.writer.write>[0])

					for (const chunk of cached) {
						opts.writer.write(chunk as Parameters<typeof opts.writer.write>[0])
					}
					// Reconstruct prose from cached chunks so the orchestrator
					// still sees the schema digest even when replaying.
					return {
						ok: true as const,
						text: extractTextFromChunks(cached),
					}
				}

				const result = await opts.agent.stream({
					prompt,
					abortSignal: signal,
				})

				const subStream = result.toUIMessageStream({
					sendStart: false,
					sendFinish: false,
				}) as unknown as ReadableStream<UIMessageChunk>

				const namespaced = prefixTextPartIds(subStream, `dbd-${toolCallId}`)
				// Rewrite db-doctor's raw `tool-*` chunks into `data-agent-step`
				// data parts so the chat UI's `segmentParts` (which skips raw
				// `tool-*` parts inside agent boundaries) renders db-doctor's
				// sub-tool calls (e.g. `listSchemas`, `getTableColumns`) under
				// the "DB Doctor" header. Originals pass through unchanged so
				// `convertToModelMessages` can reconstruct tool-call history on
				// approval-resume round-trips. Cache decision A: this transform
				// runs BEFORE the collector, so cached chunks are already
				// post-rewrite and replay can write them directly.
				const transformed = rewriteAgentToolParts(namespaced, {
					agent: agentName,
					abortSignal: signal,
				})

				if (opts.cache) {
					const collected: UIMessageChunk[] = []
					const collector = new TransformStream<UIMessageChunk, UIMessageChunk>(
						{
							transform(chunk, controller) {
								collected.push(chunk)
								controller.enqueue(chunk)
							},
							flush() {
								opts.cache?.set(prompt, collected)
							},
						},
					)
					await drainIntoWriter(
						transformed.pipeThrough(collector),
						opts.writer,
						signal,
						{ onText },
					)
					return { ok: true as const, text: capturedText }
				}

				await drainIntoWriter(transformed, opts.writer, signal, { onText })
				return { ok: true as const, text: capturedText }
			} finally {
				opts.writer.write({
					type: 'data-agent-boundary',
					id: `${toolCallId}-end`,
					data: {
						agent: agentName,
						toolCallId,
						phase: 'end',
					},
				} as unknown as Parameters<typeof opts.writer.write>[0])
			}
		},
	})

/**
 * Build the `tool({ ... })` the orchestrator registers as
 * `ontology-renderer`.
 *
 * Behaviour:
 *   - Emits a paired `data-agent-boundary` start/end marker around the inner
 *     drain so the chat UI can collapse sub-tool steps under one header.
 *   - Passes the FULL chat-level UIMessage[] (converted via
 *     `convertToModelMessages` with `ignoreIncompleteToolCalls: true`) into
 *     the renderer agent so the SDK can reconstruct prior
 *     `tool-approval-request` parts on approval-resume round-trips. The
 *     orchestrator's own routing prompt is appended as a final `system`
 *     message so the model still sees its delegation instruction.
 *   - Applies `prefixTextPartIds` first (so downstream transforms only see
 *     namespaced ids), then `pipeJsonRender` (lifts ```spec fences to
 *     `data-spec` chunks), then `rewriteAgentToolParts` (turns
 *     renderer-internal `tool-*` chunks into `data-agent-step` data parts
 *     while passing the originals through for next-turn history
 *     reconstruction).
 *   - Awaits to EOS; the closing boundary marker lands after every renderer
 *     chunk on the wire.
 */
export const rendererRoutingTool = <TOOLS extends ToolSet>(opts: {
	description: string
	agent: ToolLoopAgent<never, TOOLS>
	writer: UIMessageStreamWriter
	messages: UIMessage[]
	abortSignal?: AbortSignal
	agentId?: string
}) =>
	tool({
		description: opts.description,
		inputSchema: routingInputSchema,
		outputSchema: routingOutputSchema,
		execute: async ({ prompt }, { abortSignal, toolCallId }) => {
			const signal = abortSignal ?? opts.abortSignal
			const agentName = opts.agentId ?? RENDERER_AGENT_ID

			opts.writer.write({
				type: 'data-agent-boundary',
				id: `${toolCallId}-start`,
				data: {
					agent: agentName,
					toolCallId,
					phase: 'start',
				},
			} as unknown as Parameters<typeof opts.writer.write>[0])

			// Buffer for the renderer's prose (intro + "Approve below" paragraphs).
			// `pipeJsonRender` strips ```spec fence content from text-delta chunks
			// once it detects a fence, so what we capture here is exactly the
			// renderer's natural-language framing around the generated spec —
			// useful context for the orchestrator's tool-loop model.
			let capturedText = ''
			const onText = (delta: string) => {
				capturedText += delta
			}

			try {
				const modelMessages = await convertToModelMessages(opts.messages, {
					ignoreIncompleteToolCalls: true,
				})
				// Append the orchestrator's delegation instruction as a final
				// USER message (with a clear `Server context:` prefix) so the
				// model still sees its routing intent without losing the
				// conversation history (which carries db-doctor's schema digest
				// from earlier in this turn).
				//
				// We deliberately do NOT push a `role: 'system'` ModelMessage
				// here: the AI SDK (v6) treats inline system messages in the
				// `messages` array as a prompt-injection surface and logs a
				// warning ("System messages in the prompt or messages fields
				// can be a security risk..."). The renderer agent's own
				// `instructions` (set at construction) are emitted by the SDK
				// via the dedicated `system` argument to `streamText`, which is
				// the safe channel. `AgentStreamParameters` in this SDK version
				// does NOT accept a top-level `system` field, so we keep the
				// orchestrator's per-call delegation as a user-role message
				// with a clear server-origin prefix.
				modelMessages.push({
					role: 'user',
					content: `Server context: Orchestrator delegation:\n${prompt}`,
				})

				const result = await opts.agent.stream({
					messages: modelMessages,
					abortSignal: signal,
				})

				const subStream = result.toUIMessageStream({
					sendStart: false,
					sendFinish: false,
				}) as unknown as ReadableStream<UIMessageChunk>

				const namespaced = prefixTextPartIds(subStream, `rnd-${toolCallId}`)

				const validated = pipeJsonRender(namespaced)
				const transformed = rewriteAgentToolParts(validated, {
					agent: agentName,
					abortSignal: signal,
				})

				await drainIntoWriter(
					transformed as ReadableStream<UIMessageChunk>,
					opts.writer,
					signal,
					{ onText },
				)
			} finally {
				opts.writer.write({
					type: 'data-agent-boundary',
					id: `${toolCallId}-end`,
					data: {
						agent: agentName,
						toolCallId,
						phase: 'end',
					},
				} as unknown as Parameters<typeof opts.writer.write>[0])
			}

			return { ok: true as const, text: capturedText }
		},
	})

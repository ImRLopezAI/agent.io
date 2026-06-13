import type { UIMessageChunk } from 'ai'

/**
 * Lifecycle states emitted in the rewritten `data-agent-step` payload. Must
 * stay in sync with `AgentStepPart` in `apps/ontology/src/components/ai/messages.tsx`.
 */
export type AgentStepState =
	| 'input-streaming'
	| 'input-available'
	| 'approval-requested'
	| 'approval-responded'
	| 'output-available'
	| 'output-error'
	| 'output-denied'

/**
 * The data carried on every rewritten `data-agent-step` chunk. The chat UI
 * consumer at `messages.tsx` reads exactly these fields off `part.data`.
 */
export interface AgentStepData {
	agent: string
	toolName: string
	toolCallId: string
	state: AgentStepState
	input?: Record<string, unknown>
	output?: Record<string, unknown>
	approval?: { id: string; approved?: boolean; reason?: string }
}

interface ToolEntry {
	toolName: string
	inputDeltaBuffer: string
	input?: Record<string, unknown>
	output?: Record<string, unknown>
	approval?: { id: string; approved?: boolean; reason?: string }
	state: AgentStepState
}

const AGENT_STEP_TYPE = 'data-agent-step' as const

/**
 * Rewrites every sub-agent tool chunk (`tool-input-start`, `tool-input-delta`,
 * `tool-input-available`, `tool-input-error`, `tool-approval-request`,
 * `tool-output-available`, `tool-output-error`, `tool-output-denied`) into a
 * canonical `data-agent-step` data part the chat UI can render. Generic over
 * the sub-agent id (`options.agent`), so this same transform works for the
 * renderer, db-doctor, or any future sub-agent whose tool calls need to be
 * surfaced inside an agent boundary in the chat UI.
 *
 * Behavior contract (Bug B1 + Bug B3 fix):
 * - **Pass-through:** Every original `tool-*` chunk is forwarded into the
 *   output stream UNCHANGED *before* the corresponding `data-agent-step` is
 *   emitted. This preserves the sub-agent's authoritative tool-call history
 *   on the assistant message so `convertToModelMessages` can reconstruct the
 *   prior `tool-approval-request` on a follow-up turn (which is what
 *   `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`
 *   relies on). The chat UI ignores raw `tool-*` parts at top level (see
 *   `segmentParts` in `messages.tsx`) — only the prettified `data-agent-step`
 *   rows are rendered.
 * - **Unique ids:** Each emitted `data-agent-step` chunk carries a unique
 *   `id` (`${toolCallId}-${seq}`). The AI SDK merges incoming `data-*`
 *   chunks by `(type, id)` and would otherwise mutate the existing UIPart's
 *   `data` field in place, collapsing the entire lifecycle into one part by
 *   reference. With unique ids the assistant message's `parts` array grows
 *   append-only and React.memo on parts identity actually fires.
 *   The chat UI dedupes by `data.toolCallId` to keep the visible row count
 *   stable; see `segmentParts` / `dedupeStepsByToolCallId`.
 * - `text-*`, `data-*`, `reasoning-*`, `error`, `start`, `start-step`,
 *   `finish-step`, `finish`, `abort`, `source-*`, `file`, `message-metadata`
 *   chunks pass through unchanged.
 * - State is computed monotonically per `toolCallId` so the consumer can do
 *   identity-based React memoization keyed on `(toolCallId, state)`.
 * - Cancels the upstream input promptly when `abortSignal` fires so callers
 *   (e.g. `req.signal` aborts) tear the sub-agent dispatch down within one
 *   chunk boundary.
 *
 * @param options.agent  Sub-agent id to stamp on the emitted
 *   `data-agent-step.data.agent` field. Defaults to the renderer agent id
 *   for backwards compatibility with the original renderer-only call site.
 */
export function rewriteAgentToolParts(
	stream: ReadableStream<UIMessageChunk>,
	options: { agent?: string; abortSignal?: AbortSignal } = {},
): ReadableStream<UIMessageChunk> {
	const agentName = options.agent
	const tools = new Map<string, ToolEntry>()
	let stepSeq = 0

	const ensure = (toolCallId: string, toolName?: string): ToolEntry => {
		let entry = tools.get(toolCallId)
		if (!entry) {
			entry = {
				toolName: toolName ?? '',
				inputDeltaBuffer: '',
				state: 'input-streaming',
			}
			tools.set(toolCallId, entry)
		} else if (toolName && !entry.toolName) {
			entry.toolName = toolName
		}
		return entry
	}

	const buildAgentStep = (
		toolCallId: string,
		entry: ToolEntry,
	): UIMessageChunk => {
		const data: AgentStepData = {
			agent: agentName ?? '',
			toolName: entry.toolName,
			toolCallId,
			state: entry.state,
		}
		if (entry.input !== undefined) data.input = entry.input
		if (entry.output !== undefined) data.output = entry.output
		if (entry.approval !== undefined) data.approval = entry.approval

		// Unique id per emission. AI SDK merges `data-*` chunks by
		// `(type, id)` and mutates the existing UIPart's `data` field in
		// place; that collapse made every lifecycle update invisible to
		// React.memo on parts identity. Append-only ids let the assistant
		// message's `parts` array grow without mutation; the chat UI dedupes
		// by `data.toolCallId` to keep the rendered row count stable (see
		// `segmentParts` in `messages.tsx`).
		stepSeq += 1
		return {
			type: AGENT_STEP_TYPE,
			id: `${toolCallId}-${stepSeq}`,
			data,
		} as unknown as UIMessageChunk
	}

	const reader = stream.getReader()
	let cancelled = false

	const cancelUpstream = () => {
		if (cancelled) return
		cancelled = true
		// Best-effort. If the reader has already released, this throws — swallow.
		try {
			reader.cancel('aborted').catch(() => {
				/* noop */
			})
		} catch {
			/* noop */
		}
	}

	if (options.abortSignal) {
		if (options.abortSignal.aborted) cancelUpstream()
		else
			options.abortSignal.addEventListener('abort', cancelUpstream, {
				once: true,
			})
	}

	return new ReadableStream<UIMessageChunk>({
		async pull(controller) {
			if (options.abortSignal?.aborted) {
				cancelUpstream()
				controller.close()
				return
			}
			try {
				const { done, value } = await reader.read()
				if (done) {
					controller.close()
					return
				}

				const chunk = value
				const type = (chunk as { type: string }).type
				// Detect renderer-internal tool lifecycle chunks. For each one we
				// pass the original chunk through UNCHANGED first (so
				// `convertToModelMessages` on a follow-up turn can reconstruct
				// the prior tool-call + approval-request history) and then emit
				// a `data-agent-step` data part for the chat UI to render.
				const isToolChunk =
					type === 'tool-input-start' ||
					type === 'tool-input-delta' ||
					type === 'tool-input-available' ||
					type === 'tool-input-error' ||
					type === 'tool-approval-request' ||
					type === 'tool-output-available' ||
					type === 'tool-output-error' ||
					type === 'tool-output-denied'

				if (!isToolChunk) {
					controller.enqueue(chunk)
					return
				}

				// 1) Pass the renderer-internal tool chunk through unchanged.
				controller.enqueue(chunk)

				// 2) Update the per-toolCallId state machine and emit a fresh
				// `data-agent-step` for the chat UI.
				switch (type) {
					case 'tool-input-start': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-input-start' }
						>
						const entry = ensure(c.toolCallId, c.toolName)
						entry.state = 'input-streaming'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-input-delta': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-input-delta' }
						>
						const entry = ensure(c.toolCallId)
						entry.inputDeltaBuffer += c.inputTextDelta
						try {
							entry.input = JSON.parse(entry.inputDeltaBuffer) as Record<
								string,
								unknown
							>
						} catch {
							/* keep buffering */
						}
						entry.state = 'input-streaming'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-input-available': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-input-available' }
						>
						const entry = ensure(c.toolCallId, c.toolName)
						entry.input =
							(c.input as Record<string, unknown> | undefined) ?? entry.input
						entry.state = 'input-available'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-input-error': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-input-error' }
						>
						const entry = ensure(c.toolCallId, c.toolName)
						entry.input =
							(c.input as Record<string, unknown> | undefined) ?? entry.input
						entry.output = { errorText: c.errorText }
						entry.state = 'output-error'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-approval-request': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-approval-request' }
						>
						const entry = ensure(c.toolCallId)
						entry.approval = {
							...(entry.approval ?? {}),
							id: c.approvalId,
						}
						entry.state = 'approval-requested'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-output-available': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-output-available' }
						>
						const entry = ensure(c.toolCallId)
						const output = c.output
						entry.output =
							output && typeof output === 'object'
								? (output as Record<string, unknown>)
								: { value: output }
						entry.state = 'output-available'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-output-error': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-output-error' }
						>
						const entry = ensure(c.toolCallId)
						entry.output = { errorText: c.errorText }
						entry.state = 'output-error'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
					case 'tool-output-denied': {
						const c = chunk as Extract<
							UIMessageChunk,
							{ type: 'tool-output-denied' }
						>
						const entry = ensure(c.toolCallId)
						if (entry.approval) {
							entry.approval = { ...entry.approval, approved: false }
						}
						entry.state = 'output-denied'
						controller.enqueue(buildAgentStep(c.toolCallId, entry))
						return
					}
				}
			} catch (err) {
				controller.error(err)
			}
		},
		cancel(reason) {
			cancelUpstream()
			try {
				reader.releaseLock()
			} catch {
				/* noop */
			}
			return reason
		},
	})
}

/**
 * Backwards-compatible alias for the original renderer-only export. Kept so
 * existing imports continue to work; new call sites should prefer
 * `rewriteAgentToolParts` and pass an explicit `{ agent }`.
 *
 * @deprecated Use `rewriteAgentToolParts` and pass `{ agent }` explicitly.
 */
export const rewriteRendererToolParts = rewriteAgentToolParts

/**
 * Pure-data helpers for the chat UI's message rendering.
 *
 * `segmentParts` walks the top-level `parts` of an assistant message and
 * groups them into segments the React layer renders. `dedupeStepsByToolCallId`
 * collapses successive `data-agent-step` emissions for the same tool call so
 * the operator sees one row per tool call (carrying the latest state) — see
 * Bug B3 fix in `apps/ontology/src/server/ai/agents/rewrite-renderer-parts.ts`.
 *
 * This file is intentionally framework-free so the test suite can exercise
 * the pure logic without pulling in React, shadcn primitives, or markdown
 * renderers.
 */

export interface AgentBoundaryPart {
	type: 'data-agent-boundary'
	data: { agent: string; toolCallId?: string; phase: 'start' | 'end' }
}

export type AgentStepState =
	| 'input-streaming'
	| 'input-available'
	| 'approval-requested'
	| 'approval-responded'
	| 'output-available'
	| 'output-error'
	| 'output-denied'
	| (string & {})

export interface AgentStepPart {
	type: 'data-agent-step'
	data: {
		agent: string
		toolName: string
		toolCallId: string
		state: AgentStepState
		input?: Record<string, unknown>
		output?: Record<string, unknown>
		approval?: { id: string; approved?: boolean; reason?: string }
		/**
		 * Server-side flag set by `dbDoctorRoutingTool` when a cached
		 * sub-agent response is replayed. The chat UI uses this (combined
		 * with the `__cache_hit` `toolName` sentinel) to render a "Returned
		 * from cache" badge in place of the standard tool-call row.
		 */
		cached?: boolean
	}
}

/**
 * Sentinel `toolName` for the cache-hit `data-agent-step` emitted by
 * `dbDoctorRoutingTool`. Kept in sync with the constant in
 * `apps/ontology/src/server/ai/agents/routing.ts` so the UI doesn't drift
 * if the server constant ever changes.
 */
export const CACHE_HIT_TOOL_NAME = '__cache_hit'

/**
 * Returns true when the given step is a synthetic cache-hit marker emitted
 * by `dbDoctorRoutingTool`. Matches either the explicit `cached: true` flag
 * or the `__cache_hit` `toolName` sentinel so future server-side renames
 * only need to update one side.
 */
export function isCacheHitStep(step: AgentStepPart): boolean {
	return step.data.cached === true || step.data.toolName === CACHE_HIT_TOOL_NAME
}

export interface FilePart {
	type: 'file'
	mediaType: string
	filename?: string
	url: string
}

export type Segment =
	| { kind: 'text'; key: string; text: string }
	| { kind: 'reasoning'; key: string; text: string }
	| {
			kind: 'file'
			key: string
			mediaType: string
			filename?: string
			url: string
	  }
	| {
			kind: 'agent'
			key: string
			agent: string
			toolCallId?: string
			steps: AgentStepPart[]
			/**
			 * Markdown narration streamed inside the agent boundary (e.g.
			 * db-doctor's introspection prose or the renderer's plan summary).
			 * Rendered inside the collapsible BEFORE the sub-tool rows so the
			 * narrative isn't silently dropped.
			 */
			text: string
			/**
			 * Reasoning chunks streamed inside the agent boundary. Currently
			 * accumulated but not rendered — kept on the segment for future
			 * use and to give tests a stable shape.
			 */
			reasoning: string
			started: boolean
			ended: boolean
	  }

/**
 * Dedupe `data-agent-step` parts by `data.toolCallId`, keeping the LATEST
 * emission. The server now emits one `data-agent-step` per lifecycle phase
 * (input-streaming → input-available → approval-requested → output-available)
 * with a unique chunk `id` (Bug B3 fix in `rewrite-renderer-parts.ts`) so the
 * AI SDK can't merge-mutate them. The chat UI only wants ONE visible row per
 * tool call, and that row should reflect the most recent state.
 */
export function dedupeStepsByToolCallId(
	steps: AgentStepPart[],
): AgentStepPart[] {
	const byId = new Map<string, AgentStepPart>()
	for (const step of steps) {
		const id = step.data.toolCallId
		if (!id) continue
		byId.set(id, step)
	}
	return Array.from(byId.values())
}

interface AnyPart {
	type: string
	text?: string
	[key: string]: unknown
}

/**
 * Walks the top-level `parts` of an assistant message and groups them into
 * segments:
 *   - `text`     → consecutive `text` parts concatenated.
 *   - `reasoning`→ single `reasoning` part (each becomes its own segment).
 *   - `agent`    → everything between `data-agent-boundary` start/end
 *                  markers; `data-agent-step` parts inside the run accumulate
 *                  and are then deduped by `toolCallId`.
 *
 * Parts of type `data-spec` are dropped here — the artifact panel handles
 * them via `useJsonRenderMessage` upstream, and they are not rendered inside
 * the message bubble itself.
 *
 * Renderer-internal `tool-*` parts (`tool-createPage`, etc.) are also
 * skipped: they are kept on the message for model-history reconstruction
 * (`convertToModelMessages` on the approval round-trip — Bug B1 fix) but the
 * operator only sees the prettified `data-agent-step` rows.
 *
 * If a `start` boundary never finds its matching `end` (the renderer errored
 * mid-stream), the open segment is closed at end-of-parts with
 * `started: true, ended: false` so the UI can show an "(interrupted)" badge.
 */
export function segmentParts(parts: ReadonlyArray<AnyPart>): Segment[] {
	const segments: Segment[] = []
	let openAgent: Extract<Segment, { kind: 'agent' }> | null = null
	let textRun = ''
	let textRunStartIdx = -1

	const flushText = () => {
		if (textRun) {
			segments.push({
				kind: 'text',
				key: `text-${textRunStartIdx}`,
				text: textRun,
			})
			textRun = ''
			textRunStartIdx = -1
		}
	}

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] as AnyPart
		const type = part?.type

		// Agent boundary: open or close a renderer run.
		if (type === 'data-agent-boundary') {
			const data = (part as unknown as AgentBoundaryPart).data
			if (data?.phase === 'start') {
				flushText()
				if (openAgent) {
					// Nested boundaries shouldn't happen but if they do, close the
					// previous one as interrupted before opening a new one.
					segments.push(openAgent)
					openAgent = null
				}
				openAgent = {
					kind: 'agent',
					key: `agent-${i}-${data.toolCallId ?? data.agent}`,
					agent: data.agent,
					toolCallId: data.toolCallId,
					steps: [],
					text: '',
					reasoning: '',
					started: true,
					ended: false,
				}
				continue
			}
			if (data?.phase === 'end') {
				if (openAgent) {
					openAgent.ended = true
					segments.push(openAgent)
					openAgent = null
				}
				continue
			}
			continue
		}

		// Inside an open agent run, collect steps + narration; ignore other types.
		if (openAgent) {
			if (type === 'data-agent-step') {
				openAgent.steps.push(part as unknown as AgentStepPart)
			} else if (type === 'text') {
				// Boundary markers wrap the entire sub-agent stream, so the
				// renderer's / db-doctor's narrative prose lands HERE. Accumulate
				// it onto the agent segment so the renderer can show it inside the
				// collapsible (above the tool rows). Previously dropped — see Bug
				// in `segmentParts` comment history.
				openAgent.text += part.text ?? ''
			} else if (type === 'reasoning') {
				openAgent.reasoning += part.text ?? ''
			}
			// Skip raw `tool-*` parts (Bug B1 fix): they are preserved on the
			// message for model-history reconstruction but the chat surface only
			// renders the prettified `data-agent-step` rows.
			// `data-spec` is also dropped here — handled by the artifact panel.
			continue
		}

		// Skip raw `tool-*` parts at top level too — same rationale as above.
		// They were kept by `rewriteRendererToolParts` so the next-turn
		// `convertToModelMessages` walker can rebuild the approval-request,
		// not because we want to render them.
		if (typeof type === 'string' && type.startsWith('tool-')) {
			continue
		}

		// Top-level part outside any agent run.
		if (type === 'text') {
			const t = part.text ?? ''
			if (!t) continue
			if (textRunStartIdx === -1) textRunStartIdx = i
			textRun += t
			continue
		}

		if (type === 'reasoning') {
			flushText()
			const t = part.text ?? ''
			segments.push({ kind: 'reasoning', key: `reasoning-${i}`, text: t })
			continue
		}

		// File parts attached to the message (typically user uploads via the
		// prompt input). The AI SDK shapes these as
		// `{ type: 'file', mediaType, filename?, url }` where `url` is either
		// an http(s) URL or a base64 data URL. We emit one segment per file so
		// the renderer can show inline previews (images) or download chips
		// (everything else) before the text that follows.
		if (type === 'file') {
			flushText()
			const url = typeof part.url === 'string' ? part.url : ''
			const mediaType = typeof part.mediaType === 'string' ? part.mediaType : ''
			if (!url || !mediaType) continue
			const filename =
				typeof part.filename === 'string' ? part.filename : undefined
			segments.push({
				kind: 'file',
				key: `file-${i}`,
				mediaType,
				filename,
				url,
			})
		}

		// `data-spec` is dropped intentionally — handled by the artifact panel.
		// Any other unknown part type is ignored.
	}

	flushText()
	// Unmatched start boundary: close it as interrupted.
	if (openAgent) {
		segments.push(openAgent)
	}

	// Dedupe agent steps by `toolCallId` so each tool call renders ONE row
	// reflecting its latest lifecycle state. Without this dedupe the SDK's
	// unique-id append-only emit pattern (Bug B3 fix) would produce 5 visible
	// rows for one tool call across the input-streaming → … → output-available
	// lifecycle.
	for (const seg of segments) {
		if (seg.kind === 'agent' && seg.steps.length > 1) {
			seg.steps = dedupeStepsByToolCallId(seg.steps)
		}
	}

	return segments
}

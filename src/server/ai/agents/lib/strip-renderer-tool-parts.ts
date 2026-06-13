/**
 * Strip renderer-internal `tool-<name>` parts from prior assistant messages
 * before handing the history to the orchestrator `ToolLoopAgent`.
 *
 * Background
 * ----------
 * The renderer sub-agent registers its own toolset (e.g. `createPage`,
 * `createPageQuery`, `createPageComponent`, `createSidebarItem`, …). When its
 * stream is forwarded to the outer message via `rewriteRendererToolParts`,
 * the ORIGINAL `tool-<name>` parts are preserved on the assistant message so
 * the renderer can reconstruct its tool-approval-request lifecycle on the
 * next turn via `convertToModelMessages` (the AI SDK's
 * `lastAssistantMessageIsCompleteWithApprovalResponses` rule).
 *
 * That history is intended for the RENDERER only. The orchestrator's own
 * tool registry just knows `db-doctor` and `ontology-renderer`. If a stray
 * `tool-createPage` appears in the orchestrator's input messages, the AI SDK
 * throws `NoSuchToolError` because the orchestrator can't resolve it.
 *
 * `stripRendererToolParts` walks each assistant `UIMessage` and removes
 * every part whose `type` matches `tool-<rendererInternalName>`. All other
 * parts (text, reasoning, `data-*`, the orchestrator's own `tool-db-doctor`
 * / `tool-ontology-renderer` parts, etc.) pass through untouched.
 *
 * Behaviour:
 *   - Non-assistant messages pass through by reference (no clone).
 *   - Assistant messages whose `parts` array contains zero matches pass
 *     through by reference too.
 *   - Assistant messages with matches are shallow-cloned with a filtered
 *     `parts` array. The original message object is never mutated.
 */
import type { UIMessage } from 'ai'

interface AnyPart {
	type?: string
	[key: string]: unknown
}

/**
 * Remove `tool-<rendererInternalName>` parts from each assistant message.
 *
 * @param messages The full chat-level history sent by the client.
 * @param rendererToolNames Iterable of renderer-internal tool names (the
 *   keys returned by the renderer agent's `tools` property, e.g.
 *   `Object.keys(rendererAgent.tools)`). Each name is matched against the
 *   `type` field as `tool-<name>`.
 * @returns A new `UIMessage[]` with stripped assistant messages. Other
 *   messages are returned by reference.
 */
export function stripRendererToolParts(
	messages: ReadonlyArray<UIMessage>,
	rendererToolNames: Iterable<string>,
): UIMessage[] {
	const blockedTypes = new Set<string>()
	for (const name of rendererToolNames) {
		if (typeof name === 'string' && name.length > 0) {
			blockedTypes.add(`tool-${name}`)
		}
	}

	// Fast path: nothing to strip.
	if (blockedTypes.size === 0) return messages.slice()

	return messages.map((msg) => {
		if (msg.role !== 'assistant') return msg
		const parts = (msg as { parts?: unknown }).parts
		if (!Array.isArray(parts)) return msg

		let mutated = false
		const filtered: AnyPart[] = []
		for (const part of parts as AnyPart[]) {
			const t = part && typeof part === 'object' ? part.type : undefined
			if (typeof t === 'string' && blockedTypes.has(t)) {
				mutated = true
				continue
			}
			filtered.push(part)
		}

		if (!mutated) return msg
		return { ...msg, parts: filtered } as UIMessage
	})
}

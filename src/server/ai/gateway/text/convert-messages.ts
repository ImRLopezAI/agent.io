/**
 * Convert TanStack AI `ModelMessage[]` to an AI SDK `LanguageModelV3Prompt`.
 *
 * Mapping:
 *  - `role:'user'`   → V3 user; text parts + media (`image`/`audio`/`video`/
 *    `document`) → V3 `file` parts.
 *  - `role:'assistant'` → V3 assistant; text + `message.thinking` → reasoning
 *    parts + `message.toolCalls` → V3 `tool-call` parts.
 *  - `role:'tool'`   → V3 tool; `{ toolCallId, content }` → V3 `tool-result`.
 *
 * System prompts are NOT handled here — `ModelMessage.role` has no `'system'`;
 * the system message is prepended from `TextOptions.systemPrompts` in
 * `map-options.ts`.
 */

import type {
	LanguageModelV3FilePart,
	LanguageModelV3Message,
	LanguageModelV3Prompt,
	LanguageModelV3ReasoningPart,
	LanguageModelV3TextPart,
	LanguageModelV3ToolCallPart,
} from '@ai-sdk/provider'
import type { ContentPart, ContentPartSource, ModelMessage } from '@tanstack/ai'

/** Parse tool-call argument JSON; fall back to the raw string the model emitted. */
function safeParseJson(raw: string): unknown {
	try {
		return JSON.parse(raw)
	} catch {
		return raw
	}
}

/** Map a TanStack media source to V3 file `{ data, mediaType }`. */
function sourceToFile(
	source: ContentPartSource,
	partType: string,
): { data: string | URL; mediaType: string } {
	const fallbackType =
		partType === 'image'
			? 'image/*'
			: partType === 'audio'
				? 'audio/*'
				: partType === 'video'
					? 'video/*'
					: 'application/octet-stream'
	if (source.type === 'data') {
		return { data: source.value, mediaType: source.mimeType || fallbackType }
	}
	// url source — value may be an http(s) URL or a data URI
	return {
		data: new URL(source.value),
		mediaType: source.mimeType || fallbackType,
	}
}

type UserContentPart = LanguageModelV3TextPart | LanguageModelV3FilePart

/** Normalize `string | null | ContentPart[]` into V3 text/file parts. */
function contentToParts(
	content: string | null | Array<ContentPart>,
): Array<UserContentPart> {
	if (content == null) return []
	if (typeof content === 'string') {
		return content.length > 0 ? [{ type: 'text', text: content }] : []
	}
	const parts: Array<UserContentPart> = []
	for (const part of content) {
		if (part.type === 'text') {
			parts.push({ type: 'text', text: part.content })
		} else {
			const { data, mediaType } = sourceToFile(part.source, part.type)
			parts.push({ type: 'file', data, mediaType })
		}
	}
	return parts
}

function convertMessage(message: ModelMessage): LanguageModelV3Message {
	if (message.role === 'user') {
		return { role: 'user', content: contentToParts(message.content) }
	}

	if (message.role === 'tool') {
		// A tool-role message carries one tool result keyed by toolCallId.
		const text =
			typeof message.content === 'string'
				? message.content
				: JSON.stringify(message.content)
		return {
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: message.toolCallId ?? '',
					toolName: message.name ?? '',
					output: { type: 'text', value: text },
				},
			],
		}
	}

	// assistant: text/file + reasoning + tool-calls
	const content: Array<
		| LanguageModelV3TextPart
		| LanguageModelV3FilePart
		| LanguageModelV3ReasoningPart
		| LanguageModelV3ToolCallPart
	> = [...contentToParts(message.content)]

	if (message.thinking) {
		for (const t of message.thinking) {
			content.push({ type: 'reasoning', text: t.content })
		}
	}
	if (message.toolCalls) {
		for (const tc of message.toolCalls) {
			content.push({
				type: 'tool-call',
				toolCallId: tc.id,
				toolName: tc.function.name,
				input: safeParseJson(tc.function.arguments),
			})
		}
	}

	return { role: 'assistant', content }
}

/** Convert a full TanStack message array to a V3 prompt (no system message). */
export function convertMessages(
	messages: ReadonlyArray<ModelMessage>,
): LanguageModelV3Prompt {
	return messages.map(convertMessage)
}

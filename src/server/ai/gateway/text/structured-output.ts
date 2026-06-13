/**
 * Non-streaming structured output for the gateway text adapter.
 *
 * Issues a single `doGenerate` with `responseFormat: json` and parses the
 * model's JSON text. `structuredOutputStream` is intentionally NOT implemented
 * — the `@tanstack/ai` engine synthesizes a stream around this call when an
 * adapter omits the streaming variant.
 */

import type {
	LanguageModelV3,
	LanguageModelV3CallOptions,
	LanguageModelV3Content,
} from '@ai-sdk/provider'
import { buildBaseUsage } from '@tanstack/ai'
import type { StructuredOutputResult } from '@tanstack/ai/adapters'
import type { JSONSchema7 } from 'json-schema'

function extractText(content: ReadonlyArray<LanguageModelV3Content>): string {
	let out = ''
	for (const part of content) {
		if (part.type === 'text') out += part.text
	}
	return out
}

export async function generateStructuredOutput(
	model: LanguageModelV3,
	baseOptions: LanguageModelV3CallOptions,
	schema: JSONSchema7,
): Promise<StructuredOutputResult<unknown>> {
	const result = await model.doGenerate({
		...baseOptions,
		responseFormat: { type: 'json', schema },
	})
	const rawText = extractText(result.content)
	const data = JSON.parse(rawText)
	const promptTokens = result.usage.inputTokens.total ?? 0
	const completionTokens = result.usage.outputTokens.total ?? 0
	return {
		data,
		rawText,
		usage: buildBaseUsage({
			promptTokens,
			completionTokens,
			totalTokens: promptTokens + completionTokens,
		}),
	}
}

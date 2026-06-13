/**
 * Convert TanStack AI tools to AI SDK V3 tool specs.
 *
 * Function tools (the common case — e.g. the orchestrator's `db-doctor` /
 * `renderer` routing tools) become V3 `function` tools with their input schema
 * converted to JSON Schema. Tools already shaped as provider-defined tools are
 * passed through as V3 `provider` tools (generic passthrough; refine per
 * provider as needed).
 */

import type {
	LanguageModelV3FunctionTool,
	LanguageModelV3ProviderTool,
} from '@ai-sdk/provider'
import type { AnyTool } from '@tanstack/ai'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { JSONSchema7 } from 'json-schema'

type V3Tool = LanguageModelV3FunctionTool | LanguageModelV3ProviderTool

/** Heuristic: a provider-defined tool carries a dotted `id` like `openai.web_search`. */
function asProviderTool(tool: AnyTool): LanguageModelV3ProviderTool | null {
	const id = (tool as { id?: unknown }).id
	if (typeof id === 'string' && id.includes('.')) {
		return {
			type: 'provider',
			id: id as `${string}.${string}`,
			name: tool.name,
			args: ((tool as { args?: Record<string, unknown> }).args ?? {}) as Record<
				string,
				unknown
			>,
		} as LanguageModelV3ProviderTool
	}
	return null
}

export function convertTools(
	tools: ReadonlyArray<AnyTool> | undefined,
): Array<V3Tool> | undefined {
	if (!tools || tools.length === 0) return undefined
	return tools.map((tool) => {
		const provider = asProviderTool(tool)
		if (provider) return provider
		return {
			type: 'function',
			name: tool.name,
			description: tool.description,
			inputSchema: convertSchemaToJsonSchema(tool.inputSchema) as JSONSchema7,
		}
	})
}

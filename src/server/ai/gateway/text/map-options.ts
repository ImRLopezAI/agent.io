/**
 * Map TanStack AI `TextOptions` to an AI SDK `LanguageModelV3CallOptions`.
 *
 * Assembles the V3 prompt (system message from `systemPrompts` + converted
 * messages), tools, structured-output `responseFormat`, provider options, and
 * threads the abort signal.
 */

import type {
	LanguageModelV3CallOptions,
	LanguageModelV3Prompt,
	SharedV3ProviderOptions,
} from '@ai-sdk/provider'
import type { TextOptions } from '@tanstack/ai'
import { convertSchemaToJsonSchema, normalizeSystemPrompts } from '@tanstack/ai'
import type { JSONSchema7 } from 'json-schema'

import { convertMessages } from './convert-messages'
import { convertTools } from './convert-tools'

export function mapOptions(options: TextOptions): LanguageModelV3CallOptions {
	const prompt: LanguageModelV3Prompt = []

	const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
	if (systemPrompts.length > 0) {
		prompt.push({
			role: 'system',
			content: systemPrompts.map((p) => p.content).join('\n'),
		})
	}
	prompt.push(...convertMessages(options.messages))

	const tools = convertTools(options.tools)

	const callOptions: LanguageModelV3CallOptions = {
		prompt,
		abortSignal: options.abortController?.signal,
		providerOptions: options.modelOptions as
			| SharedV3ProviderOptions
			| undefined,
	}

	if (tools) callOptions.tools = tools

	// `outputSchema` is only populated at the adapter layer when the adapter
	// declared `supportsCombinedToolsAndSchema`; wire it into responseFormat.
	if (options.outputSchema) {
		callOptions.responseFormat = {
			type: 'json',
			schema: convertSchemaToJsonSchema(options.outputSchema) as JSONSchema7,
		}
	}

	return callOptions
}

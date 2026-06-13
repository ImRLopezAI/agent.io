/**
 * Vercel AI Gateway text (chat) adapter for `@tanstack/ai`.
 *
 * Wraps `@ai-sdk/gateway`'s `LanguageModelV3` and bridges it to TanStack AI's
 * AG-UI streaming contract. `chat()` owns the agentic tool loop; this adapter
 * is a faithful single-turn translator (options in, AG-UI events out).
 *
 * @example
 * ```ts
 * import { chat } from '@tanstack/ai'
 * import { gatewayText } from '@server/ai/gateway'
 *
 * for await (const chunk of chat({
 *   adapter: gatewayText('anthropic/claude-haiku-4.5'),
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })) { ... }
 * ```
 */

import type { GatewayModelId } from '@ai-sdk/gateway'
import type {
	DefaultMessageMetadataByModality,
	Modality,
	StreamChunk,
	TextOptions,
} from '@tanstack/ai'
import { EventType } from '@tanstack/ai'
import type {
	StructuredOutputOptions,
	StructuredOutputResult,
} from '@tanstack/ai/adapters'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { createGatewayProvider, type GatewayProviderConfig } from '../provider'
import { mapOptions } from './map-options'
import type { GatewayProviderOptions } from './provider-options'
import { streamToAgui } from './stream-to-agui'
import { generateStructuredOutput } from './structured-output'

/** Gateway model id in `provider/model` form, e.g. `anthropic/claude-haiku-4.5`. */
export type { GatewayModelId, GatewayProviderConfig, GatewayProviderOptions }

export class GatewayTextAdapter<
	TModel extends GatewayModelId = GatewayModelId,
> extends BaseTextAdapter<
	TModel,
	GatewayProviderOptions,
	ReadonlyArray<Modality>,
	DefaultMessageMetadataByModality
> {
	override readonly name = 'gateway'
	private readonly provider: ReturnType<typeof createGatewayProvider>

	constructor(model: TModel, config?: GatewayProviderConfig) {
		super(undefined, model)
		// Assign in the body, NOT via a field initializer — a field initializer
		// runs before constructor-parameter assignment (useDefineForClassFields),
		// so `this.<paramProp>` would be undefined and config would be dropped.
		this.provider = createGatewayProvider(config)
	}

	override async *chatStream(
		options: TextOptions<GatewayProviderOptions>,
	): AsyncGenerator<StreamChunk, void, unknown> {
		const runId = options.runId ?? this.generateId()
		const threadId = options.threadId ?? this.generateId()
		const model = options.model

		let stream: Awaited<
			ReturnType<ReturnType<typeof this.provider.languageModel>['doStream']>
		>['stream']
		try {
			const languageModel = this.provider.languageModel(model)
			const result = await languageModel.doStream(mapOptions(options))
			stream = result.stream
		} catch (error) {
			// doStream can reject before any chunk (auth, model-not-found,
			// network). Map to the AG-UI lifecycle instead of throwing, matching
			// the streaming error path.
			yield {
				type: EventType.RUN_STARTED,
				threadId,
				runId,
				model,
			} satisfies StreamChunk
			yield {
				type: EventType.RUN_ERROR,
				message: error instanceof Error ? error.message : String(error),
				code: (error as { code?: string })?.code,
				model,
			} satisfies StreamChunk
			return
		}

		yield* streamToAgui(stream, {
			runId,
			threadId,
			model,
			generateId: () => this.generateId(),
			abortSignal: options.abortController?.signal,
		})
	}

	override async structuredOutput(
		options: StructuredOutputOptions<GatewayProviderOptions>,
	): Promise<StructuredOutputResult<unknown>> {
		const languageModel = this.provider.languageModel(options.chatOptions.model)
		const baseOptions = mapOptions(options.chatOptions)
		return generateStructuredOutput(
			languageModel,
			baseOptions,
			options.outputSchema as Parameters<typeof generateStructuredOutput>[2],
		)
	}

	supportsCombinedToolsAndSchema(): boolean {
		return false
	}
}

/**
 * Create a gateway text adapter for the given `provider/model` id.
 *
 * @param model  Model id, e.g. `anthropic/claude-haiku-4.5`.
 * @param config Optional gateway config (apiKey, baseURL, headers, fetch).
 *               Defaults to env-first auth (`AI_GATEWAY_API_KEY` → OIDC).
 */
export function gatewayText<TModel extends GatewayModelId>(
	model: TModel,
	config?: GatewayProviderConfig,
): GatewayTextAdapter<TModel> {
	return new GatewayTextAdapter(model, config)
}

import type { ImageModelV3CallOptions } from '@ai-sdk/provider'
import {
	buildBaseUsage,
	type ImageGenerationOptions,
	type ImageGenerationResult,
} from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'

import { createGatewayProvider, type GatewayProviderConfig } from '../provider'

/** Encode raw image bytes to base64 without relying on Node's `Buffer`. */
function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

type GatewayImageProviderOptions = ImageModelV3CallOptions['providerOptions']
type GatewayImageSize = ImageModelV3CallOptions['size']
type GatewayImageAspectRatio = ImageModelV3CallOptions['aspectRatio']

interface GatewayImageModelOptions {
	aspectRatio?: GatewayImageAspectRatio
	seed?: number
	providerOptions?: GatewayImageProviderOptions
	abortSignal?: AbortSignal
	headers?: ImageModelV3CallOptions['headers']
}

const generateId = () => {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID()
	}

	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export class GatewayImageAdapter extends BaseImageAdapter<
	string,
	GatewayImageModelOptions,
	Record<string, GatewayImageModelOptions>,
	Record<string, GatewayImageSize>
> {
	readonly name = 'gateway-image'

	constructor(
		model: string,
		private readonly gatewayConfig?: GatewayProviderConfig,
	) {
		super(model, gatewayConfig)
	}

	async generateImages(
		options: ImageGenerationOptions<GatewayImageModelOptions, GatewayImageSize>,
	): Promise<ImageGenerationResult> {
		const provider = createGatewayProvider(this.gatewayConfig)
		const model = options.model ?? this.model
		const imageModel = provider.imageModel(model)
		const modelOptions = options.modelOptions ?? {}

		options.logger.request('Generating image with gateway provider', {
			model,
			numberOfImages: options.numberOfImages,
			size: options.size,
		})

		try {
			const result = await imageModel.doGenerate({
				prompt: options.prompt,
				n: options.numberOfImages ?? 1,
				size: options.size,
				aspectRatio: modelOptions.aspectRatio,
				seed: modelOptions.seed,
				files: undefined,
				mask: undefined,
				providerOptions: modelOptions.providerOptions ?? {},
				abortSignal: modelOptions.abortSignal,
				headers: modelOptions.headers,
			})

			const usage =
				typeof result.usage?.inputTokens === 'number' &&
				typeof result.usage.outputTokens === 'number' &&
				typeof result.usage.totalTokens === 'number'
					? buildBaseUsage({
							promptTokens: result.usage.inputTokens,
							completionTokens: result.usage.outputTokens,
							totalTokens: result.usage.totalTokens,
						})
					: undefined

			return {
				id: generateId(),
				model,
				images: result.images.map((image) => ({
					b64Json: typeof image === 'string' ? image : bytesToBase64(image),
				})),
				...(usage ? { usage } : {}),
			}
		} catch (error) {
			options.logger.errors('Gateway image generation failed', { error })
			throw error
		}
	}
}

export function gatewayImage(
	model: string,
	config?: GatewayProviderConfig,
): GatewayImageAdapter {
	return new GatewayImageAdapter(model, config)
}

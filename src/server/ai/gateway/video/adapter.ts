/**
 * Experimental Vercel AI Gateway video adapter for TanStack AI.
 *
 * TanStack's video activity is shaped around create/status/url job polling,
 * while the AI SDK Gateway video model currently exposes one-shot doGenerate().
 * This bridge treats each one-shot generation as an already-completed job and
 * keeps the resolved video URL in a process-local cache for follow-up polling.
 */

import type {
	Experimental_VideoModelV3,
	Experimental_VideoModelV3CallOptions,
	Experimental_VideoModelV3VideoData,
	SharedV3ProviderOptions,
} from '@ai-sdk/provider'
import type {
	VideoGenerationOptions,
	VideoJobResult,
	VideoStatusResult,
	VideoUrlResult,
} from '@tanstack/ai'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'

import { createGatewayProvider, type GatewayProviderConfig } from '../provider'

type JobCacheEntry =
	| {
			status: 'completed'
			url: string
			error?: never
	  }
	| {
			status: 'failed'
			url?: never
			error: string
	  }

const videoJobs = new Map<string, JobCacheEntry>()
let jobCounter = 0

export class GatewayVideoAdapter extends BaseVideoAdapter {
	readonly kind = 'video'
	readonly name: string

	constructor(
		private readonly gatewayConfig: GatewayProviderConfig | undefined,
		model: string,
	) {
		super(gatewayConfig, model)
		this.name = model
	}

	async createVideoJob(
		options: VideoGenerationOptions,
	): Promise<VideoJobResult> {
		const jobId = createJobId()
		const videoModel = this.getVideoModel()
		const callOptions = toVideoCallOptions(options)

		options.logger.request('gateway video generation request', {
			model: this.model,
			prompt: options.prompt,
			size: options.size,
			duration: options.duration,
		})

		try {
			const result = await videoModel.doGenerate(callOptions)
			const video = result.videos[0]

			if (!video) {
				throw new Error('gateway video generation returned no videos')
			}

			videoJobs.set(jobId, {
				status: 'completed',
				url: videoToUrl(video),
			})
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'gateway video generation failed'

			videoJobs.set(jobId, {
				status: 'failed',
				error: message,
			})
			options.logger.errors('gateway video generation failed', {
				model: this.model,
				error: message,
			})
			throw error
		}

		return {
			jobId,
			model: this.model,
		}
	}

	async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
		const job = videoJobs.get(jobId)

		if (!job) {
			return {
				jobId,
				status: 'failed',
				error: 'unknown job',
			}
		}

		if (job.status === 'failed') {
			return {
				jobId,
				status: 'failed',
				error: job.error,
			}
		}

		return {
			jobId,
			status: 'completed',
		}
	}

	async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
		const job = videoJobs.get(jobId)

		if (!job || job.status !== 'completed') {
			throw new Error(job?.error ?? 'unknown job')
		}

		return {
			jobId,
			url: job.url,
		}
	}

	private getVideoModel(): Experimental_VideoModelV3 {
		const provider = createGatewayProvider(this.gatewayConfig)

		return provider.videoModel(
			this.model as Parameters<typeof provider.videoModel>[0],
		)
	}
}

export function gatewayVideo(
	model: string,
	config?: GatewayProviderConfig,
): GatewayVideoAdapter {
	return new GatewayVideoAdapter(config, model)
}

function createJobId(): string {
	jobCounter += 1

	return `gateway-video-${jobCounter}-${crypto.randomUUID()}`
}

function toVideoCallOptions(
	options: VideoGenerationOptions,
): Experimental_VideoModelV3CallOptions {
	const { aspectRatio, resolution } = parseSize(options.size)

	return {
		prompt: options.prompt,
		n: 1,
		aspectRatio,
		resolution,
		duration: options.duration,
		fps: undefined,
		seed: undefined,
		image: undefined,
		providerOptions:
			(options.modelOptions as SharedV3ProviderOptions | undefined) ?? {},
	}
}

function parseSize(size: string | undefined): {
	aspectRatio: Experimental_VideoModelV3CallOptions['aspectRatio']
	resolution: Experimental_VideoModelV3CallOptions['resolution']
} {
	if (!size) {
		return {
			aspectRatio: undefined,
			resolution: undefined,
		}
	}

	if (/^\d+:\d+$/.test(size)) {
		return {
			aspectRatio: size as Experimental_VideoModelV3CallOptions['aspectRatio'],
			resolution: undefined,
		}
	}

	if (/^\d+x\d+$/.test(size)) {
		return {
			aspectRatio: undefined,
			resolution: size as Experimental_VideoModelV3CallOptions['resolution'],
		}
	}

	return {
		aspectRatio: undefined,
		resolution: undefined,
	}
}

function videoToUrl(video: Experimental_VideoModelV3VideoData): string {
	if (video.type === 'url') {
		return video.url
	}

	if (video.type === 'base64') {
		return `data:${video.mediaType};base64,${video.data}`
	}

	return `data:${video.mediaType};base64,${bytesToBase64(video.data)}`
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''

	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}

	return btoa(binary)
}

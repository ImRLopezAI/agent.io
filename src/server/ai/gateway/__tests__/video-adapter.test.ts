import type { VideoGenerationOptions } from '@tanstack/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { gatewayVideo } from '../video/adapter'

const mocks = vi.hoisted(() => ({
	doGenerate: vi.fn(),
	videoModel: vi.fn(),
}))

vi.mock('../provider', () => ({
	createGatewayProvider: vi.fn(() => ({
		videoModel: mocks.videoModel,
	})),
}))

const logger = {
	request: vi.fn(),
	errors: vi.fn(),
}

function videoOptions(
	overrides: Partial<VideoGenerationOptions> = {},
): VideoGenerationOptions {
	return {
		model: 'fal/video-model',
		prompt: 'A city skyline at sunset',
		logger: logger as unknown as VideoGenerationOptions['logger'],
		...overrides,
	}
}

describe('GatewayVideoAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.videoModel.mockReturnValue({
			doGenerate: mocks.doGenerate,
		})
		mocks.doGenerate.mockResolvedValue({
			videos: [
				{
					type: 'url',
					url: 'https://example.com/video.mp4',
					mediaType: 'video/mp4',
				},
			],
			warnings: [],
			response: {
				timestamp: new Date('2026-06-13T00:00:00.000Z'),
				modelId: 'fal/video-model',
				headers: undefined,
			},
		})
	})

	it('creates a completed video job for the configured model', async () => {
		const adapter = gatewayVideo('fal/video-model')

		const result = await adapter.createVideoJob(videoOptions())

		expect(result).toEqual({
			jobId: expect.stringMatching(/^gateway-video-\d+-/),
			model: 'fal/video-model',
		})
		expect(mocks.videoModel).toHaveBeenCalledWith('fal/video-model')
		expect(mocks.doGenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'A city skyline at sunset',
				n: 1,
				providerOptions: {},
			}),
		)
	})

	it('returns completed status for a generated job', async () => {
		const adapter = gatewayVideo('fal/video-model')
		const { jobId } = await adapter.createVideoJob(videoOptions())

		await expect(adapter.getVideoStatus(jobId)).resolves.toEqual({
			jobId,
			status: 'completed',
		})
	})

	it('returns a video URL for a generated job', async () => {
		const adapter = gatewayVideo('fal/video-model')
		const { jobId } = await adapter.createVideoJob(videoOptions())

		await expect(adapter.getVideoUrl(jobId)).resolves.toEqual({
			jobId,
			url: expect.any(String),
		})
	})

	it('returns failed status for an unknown job', async () => {
		const adapter = gatewayVideo('fal/video-model')

		await expect(adapter.getVideoStatus('missing-job')).resolves.toEqual({
			jobId: 'missing-job',
			status: 'failed',
			error: 'unknown job',
		})
	})

	it('rejects and stores failed status when generation fails', async () => {
		const adapter = gatewayVideo('fal/video-model')
		mocks.doGenerate.mockRejectedValueOnce(new Error('provider unavailable'))

		await expect(adapter.createVideoJob(videoOptions())).rejects.toThrow(
			'provider unavailable',
		)

		await expect(
			adapter.getVideoStatus('missing-after-failure'),
		).resolves.toEqual({
			jobId: 'missing-after-failure',
			status: 'failed',
			error: 'unknown job',
		})
		expect(logger.errors).toHaveBeenCalledWith(
			'gateway video generation failed',
			expect.objectContaining({
				error: 'provider unavailable',
			}),
		)
	})
})

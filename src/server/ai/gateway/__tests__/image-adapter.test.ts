import type { ImageModelV3CallOptions } from '@ai-sdk/provider'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GatewayImageAdapter } from '../image/adapter'
import { createGatewayProvider } from '../provider'

vi.mock('../provider', () => ({
	createGatewayProvider: vi.fn(),
}))

const doGenerate = vi.fn()

const logger = {
	request: vi.fn(),
	errors: vi.fn(),
}

const mockedCreateGatewayProvider = vi.mocked(createGatewayProvider)

type GatewayImageOptions = Parameters<GatewayImageAdapter['generateImages']>[0]

const imageOptions = (
	overrides: Partial<GatewayImageOptions> = {},
): GatewayImageOptions =>
	({
		model: 'gateway-model',
		prompt: 'a generated image',
		logger,
		...overrides,
	}) as GatewayImageOptions

describe('GatewayImageAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		doGenerate.mockResolvedValue({
			images: ['base64encodedstring'],
			warnings: [],
		})
		mockedCreateGatewayProvider.mockReturnValue({
			imageModel: vi.fn(() => ({
				doGenerate,
			})),
		} as unknown as ReturnType<typeof createGatewayProvider>)
	})

	it('returns generated base64 images with id and model', async () => {
		const adapter = new GatewayImageAdapter('default-model')

		const result = await adapter.generateImages(imageOptions())

		expect(result.id).toEqual(expect.any(String))
		expect(result.model).toBe('gateway-model')
		expect(result.images[0]?.b64Json).toBe('base64encodedstring')
	})

	it('forwards size and numberOfImages into doGenerate', async () => {
		const adapter = new GatewayImageAdapter('default-model')

		await adapter.generateImages(
			imageOptions({
				numberOfImages: 3,
				size: '1024x1024',
			}),
		)

		expect(doGenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				n: 3,
				size: '1024x1024',
			}) satisfies Partial<ImageModelV3CallOptions>,
		)
	})

	it('rejects with the original doGenerate error', async () => {
		const adapter = new GatewayImageAdapter('default-model')
		const error = new Error('generation failed')
		doGenerate.mockRejectedValueOnce(error)

		await expect(adapter.generateImages(imageOptions())).rejects.toBe(error)
	})
})

import { describe, expect, it, vi } from 'vitest'

const createGatewayProvider = vi.fn(() => ({ languageModel: () => ({}) }))
vi.mock('../provider', () => ({ createGatewayProvider }))
const { gatewayText } = await import('../text/adapter')
describe('config passthrough (init-order)', () => {
	it('passes config to createGatewayProvider', () => {
		createGatewayProvider.mockClear()
		gatewayText('anthropic/x' as `${string}/${string}`, { apiKey: 'SECRET' })
		expect(createGatewayProvider).toHaveBeenCalledWith({ apiKey: 'SECRET' })
	})
})

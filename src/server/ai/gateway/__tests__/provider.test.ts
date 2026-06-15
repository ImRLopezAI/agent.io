import { describe, expect, it } from 'vite-plus/test'

import { createGatewayProvider } from '../provider'

describe('createGatewayProvider', () => {
	it('no config -> usable provider (env-first singleton)', () => {
		const provider = createGatewayProvider()
		expect(typeof provider.languageModel).toBe('function')
	})

	it('config -> a distinct configured provider', () => {
		const singleton = createGatewayProvider()
		const configured = createGatewayProvider({ apiKey: 'test-key' })
		expect(typeof configured.languageModel).toBe('function')
		expect(configured).not.toBe(singleton)
	})

	it('empty config object falls back to the singleton', () => {
		expect(createGatewayProvider({})).toBe(createGatewayProvider())
	})
})

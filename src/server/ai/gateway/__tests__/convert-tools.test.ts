import type { AnyTool } from '@tanstack/ai'
import { describe, expect, it } from 'vite-plus/test'

import { convertTools } from '../text/convert-tools'

const fnTool = {
	name: 'get_weather',
	description: 'Get weather',
	inputSchema: {
		type: 'object',
		properties: { city: { type: 'string' } },
		required: ['city'],
	},
} as unknown as AnyTool

describe('convertTools', () => {
	it('function tool -> V3 function tool with JSON-schema input', () => {
		const out = convertTools([fnTool])
		expect(out).toHaveLength(1)
		expect(out![0]).toMatchObject({
			type: 'function',
			name: 'get_weather',
			description: 'Get weather',
		})
		expect(
			(out![0] as { inputSchema: { type: string } }).inputSchema.type,
		).toBe('object')
	})

	it('no tools -> undefined (not empty array)', () => {
		expect(convertTools(undefined)).toBeUndefined()
		expect(convertTools([])).toBeUndefined()
	})

	it('dotted-id tool -> V3 provider tool passthrough', () => {
		const providerTool = {
			name: 'web_search',
			description: '',
			inputSchema: {},
			id: 'openai.web_search',
			args: { maxResults: 3 },
		} as unknown as AnyTool
		const [out] = convertTools([providerTool])!
		expect(out).toMatchObject({
			type: 'provider',
			id: 'openai.web_search',
			name: 'web_search',
		})
	})
})

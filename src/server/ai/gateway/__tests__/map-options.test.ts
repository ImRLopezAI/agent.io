import type { TextOptions } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { mapOptions } from '../text/map-options'

function baseOptions(over: Partial<TextOptions> = {}): TextOptions {
	return {
		model: 'anthropic/claude-haiku-4.5',
		messages: [{ role: 'user', content: 'hi' }],
		...over,
	} as TextOptions
}

describe('mapOptions', () => {
	it('prepends a system message from systemPrompts', () => {
		const out = mapOptions(baseOptions({ systemPrompts: ['be brief'] }))
		expect(out.prompt[0]).toEqual({ role: 'system', content: 'be brief' })
		expect(out.prompt[1]).toMatchObject({ role: 'user' })
	})

	it('no system prompt -> first prompt entry is the user message', () => {
		const out = mapOptions(baseOptions())
		expect(out.prompt[0]).toMatchObject({ role: 'user' })
	})

	it('modelOptions pass through as providerOptions', () => {
		const out = mapOptions(
			baseOptions({
				modelOptions: { anthropic: { thinking: { type: 'enabled' } } },
			} as Partial<TextOptions>),
		)
		expect(out.providerOptions).toEqual({
			anthropic: { thinking: { type: 'enabled' } },
		})
	})

	it('no tools -> tools field omitted', () => {
		const out = mapOptions(baseOptions())
		expect('tools' in out).toBe(false)
	})

	it('outputSchema -> responseFormat json', () => {
		const out = mapOptions(
			baseOptions({
				outputSchema: { type: 'object', properties: {} },
			} as Partial<TextOptions>),
		)
		expect(out.responseFormat).toMatchObject({ type: 'json' })
	})

	it('abortController signal forwarded', () => {
		const abortController = new AbortController()
		const out = mapOptions(baseOptions({ abortController }))
		expect(out.abortSignal).toBe(abortController.signal)
	})
})

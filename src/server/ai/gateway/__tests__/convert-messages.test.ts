import type { ModelMessage } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { convertMessages } from '../text/convert-messages'

describe('convertMessages', () => {
	it('user string content -> single V3 text part', () => {
		const out = convertMessages([{ role: 'user', content: 'hi' }])
		expect(out).toEqual([
			{ role: 'user', content: [{ type: 'text', text: 'hi' }] },
		])
	})

	it('user text + image (data source) -> text + file part', () => {
		const msg: ModelMessage = {
			role: 'user',
			content: [
				{ type: 'text', content: 'look' },
				{
					type: 'image',
					source: { type: 'data', value: 'BASE64', mimeType: 'image/png' },
				},
			],
		}
		const [user] = convertMessages([msg])
		expect(user.content).toEqual([
			{ type: 'text', text: 'look' },
			{ type: 'file', data: 'BASE64', mediaType: 'image/png' },
		])
	})

	it('assistant with thinking + toolCalls -> reasoning + tool-call parts', () => {
		const msg: ModelMessage = {
			role: 'assistant',
			content: 'done',
			thinking: [{ content: 'pondering' }],
			toolCalls: [
				{
					id: 'tc1',
					type: 'function',
					function: { name: 'search', arguments: '{"q":"x"}' },
				},
			],
		}
		const [a] = convertMessages([msg])
		expect(a).toEqual({
			role: 'assistant',
			content: [
				{ type: 'text', text: 'done' },
				{ type: 'reasoning', text: 'pondering' },
				{
					type: 'tool-call',
					toolCallId: 'tc1',
					toolName: 'search',
					input: { q: 'x' },
				},
			],
		})
	})

	it('tool role message -> V3 tool-result part', () => {
		const msg: ModelMessage = {
			role: 'tool',
			toolCallId: 'tc1',
			name: 'search',
			content: 'result text',
		}
		const [t] = convertMessages([msg])
		expect(t).toEqual({
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: 'tc1',
					toolName: 'search',
					output: { type: 'text', value: 'result text' },
				},
			],
		})
	})

	it('tool-call/result transcript round-trips (loop re-entry)', () => {
		const out = convertMessages([
			{ role: 'user', content: 'q' },
			{
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: 'tc1',
						type: 'function',
						function: { name: 'f', arguments: '{}' },
					},
				],
			},
			{ role: 'tool', toolCallId: 'tc1', name: 'f', content: 'ok' },
		])
		expect(out).toHaveLength(3)
		expect(out[1].role).toBe('assistant')
		expect(out[2].role).toBe('tool')
	})

	it('null/empty content does not crash', () => {
		const out = convertMessages([{ role: 'user', content: null }])
		expect(out).toEqual([{ role: 'user', content: [] }])
	})

	it('malformed tool-call arguments fall back to raw string', () => {
		const [a] = convertMessages([
			{
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: 't',
						type: 'function',
						function: { name: 'f', arguments: 'not json' },
					},
				],
			},
		])
		expect((a.content as Array<{ input: unknown }>)[0].input).toBe('not json')
	})
})

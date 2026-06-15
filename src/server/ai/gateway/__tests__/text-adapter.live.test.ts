// @vitest-environment node
/// <reference types="node" />
/**
 * Real end-to-end tests against the live Vercel AI Gateway.
 *
 * Runs for real when `AI_GATEWAY_API_KEY` is present (it is, in `.env.local`),
 * and skips cleanly in CI without the secret. Not a mock — proves the adapter
 * actually streams and tool-calls through the gateway.
 */
import { readFileSync } from 'node:fs'

import { chat, EventType, toolDefinition } from '@tanstack/ai'
import { describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'

import { gatewayText } from '../text/adapter'

// vitest doesn't load .env.local into process.env; @ai-sdk/gateway reads it.
// Load at module top-level (before the skip gate is evaluated).
if (!process.env.AI_GATEWAY_API_KEY) {
	try {
		for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
			const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
			if (m && !process.env[m[1]]) {
				process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
			}
		}
	} catch {
		/* no .env.local — tests will skip */
	}
}

const hasKey = Boolean(process.env.AI_GATEWAY_API_KEY)
const MODEL = 'anthropic/claude-haiku-4.5' as const

describe.skipIf(!hasKey)('GatewayTextAdapter (live gateway)', () => {
	it('real streaming turn yields text + RUN_FINISHED with usage', async () => {
		let text = ''
		let finishedUsage: { totalTokens?: number } | undefined
		for await (const e of chat({
			adapter: gatewayText(MODEL),
			messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
		})) {
			if (e.type === EventType.TEXT_MESSAGE_CONTENT)
				text += (e as { delta: string }).delta
			if (e.type === EventType.RUN_FINISHED)
				finishedUsage = (e as { usage?: { totalTokens?: number } }).usage
			if (e.type === EventType.RUN_ERROR)
				throw new Error(`RUN_ERROR: ${JSON.stringify(e)}`)
		}
		expect(text.length).toBeGreaterThan(0)
		expect(finishedUsage?.totalTokens).toBeGreaterThan(0)
	}, 30_000)

	it('real tool turn emits TOOL_CALL_* and completes the loop', async () => {
		const addTool = toolDefinition({
			name: 'add',
			description: 'Add two integers. Always use this for arithmetic.',
			inputSchema: z.object({ a: z.number(), b: z.number() }),
		}).server(async ({ a, b }) => ({ sum: a + b }))

		const types: Array<EventType> = []
		for await (const e of chat({
			adapter: gatewayText(MODEL),
			tools: [addTool],
			messages: [
				{
					role: 'user',
					content:
						'Use the add tool to compute 2 + 3, then tell me the result.',
				},
			],
		})) {
			types.push(e.type)
			if (e.type === EventType.RUN_ERROR)
				throw new Error(`RUN_ERROR: ${JSON.stringify(e)}`)
		}
		expect(types).toContain(EventType.TOOL_CALL_START)
		expect(types).toContain(EventType.TOOL_CALL_END)
	}, 45_000)

	it('invalid model id surfaces RUN_ERROR (real gateway error mapping)', async () => {
		let sawError = false
		for await (const e of chat({
			adapter: gatewayText('anthropic/not-a-real-model-xyz'),
			messages: [{ role: 'user', content: 'hi' }],
		})) {
			if (e.type === EventType.RUN_ERROR) sawError = true
		}
		expect(sawError).toBe(true)
	}, 30_000)
})

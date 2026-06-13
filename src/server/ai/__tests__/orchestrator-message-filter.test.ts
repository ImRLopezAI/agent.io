import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { stripRendererToolParts } from '../agents/strip-renderer-tool-parts'

/* ─── Helpers ──────────────────────────────────────────────────────────── */

interface AnyPart {
	type: string
	[key: string]: unknown
}

const userMessage = (text: string): UIMessage =>
	({
		id: `u-${text.slice(0, 8)}`,
		role: 'user',
		parts: [{ type: 'text', text }],
	}) as unknown as UIMessage

const assistantMessage = (parts: AnyPart[]): UIMessage =>
	({
		id: `a-${Math.random().toString(36).slice(2, 8)}`,
		role: 'assistant',
		parts,
	}) as unknown as UIMessage

const partsOf = (msg: UIMessage): AnyPart[] =>
	((msg as { parts?: unknown }).parts as AnyPart[]) ?? []

/* ─── Tests ────────────────────────────────────────────────────────────── */

describe('stripRendererToolParts', () => {
	it('removes tool-<rendererInternalName> parts from assistant messages', () => {
		const messages: UIMessage[] = [
			userMessage('Generate a clients list page'),
			assistantMessage([
				{ type: 'text', text: 'Working on it.' },
				{
					type: 'tool-createPage',
					toolCallId: 'tc1',
					state: 'output-available',
				},
				{
					type: 'tool-db-doctor',
					toolCallId: 'tc2',
					state: 'output-available',
				},
				{ type: 'data-agent-step', id: 's1', data: {} },
			]),
		]

		const filtered = stripRendererToolParts(messages, [
			'createPage',
			'createPageQuery',
		])

		expect(filtered).toHaveLength(2)
		// User message passes through by reference.
		expect(filtered[0]).toBe(messages[0])

		// Assistant message has the renderer-internal `tool-createPage` stripped
		// but keeps `tool-db-doctor` (orchestrator tool) and other parts.
		const assistantParts = partsOf(filtered[1]!)
		const types = assistantParts.map((p) => p.type)
		expect(types).toEqual(['text', 'tool-db-doctor', 'data-agent-step'])
	})

	it('returns the assistant message by reference if no parts match', () => {
		const messages: UIMessage[] = [
			userMessage('hello'),
			assistantMessage([
				{ type: 'text', text: 'hi' },
				{ type: 'tool-db-doctor', toolCallId: 'tc1' },
			]),
		]

		const filtered = stripRendererToolParts(messages, ['createPage'])
		expect(filtered[1]).toBe(messages[1])
	})

	it('does not mutate the original messages', () => {
		const originalParts: AnyPart[] = [
			{ type: 'text', text: 'a' },
			{ type: 'tool-createPage', toolCallId: 'tc1' },
		]
		const messages: UIMessage[] = [assistantMessage(originalParts)]

		const filtered = stripRendererToolParts(messages, ['createPage'])

		// Original assistant message untouched.
		expect(partsOf(messages[0]!)).toHaveLength(2)
		expect(partsOf(messages[0]!).map((p) => p.type)).toContain(
			'tool-createPage',
		)
		// Filtered message has the part removed.
		expect(partsOf(filtered[0]!).map((p) => p.type)).not.toContain(
			'tool-createPage',
		)
	})

	it('only inspects assistant messages — leaves user/system messages by reference', () => {
		const userMsg = userMessage('hi')
		const systemMsg = {
			id: 'sys-1',
			role: 'system',
			parts: [{ type: 'tool-createPage', toolCallId: 'tcX' }],
		} as unknown as UIMessage
		const messages: UIMessage[] = [userMsg, systemMsg]

		const filtered = stripRendererToolParts(messages, ['createPage'])
		expect(filtered[0]).toBe(userMsg)
		// Non-assistant role passes through verbatim even when a banned part
		// type happens to be present.
		expect(filtered[1]).toBe(systemMsg)
	})

	it('matches multiple renderer-tool names in one pass', () => {
		const messages: UIMessage[] = [
			assistantMessage([
				{ type: 'tool-createPage' },
				{ type: 'tool-createPageQuery' },
				{ type: 'tool-createPageComponent' },
				{ type: 'tool-db-doctor' },
				{ type: 'text', text: 'done' },
			]),
		]

		const filtered = stripRendererToolParts(messages, [
			'createPage',
			'createPageQuery',
			'createPageComponent',
		])

		const types = partsOf(filtered[0]!).map((p) => p.type)
		expect(types).toEqual(['tool-db-doctor', 'text'])
	})

	it('returns an empty list of names through unchanged (defensive)', () => {
		const messages: UIMessage[] = [
			assistantMessage([{ type: 'tool-createPage' }]),
		]
		const filtered = stripRendererToolParts(messages, [])
		// No names → nothing to strip. Each message passes by reference.
		expect(filtered).toHaveLength(messages.length)
		expect(filtered[0]).toBe(messages[0])
	})
})

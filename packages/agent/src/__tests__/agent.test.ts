import type { ProcedureSnapshot } from '@agent.io/domain/schemas'
import { describe, expect, test } from 'vite-plus/test'

import {
	compileProcedures,
	configHash,
	effectiveToolkits,
	evaluateExpression,
	EventNormalizer,
	expand,
	type McpConnectionRow,
	OpenAIDialectProvider,
	OPENAI,
	resolveComposioEntry,
	TranscriptRecorder,
	XAI,
	type CallControl,
	type ConvexIngest,
	type NormalizedEvent,
	type ResolvedAgentVersion,
} from '../index'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const noopControl: CallControl = {
	hangup: async () => {},
	transfer: async () => {},
	playDtmf: async () => {},
	markVoicemail: async () => {},
	skipTurn: async () => {},
	detectLanguage: async () => {},
	transferToAgent: async () => {},
}

const mkIngest = () => {
	const calls: { kind: string; args: unknown }[] = []
	let sequence = 0
	const ingest: ConvexIngest = {
		start: async (args) => {
			calls.push({ kind: 'start', args })
			return 'conv_1'
		},
		append: async (args) => {
			calls.push({ kind: 'append', args })
			sequence += 1
			return { sequence }
		},
		finish: async (args) => {
			calls.push({ kind: 'finish', args })
		},
		searchKnowledgeBase: async () => [
			{ text: 'SKU-1 costs $5', score: 0.91, documentId: 'doc1' },
		],
	}
	return { ingest, calls }
}

const connection = (
	over: Partial<McpConnectionRow> = {},
): McpConnectionRow => ({
	_id: 'conn_1',
	kind: 'composio',
	name: 'Composio',
	status: 'active',
	toolkitSlugs: ['gmail', 'hubspot', 'slack', 'notion', 'airtable'],
	approvalPolicy: 'require_approval_all',
	...over,
})

const mkComposio = () => {
	const creates: unknown[] = []
	const uses: string[] = []
	const client = {
		create: async (userId: string, options: unknown) => {
			creates.push({ userId, options })
			return {
				id: `sess_${creates.length}`,
				mcp: { url: 'https://mcp.composio.dev/s/abc', headers: { 'x-k': 'v' } },
			}
		},
		use: async (sessionId: string) => {
			uses.push(sessionId)
			return {
				id: sessionId,
				mcp: { url: 'https://mcp.composio.dev/s/abc', headers: { 'x-k': 'v' } },
			}
		},
	}
	const cache = new Map<string, string>()
	const sessionCache = {
		get: async (k: {
			tenant: string
			connectionId: string
			configHash: string
		}) => cache.get(`${k.tenant}:${k.connectionId}:${k.configHash}`) ?? null,
		put: async (k: {
			tenant: string
			connectionId: string
			configHash: string
			sessionId: string
		}) => {
			cache.set(`${k.tenant}:${k.connectionId}:${k.configHash}`, k.sessionId)
		},
	}
	return { client, sessionCache, creates, uses }
}

// ---------------------------------------------------------------------------
// EventNormalizer — both dialects
// ---------------------------------------------------------------------------

describe('EventNormalizer', () => {
	const core: [Record<string, unknown>, NormalizedEvent['type']][] = [
		[{ type: 'session.created' }, 'session.ready'],
		[{ type: 'input_audio_buffer.speech_started' }, 'user.speech_started'],
		[
			{
				type: 'conversation.item.input_audio_transcription.completed',
				transcript: 'hi',
			},
			'user.transcript',
		],
		[{ type: 'response.output_audio.delta', delta: 'AAA=' }, 'agent.audio'],
		[
			{ type: 'response.done', response: { id: 'r1', status: 'completed' } },
			'agent.response_done',
		],
		[
			{
				type: 'response.function_call_arguments.done',
				call_id: 'c1',
				name: 'end_call',
				arguments: '{}',
			},
			'tool.call',
		],
		[{ type: 'input_audio_buffer.dtmf_event_received', digits: '1' }, 'dtmf'],
		[{ type: 'input_audio_buffer.timeout_triggered' }, 'idle_timeout'],
		[{ type: 'error', error: { code: 'x', message: 'boom' } }, 'error'],
	]

	test('core event set normalizes identically on both dialects', () => {
		for (const quirks of [OPENAI.quirks, XAI.quirks]) {
			const normalizer = new EventNormalizer(quirks)
			for (const [raw, expected] of core) {
				expect(normalizer.toNormalized(raw)?.type).toBe(expected)
			}
		}
	})

	test('xAI response.text.delta alias and GA form normalize identically', () => {
		const xai = new EventNormalizer(XAI.quirks)
		const alias = xai.toNormalized({
			type: 'response.text.delta',
			delta: 'hel',
			item_id: 'i1',
		})
		const ga = xai.toNormalized({
			type: 'response.output_text.delta',
			delta: 'hel',
			item_id: 'i1',
		})
		expect(alias).toEqual(ga)
		expect(alias?.type).toBe('agent.transcript')
	})

	test('unknown events drop to null, never throw', () => {
		const normalizer = new EventNormalizer(OPENAI.quirks)
		expect(normalizer.toNormalized({ type: 'rate_limits.updated' })).toBeNull()
		expect(normalizer.toNormalized({})).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Provider config mapping + capabilities
// ---------------------------------------------------------------------------

describe('OpenAIDialectProvider', () => {
	const baseCfg = {
		model: { provider: 'xai' as const, model: 'grok-voice-latest' },
		instructions: 'hi',
		voice: 'ara',
		vad: { mode: 'semantic_vad' as const, eagerness: 'high' as const },
		tools: [],
		mcpTools: [],
		audio: {
			input: { format: 'g711_ulaw' as const, transcription: true },
			output: { format: 'g711_ulaw' as const },
		},
		warnings: [],
	}

	test('semantic_vad downgrades to server_vad on xAI', () => {
		const provider = new OpenAIDialectProvider(XAI, 'key')
		const config = provider.toSessionConfig(baseCfg) as {
			audio: { input: { turnDetection: { type: string } } }
		}
		expect(config.audio.input.turnDetection.type).toBe('server_vad')
	})

	test('semantic_vad passes through on OpenAI', () => {
		const provider = new OpenAIDialectProvider(OPENAI, 'key')
		const config = provider.toSessionConfig(baseCfg) as {
			audio: { input: { turnDetection: { type: string } } }
		}
		expect(config.audio.input.turnDetection.type).toBe('semantic_vad')
	})

	test('capabilities reflect the quirk table', () => {
		const openai = new OpenAIDialectProvider(OPENAI, 'k').capabilities
		const xai = new OpenAIDialectProvider(XAI, 'k').capabilities
		expect(openai.webrtc).toBe(true)
		expect(openai.inputSampleRates).toEqual([24000])
		expect(openai.maxClientSecretTtlSecs).toBe(7200)
		expect(xai.webrtc).toBe(false)
		expect(xai.semanticVad).toBe(false)
		expect(xai.maxClientSecretTtlSecs).toBe(3600)
	})
})

// ---------------------------------------------------------------------------
// Composio scoping (R6)
// ---------------------------------------------------------------------------

describe('composio scoping', () => {
	test('agent subset intersects connection toolkits; governance wins', () => {
		const { toolkits, dropped } = effectiveToolkits(
			{
				connectionId: 'conn_1',
				toolkits: { enable: ['gmail', 'hubspot', 'jira'] },
			},
			connection(),
		)
		expect(toolkits).toEqual(['gmail', 'hubspot'])
		expect(dropped).toEqual(['jira'])
	})

	test('two agents, different subsets, same connection → different sessions', async () => {
		const { client, sessionCache, creates } = mkComposio()
		const warnings: string[] = []
		const a = await resolveComposioEntry({
			tenant: 'org_1',
			scope: {
				connectionId: 'conn_1',
				toolkits: { enable: ['gmail', 'hubspot'] },
			},
			connection: connection(),
			client,
			cache: sessionCache,
			warnings,
		})
		const b = await resolveComposioEntry({
			tenant: 'org_1',
			scope: { connectionId: 'conn_1', toolkits: { enable: ['slack'] } },
			connection: connection(),
			client,
			cache: sessionCache,
			warnings,
		})
		expect(a?.type).toBe('mcp')
		expect(b?.type).toBe('mcp')
		expect(creates).toHaveLength(2)
		const first = creates[0] as { options: { toolkits: { enable: string[] } } }
		expect(first.options.toolkits.enable).toEqual(['gmail', 'hubspot'])
	})

	test('identical config resumes the cached session instead of creating', async () => {
		const { client, sessionCache, creates, uses } = mkComposio()
		const scope = { connectionId: 'conn_1', toolkits: { enable: ['gmail'] } }
		const warnings: string[] = []
		await resolveComposioEntry({
			tenant: 'org_1',
			scope,
			connection: connection(),
			client,
			cache: sessionCache,
			warnings,
		})
		await resolveComposioEntry({
			tenant: 'org_1',
			scope,
			connection: connection(),
			client,
			cache: sessionCache,
			warnings,
		})
		expect(creates).toHaveLength(1)
		expect(uses).toEqual(['sess_1'])
	})

	test('governance change rolls the hash (allowedTools in configHash)', () => {
		const scope = { connectionId: 'conn_1', toolkits: { enable: ['gmail'] } }
		const before = configHash(scope, connection())
		const after = configHash(
			scope,
			connection({ allowedTools: ['GMAIL_SEND_EMAIL'] }),
		)
		expect(before).not.toBe(after)
	})

	test('composio failure degrades: null + warning, no throw', async () => {
		const failing = {
			create: async () => {
				throw new Error('composio down')
			},
			use: async () => {
				throw new Error('composio down')
			},
		}
		const { sessionCache } = mkComposio()
		const warnings: string[] = []
		const result = await resolveComposioEntry({
			tenant: 'org_1',
			scope: { connectionId: 'conn_1', toolkits: { enable: ['gmail'] } },
			connection: connection(),
			client: failing,
			cache: sessionCache,
			warnings,
		})
		expect(result).toBeNull()
		expect(warnings.join(' ')).toMatch(/degraded/)
	})

	test('disabled connection is skipped with a warning', async () => {
		const { client, sessionCache } = mkComposio()
		const warnings: string[] = []
		const result = await resolveComposioEntry({
			tenant: 'org_1',
			scope: { connectionId: 'conn_1' },
			connection: connection({ status: 'disabled' }),
			client,
			cache: sessionCache,
			warnings,
		})
		expect(result).toBeNull()
		expect(warnings.join(' ')).toMatch(/disabled/)
	})
})

// ---------------------------------------------------------------------------
// Resolver expansion
// ---------------------------------------------------------------------------

const version: ResolvedAgentVersion = {
	versionId: 'v1',
	agentId: 'a1',
	tenant: 'org_1',
	config: {
		name: 'Support',
		instructions: 'You help {{user_name}} with orders.',
		model: { provider: 'openai', model: 'gpt-realtime' },
		voice: 'marin',
		vad: { mode: 'server_vad' },
		systemTools: { end_call: { enabled: true } },
		mcp: [{ connectionId: 'conn_1', toolkits: { enable: ['gmail'] } }],
		knowledgeBase: [
			{ documentId: 'doc_auto', usageMode: 'auto' },
			{ documentId: 'doc_prompt', usageMode: 'prompt' },
		],
		dynamicVariableDefaults: { user_name: 'there' },
		procedures: {
			kind: 'inline',
			items: [
				{
					sourceProcedureId: 'p1',
					name: 'Refunds',
					type: 'free_form',
					trigger: 'the caller asks for a refund',
					content: 'Look up the order, then refund.',
					references: [],
				},
			],
		},
	},
}

describe('resolver expand', () => {
	test('renders variables, injects prompt KB, compiles procedures, builds tools', async () => {
		const { ingest } = mkIngest()
		const { client, sessionCache } = mkComposio()
		const cfg = await expand({
			version,
			conversationId: 'conv_1',
			control: noopControl,
			dynamicVariables: { user_name: 'Angel' },
			deps: {
				ingest,
				composio: client,
				sessionCache,
				loadConnection: async () => connection(),
				loadKbPromptDocs: async () => [
					{ name: 'Policy', content: 'Refunds within 30 days.' },
				],
			},
		})
		expect(cfg.instructions).toContain('You help Angel with orders.')
		expect(cfg.instructions).toContain(
			'<knowledge_base_document name="Policy">',
		)
		expect(cfg.instructions).toContain(
			'"Refunds": when the caller asks for a refund',
		)
		const toolNames = cfg.tools.map((t) => t.name)
		expect(toolNames).toContain('end_call')
		expect(toolNames).toContain('search_knowledge_base')
		expect(toolNames).toContain('start_procedure')
		expect(cfg.mcpTools).toHaveLength(1)
		expect(cfg.warnings).toHaveLength(0)
	})

	test('missing connection degrades to warning, session still builds', async () => {
		const { ingest } = mkIngest()
		const { client, sessionCache } = mkComposio()
		const cfg = await expand({
			version,
			conversationId: 'conv_1',
			control: noopControl,
			deps: {
				ingest,
				composio: client,
				sessionCache,
				loadConnection: async () => null,
				loadKbPromptDocs: async () => [],
			},
		})
		expect(cfg.mcpTools).toHaveLength(0)
		expect(cfg.warnings.join(' ')).toMatch(/not found/)
	})
})

// ---------------------------------------------------------------------------
// Procedure engine (R10)
// ---------------------------------------------------------------------------

const structured: ProcedureSnapshot = {
	sourceProcedureId: 'p2',
	name: 'Verify',
	type: 'structured',
	trigger: 'identity verification is needed',
	references: [],
	steps: [
		{ type: 'ask', instruction: 'What is your order id?' },
		{ type: 'tool', toolRef: 'conn_1:HUBSPOT_LOOKUP' },
		{
			type: 'if',
			condition: { kind: 'expression', expression: '{{system__vip}} == yes' },
			steps: [{ type: 'say', text: 'Welcome back, VIP.' }],
		},
		{ type: 'tell', instruction: 'Confirm the account is verified.' },
	],
}

describe('procedure engine', () => {
	test('R10 hard guarantee: never advances past Ask without a user turn', () => {
		const { engine } = compileProcedures([structured], {})
		const first = engine.start('Verify')
		expect(first).toMatch(/^ASK/)
		// model falsely claims completion — engine refuses, repeatedly
		expect(engine.advance()).toMatch(/waiting/)
		expect(engine.advance()).toMatch(/waiting/)
		engine.onUserTurn()
		expect(engine.advance()).toMatch(/RUN the tool conn_1:HUBSPOT_LOOKUP/)
	})

	test('expression conditions evaluate in code — no model call', () => {
		expect(
			evaluateExpression('{{system__vip}} == yes', { system__vip: 'yes' }),
		).toBe(true)
		expect(
			evaluateExpression('{{system__vip}} == yes', { system__vip: 'no' }),
		).toBe(false)
		expect(evaluateExpression('{{x}} != y', { x: 'z' })).toBe(true)
	})

	test('expression If enters branch when true, skips when false', () => {
		const { engine } = compileProcedures([structured], { system__vip: 'yes' })
		engine.start('Verify')
		engine.onUserTurn()
		engine.advance() // tool step
		const branch = engine.advance() // if step → evaluates true → SAY
		expect(branch).toMatch(/SAY exactly.*Welcome back, VIP/)
		const after = engine.advance() // rejoin main flow
		expect(after).toMatch(/TELL/)
	})

	test('tool failure halts the remaining steps', () => {
		const { engine } = compileProcedures([structured], {})
		engine.start('Verify')
		engine.onUserTurn()
		engine.advance()
		engine.haltOnToolFailure('HUBSPOT_LOOKUP failed')
		expect(engine.advance()).toMatch(/halted: HUBSPOT_LOOKUP failed/)
	})

	test('unknown procedure returns a typed error, conversation continues', () => {
		const { engine } = compileProcedures([structured], {})
		expect(engine.start('Nope')).toMatch(/unknown procedure/)
	})
})

// ---------------------------------------------------------------------------
// Transcript recorder
// ---------------------------------------------------------------------------

describe('TranscriptRecorder', () => {
	test('scripted event stream → ordered append/finish calls', async () => {
		const { ingest, calls } = mkIngest()
		const recorder = new TranscriptRecorder(ingest)
		recorder.bind('conv_1')
		const events: NormalizedEvent[] = [
			{ type: 'session.ready' },
			{ type: 'user.transcript', text: 'hi there', final: true },
			{ type: 'agent.response_started', responseId: 'r1' },
			{
				type: 'tool.call',
				callId: 'c1',
				name: 'search_knowledge_base',
				argsJson: '{}',
			},
			{
				type: 'agent.transcript',
				text: 'Hello! How can I help?',
				final: true,
				itemId: 'i1',
			},
			{ type: 'agent.response_done', responseId: 'r1', status: 'completed' },
			{ type: 'closed', reason: 'hangup' },
		]
		for (const event of events) recorder.onEvent(event)
		await recorder.flush()
		expect(calls.map((c) => c.kind)).toEqual(['append', 'append', 'finish'])
		const agentTurn = calls[1]?.args as { text: string; toolCalls: unknown[] }
		expect(agentTurn.text).toBe('Hello! How can I help?')
		expect(agentTurn.toolCalls).toHaveLength(1)
	})

	test('barge-in marks the agent turn interrupted', async () => {
		const { ingest, calls } = mkIngest()
		const recorder = new TranscriptRecorder(ingest)
		recorder.bind('conv_1')
		recorder.onEvent({
			type: 'agent.transcript',
			text: 'Let me expl—',
			final: true,
			itemId: 'i1',
		})
		recorder.onEvent({ type: 'user.speech_started' })
		recorder.onEvent({
			type: 'agent.response_done',
			responseId: 'r1',
			status: 'cancelled',
		})
		await recorder.flush()
		const turn = calls[0]?.args as { interrupted: boolean }
		expect(turn.interrupted).toBe(true)
	})

	test('append failure retries once without breaking order', async () => {
		let failures = 0
		const calls: string[] = []
		const flaky: ConvexIngest = {
			start: async () => 'conv_1',
			append: async (args) => {
				if (args.text === 'turn-2' && failures === 0) {
					failures += 1
					throw new Error('transient')
				}
				calls.push(args.text ?? '')
				return { sequence: calls.length }
			},
			finish: async () => {
				calls.push('finish')
			},
			searchKnowledgeBase: async () => [],
		}
		const recorder = new TranscriptRecorder(flaky)
		recorder.bind('conv_1')
		recorder.onEvent({ type: 'user.transcript', text: 'turn-1', final: true })
		recorder.onEvent({ type: 'user.transcript', text: 'turn-2', final: true })
		recorder.onEvent({ type: 'user.transcript', text: 'turn-3', final: true })
		recorder.onEvent({ type: 'closed', reason: 'end' })
		await recorder.flush()
		expect(calls).toEqual(['turn-1', 'turn-2', 'turn-3', 'finish'])
	})
})

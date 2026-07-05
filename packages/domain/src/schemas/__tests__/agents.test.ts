import { describe, expect, test } from 'vite-plus/test'

import { Agents, AgentVersions, versionConfig } from '../agents.ts'
import { enableDisable, vadConfig } from '../shared.ts'

const draft = {
	tenant: 'org_1',
	name: 'Support Agent',
	instructions: 'You help customers.',
	model: { provider: 'openai', model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad', silenceMs: 500 },
	systemTools: { end_call: { enabled: true } },
	mcp: [],
	knowledgeBase: [],
	archived: false,
}

describe('Agents (draft)', () => {
	test('a full draft parses', () => {
		expect(Agents.insertSchema.safeParse(draft).success).toBe(true)
	})

	test('unknown system-tool slug rejects', () => {
		const bad = {
			...draft,
			systemTools: { not_a_tool: { enabled: true } },
		}
		const res = Agents.insertSchema.safeParse(bad)
		expect(res.success).toBe(false)
	})

	test('vad union rejects semantic_vad carrying server_vad-only fields', () => {
		expect(
			vadConfig.safeParse({ mode: 'semantic_vad', silenceMs: 500 }).success,
		).toBe(false)
		expect(
			vadConfig.safeParse({ mode: 'semantic_vad', eagerness: 'high' }).success,
		).toBe(true)
	})
})

describe('mcp scoping (R6)', () => {
	test('enable XOR disable — both at once rejected', () => {
		expect(enableDisable.safeParse({ enable: ['gmail'] }).success).toBe(true)
		expect(enableDisable.safeParse({ disable: ['exa'] }).success).toBe(true)
		expect(
			enableDisable.safeParse({ enable: ['gmail'], disable: ['exa'] }).success,
		).toBe(false)
	})
})

describe('AgentVersions (immutable)', () => {
	test('accepts config with embedded procedure snapshots', () => {
		const config = {
			name: 'Support Agent',
			instructions: 'You help customers.',
			model: { provider: 'openai', model: 'gpt-realtime' },
			voice: 'marin',
			vad: { mode: 'server_vad', silenceMs: 500 },
			systemTools: { end_call: { enabled: true } },
			mcp: [],
			knowledgeBase: [],
			procedures: {
				kind: 'inline',
				items: [
					{
						sourceProcedureId: 'p1',
						name: 'Refunds',
						type: 'free_form',
						trigger: 'refund requests',
						content: '# Refunds',
						references: [],
					},
				],
			},
		}
		const res = AgentVersions.insertSchema.safeParse({
			tenant: 'org_1',
			agentId: 'agents_x',
			version: 1,
			publishedBy: 'user_1',
			config,
		})
		expect(res.success).toBe(true)
	})

	test('reserved refs variant parses', () => {
		const cfg = {
			name: 'A',
			instructions: '',
			model: { provider: 'xai', model: 'grok-voice-latest' },
			voice: 'ara',
			vad: { mode: 'manual' },
			systemTools: {},
			mcp: [],
			knowledgeBase: [],
			procedures: { kind: 'refs', procedureVersionIds: ['pv1'] },
		}
		expect(versionConfig.safeParse(cfg).success).toBe(true)
	})

	test('module exposes no update surface', () => {
		expect('update' in AgentVersions).toBe(false)
		expect('updateSchema' in AgentVersions).toBe(false)
		expect('update' in AgentVersions.tools).toBe(false)
	})
})

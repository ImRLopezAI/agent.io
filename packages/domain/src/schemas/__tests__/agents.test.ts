import { describe, expect, test } from 'vite-plus/test'

import {
	agents,
	agentVariants,
	agentVersions,
	versionConfig,
} from '../agents.ts'
import { enableDisable, vadConfig } from '../shared.ts'

const agent = {
	tenant: 'org_1',
	name: 'Support Agent',
	allocationRevision: 0,
	archived: false,
}

const draft = {
	instructions: 'You help customers.',
	model: { provider: 'openai', model: 'gpt-realtime' },
	voice: 'marin',
	vad: { mode: 'server_vad', silenceMs: 500 },
	systemTools: { end_call: { enabled: true } },
	mcp: [],
	knowledgeBase: [],
	inboundWorkflow: { enabled: true, firstSpeaker: 'caller' },
	outboundWorkflow: { enabled: true, firstSpeaker: 'agent' },
}

describe('Agents and Variants', () => {
	test('Agent is stable identity and Variant owns the draft', () => {
		expect(agents.insertSchema.safeParse(agent).success).toBe(true)
		expect(
			agentVariants.insertSchema.safeParse({
				tenant: 'org_1',
				agentId: 'agents_x',
				name: 'Main',
				isMain: true,
				allocationOrdinal: 1,
				trafficWeightBps: 0,
				draft,
				archived: false,
			}).success,
		).toBe(true)
		const parsedAgent = agents.insertSchema.parse({ ...agent, ...draft })
		expect('instructions' in parsedAgent).toBe(false)
		expect('publishedVersionId' in parsedAgent).toBe(false)
	})

	test('unknown system-tool slug rejects', () => {
		const bad = {
			...draft,
			systemTools: { not_a_tool: { enabled: true } },
		}
		const res = agentVariants.insertSchema.safeParse({
			tenant: 'org_1',
			agentId: 'agents_x',
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 0,
			draft: bad,
			archived: false,
		})
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
	test('discriminated on mode — malformed shapes rejected', () => {
		expect(
			enableDisable.safeParse({ mode: 'enable', values: ['gmail'] }).success,
		).toBe(true)
		expect(
			enableDisable.safeParse({ mode: 'disable', values: ['exa'] }).success,
		).toBe(true)
		expect(enableDisable.safeParse({ enable: ['gmail'] }).success).toBe(false)
		expect(
			enableDisable.safeParse({ mode: 'enable', values: ['a'], extra: 1 })
				.success,
		).toBe(false)
	})
})

describe('AgentVersions (immutable)', () => {
	test('accepts config with embedded procedure snapshots', () => {
		const config = {
			...draft,
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
		const res = agentVersions.insertSchema.safeParse({
			tenant: 'org_1',
			agentId: 'agents_x',
			agentVariantId: 'agentVariants_x',
			version: 1,
			publishedBy: 'user_1',
			config,
		})
		expect(res.success).toBe(true)
	})

	test('reserved refs variant parses', () => {
		const cfg = {
			...draft,
			procedures: { kind: 'refs', procedureVersionIds: ['pv1'] },
		}
		expect(versionConfig.safeParse(cfg).success).toBe(true)
	})

	test('module exposes no update surface', () => {
		expect('update' in agentVersions).toBe(false)
		expect('updateSchema' in agentVersions).toBe(false)
		expect('update' in agentVersions.tools).toBe(false)
	})
})

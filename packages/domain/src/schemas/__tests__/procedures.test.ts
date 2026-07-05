import { describe, expect, test } from 'vite-plus/test'

import {
	PROCEDURE_CONTENT_MAX_CHARS,
	procedures,
	procedureStep,
	validateProcedureBody,
} from '../procedures.ts'
import type { ProcedureStep } from '../procedures.ts'

const ask: ProcedureStep = { type: 'ask', instruction: 'Ask for the order id' }
const tell: ProcedureStep = {
	type: 'tell',
	instruction: 'Explain the refund policy',
}
const say: ProcedureStep = { type: 'say', text: 'Your refund is on the way.' }
const tool: ProcedureStep = { type: 'tool', toolRef: 'end_call' }
const anIf: ProcedureStep = {
	type: 'if',
	condition: { kind: 'natural_language', description: 'user has an order' },
	steps: [{ type: 'tell', instruction: 'Explain the refund policy' }],
}

describe('procedureStep', () => {
	test('all five step types parse', () => {
		for (const s of [ask, tell, say, tool, anIf]) {
			expect(procedureStep.safeParse(s).success).toBe(true)
		}
	})

	test('If-inside-If is structurally impossible', () => {
		const nested = { ...anIf, steps: [anIf] }
		expect(procedureStep.safeParse(nested).success).toBe(false)
	})

	test('expression conditions parse', () => {
		const s = {
			type: 'if',
			condition: {
				kind: 'expression',
				expression: '{{system__agent_turns}} == 0',
			},
			steps: [say],
		}
		expect(procedureStep.safeParse(s).success).toBe(true)
	})
})

describe('validateProcedureBody', () => {
	test('valid free_form and structured pass', () => {
		expect(
			validateProcedureBody({ type: 'free_form', content: '# Refunds' }),
		).toBeNull()
		expect(
			validateProcedureBody({ type: 'structured', steps: [ask, tool] }),
		).toBeNull()
	})

	test('free_form without content fails', () => {
		expect(validateProcedureBody({ type: 'free_form' })).toMatch(/content/)
	})

	test('structured without steps fails', () => {
		expect(validateProcedureBody({ type: 'structured' })).toMatch(/steps/)
	})

	test('cannot start with If', () => {
		expect(
			validateProcedureBody({ type: 'structured', steps: [anIf, ask] }),
		).toMatch(/cannot start/)
	})

	test('adjacent If steps rejected', () => {
		expect(
			validateProcedureBody({ type: 'structured', steps: [ask, anIf, anIf] }),
		).toMatch(/back to back/)
	})

	test('structured may only reference tools', () => {
		expect(
			validateProcedureBody({
				type: 'structured',
				steps: [ask],
				references: [
					{
						location: 'content',
						targetType: 'knowledge_base',
						targetId: 'doc1',
						health: 'valid',
					},
				],
			}),
		).toMatch(/only reference tools/)
	})
})

describe('procedures table', () => {
	test('content length boundary: 50_000 passes, 50_001 fails', () => {
		const base = {
			tenant: 'org_1',
			agentId: 'agents_x',
			name: 'Refunds',
			type: 'free_form',
			trigger: 'user asks for a refund',
			references: [],
			source: 'manual',
			status: 'draft',
		}
		const at = procedures.insertSchema.safeParse({
			...base,
			content: 'x'.repeat(PROCEDURE_CONTENT_MAX_CHARS),
		})
		const over = procedures.insertSchema.safeParse({
			...base,
			content: 'x'.repeat(PROCEDURE_CONTENT_MAX_CHARS + 1),
		})
		expect(at.success).toBe(true)
		expect(over.success).toBe(false)
	})
})

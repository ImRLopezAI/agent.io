import type {
	BasicStep,
	ProcedureSnapshot,
	ProcedureStep,
} from '@agent.io/domain/schemas'
import { tool } from '@openai/agents-realtime'
import { z } from 'zod'

/**
 * Procedure engine (plan Unit 13, R10). Code-enforced: step ORDERING, tool
 * silence, and expression conditions. Model-judged within code-gated turn
 * boundaries: Ask completion and natural-language conditions. The engine
 * never advances past an Ask without at least one intervening user turn.
 */

export interface EngineState {
	activeProcedure: string | null
	stepIndex: number
	/** Ask gate: set when an Ask step is issued; cleared by a user turn. */
	awaitingUserTurn: boolean
	pendingBranch: BasicStep[] | null
	branchIndex: number
	halted: string | null
}

export const initialEngineState = (): EngineState => ({
	activeProcedure: null,
	stepIndex: 0,
	awaitingUserTurn: false,
	pendingBranch: null,
	branchIndex: 0,
	halted: null,
})

/** Exact comparison over dynamic variables: "{{var}} == value" style. */
export const evaluateExpression = (
	expression: string,
	variables: Record<string, string>,
): boolean => {
	const match = expression.match(
		/^\s*\{\{\s*([\w.]+)\s*\}\}\s*(==|!=)\s*(.+?)\s*$/,
	)
	if (!match) return false
	const [, name, operator, rawValue] = match
	const value = rawValue?.replace(/^['"]|['"]$/g, '') ?? ''
	const actual = variables[name ?? ''] ?? ''
	return operator === '==' ? actual === value : actual !== value
}

export interface CompiledProcedures {
	instructionSuffix: string
	tools: ReturnType<typeof tool>[]
	engine: ProcedureEngine
}

export class ProcedureEngine {
	state = initialEngineState()

	constructor(
		private readonly procedures: ProcedureSnapshot[],
		private readonly variables: Record<string, string> = {},
	) {}

	/** Called by the session on every user turn — clears the Ask gate. */
	onUserTurn() {
		if (this.state.awaitingUserTurn) this.state.awaitingUserTurn = false
	}

	start(name: string): string {
		const procedure = this.procedures.find((p) => p.name === name)
		if (!procedure) return `error: unknown procedure "${name}"`
		this.state = { ...initialEngineState(), activeProcedure: name }
		if (procedure.type === 'free_form') {
			return `procedure "${name}" loaded:\n${procedure.content ?? ''}`
		}
		return this.describeCurrentStep()
	}

	end(): string {
		const name = this.state.activeProcedure
		this.state = initialEngineState()
		return name
			? `procedure "${name}" ended — rejoin the conversation`
			: 'no active procedure'
	}

	/**
	 * Advance the structured step machine. The model calls this to get its
	 * next instruction; the engine refuses to move past an Ask until a user
	 * turn arrived, regardless of what the model claims (the R10 guarantee).
	 */
	advance(): string {
		const procedure = this.procedures.find(
			(p) => p.name === this.state.activeProcedure,
		)
		if (!procedure || procedure.type !== 'structured') {
			return 'error: no active structured procedure'
		}
		if (this.state.halted) {
			return `procedure halted: ${this.state.halted}`
		}
		if (this.state.awaitingUserTurn) {
			return 'waiting: the Ask step is not complete until the caller answers — do not proceed'
		}
		if (this.state.pendingBranch) {
			this.state.branchIndex += 1
			if (this.state.branchIndex >= this.state.pendingBranch.length) {
				this.state.pendingBranch = null
				this.state.branchIndex = 0
			} else {
				return this.describeStep(
					this.state.pendingBranch[this.state.branchIndex] as ProcedureStep,
				)
			}
		}
		this.state.stepIndex += 1
		return this.describeCurrentStep()
	}

	haltOnToolFailure(reason: string) {
		this.state.halted = reason
	}

	describeCurrentStep(): string {
		const procedure = this.procedures.find(
			(p) => p.name === this.state.activeProcedure,
		)
		const steps = procedure?.steps ?? []
		if (this.state.stepIndex >= steps.length) {
			return 'all steps complete — call end_procedure'
		}
		return this.describeStep(steps[this.state.stepIndex] as ProcedureStep)
	}

	private describeStep(step: ProcedureStep): string {
		switch (step.type) {
			case 'ask':
				this.state.awaitingUserTurn = true
				return `ASK the caller (one question, then wait for their answer): ${step.instruction}`
			case 'tell':
				return `TELL the caller in your own words (one message): ${step.instruction}`
			case 'say':
				return `SAY exactly, word for word (one message): "${step.text}"`
			case 'tool':
				return `RUN the tool ${step.toolRef} now. Do not speak during this step.${step.instruction ? ` Intent: ${step.instruction}` : ''}`
			case 'if': {
				if (step.condition.kind === 'expression') {
					const holds = evaluateExpression(
						step.condition.expression,
						this.variables,
					)
					if (holds) {
						this.state.pendingBranch = step.steps
						this.state.branchIndex = 0
						return this.describeStep(step.steps[0] as ProcedureStep)
					}
					return 'condition does not hold — call advance_procedure to continue'
				}
				return `DECIDE: does this apply — "${step.condition.description}"? If yes call enter_branch, otherwise call advance_procedure.`
			}
		}
	}

	enterBranch(): string {
		const procedure = this.procedures.find(
			(p) => p.name === this.state.activeProcedure,
		)
		const step = procedure?.steps?.[this.state.stepIndex]
		if (!step || step.type !== 'if') return 'error: current step is not an If'
		this.state.pendingBranch = step.steps
		this.state.branchIndex = 0
		return this.describeStep(step.steps[0] as ProcedureStep)
	}
}

/** Trigger index + engine tools appended at expand time (plan Unit 12/13). */
export const compileProcedures = (
	procedures: ProcedureSnapshot[],
	variables: Record<string, string> = {},
): CompiledProcedures => {
	const engine = new ProcedureEngine(procedures, variables)
	if (procedures.length === 0) {
		return { instructionSuffix: '', tools: [], engine }
	}
	const index = procedures
		.map((p) => `- "${p.name}": when ${p.trigger}`)
		.join('\n')
	const instructionSuffix = `\n\n## Procedures\nWhen the caller's request matches a trigger below, call start_procedure with its exact name and follow its steps until end_procedure.\n${index}`
	const tools = [
		tool({
			name: 'start_procedure',
			description:
				'Start the procedure whose trigger matches the caller request.',
			parameters: z.object({ name: z.string() }),
			execute: async ({ name }) => engine.start(name),
		}),
		tool({
			name: 'advance_procedure',
			description:
				'Get the next step of the active structured procedure after completing the current one.',
			parameters: z.object({}),
			execute: async () => engine.advance(),
		}),
		tool({
			name: 'enter_branch',
			description:
				'Enter the If branch of the current structured-procedure step when its condition applies.',
			parameters: z.object({}),
			execute: async () => engine.enterBranch(),
		}),
		tool({
			name: 'end_procedure',
			description: 'End the active procedure and rejoin the conversation.',
			parameters: z.object({}),
			execute: async () => engine.end(),
		}),
	]
	return { instructionSuffix, tools, engine }
}

import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Procedures — platform-owned agent behaviors (ERD §1b, vendor spec in Alpha).
 * We are the system of record; procedures snapshot into the Agent Version at
 * publish time.
 */

export const PROCEDURE_CONTENT_MAX_CHARS = 50_000

export const PROCEDURE_TYPES = ['free_form', 'structured'] as const
export type ProcedureType = (typeof PROCEDURE_TYPES)[number]
export const PROCEDURE_SOURCES = ['manual', 'sop_import', 'generated'] as const
export const PROCEDURE_STATUSES = ['draft', 'active', 'archived'] as const
export const REFERENCE_LOCATIONS = ['trigger', 'content'] as const
export const REFERENCE_TARGET_TYPES = [
	'system_tool',
	'mcp_tool',
	'knowledge_base',
	'procedure',
] as const
export const REFERENCE_HEALTH = ['valid', 'invalid', 'unavailable'] as const

// ---------------------------------------------------------------------------
// Steps (structured procedures)
// ---------------------------------------------------------------------------

/** Requests information and blocks until an appropriate answer is received. */
const askStep = z.object({
	type: z.literal('ask'),
	instruction: z.string().min(1),
})

/** Agent composes ONE message in its own words. */
const tellStep = z.object({
	type: z.literal('tell'),
	instruction: z.string().min(1),
})

/** Agent speaks ONE message word for word. */
const sayStep = z.object({
	type: z.literal('say'),
	text: z.string().min(1),
})

/** Runs a tool; agent silent during the step; failure halts the procedure. */
const toolStep = z.object({
	type: z.literal('tool'),
	/** system tool slug, or "connectionId:toolName" for MCP tools */
	toolRef: z.string().min(1),
	instruction: z.string().optional(),
})

export const ifCondition = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('natural_language'),
		description: z.string().min(1),
	}),
	z.object({ kind: z.literal('expression'), expression: z.string().min(1) }),
])
export type IfCondition = z.infer<typeof ifCondition>

/** Steps allowed inside an If branch — If cannot nest (vendor rule). */
const basicStep = z.discriminatedUnion('type', [
	askStep,
	tellStep,
	sayStep,
	toolStep,
])
export type BasicStep = z.infer<typeof basicStep>

/** Branches: runs nested steps when the condition holds, then rejoins. */
const ifStep = z.object({
	type: z.literal('if'),
	condition: ifCondition,
	steps: z.array(basicStep).min(1),
})

export const procedureStep = z.discriminatedUnion('type', [
	askStep,
	tellStep,
	sayStep,
	toolStep,
	ifStep,
])
export type ProcedureStep = z.infer<typeof procedureStep>

// ---------------------------------------------------------------------------
// Inline references
// ---------------------------------------------------------------------------

export const procedureReference = z.object({
	location: z.enum(REFERENCE_LOCATIONS),
	targetType: z.enum(REFERENCE_TARGET_TYPES),
	targetId: z.string().min(1),
	/** Broken-ref detection: deleted (invalid) vs inaccessible (unavailable). */
	health: z.enum(REFERENCE_HEALTH).default('valid'),
})
export type ProcedureReference = z.infer<typeof procedureReference>

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const procedures = tenantTable('procedures', (id) => ({
	agentVariantId: id('agentVariants'),
	/** Dashboard label — never sent to the LLM. */
	name: z.string().min(1).max(120),
	/** NOT convertible after creation (vendor rule). */
	type: z.enum(PROCEDURE_TYPES),
	/** When the agent should run this — user-intent phrasing. */
	trigger: z.string().min(1),
	/** free_form body (markdown). Empty for structured procedures. */
	content: z.string().max(PROCEDURE_CONTENT_MAX_CHARS).optional(),
	/** structured body. Empty for free_form procedures. */
	steps: z.array(procedureStep).optional(),
	references: z.array(procedureReference).default([]),
	source: z.enum(PROCEDURE_SOURCES).default('manual'),
	status: z.enum(PROCEDURE_STATUSES).default('draft'),
}))

// ---------------------------------------------------------------------------
// Validators (run at the mutation boundary — refinements don't survive
// zodToConvex, so structural rules live here as exported functions)
// ---------------------------------------------------------------------------

export interface ProcedureBody {
	type: ProcedureType
	content?: string
	steps?: ProcedureStep[]
	references?: ProcedureReference[]
}

/**
 * ERD §1b structural + cross-field rules. Returns null when valid, else the
 * first violation message.
 */
export const validateProcedureBody = (p: ProcedureBody): string | null => {
	if (p.type === 'free_form' && !p.content)
		return 'free_form procedures require content'
	if (p.type === 'structured') {
		if (!p.steps?.length) return 'structured procedures require steps'
		if (p.steps[0]?.type === 'if')
			return 'a procedure cannot start with an If step'
		for (let i = 1; i < p.steps.length; i++) {
			if (p.steps[i]?.type === 'if' && p.steps[i - 1]?.type === 'if')
				return 'two If steps cannot be placed back to back'
		}
		const badRef = p.references?.find(
			(r) => r.targetType !== 'system_tool' && r.targetType !== 'mcp_tool',
		)
		if (badRef)
			return `structured procedures may only reference tools (got ${badRef.targetType})`
	}
	return null
}

/** Immutable per-version snapshot of a procedure (embedded in agentVersions). */
export const procedureSnapshot = z.object({
	sourceProcedureId: z.string(),
	name: z.string(),
	type: z.enum(PROCEDURE_TYPES),
	trigger: z.string(),
	content: z.string().optional(),
	steps: z.array(procedureStep).optional(),
	references: z.array(procedureReference),
})
export type ProcedureSnapshot = z.infer<typeof procedureSnapshot>

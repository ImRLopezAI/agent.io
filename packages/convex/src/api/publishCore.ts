import {
	type ProcedureSnapshot,
	validateProcedureBody,
	type VersionConfig,
} from '@agent.io/domain/schemas'

/** Publish snapshot size budget — fail clearly before Convex's 1 MiB limit. */
export const VERSION_SIZE_BUDGET_BYTES = 800_000

interface DraftLike {
	name: string
	instructions: string
	model: VersionConfig['model']
	voice: string
	vad: VersionConfig['vad']
	audio?: VersionConfig['audio']
	systemTools: VersionConfig['systemTools']
	mcp: VersionConfig['mcp']
	knowledgeBase: VersionConfig['knowledgeBase']
	dynamicVariableDefaults?: VersionConfig['dynamicVariableDefaults']
}

interface ProcedureLike {
	_id: string
	name: string
	type: 'free_form' | 'structured'
	trigger: string
	content?: string
	steps?: ProcedureSnapshot['steps']
	references: ProcedureSnapshot['references']
	status: 'draft' | 'active' | 'archived'
}

/**
 * Assemble the immutable version snapshot from a draft + its procedures.
 * Throws on the first invalid procedure or when the size budget is exceeded
 * — callers run this INSIDE the publish mutation so failure writes nothing.
 */
export const buildVersionSnapshot = (
	draft: DraftLike,
	procedures: ProcedureLike[],
): VersionConfig => {
	const active = procedures.filter((p) => p.status !== 'archived')
	for (const procedure of active) {
		const violation = validateProcedureBody(procedure)
		if (violation) {
			throw new Error(
				`publish blocked: procedure "${procedure.name}": ${violation}`,
			)
		}
	}
	const items: ProcedureSnapshot[] = active.map((p) => ({
		sourceProcedureId: p._id,
		name: p.name,
		type: p.type,
		trigger: p.trigger,
		content: p.content,
		steps: p.steps,
		references: p.references,
	}))
	const config: VersionConfig = {
		name: draft.name,
		instructions: draft.instructions,
		model: draft.model,
		voice: draft.voice,
		vad: draft.vad,
		audio: draft.audio,
		systemTools: draft.systemTools,
		mcp: draft.mcp,
		knowledgeBase: draft.knowledgeBase,
		dynamicVariableDefaults: draft.dynamicVariableDefaults,
		procedures: { kind: 'inline', items },
	}
	const sizeBytes = new TextEncoder().encode(JSON.stringify(config)).length
	if (sizeBytes > VERSION_SIZE_BUDGET_BYTES) {
		throw new Error(
			`publish blocked: version snapshot is ${sizeBytes} bytes — over the ${VERSION_SIZE_BUDGET_BYTES}-byte budget. Reduce procedure content or split procedures.`,
		)
	}
	return config
}

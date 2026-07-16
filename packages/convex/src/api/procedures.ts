import {
	procedures,
	SYSTEM_TOOL_SLUGS,
	type ProcedureReference,
	validateProcedureBody,
} from '@agent.io/domain/schemas'
import { z } from 'zod'

import { internal } from '../_generated/api'
import { nativePaginationOpts, stampCreate, stampUpdate } from '../lib'
import {
	requirePermission,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
} from '../utils'

type ProcedureRecord = z.infer<typeof procedures.schema> & {
	_id: string
	_creationTime: number
}

type TenantIdContext = Parameters<typeof resolveTenantId>[0]

const SYSTEM_TOOL_SET = new Set<string>(SYSTEM_TOOL_SLUGS)

export const isSystemToolReference = (targetId: string) =>
	SYSTEM_TOOL_SET.has(targetId)

export const parseMcpToolReference = (targetId: string) => {
	const separator = targetId.indexOf(':')
	if (separator <= 0 || separator === targetId.length - 1) return null
	return {
		connectionId: targetId.slice(0, separator),
		toolName: targetId.slice(separator + 1),
	}
}

export const toProcedureDto = (procedure: ProcedureRecord) => ({
	id: procedure._id,
	agentVariantId: procedure.agentVariantId,
	name: procedure.name,
	type: procedure.type,
	trigger: procedure.trigger,
	content: procedure.content,
	steps: procedure.steps,
	references: procedure.references,
	source: procedure.source,
	status: procedure.status,
	createdAt: procedure.createdAt,
	updatedAt: procedure.updatedAt,
	creationTime: procedure._creationTime,
})

export const validateProcedureReferences = async (
	ctx: TenantIdContext,
	references: ProcedureReference[],
	selfId?: string,
) => {
	for (const reference of references) {
		switch (reference.targetType) {
			case 'system_tool':
				if (!isSystemToolReference(reference.targetId)) {
					throw new Error('system tool not found')
				}
				break
			case 'mcp_tool': {
				const parsed = parseMcpToolReference(reference.targetId)
				if (!parsed) throw new Error('invalid MCP tool reference')
				await resolveTenantId(
					ctx,
					'mcpConnections',
					parsed.connectionId,
					'MCP connection',
				)
				break
			}
			case 'knowledge_base':
				await resolveTenantId(
					ctx,
					'kbDocuments',
					reference.targetId,
					'knowledge base document',
				)
				break
			case 'procedure':
				if (selfId && reference.targetId === selfId) {
					throw new Error('a procedure cannot reference itself')
				}
				await resolveTenantId(
					ctx,
					'procedures',
					reference.targetId,
					'procedure',
				)
				break
		}
	}
}

export const create = tenantMutation({
	args: procedures.insert({ tenant: true }).shape,
	handler: async (ctx, args) => {
		requirePermission(ctx.org, 'prompts:write')
		await resolveTenantId(
			ctx,
			'agentVariants',
			args.agentVariantId,
			'Agent Variant',
		)
		const violation = validateProcedureBody(args)
		if (violation) throw new Error(violation)
		await validateProcedureReferences(ctx, args.references)
		const created: ProcedureRecord = await ctx.runMutation(
			internal.api.internals.procedures.create,
			stampCreate(ctx.tenant, args),
		)
		return toProcedureDto(created)
	},
})

export const update = tenantMutation({
	args: {
		id: z.string(),
		patch: procedures.update({
			tenant: true,
			type: true,
			agentVariantId: true,
		}),
	},
	handler: async (ctx, { id, patch }) => {
		requirePermission(ctx.org, 'prompts:write')
		const procedureId = await resolveTenantId(
			ctx,
			'procedures',
			id,
			'procedure',
		)
		const existing = await ctx.db.get(procedureId)
		if (!existing) throw new Error('procedure not found')
		const merged = { ...existing, ...patch }
		const violation = validateProcedureBody(merged)
		if (violation) throw new Error(violation)
		await validateProcedureReferences(ctx, merged.references, procedureId)
		await ctx.runMutation(internal.api.internals.procedures.update, {
			id: procedureId,
			patch: stampUpdate(patch),
		})
	},
})

export const remove = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:write')
		const procedureId = await resolveTenantId(
			ctx,
			'procedures',
			id,
			'procedure',
		)
		await ctx.runMutation(internal.api.internals.procedures.update, {
			id: procedureId,
			patch: stampUpdate({ status: 'archived' as const }),
		})
	},
})

export const get = tenantQuery({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		requirePermission(ctx.org, 'prompts:read')
		const procedureId = await resolveTenantId(
			ctx,
			'procedures',
			id,
			'procedure',
		)
		const procedure = await ctx.db.get(procedureId)
		if (!procedure) throw new Error('procedure not found')
		return toProcedureDto(procedure)
	},
})

export const listByVariant = tenantQuery({
	args: {
		agentVariantId: z.string(),
		status: z.enum(['draft', 'active', 'archived']).optional(),
		paginationOpts: nativePaginationOpts,
	},
	handler: async (ctx, { agentVariantId, status, paginationOpts }) => {
		requirePermission(ctx.org, 'prompts:read')
		const id = await resolveTenantId(
			ctx,
			'agentVariants',
			agentVariantId,
			'Agent Variant',
		)
		const result = status
			? await ctx.db
					.query('procedures')
					.withIndex('by_agentVariantId_and_status', (q) =>
						q.eq('agentVariantId', id).eq('status', status),
					)
					.order('desc')
					.paginate(paginationOpts)
			: await ctx.db
					.query('procedures')
					.withIndex('by_variant', (q) => q.eq('agentVariantId', id))
					.order('desc')
					.paginate(paginationOpts)
		return { ...result, page: result.page.map(toProcedureDto) }
	},
})

import { zid, zodToConvex } from 'convex-helpers/server/zod4'
import { defineTable, type TableDefinition } from 'convex/server'
import type { GenericId } from 'convex/values'
import { z } from 'zod'

// JSON-schema-safe Convex ID for tools: still typed as GenericId<TableName> but uses primitive string checks.
const jsonSafeZid = <TableName extends string>(
	tableName: TableName,
): z.ZodType<GenericId<TableName>> =>
	z.string().describe(`Convex Id<${tableName}>`) as unknown as z.ZodType<
		GenericId<TableName>
	>

export interface TableIndexOptions {
	/** Regular indexes, declared verbatim: { by_agent: ['agentId'] } */
	indexes?: Record<string, readonly string[]>
	/** Full-text search indexes (Tantivy): { search_text: { searchField, filterFields } } */
	searchIndexes?: Record<
		string,
		{ searchField: string; filterFields?: readonly string[] }
	>
	/** Vector indexes: { by_embedding: { vectorField, dimensions, filterFields } } */
	vectorIndexes?: Record<
		string,
		{
			vectorField: string
			dimensions: number
			filterFields?: readonly string[]
		}
	>
}

// Type-level index tracking: dataModel.d.ts derives types from schema.ts, so
// the declarative specs must surface in TableDefinition's generic params —
// applyIndexes is a runtime loop and would otherwise erase them.
type IndexesOf<O extends TableIndexOptions> = {
	[K in keyof O['indexes']]: O['indexes'][K] extends readonly string[]
		? [...O['indexes'][K], '_creationTime']
		: never
}
type SearchOf<O extends TableIndexOptions> = {
	[K in keyof O['searchIndexes']]: O['searchIndexes'][K] extends {
		searchField: infer S extends string
	}
		? {
				searchField: S
				filterFields: O['searchIndexes'][K] extends {
					filterFields: readonly (infer F extends string)[]
				}
					? F
					: never
			}
		: never
}
type VectorOf<O extends TableIndexOptions> = {
	[K in keyof O['vectorIndexes']]: O['vectorIndexes'][K] extends {
		vectorField: infer V extends string
	}
		? {
				vectorField: V
				dimensions: number
				filterFields: O['vectorIndexes'][K] extends {
					filterFields: readonly (infer F extends string)[]
				}
					? F
					: never
			}
		: never
}

const applyIndexes = (
	table: ReturnType<typeof defineTable>,
	options?: TableIndexOptions,
) => {
	let t = table
	for (const [name, fields] of Object.entries(options?.indexes ?? {})) {
		t = t.index(name, fields as [string, ...string[]])
	}
	for (const [name, spec] of Object.entries(options?.searchIndexes ?? {})) {
		t = t.searchIndex(
			name,
			spec as { searchField: string; filterFields?: string[] },
		)
	}
	for (const [name, spec] of Object.entries(options?.vectorIndexes ?? {})) {
		t = t.vectorIndex(
			name,
			spec as {
				vectorField: string
				dimensions: number
				filterFields?: string[]
			},
		)
	}
	return t
}

/**
 * Defines a Convex table schema with automatic _id and _creationTime fields using convex-helpers.
 */
export const zodTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
	const O extends TableIndexOptions = Record<never, never>,
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
	options?: O,
) => {
	const baseSchema = z.object({
		...schema(zid),
		updatedAt: z.string().optional(),
		createdAt: z.string(),
	})

	const fullSchema = baseSchema.extend({
		_id: zid(tableName),
	})

	const toolSafeBaseSchema = z.object({
		...schema(jsonSafeZid as typeof zid),
		updatedAt: z.string().optional(),
		createdAt: z.string(),
	})

	const insertSchema = baseSchema.omit({
		createdAt: true,
		updatedAt: true,
	})
	const updateSchema = insertSchema.partial()

	type ZodObjectOmit<
		Schema extends z.ZodObject<any, any>,
		Mask extends z.util.Mask<keyof Schema['shape']>,
	> =
		Schema extends z.ZodObject<infer Shape, infer Config>
			? z.ZodObject<
					z.util.Flatten<Omit<Shape, Extract<keyof Shape, keyof Mask>>>,
					Config
				>
			: never

	type InsertSchema = typeof insertSchema
	type UpdateSchema = typeof updateSchema
	type InsertMask = z.util.Mask<keyof InsertSchema['shape']>
	type UpdateMask = z.util.Mask<keyof UpdateSchema['shape']>

	function insert(): InsertSchema
	function insert<M extends InsertMask>(omit: M): ZodObjectOmit<InsertSchema, M>
	function insert(omit?: InsertMask) {
		return omit ? insertSchema.omit(omit as any) : insertSchema
	}

	function update(): UpdateSchema
	function update<M extends UpdateMask>(omit: M): ZodObjectOmit<UpdateSchema, M>
	function update<M extends UpdateMask>(omit?: M) {
		return omit ? updateSchema.omit(omit as any) : updateSchema
	}

	const toolInsertSchema = toolSafeBaseSchema
	const toolUpdateSchema = toolInsertSchema.partial()

	return {
		tableName,
		schema: fullSchema,
		insertSchema,
		updateSchema,
		table: () => {
			const validator = zodToConvex(baseSchema)
			return applyIndexes(
				defineTable(validator),
				options,
			) as unknown as TableDefinition<
				typeof validator,
				IndexesOf<O>,
				SearchOf<O>,
				VectorOf<O>
			>
		},
		insert,
		update,
		tools: {
			insert: toolInsertSchema,
			update: z.object({
				data: toolUpdateSchema,
				id: jsonSafeZid(tableName),
			}),
			id: z.object({
				id: jsonSafeZid(tableName),
			}),
		},
	}
}

/**
 * Tenant-scoped table (ADR 0001): injects `tenant: z.string()` (the WorkOS
 * `org_…` id) and always adds the `by_tenant` index. Caller-declared indexes
 * are taken verbatim; search/vector indexes must carry `tenant` in their
 * `filterFields` (isolation happens inside the index).
 */
type WithByTenant<O extends TableIndexOptions> = Omit<O, 'indexes'> & {
	indexes: { by_tenant: readonly ['tenant'] } & (O['indexes'] extends object
		? O['indexes']
		: Record<never, never>)
}

export const tenantTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
	const O extends TableIndexOptions = Record<never, never>,
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
	options?: O,
) => {
	const shape = schema(zid)
	if ('tenant' in shape) {
		throw new Error(
			`tenantTable('${tableName}'): shape already defines 'tenant' — the helper owns that field`,
		)
	}
	if (options?.indexes && 'by_tenant' in options.indexes) {
		throw new Error(
			`tenantTable('${tableName}'): 'by_tenant' index is added automatically — remove it from options`,
		)
	}
	return zodTable(
		tableName,
		(id) => ({
			...schema(id),
			tenant: z.string(),
		}),
		{
			...options,
			indexes: { by_tenant: ['tenant'] as const, ...options?.indexes },
		} as WithByTenant<O>,
	)
}

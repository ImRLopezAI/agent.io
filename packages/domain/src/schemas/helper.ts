import { zid, zodToConvex } from 'convex-helpers/server/zod4'
import { defineTable } from 'convex/server'
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
	indexes?: Record<string, string[]>
	/** Full-text search indexes (Tantivy): { search_text: { searchField, filterFields } } */
	searchIndexes?: Record<
		string,
		{ searchField: string; filterFields?: string[] }
	>
	/** Vector indexes: { by_embedding: { vectorField, dimensions, filterFields } } */
	vectorIndexes?: Record<
		string,
		{ vectorField: string; dimensions: number; filterFields?: string[] }
	>
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
		t = t.searchIndex(name, spec)
	}
	for (const [name, spec] of Object.entries(options?.vectorIndexes ?? {})) {
		t = t.vectorIndex(name, spec)
	}
	return t
}

/**
 * Defines a Convex table schema with automatic _id and _creationTime fields using convex-helpers.
 */
export const zodTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
	options?: TableIndexOptions,
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
			return applyIndexes(defineTable(zodToConvex(baseSchema)), options)
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
export const tenantTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
	options?: TableIndexOptions,
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
			indexes: { by_tenant: ['tenant'], ...options?.indexes },
		},
	)
}

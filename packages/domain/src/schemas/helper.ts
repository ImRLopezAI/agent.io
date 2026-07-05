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

/**
 * Defines a Convex table schema with automatic _id and _creationTime fields using convex-helpers.
 */
export const zodTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
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
		table: defineTable(zodToConvex(baseSchema)),
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

export const tenantTable = <
	Table extends string,
	T extends { [key: string]: z.ZodType },
>(
	tableName: Table,
	schema: (id: typeof zid) => T,
) => {
	return zodTable(tableName, (id) => ({
		...schema(id),
		tenant: z.string(),
	}))
}

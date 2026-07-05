import { describe, expect, test } from 'vite-plus/test'
import { z } from 'zod'

import { tenantTable, zodTable } from '../helper.ts'

const shape = () => ({ name: z.string(), agentId: z.string() })

interface ExportedTable {
	indexes: { indexDescriptor: string; fields: string[] }[]
	searchIndexes: { indexDescriptor: string }[]
	vectorIndexes: { indexDescriptor: string; dimensions: number }[]
}

// TableDefinition.export() exists at runtime but is not on the public type.
const exportTable = (table: { table: () => unknown }): ExportedTable =>
	(table.table() as { export: () => ExportedTable }).export()

describe('zodTable', () => {
	test('insertSchema omits createdAt/updatedAt; updateSchema is partial', () => {
		const t = zodTable('things', shape)
		expect(Object.keys(t.insertSchema.shape)).not.toContain('createdAt')
		expect(Object.keys(t.insertSchema.shape)).not.toContain('updatedAt')
		expect(t.updateSchema.safeParse({}).success).toBe(true)
	})

	test('declares no tenant field or by_tenant index', () => {
		const t = zodTable('things', shape)
		expect(Object.keys(t.schema.shape)).not.toContain('tenant')
		const exported = exportTable(t)
		expect(exported.indexes ?? []).toHaveLength(0)
	})

	test('declared regular/search/vector indexes land on the table', () => {
		const t = zodTable('things', shape, {
			indexes: { by_agent: ['agentId'] },
			searchIndexes: {
				search_name: { searchField: 'name', filterFields: ['agentId'] },
			},
			vectorIndexes: {
				by_embedding: {
					vectorField: 'name',
					dimensions: 1536,
					filterFields: ['agentId'],
				},
			},
		})
		const exported = exportTable(t)
		expect(exported.indexes.map((i) => i.indexDescriptor)).toContain('by_agent')
		expect(exported.searchIndexes.map((i) => i.indexDescriptor)).toContain(
			'search_name',
		)
		expect(exported.vectorIndexes[0]?.dimensions).toBe(1536)
	})
})

describe('tenantTable', () => {
	test('injects required tenant field and auto by_tenant index', () => {
		const t = tenantTable('things', shape)
		expect(t.schema.shape.tenant).toBeDefined()
		expect(t.insertSchema.safeParse({ name: 'a', agentId: 'b' }).success).toBe(
			false,
		)
		expect(
			t.insertSchema.safeParse({ name: 'a', agentId: 'b', tenant: 'org_1' })
				.success,
		).toBe(true)
		const byTenant = exportTable(t).indexes.find(
			(i) => i.indexDescriptor === 'by_tenant',
		)
		expect(byTenant?.fields).toEqual(['tenant'])
	})

	test('caller indexes are verbatim and coexist with by_tenant', () => {
		const t = tenantTable('things', shape, {
			indexes: { by_agent: ['agentId'] },
		})
		const names = exportTable(t).indexes.map((i) => i.indexDescriptor)
		expect(names).toContain('by_tenant')
		expect(names).toContain('by_agent')
		const byAgent = exportTable(t).indexes.find(
			(i) => i.indexDescriptor === 'by_agent',
		)
		expect(byAgent?.fields).toEqual(['agentId'])
	})

	test('throws on tenant key collision in the caller shape', () => {
		expect(() => tenantTable('things', () => ({ tenant: z.string() }))).toThrow(
			/owns that field/,
		)
	})

	test('throws when caller declares by_tenant manually', () => {
		expect(() =>
			tenantTable('things', shape, { indexes: { by_tenant: ['tenant'] } }),
		).toThrow(/added automatically/)
	})
})

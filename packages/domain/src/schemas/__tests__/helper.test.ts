import { describe, expect, test } from 'vite-plus/test'
import { z } from 'zod'

import { tenantTable, zodTable } from '../helper.ts'

const shape = () => ({ name: z.string(), agentId: z.string() })

describe('zodTable', () => {
	test('insertSchema omits createdAt/updatedAt; updateSchema is partial', () => {
		const t = zodTable('things', shape)
		expect(Object.keys(t.insertSchema.shape)).not.toContain('createdAt')
		expect(Object.keys(t.insertSchema.shape)).not.toContain('updatedAt')
		expect(t.updateSchema.safeParse({}).success).toBe(true)
	})

	test('declares no tenant field', () => {
		const t = zodTable('things', shape)
		expect(Object.keys(t.schema.shape)).not.toContain('tenant')
	})
})

describe('tenantTable', () => {
	test('injects required tenant field', () => {
		const t = tenantTable('things', shape)
		expect(t.schema.shape.tenant).toBeDefined()
		expect(t.insertSchema.safeParse({ name: 'a', agentId: 'b' }).success).toBe(
			false,
		)
		expect(
			t.insertSchema.safeParse({ name: 'a', agentId: 'b', tenant: 'org_1' })
				.success,
		).toBe(true)
	})
})

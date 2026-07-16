import { describe, expect, test } from 'vite-plus/test'

import type { Id } from '../../_generated/dataModel'

process.env.WORKOS_CLIENT_ID ??= 'client_test'
process.env.WORKOS_API_KEY ??= 'sk_test'
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test'

const { toAgentDetail, toAgentSummary, validateAgentAttachments } =
	await import('../agents')
const { toVariantDetail } = await import('../agentVariants')
const {
	mergeAndValidateMcpConnection,
	publicMcpCreateInput,
	publicMcpUpdatePatch,
	toMcpConnectionDto,
} = await import('../mcpConnections')
const {
	isSystemToolReference,
	parseMcpToolReference,
	toProcedureDto,
	validateProcedureReferences,
} = await import('../procedures')

const tenantContext = (
	tenant: string,
	rows: Record<string, { tenant: string }>,
) =>
	({
		tenant,
		db: {
			normalizeId: (_table: string, id: string) => id,
			get: async (id: string) => rows[id] ?? null,
		},
	}) as unknown as Parameters<typeof validateAgentAttachments>[0]

describe('configuration data-service projections', () => {
	test('Agent summaries expose only the management contract', () => {
		const agent = {
			_id: 'agent_1' as Id<'agents'>,
			_creationTime: 10,
			tenant: 'org_secret',
			name: 'Support',
			archived: false,
			mainVariantId: 'variant_1' as Id<'agentVariants'>,
			allocationRevision: 2,
			createdAt: '2026-07-15T00:00:00.000Z',
			updatedAt: '2026-07-15T01:00:00.000Z',
		}
		const summary = toAgentSummary(agent)
		expect(summary).toEqual({
			id: 'agent_1',
			name: 'Support',
			archived: false,
			mainVariantId: 'variant_1',
			allocationRevision: 2,
			createdAt: '2026-07-15T00:00:00.000Z',
			updatedAt: '2026-07-15T01:00:00.000Z',
			creationTime: 10,
		})
		expect(summary).not.toHaveProperty('tenant')
	})

	test('Agent details expose stable deployment identity only', () => {
		const agent = {
			_id: 'agent_1' as Id<'agents'>,
			_creationTime: 10,
			tenant: 'org_secret',
			name: 'Support',
			mainVariantId: 'variant_1' as Id<'agentVariants'>,
			allocationRevision: 2,
			archived: false,
			createdAt: '2026-07-15T00:00:00.000Z',
		}
		const detail = toAgentDetail(agent)
		expect(detail).toMatchObject({
			id: 'agent_1',
			name: 'Support',
			mainVariantId: 'variant_1',
			allocationRevision: 2,
		})
		expect(detail).not.toHaveProperty('draft')
		expect(detail).not.toHaveProperty('tenant')
	})

	test('Agent Variant details explicitly project safe draft configuration', () => {
		const detail = toVariantDetail({
			_id: 'variant_1' as Id<'agentVariants'>,
			_creationTime: 11,
			tenant: 'org_secret',
			agentId: 'agent_1' as Id<'agents'>,
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 10_000,
			publishedVersionId: 'version_1' as Id<'agentVersions'>,
			draft: {
				instructions: 'Help the caller.',
				model: { provider: 'openai', model: 'gpt-realtime' },
				voice: 'marin',
				vad: { mode: 'server_vad' },
				systemTools: {},
				mcp: [{ connectionId: 'mcp_1' }],
				knowledgeBase: [{ documentId: 'kb_1', usageMode: 'prompt' }],
				inboundWorkflow: { enabled: true, firstSpeaker: 'caller' },
				outboundWorkflow: { enabled: true, firstSpeaker: 'agent' },
			},
			archived: false,
			createdAt: '2026-07-15T00:00:00.000Z',
		})
		expect(detail.draft).toMatchObject({
			mcp: [{ connectionId: 'mcp_1' }],
			knowledgeBase: [{ documentId: 'kb_1', usageMode: 'prompt' }],
			inboundWorkflow: { enabled: true, firstSpeaker: 'caller' },
			outboundWorkflow: { enabled: true, firstSpeaker: 'agent' },
		})
		expect(detail).not.toHaveProperty('tenant')
	})

	test('Agent attachments reject missing and cross-tenant resources', async () => {
		const ctx = tenantContext('org_a', {
			kbOwn: { tenant: 'org_a' },
			mcpForeign: { tenant: 'org_b' },
		})
		await expect(
			validateAgentAttachments(ctx, {
				knowledgeBase: [{ documentId: 'kbOwn', usageMode: 'prompt' }],
				mcp: [{ connectionId: 'mcpForeign' }],
			}),
		).rejects.toThrow(/MCP connection not found/)
		await expect(
			validateAgentAttachments(ctx, {
				knowledgeBase: [{ documentId: 'kbMissing', usageMode: 'auto' }],
				mcp: [],
			}),
		).rejects.toThrow(/knowledge base document not found/)
	})

	test('MCP DTOs expose header state without credential values', () => {
		const dto = toMcpConnectionDto({
			_id: 'mcp_1' as Id<'mcpConnections'>,
			_creationTime: 10,
			tenant: 'org_secret',
			kind: 'byo',
			name: 'CRM',
			url: 'https://mcp.example.com',
			transport: 'sse',
			secretRef: 'vault://token',
			requestHeaders: {
				authorization: { secretRef: 'vault://auth' },
				'x-public-client': 'client-secret-value',
			},
			approvalPolicy: 'require_approval_all',
			toolApprovals: [],
			responseTimeoutSecs: 30,
			toolConfigOverrides: [],
			status: 'active',
			createdAt: '2026-07-15T00:00:00.000Z',
		})
		expect(dto).not.toHaveProperty('tenant')
		expect(dto).not.toHaveProperty('secretRef')
		expect(JSON.stringify(dto)).not.toContain('vault://')
		expect(JSON.stringify(dto)).not.toContain('client-secret-value')
		expect(dto.headers).toEqual([
			{ name: 'authorization', configured: true, source: 'secret' },
			{ name: 'x-public-client', configured: true, source: 'literal' },
		])
	})

	test('public MCP input schemas reject credential-bearing fields', () => {
		const validCreate = {
			kind: 'byo' as const,
			name: 'CRM',
			url: 'https://mcp.example.com',
			transport: 'sse' as const,
			approvalPolicy: 'require_approval_all' as const,
			toolApprovals: [],
			responseTimeoutSecs: 30,
			toolConfigOverrides: [],
			status: 'active' as const,
		}
		expect(publicMcpCreateInput.safeParse(validCreate).success).toBe(true)
		expect(
			publicMcpCreateInput.safeParse({
				...validCreate,
				secretRef: 'vault://token',
			}).success,
		).toBe(false)
		expect(
			publicMcpUpdatePatch.safeParse({
				requestHeaders: { authorization: 'secret' },
			}).success,
		).toBe(false)
	})

	test('MCP partial updates validate the merged connection kind', () => {
		expect(() =>
			mergeAndValidateMcpConnection(
				{
					kind: 'byo',
					name: 'CRM',
					url: 'https://mcp.example.com',
				},
				{ kind: 'composio', url: undefined },
			),
		).toThrow(/composioAccountId/)
	})

	test('system tool references accept only canonical slugs', () => {
		expect(isSystemToolReference('end_call')).toBe(true)
		expect(isSystemToolReference('invented_tool')).toBe(false)
	})

	test('MCP tool references require connectionId:toolName', () => {
		expect(parseMcpToolReference('connection_1:search')).toEqual({
			connectionId: 'connection_1',
			toolName: 'search',
		})
		expect(parseMcpToolReference('missing-tool')).toBeNull()
		expect(parseMcpToolReference(':missing-connection')).toBeNull()
		expect(parseMcpToolReference('connection_1:')).toBeNull()
	})

	test('Procedure references resolve by target type and reject self refs', async () => {
		const ctx = tenantContext('org_a', {
			mcpOwn: { tenant: 'org_a' },
			kbOwn: { tenant: 'org_a' },
			procedureOwn: { tenant: 'org_a' },
		}) as Parameters<typeof validateProcedureReferences>[0]
		await expect(
			validateProcedureReferences(ctx, [
				{
					location: 'content',
					targetType: 'system_tool',
					targetId: 'end_call',
					health: 'valid',
				},
				{
					location: 'content',
					targetType: 'mcp_tool',
					targetId: 'mcpOwn:search',
					health: 'valid',
				},
				{
					location: 'content',
					targetType: 'knowledge_base',
					targetId: 'kbOwn',
					health: 'valid',
				},
				{
					location: 'content',
					targetType: 'procedure',
					targetId: 'procedureOwn',
					health: 'valid',
				},
			]),
		).resolves.toBeUndefined()
		await expect(
			validateProcedureReferences(
				ctx,
				[
					{
						location: 'content',
						targetType: 'procedure',
						targetId: 'procedureOwn',
						health: 'valid',
					},
				],
				'procedureOwn',
			),
		).rejects.toThrow(/cannot reference itself/)
	})

	test('Procedure DTOs omit tenant internals', () => {
		const dto = toProcedureDto({
			_id: 'procedure_1' as Id<'procedures'>,
			_creationTime: 10,
			tenant: 'org_secret',
			agentVariantId: 'variant_1' as Id<'agentVariants'>,
			name: 'Refunds',
			type: 'free_form',
			trigger: 'refund request',
			content: 'Handle the refund.',
			references: [],
			source: 'manual',
			status: 'active',
			createdAt: '2026-07-15T00:00:00.000Z',
		})
		expect(dto).toMatchObject({
			id: 'procedure_1',
			agentVariantId: 'variant_1',
			name: 'Refunds',
			status: 'active',
		})
		expect(dto).not.toHaveProperty('tenant')
	})
})

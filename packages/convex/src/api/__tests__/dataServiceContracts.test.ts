import { describe, expect, test } from 'vite-plus/test'

import { nativePaginationOpts, queryStreamPaginationOpts } from '../../lib'
import { requirePermission } from '../../tenancy'
import { toVariantSummary } from '../agentVariantDtos'
import { toConversationDetailDto } from '../conversationDtos'
import {
	hasValidMachineAuthorization,
	serviceTokensMatch,
} from '../internals/machineAuth'
import { toMachineError } from '../internals/machineErrors'

describe('public data-service contracts', () => {
	test('native pagination accepts only a bounded cursor request', () => {
		expect(nativePaginationOpts.parse({ cursor: null, numItems: 100 })).toEqual(
			{ cursor: null, numItems: 100 },
		)
		expect(() =>
			nativePaginationOpts.parse({ cursor: null, numItems: 101 }),
		).toThrow(/<=100/)
		expect(() =>
			nativePaginationOpts.parse({
				cursor: null,
				numItems: 25,
				endCursor: 'stream-only',
			}),
		).toThrow(/unrecognized key/i)
	})

	test('QueryStream pagination accepts the helper-managed end cursor', () => {
		expect(
			queryStreamPaginationOpts.parse({
				cursor: 'start',
				numItems: 25,
				endCursor: 'end',
			}),
		).toEqual({ cursor: 'start', numItems: 25, endCursor: 'end' })
	})

	test('permission checks accept explicit claims and admin ownership', () => {
		expect(() =>
			requirePermission({ permissions: ['prompts:read'] }, 'prompts:read'),
		).not.toThrow()
		expect(() =>
			requirePermission({ role: 'owner' }, 'conversations:read'),
		).not.toThrow()
		expect(() =>
			requirePermission({ role: 'reader' }, 'prompts:write'),
		).toThrow(/prompts:write/)
	})

	test('machine authorization requires an exact bearer token', () => {
		expect(serviceTokensMatch('secret', 'secret')).toBe(true)
		expect(serviceTokensMatch('secret', 'secrex')).toBe(false)
		expect(serviceTokensMatch('short', 'longer')).toBe(false)
		expect(hasValidMachineAuthorization('Bearer secret', 'secret')).toBe(true)
		expect(hasValidMachineAuthorization('Basic secret', 'secret')).toBe(false)
		expect(hasValidMachineAuthorization('Bearer wrong', 'secret')).toBe(false)
		expect(hasValidMachineAuthorization(undefined, 'secret')).toBe(false)
	})

	test('machine failures expose only stable allowlisted codes', () => {
		expect(toMachineError(new Error('idempotency_conflict'))).toEqual({
			code: 'idempotency_conflict',
			status: 409,
		})
		expect(toMachineError(new Error('database details'))).toEqual({
			code: 'machine_request_failed',
			status: 500,
		})
	})

	test('Variant summaries expose readiness without mutable draft contents', () => {
		const summary = toVariantSummary({
			_id: 'variant_1',
			_creationTime: 1,
			tenant: 'org_a',
			agentId: 'agent_1',
			name: 'Main',
			isMain: true,
			allocationOrdinal: 1,
			trafficWeightBps: 10_000,
			publishedVersionId: 'version_1',
			draft: {
				instructions: 'private prompt',
				model: { provider: 'openai', model: 'gpt-realtime' },
				voice: 'marin',
				vad: { mode: 'server_vad' },
				systemTools: {},
				mcp: [{ connectionId: 'mcp_1' }],
				knowledgeBase: [{ documentId: 'kb_1', usageMode: 'auto' }],
				inboundWorkflow: { enabled: true, firstSpeaker: 'caller' },
				outboundWorkflow: { enabled: false, firstSpeaker: 'agent' },
			},
			archived: false,
			createdAt: '2026-07-16T00:00:00.000Z',
		} as never)

		expect(summary).toMatchObject({
			hasPublishedVersion: true,
			workflowReadiness: { inbound: true, outbound: false },
			configurationHealth: {
				knowledgeBaseAttachments: 1,
				mcpConnections: 1,
			},
		})
		expect(summary).not.toHaveProperty('draft')
		expect(JSON.stringify(summary)).not.toContain('private prompt')
	})

	test('Conversation detail exposes immutable routing and masks participants', () => {
		const detail = toConversationDetailDto({
			_id: 'conversation_1',
			_creationTime: 1,
			tenant: 'org_a',
			conversationKey: 'call_1',
			idempotencyFingerprint: 'private',
			agentId: 'agent_1',
			agentVariantId: 'variant_1',
			agentVersionId: 'version_1',
			allocationMode: 'weighted',
			allocationBucket: 42,
			allocationRevision: 3,
			workflow: 'outbound',
			provider: 'openai',
			channel: 'voice_outbound',
			direction: 'outbound',
			status: 'initiated',
			startedAt: '2026-07-16T00:00:00.000Z',
			phoneNumberId: 'phone_1',
			callerIdSelectionReason: 'rule:regional',
			externalNumber: '+18095551234',
			hasAudio: false,
			messageCount: 0,
			createdAt: '2026-07-16T00:00:00.000Z',
		} as never)

		expect(detail).toMatchObject({
			agentVariantId: 'variant_1',
			agentVersionId: 'version_1',
			allocationMode: 'weighted',
			allocationBucket: 42,
			allocationRevision: 3,
			workflow: 'outbound',
			callerIdSelectionReason: 'rule:regional',
			externalNumber: '********1234',
		})
		expect(detail).not.toHaveProperty('tenant')
		expect(detail).not.toHaveProperty('idempotencyFingerprint')
	})
})

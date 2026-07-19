import { z } from 'zod'

import { AGENT_TRAFFIC_BPS_TOTAL } from './agents.ts'
import { tenantTable } from './helper.ts'
import { PROVIDERS } from './shared.ts'

/**
 * Conversations substrate (ERD §2, plan Unit 6): with raw model providers our
 * Convex mirror IS the system of record for calls. Transcripts are always
 * stored (captured live from the session); audio only when the tenant's
 * recording setting is on. Written by machine paths only — tenant is derived
 * from the owning resource. Indexes live at the schema definition site.
 */

export const CONVERSATION_CHANNELS = [
	'voice_inbound',
	'voice_outbound',
	'whatsapp',
	'sms',
	'web',
] as const
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number]

export const CONVERSATION_STATUSES = [
	'initiated',
	'in_progress',
	'processing',
	'done',
	'failed',
] as const
export const CONVERSATION_DIRECTIONS = ['inbound', 'outbound'] as const
export const MESSAGE_ROLES = ['user', 'agent', 'system'] as const

export const SUCCESS_STATUSES = ['success', 'failure', 'unknown'] as const
export const ALLOCATION_MODES = ['weighted', 'override', 'direct'] as const
export const WORKFLOW_ATTRIBUTIONS = ['inbound', 'outbound', 'none'] as const

export const conversations = tenantTable('conversations', (id) => ({
	conversationKey: z.string().min(1).max(255),
	idempotencyFingerprint: z.string().min(1).max(1_000),
	agentId: id('agents'),
	agentVariantId: id('agentVariants'),
	agentVersionId: id('agentVersions'),
	allocationMode: z.enum(ALLOCATION_MODES),
	allocationBucket: z
		.number()
		.int()
		.min(0)
		.max(AGENT_TRAFFIC_BPS_TOTAL - 1)
		.optional(),
	allocationRevision: z.number().int().nonnegative().optional(),
	workflow: z.enum(WORKFLOW_ATTRIBUTIONS),
	provider: z.enum(PROVIDERS),
	providerSessionId: z.string().optional(),
	channel: z.enum(CONVERSATION_CHANNELS),
	direction: z.enum(CONVERSATION_DIRECTIONS),
	status: z.enum(CONVERSATION_STATUSES),
	startedAt: z.string(),
	acceptedAt: z.string().optional(),
	endedAt: z.string().optional(),
	durationSecs: z.number().nonnegative().optional(),
	// channel refs (mutually exclusive where applicable)
	phoneNumberId: id('phoneNumbers').optional(),
	phoneNumberSnapshot: z
		.object({
			number: z.string(),
			provider: z.enum(['twilio', 'sip_trunk']),
			providerNumberId: z.string(),
			telephonyConnectionId: z.string(),
		})
		.optional(),
	callerIdSelectionReason: z.string().optional(),
	whatsappAccountId: id('whatsappAccounts').optional(),
	batchCallRecipientId: id('batchCallRecipients').optional(),
	externalNumber: z.string().optional(),
	/** Set once the retention purge or an erasure request redacted PII. */
	redactedAt: z.string().optional(),
	// rollups
	usage: z
		.object({
			inputTokens: z.number().int().nonnegative(),
			outputTokens: z.number().int().nonnegative(),
			costUsd: z.number().nonnegative().optional(),
		})
		.optional(),
	hasAudio: z.boolean().default(false),
	messageCount: z.number().int().nonnegative().default(0),
	// post-call analysis placeholders (jobs are a follow-up plan)
	summary: z.string().optional(),
	successStatus: z.enum(SUCCESS_STATUSES).optional(),
	terminationReason: z.string().optional(),
}))

export const toolCallPayload = z.object({
	callId: z.string(),
	name: z.string(),
	argsJson: z.string(),
})

export const toolResultPayload = z.object({
	callId: z.string(),
	output: z.string(),
	isError: z.boolean().default(false),
	latencyMs: z.number().nonnegative().optional(),
	retrievalEntryIds: z.array(z.string()).optional(),
})

export const conversationMessages = tenantTable(
	'conversationMessages',
	(id) => ({
		conversationId: id('conversations'),
		/** Denormalized for the search index filter. */
		agentId: id('agents'),
		agentVariantId: id('agentVariants'),
		/** Stable runtime event key for transport-safe append retries. */
		messageKey: z.string().min(1).max(255).optional(),
		idempotencyFingerprint: z.string().min(1).max(4_000).optional(),
		/** Monotonic per conversation; assigned by the append mutation. */
		sequence: z.number().int().positive(),
		role: z.enum(MESSAGE_ROLES),
		text: z.string().optional(),
		toolCalls: z.array(toolCallPayload).optional(),
		toolResults: z.array(toolResultPayload).optional(),
		timeInCallSecs: z.number().nonnegative().optional(),
		interrupted: z.boolean().default(false),
		audioStorageId: z.string().optional(),
	}),
)

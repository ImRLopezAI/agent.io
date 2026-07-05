import { z } from 'zod'

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

export const conversations = tenantTable('conversations', (id) => ({
	agentId: id('agents'),
	agentVersionId: id('agentVersions'),
	provider: z.enum(PROVIDERS),
	providerSessionId: z.string().optional(),
	channel: z.enum(CONVERSATION_CHANNELS),
	direction: z.enum(CONVERSATION_DIRECTIONS),
	status: z.enum(CONVERSATION_STATUSES),
	startedAt: z.string(),
	acceptedAt: z.string().optional(),
	endedAt: z.string().optional(),
	durationSecs: z.number().nonnegative().optional(),
	// channel refs (mutually exclusive)
	phoneNumberId: id('phoneNumbers').optional(),
	batchCallRecipientId: id('batchCallRecipients').optional(),
	externalNumber: z.string().optional(),
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
})

export const conversationMessages = tenantTable(
	'conversationMessages',
	(id) => ({
		conversationId: id('conversations'),
		/** Denormalized for the search index filter. */
		agentId: id('agents'),
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

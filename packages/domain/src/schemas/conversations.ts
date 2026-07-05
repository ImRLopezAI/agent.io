import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Conversations substrate (ERD §2, plan Unit 6): with raw model providers our
 * Convex mirror IS the system of record for calls. Transcripts are always
 * stored (captured live from the session); audio only when the tenant's
 * recording setting is on. Written by machine paths only (webhook ingestion /
 * TranscriptRecorder) — tenant is derived from the owning resource.
 */

export const conversationChannel = z.enum([
	'voice_inbound',
	'voice_outbound',
	'whatsapp',
	'sms',
	'web',
])
export type ConversationChannel = z.infer<typeof conversationChannel>

export const Conversations = tenantTable(
	'conversations',
	(id) => ({
		agentId: id('agents'),
		agentVersionId: id('agentVersions'),
		provider: z.enum(['openai', 'xai']),
		providerSessionId: z.string().optional(),
		channel: conversationChannel,
		direction: z.enum(['inbound', 'outbound']),
		status: z.enum([
			'initiated',
			'in_progress',
			'processing',
			'done',
			'failed',
		]),
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
		successStatus: z.enum(['success', 'failure', 'unknown']).optional(),
		terminationReason: z.string().optional(),
	}),
	{
		indexes: {
			by_agent: ['agentId'],
			by_status: ['tenant', 'status'],
		},
	},
)

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

export const ConversationMessages = tenantTable(
	'conversationMessages',
	(id) => ({
		conversationId: id('conversations'),
		/** Denormalized for the search index filter. */
		agentId: id('agents'),
		/** Monotonic per conversation; assigned by the append mutation. */
		sequence: z.number().int().positive(),
		role: z.enum(['user', 'agent', 'system']),
		text: z.string().optional(),
		toolCalls: z.array(toolCallPayload).optional(),
		toolResults: z.array(toolResultPayload).optional(),
		timeInCallSecs: z.number().nonnegative().optional(),
		interrupted: z.boolean().default(false),
		audioStorageId: z.string().optional(),
	}),
	{
		indexes: { by_conversation: ['conversationId', 'sequence'] },
		searchIndexes: {
			search_text: {
				searchField: 'text',
				filterFields: ['tenant', 'conversationId', 'agentId', 'role'],
			},
		},
	},
)

import { z } from 'zod'

import { now } from '../lib'
import { assertSameTenant } from '../tenancy'
import { machineMutation, tenantQuery } from '../utils'

/**
 * Machine-path conversation substrate (ADR 0001): tenant is NEVER an
 * argument — it derives from the owning resource. These are internal
 * functions, reachable only through the authenticated HTTP surface.
 */

const startShape = {
	provider: z.enum(['openai', 'xai']),
	providerSessionId: z.string().optional(),
	channel: z.enum([
		'voice_inbound',
		'voice_outbound',
		'whatsapp',
		'sms',
		'web',
	]),
	direction: z.enum(['inbound', 'outbound']),
	externalNumber: z.string().optional(),
}

/** Inbound telephony: owner = the phone number that received the call. */
export const startFromPhoneNumber = machineMutation('phoneNumbers')({
	args: { ...startShape, agentVersionId: z.string() },
	handler: async (ctx, { agentVersionId, ...args }) => {
		const versionId = ctx.db.normalizeId('agentVersions', agentVersionId)
		if (!versionId) throw new Error('invalid agentVersionId')
		const version = await ctx.db.get(versionId)
		const phone = ctx.owner as { _id: string; tenant: string }
		assertSameTenant(ctx.tenant, [version])
		if (!version) throw new Error('agent version not found')
		return ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			agentId: version.agentId,
			agentVersionId: versionId,
			phoneNumberId: phone._id as never,
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
			...args,
		})
	},
})

/** Non-telephony channels (web, outbound API): owner = the agent version. */
export const startFromVersion = machineMutation('agentVersions')({
	args: startShape,
	handler: async (ctx, args) => {
		const version = ctx.owner as {
			_id: string
			agentId: string
			tenant: string
		}
		return ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			agentId: version.agentId as never,
			agentVersionId: version._id as never,
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
			...args,
		})
	},
})

/**
 * Append one turn. `sequence` is assigned mutation-side via read-max+1
 * (OCC-safe per conversation; stays correct if a second writer appears).
 */
export const appendMessage = machineMutation('conversations')({
	args: {
		role: z.enum(['user', 'agent', 'system']),
		text: z.string().optional(),
		toolCalls: z
			.array(
				z.object({
					callId: z.string(),
					name: z.string(),
					argsJson: z.string(),
				}),
			)
			.optional(),
		toolResults: z
			.array(
				z.object({
					callId: z.string(),
					output: z.string(),
					isError: z.boolean().default(false),
					latencyMs: z.number().nonnegative().optional(),
				}),
			)
			.optional(),
		timeInCallSecs: z.number().nonnegative().optional(),
		interrupted: z.boolean().default(false),
		audioStorageId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const conversation = ctx.owner as {
			_id: string
			agentId: string
			status: string
			messageCount: number
			tenant: string
		}
		if (conversation.status === 'done' || conversation.status === 'failed') {
			throw new Error(`cannot append to a ${conversation.status} conversation`)
		}
		const last = await ctx.db
			.query('conversationMessages')
			.withIndex('by_conversation', (q) =>
				q.eq('conversationId', conversation._id as never),
			)
			.order('desc')
			.first()
		const sequence = (last?.sequence ?? 0) + 1
		const messageId = await ctx.db.insert('conversationMessages', {
			tenant: ctx.tenant,
			conversationId: conversation._id as never,
			agentId: conversation.agentId as never,
			sequence,
			createdAt: now(),
			...args,
		})
		await ctx.db.patch(
			conversation._id as never,
			{
				messageCount: conversation.messageCount + 1,
				status: 'in_progress',
				...(args.audioStorageId ? { hasAudio: true } : {}),
			} as never,
		)
		return { messageId, sequence }
	},
})

export const finish = machineMutation('conversations')({
	args: {
		status: z.enum(['done', 'failed']),
		terminationReason: z.string().optional(),
		durationSecs: z.number().nonnegative().optional(),
		usage: z
			.object({
				inputTokens: z.number().int().nonnegative(),
				outputTokens: z.number().int().nonnegative(),
				costUsd: z.number().nonnegative().optional(),
			})
			.optional(),
	},
	handler: async (ctx, args) => {
		const conversation = ctx.owner as { _id: string }
		await ctx.db.patch(
			conversation._id as never,
			{
				...args,
				endedAt: now(),
			} as never,
		)
	},
})

// ---------------------------------------------------------------------------
// Back-office reads (user path)
// ---------------------------------------------------------------------------

export const list = tenantQuery({
	args: { status: z.string().optional() },
	handler: async (ctx, { status }) => {
		if (status) {
			return ctx.db
				.query('conversations')
				.withIndex('by_status', (q) =>
					q.eq('tenant', ctx.tenant).eq('status', status as never),
				)
				.order('desc')
				.take(100)
		}
		return ctx.db
			.query('conversations')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.order('desc')
			.take(100)
	},
})

export const messages = tenantQuery({
	args: { conversationId: z.string() },
	handler: async (ctx, { conversationId }) => {
		const id = ctx.db.normalizeId('conversations', conversationId)
		if (!id) return []
		return ctx.db
			.query('conversationMessages')
			.withIndex('by_conversation', (q) => q.eq('conversationId', id))
			.collect()
	},
})

export const searchTranscripts = tenantQuery({
	args: { text: z.string(), conversationId: z.string().optional() },
	handler: async (ctx, { text, conversationId }) => {
		return ctx.db
			.query('conversationMessages')
			.withSearchIndex('search_text', (q) => {
				const base = q.search('text', text).eq('tenant', ctx.tenant)
				const id = conversationId
					? ctx.db.normalizeId('conversations', conversationId)
					: null
				return id ? base.eq('conversationId', id) : base
			})
			.take(50)
	},
})

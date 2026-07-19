import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import { now } from '../../lib'

/**
 * PII lifecycle (plan U8): transcripts, audio, participant phone numbers, and
 * the (secret) conversationKey are redacted after the retention window or on
 * an erasure request. Attribution and rollup fields survive for analytics.
 * All sweeps run in bounded batches and self-reschedule — one unbounded
 * mutation would hit Convex document limits and silently stop.
 */

const BATCH_LIMIT = 25
/** Per-conversation message-deletion cap: keeps one purge transaction bounded
 * even for very long transcripts; incomplete conversations stay unredacted so
 * the next sweep (or self-reschedule) resumes them. */
const MESSAGE_DELETE_LIMIT = 200

/** Returns true when the conversation is fully redacted, false when more
 * messages remain and the caller should resume in a later transaction. */
const redactConversation = async (
	ctx: MutationCtx,
	conversation: Doc<'conversations'>,
): Promise<boolean> => {
	const messages = await ctx.db
		.query('conversationMessages')
		.withIndex('by_conversation', (q) =>
			q.eq('conversationId', conversation._id),
		)
		.take(MESSAGE_DELETE_LIMIT)
	for (const message of messages) {
		if (message.audioStorageId) {
			await ctx.storage.delete(message.audioStorageId as never).catch(() => {})
		}
		await ctx.db.delete(message._id)
	}
	if (messages.length === MESSAGE_DELETE_LIMIT) return false
	await ctx.db.patch(conversation._id, {
		externalNumber: undefined,
		summary: undefined,
		...(conversation.phoneNumberSnapshot
			? {
					phoneNumberSnapshot: {
						...conversation.phoneNumberSnapshot,
						number: 'redacted',
					},
				}
			: {}),
		// The key is inert secret material once redacted; replace with a
		// non-guessable, non-colliding marker so the unique index holds.
		conversationKey: `redacted:${conversation._id}`,
		redactedAt: now(),
	})
	if (conversation.batchCallRecipientId) {
		const recipient = await ctx.db.get(conversation.batchCallRecipientId)
		if (recipient) {
			await ctx.db.patch(recipient._id, {
				phoneNumber: 'redacted',
				updatedAt: now(),
			})
		}
	}
	return true
}

export const purgeExpiredConversationData = internalMutation({
	args: {
		retentionDays: v.number(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(args.limit ?? BATCH_LIMIT, 100)
		const cutoffMs = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000
		const cutoffIso = new Date(cutoffMs).toISOString()
		let processed = 0

		// Sweep A: finished, unredacted conversations past the window.
		// `endedAt` is normalized fixed-width ISO-8601 UTC (lib `now()`), so
		// string range comparison is chronological.
		const expired = await ctx.db
			.query('conversations')
			.withIndex('by_redaction', (q) =>
				q.eq('redactedAt', undefined).lt('endedAt', cutoffIso),
			)
			.filter((q) => q.neq(q.field('endedAt'), undefined))
			.take(limit)
		for (const conversation of expired) {
			const complete = await redactConversation(ctx, conversation)
			// An incomplete redaction stays unredacted and is picked up again;
			// force a reschedule so long transcripts drain promptly.
			processed += complete ? 1 : limit
		}

		// Sweep B: abandoned non-terminal conversations older than the window
		// (caller crashed before `finish`) — fail them so Sweep A redacts them
		// on a later run. Built-in creation-time paging, no extra index.
		const abandoned = await ctx.db
			.query('conversations')
			.withIndex('by_creation_time', (q) => q.lt('_creationTime', cutoffMs))
			.filter((q) =>
				q.and(
					q.neq(q.field('status'), 'done'),
					q.neq(q.field('status'), 'failed'),
				),
			)
			.take(limit)
		for (const conversation of abandoned) {
			await ctx.db.patch(conversation._id, {
				status: 'failed',
				terminationReason:
					conversation.status === 'initiated' ? 'never_dialed' : 'abandoned',
				endedAt: now(),
			})
			processed += 1
		}

		// Sweep C: batch jobs past the window whose recipient numbers were
		// never redacted (covers never-dialed recipients with no Conversation).
		const staleJobs = await ctx.db
			.query('batchCallJobs')
			.withIndex('by_creation_time', (q) => q.lt('_creationTime', cutoffMs))
			.filter((q) => q.eq(q.field('redactedAt'), undefined))
			.take(limit)
		for (const job of staleJobs) {
			const recipients = await ctx.db
				.query('batchCallRecipients')
				.withIndex('by_batch', (q) => q.eq('batchId', job._id))
				.collect()
			for (const recipient of recipients) {
				if (recipient.phoneNumber !== 'redacted') {
					await ctx.db.patch(recipient._id, {
						phoneNumber: 'redacted',
						updatedAt: now(),
					})
				}
			}
			await ctx.db.patch(job._id, { redactedAt: now() })
			processed += 1
		}

		// Full batches mean more work remains — continue in a fresh transaction.
		if (processed >= limit) {
			await ctx.scheduler.runAfter(
				0,
				internal.api.internals.retention.purgeExpiredConversationData,
				args,
			)
		}
		return { processed }
	},
})

/**
 * GDPR/CCPA erasure primitive: redacts the named conversations (messages,
 * audio, participant numbers, key) regardless of age. Foreign-tenant ids are
 * indistinguishable from missing.
 */
export const deleteConversationData = internalMutation({
	args: {
		tenant: v.string(),
		conversationIds: v.array(v.id('conversations')),
	},
	handler: async (ctx, args) => {
		let redacted = 0
		const incomplete: Id<'conversations'>[] = []
		for (const conversationId of args.conversationIds) {
			const conversation = await ctx.db.get(
				conversationId as Id<'conversations'>,
			)
			if (!conversation || conversation.tenant !== args.tenant) continue
			if (await redactConversation(ctx, conversation)) {
				redacted += 1
			} else {
				incomplete.push(conversation._id)
			}
		}
		if (incomplete.length > 0) {
			await ctx.scheduler.runAfter(
				0,
				internal.api.internals.retention.deleteConversationData,
				{ tenant: args.tenant, conversationIds: incomplete },
			)
		}
		return { redacted, resumed: incomplete.length }
	},
})

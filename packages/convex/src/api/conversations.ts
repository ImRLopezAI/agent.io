import {
	CONVERSATION_CHANNELS,
	CONVERSATION_DIRECTIONS,
	CONVERSATION_STATUSES,
	MESSAGE_ROLES,
	PROVIDERS,
	toolCallPayload,
	toolResultPayload,
} from '@agent.io/domain/schemas'
import { v } from 'convex/values'
import { z } from 'zod'

import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { nativePaginationOpts, now } from '../lib'
import {
	machineMutation,
	internalQuery,
	requirePermission,
	resolveTenantId,
	tenantQuery,
} from '../utils'
import {
	toConversationDetailDto,
	toConversationMessageDto,
	toConversationSummaryDto,
} from './conversationDtos'
import {
	resolveAgentDeployment,
	type ResolvedDeployment,
} from './internals/agentRouting'
import { selectOutboundNumber } from './phoneRouting'

/**
 * Machine-path conversation substrate (ADR 0001): tenant is NEVER an
 * argument — it derives from the owning resource. These are internal
 * functions, reachable only through the authenticated HTTP surface.
 */

const startBaseShape = {
	conversationKey: z.string().min(1).max(255),
	provider: z.enum(PROVIDERS),
	providerSessionId: z.string().optional(),
	externalNumber: z.string().optional(),
}

const fingerprint = (value: Record<string, unknown>) => JSON.stringify(value)

const toDeploymentAttribution = (deployment: ResolvedDeployment) => ({
	agentId: deployment.agent._id,
	agentVariantId: deployment.variant._id,
	agentVersionId: deployment.version._id,
	allocationMode: deployment.allocationMode,
	allocationBucket: deployment.allocationBucket,
	allocationRevision: deployment.allocationRevision,
	workflow: deployment.workflow,
})

const existingConversation = async (
	ctx: Pick<MutationCtx, 'db'> & { tenant: string },
	conversationKey: string,
	idempotencyFingerprint: string,
) => {
	const existing = await ctx.db
		.query('conversations')
		.withIndex('by_tenant_and_conversationKey', (q) =>
			q.eq('tenant', ctx.tenant).eq('conversationKey', conversationKey),
		)
		.unique()
	if (!existing) return null
	if (existing.idempotencyFingerprint !== idempotencyFingerprint) {
		throw new Error('idempotency_conflict')
	}
	return existing
}

export const getMachineStartResult = internalQuery({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const conversation = await ctx.db.get(conversationId)
		if (!conversation) throw new Error('conversation_not_found')
		const version = await ctx.db.get(conversation.agentVersionId)
		if (!version) throw new Error('published_version_invalid')
		const workflowConfig =
			conversation.workflow === 'inbound'
				? version.config.inboundWorkflow
				: conversation.workflow === 'outbound'
					? version.config.outboundWorkflow
					: undefined
		return {
			conversationId: conversation._id,
			agentId: conversation.agentId,
			agentVariantId: conversation.agentVariantId,
			agentVersionId: conversation.agentVersionId,
			allocationMode: conversation.allocationMode,
			allocationBucket: conversation.allocationBucket,
			allocationRevision: conversation.allocationRevision,
			workflow: conversation.workflow,
			workflowConfig,
			phone:
				conversation.phoneNumberId && conversation.phoneNumberSnapshot
					? {
							id: conversation.phoneNumberId,
							number: conversation.phoneNumberSnapshot.number,
							provider: conversation.phoneNumberSnapshot.provider,
						}
					: undefined,
			callerIdSelectionReason: conversation.callerIdSelectionReason,
			versionConfig: version.config,
		}
	},
})

export const resolveInboundPhoneNumber = internalQuery({
	args: {
		telephonyConnectionId: v.id('telephonyConnections'),
		providerNumberId: v.string(),
	},
	handler: async (ctx, { telephonyConnectionId, providerNumberId }) => {
		const connection = await ctx.db.get(telephonyConnectionId)
		if (!connection || connection.status !== 'active') {
			throw new Error('phone_number_not_routable')
		}
		const phone = await ctx.db
			.query('phoneNumbers')
			.withIndex('by_connection_provider_number', (q) =>
				q
					.eq('telephonyConnectionId', telephonyConnectionId)
					.eq('providerNumberId', providerNumberId),
			)
			.unique()
		if (!phone || phone.tenant !== connection.tenant) {
			throw new Error('phone_number_not_routable')
		}
		return phone._id
	},
})

/** Inbound telephony: owner = the phone number that received the call. */
export const startFromPhoneNumber = machineMutation('phoneNumbers')({
	args: startBaseShape,
	handler: async (ctx, args) => {
		const phone = ctx.owner as Doc<'phoneNumbers'>
		const idempotencyFingerprint = fingerprint({
			direction: 'inbound',
			ownerId: phone._id,
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			externalNumber: args.externalNumber,
		})
		const existing = await existingConversation(
			ctx as never,
			args.conversationKey,
			idempotencyFingerprint,
		)
		if (existing) return existing._id
		const connection = await ctx.db.get(phone.telephonyConnectionId)
		if (
			phone.status !== 'active' ||
			!phone.capabilities.inboundVoice ||
			!phone.assignedAgentId ||
			!connection ||
			connection.tenant !== ctx.tenant ||
			connection.status !== 'active'
		) {
			throw new Error('phone_number_not_routable')
		}
		const deployment = await resolveAgentDeployment(ctx as never, {
			agentId: phone.assignedAgentId,
			conversationKey: args.conversationKey,
			workflow: 'inbound',
		})
		return ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			conversationKey: args.conversationKey,
			idempotencyFingerprint,
			...toDeploymentAttribution(deployment),
			phoneNumberId: phone._id,
			phoneNumberSnapshot: {
				number: phone.number,
				provider: phone.provider,
				providerNumberId: phone.providerNumberId,
				telephonyConnectionId: phone.telephonyConnectionId,
			},
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			channel: 'voice_inbound',
			direction: 'inbound',
			externalNumber: args.externalNumber,
		})
	},
})

/**
 * WhatsApp: owner = the tenant's connected WhatsApp number
 * (`whatsappAccounts` row resolved by Meta phone_number_id).
 */
export const startFromWhatsappAccount = machineMutation('whatsappAccounts')({
	args: {
		...startBaseShape,
		direction: z.enum(CONVERSATION_DIRECTIONS),
	},
	handler: async (ctx, args) => {
		const account = ctx.owner as Doc<'whatsappAccounts'>
		const idempotencyFingerprint = fingerprint({
			direction: args.direction,
			ownerId: account._id,
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			externalNumber: args.externalNumber,
		})
		const existing = await existingConversation(
			ctx as never,
			args.conversationKey,
			idempotencyFingerprint,
		)
		if (existing) return existing._id
		if (
			account.status !== 'active' ||
			!account.enableMessaging ||
			!account.assignedAgentId
		) {
			throw new Error('whatsapp_account_not_routable')
		}
		const deployment = await resolveAgentDeployment(ctx as never, {
			agentId: account.assignedAgentId,
			conversationKey: args.conversationKey,
			workflow: 'none',
		})
		return ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			conversationKey: args.conversationKey,
			idempotencyFingerprint,
			...toDeploymentAttribution(deployment),
			whatsappAccountId: account._id,
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			channel: 'whatsapp',
			direction: args.direction,
			externalNumber: args.externalNumber,
		})
	},
})

/** Non-telephony channels (web, outbound API): owner = the agent version. */
export const startFromVersion = machineMutation('agentVersions')({
	args: {
		...startBaseShape,
		channel: z.enum(['sms', 'web']),
		direction: z.enum(CONVERSATION_DIRECTIONS),
	},
	handler: async (ctx, args) => {
		const version = ctx.owner as Doc<'agentVersions'>
		const idempotencyFingerprint = fingerprint({
			channel: args.channel,
			direction: args.direction,
			ownerId: version._id,
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			externalNumber: args.externalNumber,
		})
		const existing = await existingConversation(
			ctx as never,
			args.conversationKey,
			idempotencyFingerprint,
		)
		if (existing) return existing._id
		return ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			conversationKey: args.conversationKey,
			idempotencyFingerprint,
			agentId: version.agentId,
			agentVariantId: version.agentVariantId,
			agentVersionId: version._id,
			allocationMode: 'direct',
			workflow: 'none',
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			channel: args.channel,
			direction: args.direction,
			externalNumber: args.externalNumber,
		})
	},
})

export const startOutboundFromRecipient = machineMutation(
	'batchCallRecipients',
)({
	args: {
		...startBaseShape,
		destinationCountryCode: z.string().optional(),
		destinationRegionCode: z.string().optional(),
		agentVariantOverrideId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const recipient = ctx.owner as Doc<'batchCallRecipients'>
		const batch = await ctx.db.get(recipient.batchId)
		if (!batch || batch.tenant !== ctx.tenant)
			throw new Error('batch_not_found')
		const idempotencyFingerprint = fingerprint({
			direction: 'outbound',
			ownerId: recipient._id,
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			destinationCountryCode: args.destinationCountryCode,
			destinationRegionCode: args.destinationRegionCode,
			agentVariantOverrideId: args.agentVariantOverrideId,
		})
		const existing = await existingConversation(
			ctx as never,
			args.conversationKey,
			idempotencyFingerprint,
		)
		if (existing) return existing._id
		if (
			recipient.conversationId ||
			!['pending', 'dispatched'].includes(recipient.status)
		) {
			throw new Error('recipient_already_started')
		}
		if (!['pending', 'in_progress'].includes(batch.status)) {
			throw new Error('batch_not_routable')
		}
		const variantOverrideId =
			args.agentVariantOverrideId ?? batch.agentVariantOverrideId
		const selected = await selectOutboundNumber(ctx as never, {
			recipientId: recipient._id,
			destinationCountryCode: args.destinationCountryCode,
			destinationRegionCode: args.destinationRegionCode,
		})
		const deployment = await resolveAgentDeployment(ctx as never, {
			agentId: batch.agentId,
			conversationKey: args.conversationKey,
			workflow: 'outbound',
			variantOverrideId,
		})
		const conversationId = await ctx.db.insert('conversations', {
			tenant: ctx.tenant,
			conversationKey: args.conversationKey,
			idempotencyFingerprint,
			...toDeploymentAttribution(deployment),
			provider: args.provider,
			providerSessionId: args.providerSessionId,
			channel: 'voice_outbound',
			direction: 'outbound',
			phoneNumberId: selected.phoneNumberId,
			phoneNumberSnapshot: {
				number: selected.number.number,
				provider: selected.number.provider,
				providerNumberId: selected.number.providerNumberId,
				telephonyConnectionId: selected.number.telephonyConnectionId,
			},
			callerIdSelectionReason: selected.reason,
			batchCallRecipientId: recipient._id,
			externalNumber: recipient.phoneNumber,
			status: 'initiated',
			startedAt: now(),
			hasAudio: false,
			messageCount: 0,
			createdAt: now(),
		})
		await ctx.db.patch(recipient._id, {
			conversationId,
			status: 'initiated',
			updatedAt: now(),
		})
		return conversationId
	},
})

/**
 * Append one turn. `sequence` is assigned mutation-side via read-max+1
 * (OCC-safe per conversation; stays correct if a second writer appears).
 */
export const appendMessage = machineMutation('conversations')({
	args: {
		messageKey: z.string().min(1).max(255).optional(),
		role: z.enum(MESSAGE_ROLES),
		text: z.string().optional(),
		toolCalls: z.array(toolCallPayload).optional(),
		toolResults: z.array(toolResultPayload).optional(),
		timeInCallSecs: z.number().nonnegative().optional(),
		interrupted: z.boolean().default(false),
		audioStorageId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const conversation = ctx.owner as {
			_id: string
			agentId: string
			agentVariantId: string
			status: string
			messageCount: number
			tenant: string
		}
		if (conversation.status === 'done' || conversation.status === 'failed') {
			throw new Error(`cannot append to a ${conversation.status} conversation`)
		}
		const idempotencyFingerprint = args.messageKey
			? fingerprint(args)
			: undefined
		if (args.messageKey) {
			const existing = await ctx.db
				.query('conversationMessages')
				.withIndex('by_conversation_and_messageKey', (q) =>
					q
						.eq('conversationId', conversation._id as never)
						.eq('messageKey', args.messageKey),
				)
				.unique()
			if (existing) {
				if (existing.idempotencyFingerprint !== idempotencyFingerprint) {
					throw new Error('idempotency_conflict')
				}
				return { messageId: existing._id, sequence: existing.sequence }
			}
		}
		const sequence = conversation.messageCount + 1
		const messageId = await ctx.db.insert('conversationMessages', {
			tenant: ctx.tenant,
			conversationId: conversation._id as never,
			agentId: conversation.agentId as never,
			agentVariantId: conversation.agentVariantId as never,
			sequence,
			idempotencyFingerprint,
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
		const conversation = ctx.owner as {
			_id: string
			status: string
			terminationReason?: string
			durationSecs?: number
			usage?: { inputTokens: number; outputTokens: number; costUsd?: number }
		}
		if (conversation.status === 'done' || conversation.status === 'failed') {
			const metadataMatches =
				(args.terminationReason === undefined ||
					args.terminationReason === conversation.terminationReason) &&
				(args.durationSecs === undefined ||
					args.durationSecs === conversation.durationSecs) &&
				(args.usage === undefined ||
					JSON.stringify(args.usage) === JSON.stringify(conversation.usage))
			if (conversation.status !== args.status || !metadataMatches) {
				throw new Error('terminal_state_conflict')
			}
			return { status: 'already_finished' as const }
		}
		await ctx.db.patch(
			conversation._id as never,
			{
				...args,
				endedAt: now(),
			} as never,
		)
		return { status: 'finished' as const }
	},
})

// ---------------------------------------------------------------------------
// Back-office reads (user path)
// ---------------------------------------------------------------------------

export const list = tenantQuery({
	args: {
		paginationOpts: nativePaginationOpts,
		status: z.enum(CONVERSATION_STATUSES).optional(),
		agentId: z.string().optional(),
		channel: z.enum(CONVERSATION_CHANNELS).optional(),
		direction: z.enum(CONVERSATION_DIRECTIONS).optional(),
	},
	handler: async (ctx, args) => {
		requirePermission(ctx.org, 'conversations:read')
		const agentId = args.agentId
			? await resolveTenantId(ctx, 'agents', args.agentId, 'agent')
			: undefined
		const base = args.status
			? ctx.db
					.query('conversations')
					.withIndex('by_status', (q) =>
						q.eq('tenant', ctx.tenant).eq('status', args.status!),
					)
			: agentId
				? ctx.db
						.query('conversations')
						.withIndex('by_tenant_agent', (q) =>
							q.eq('tenant', ctx.tenant).eq('agentId', agentId),
						)
				: args.channel
					? ctx.db
							.query('conversations')
							.withIndex('by_tenant_channel', (q) =>
								q.eq('tenant', ctx.tenant).eq('channel', args.channel!),
							)
					: args.direction
						? ctx.db
								.query('conversations')
								.withIndex('by_tenant_direction', (q) =>
									q.eq('tenant', ctx.tenant).eq('direction', args.direction!),
								)
						: ctx.db
								.query('conversations')
								.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
		const filtered = base.filter((q) => {
			let predicate = q.eq(q.field('tenant'), ctx.tenant)
			if (args.status)
				predicate = q.and(predicate, q.eq(q.field('status'), args.status))
			if (agentId)
				predicate = q.and(predicate, q.eq(q.field('agentId'), agentId))
			if (args.channel)
				predicate = q.and(predicate, q.eq(q.field('channel'), args.channel))
			if (args.direction)
				predicate = q.and(predicate, q.eq(q.field('direction'), args.direction))
			return predicate
		})
		const result = await filtered.order('desc').paginate(args.paginationOpts)
		return { ...result, page: result.page.map(toConversationSummaryDto) }
	},
})

export const get = tenantQuery({
	args: { conversationId: z.string() },
	handler: async (ctx, { conversationId }) => {
		requirePermission(ctx.org, 'conversations:read')
		const id = await resolveTenantId(
			ctx,
			'conversations',
			conversationId,
			'conversation',
		)
		const row = await ctx.db.get(id)
		if (!row) throw new Error('conversation not found')
		return toConversationDetailDto(row)
	},
})

export const messages = tenantQuery({
	args: { conversationId: z.string(), paginationOpts: nativePaginationOpts },
	handler: async (ctx, { conversationId, paginationOpts }) => {
		requirePermission(ctx.org, 'conversations:read')
		const id = await resolveTenantId(
			ctx,
			'conversations',
			conversationId,
			'conversation',
		)
		const result = await ctx.db
			.query('conversationMessages')
			.withIndex('by_conversation', (q) => q.eq('conversationId', id))
			.order('asc')
			.paginate(paginationOpts)
		return { ...result, page: result.page.map(toConversationMessageDto) }
	},
})

export const searchTranscripts = tenantQuery({
	args: {
		text: z.string().min(1),
		paginationOpts: nativePaginationOpts,
		conversationId: z.string().optional(),
		agentId: z.string().optional(),
		role: z.enum(MESSAGE_ROLES).optional(),
	},
	handler: async (ctx, args) => {
		requirePermission(ctx.org, 'conversations:read')
		const conversationId = args.conversationId
			? await resolveTenantId(
					ctx,
					'conversations',
					args.conversationId,
					'conversation',
				)
			: undefined
		const agentId = args.agentId
			? await resolveTenantId(ctx, 'agents', args.agentId, 'agent')
			: undefined
		const result = await ctx.db
			.query('conversationMessages')
			.withSearchIndex('search_text', (q) => {
				let base = q.search('text', args.text).eq('tenant', ctx.tenant)
				if (conversationId) base = base.eq('conversationId', conversationId)
				if (agentId) base = base.eq('agentId', agentId)
				if (args.role) base = base.eq('role', args.role)
				return base
			})
			.paginate(args.paginationOpts)
		return { ...result, page: result.page.map(toConversationMessageDto) }
	},
})

export {
	maskExternalNumber,
	toConversationDetailDto,
	toConversationMessageDto,
	toConversationSummaryDto,
} from './conversationDtos'

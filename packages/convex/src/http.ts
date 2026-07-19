import {
	CONVERSATION_DIRECTIONS,
	MESSAGE_ROLES,
	PROVIDERS,
	toolCallPayload,
	toolResultPayload,
} from '@agent.io/domain/schemas'
import {
	type HonoWithConvex,
	HttpRouterWithHono,
} from 'convex-helpers/server/hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { z } from 'zod'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import { env } from './_generated/server'
import { agentRequestHandler } from './ai'
import { resolveMachineService } from './api/internals/machineAuth'
import { toMachineError } from './api/internals/machineErrors'
import { authKit } from './auth'
import { resend } from './resend'

export const app: HonoWithConvex<ActionCtx> = new Hono()

app.use(requestId())
app.use(cors())
app.use('/api/machine/*', async (c, next) => {
	// Identity is HTTP-layer scoped (logging/audit); it does not cross into
	// mutations — handlers pass explicit args only.
	const machineService = resolveMachineService(
		c.req.header('authorization'),
		env.CONVEX_SERVICE_TOKENS,
	)
	if (!machineService) {
		return c.json({ error: 'unauthorized' }, 401)
	}
	await next()
})
app.onError((error, c) => {
	if (!c.req.path.startsWith('/api/machine/')) throw error
	const machineError = toMachineError(error)
	return c.json(
		{
			error: machineError.code,
			...('conversationId' in machineError && machineError.conversationId
				? { conversationId: machineError.conversationId }
				: {}),
		},
		machineError.status as 401 | 409 | 422 | 500,
	)
})
app.on('POST', ['/api/agents', '/api/chat'], async (c) => {
	const request = c.req.raw
	return await agentRequestHandler(request)
})

app.post('/resend/events', async (c) => {
	return await resend.handleResendEventWebhook(c.env, c.req.raw)
})

/**
 * `conversationKey` is ownership proof for later append/finish, so its
 * unforgeability cannot rest on caller discipline: the machine boundary only
 * accepts high-entropy UUID-shaped keys.
 */
const startBase = z.object({
	conversationKey: z.string().uuid(),
	provider: z.enum(PROVIDERS),
	providerSessionId: z.string().optional(),
	externalNumber: z.string().optional(),
})

const parseBody = async <Schema extends z.ZodType>(
	request: Request,
	schema: Schema,
): Promise<z.output<Schema> | undefined> => {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return undefined
	}
	const parsed = schema.safeParse(body)
	return parsed.success ? parsed.data : undefined
}

const getMachineStartResult = (ctx: ActionCtx, conversationId: string) =>
	ctx.runQuery(internal.api.conversations.getMachineStartResult, {
		conversationId: conversationId as never,
	})

app.post('/api/machine/conversations/inbound', async (c) => {
	const input = await parseBody(
		c.req.raw,
		startBase.extend({
			telephonyConnectionId: z.string().min(1),
			providerNumberId: z.string().min(1),
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const phoneNumberId = await c.env.runQuery(
		internal.api.conversations.resolveInboundPhoneNumber,
		{
			telephonyConnectionId: input.telephonyConnectionId as never,
			providerNumberId: input.providerNumberId,
		},
	)
	const conversationId = await c.env.runMutation(
		internal.api.conversations.startFromPhoneNumber,
		{
			ownerId: phoneNumberId,
			conversationKey: input.conversationKey,
			provider: input.provider,
			providerSessionId: input.providerSessionId,
			externalNumber: input.externalNumber,
		},
	)
	return c.json(await getMachineStartResult(c.env, conversationId))
})

app.post('/api/machine/conversations/outbound', async (c) => {
	const input = await parseBody(
		c.req.raw,
		startBase.extend({
			batchCallRecipientId: z.string().min(1),
			destinationCountryCode: z.string().optional(),
			destinationRegionCode: z.string().optional(),
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const conversationId = await c.env.runMutation(
		internal.api.conversations.startOutboundFromRecipient,
		{
			ownerId: input.batchCallRecipientId as never,
			conversationKey: input.conversationKey,
			provider: input.provider,
			providerSessionId: input.providerSessionId,
			externalNumber: input.externalNumber,
			destinationCountryCode: input.destinationCountryCode,
			destinationRegionCode: input.destinationRegionCode,
		},
	)
	return c.json(await getMachineStartResult(c.env, conversationId))
})

app.post('/api/machine/conversations/direct', async (c) => {
	const input = await parseBody(
		c.req.raw,
		startBase.extend({
			agentVersionId: z.string().min(1),
			channel: z.enum(['sms', 'web']),
			direction: z.enum(CONVERSATION_DIRECTIONS),
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const conversationId = await c.env.runMutation(
		internal.api.conversations.startFromVersion,
		{
			ownerId: input.agentVersionId as never,
			conversationKey: input.conversationKey,
			provider: input.provider,
			providerSessionId: input.providerSessionId,
			externalNumber: input.externalNumber,
			channel: input.channel,
			direction: input.direction,
		},
	)
	return c.json(await getMachineStartResult(c.env, conversationId))
})

app.post('/api/machine/conversations/whatsapp', async (c) => {
	const input = await parseBody(
		c.req.raw,
		startBase.extend({
			whatsappAccountId: z.string().min(1),
			direction: z.enum(CONVERSATION_DIRECTIONS),
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const conversationId = await c.env.runMutation(
		internal.api.conversations.startFromWhatsappAccount,
		{
			ownerId: input.whatsappAccountId as never,
			conversationKey: input.conversationKey,
			provider: input.provider,
			providerSessionId: input.providerSessionId,
			externalNumber: input.externalNumber,
			direction: input.direction,
		},
	)
	return c.json(await getMachineStartResult(c.env, conversationId))
})

app.post('/api/machine/conversations/:conversationId/messages', async (c) => {
	const input = await parseBody(
		c.req.raw,
		z.object({
			conversationKey: z.string().min(1).max(255),
			messageKey: z.string().min(1).max(255),
			role: z.enum(MESSAGE_ROLES),
			text: z.string().optional(),
			toolCalls: z.array(toolCallPayload).optional(),
			toolResults: z.array(toolResultPayload).optional(),
			timeInCallSecs: z.number().nonnegative().optional(),
			interrupted: z.boolean().optional(),
			audioStorageId: z.string().optional(),
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const result = await c.env.runMutation(
		internal.api.conversations.appendMessage,
		{
			ownerId: c.req.param('conversationId') as never,
			...input,
		},
	)
	return c.json(result)
})

app.post('/api/machine/conversations/:conversationId/finish', async (c) => {
	const input = await parseBody(
		c.req.raw,
		z.object({
			conversationKey: z.string().min(1).max(255),
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
		}),
	)
	if (!input) return c.json({ error: 'invalid_request' }, 400)
	const result = await c.env.runMutation(internal.api.conversations.finish, {
		ownerId: c.req.param('conversationId') as never,
		...input,
	})
	return c.json(result)
})

const http = new HttpRouterWithHono(app)
authKit.registerRoutes(http)
export default http

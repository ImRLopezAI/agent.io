import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

process.env.AI_GATEWAY_API_KEY ??= 'ai_test'
process.env.CONVEX_SERVICE_TOKENS ??=
	'v-inbound:machine_test,v-inbound:machine_test_previous,v-outbound:outbound_test,back-office:office:token:with:colons,runtime:dupe_value,v-outbound:dupe_value'
process.env.EMAIL_FROM ??= 'test@example.com'
process.env.RESEND_API_KEY ??= 'resend_test'
process.env.RESEND_WEBHOOK_SECRET ??= 'resend_webhook_test'
process.env.WORKOS_API_KEY ??= 'workos_test'
process.env.WORKOS_CLIENT_ID ??= 'client_test'
process.env.WORKOS_WEBHOOK_SECRET ??= 'workos_webhook_test'

vi.mock('../ai', () => ({ agentRequestHandler: vi.fn<() => void>() }))
vi.mock('../auth', () => ({
	authKit: { registerRoutes: vi.fn<() => void>() },
}))
vi.mock('../resend', () => ({
	resend: { handleResendEventWebhook: vi.fn<() => void>() },
}))

const { app } = await import('../http')

const runtimeResult = {
	conversationId: 'conv_1',
	agentId: 'agent_1',
	agentVariantId: 'variant_1',
	agentVersionId: 'version_1',
	allocationMode: 'direct',
	workflow: 'none',
	versionConfig: {},
}

const bindings = () => ({
	runMutation: vi.fn<(reference: unknown, args: unknown) => Promise<string>>(
		async () => 'conv_1',
	),
	runQuery: vi.fn<
		(reference: unknown, args: unknown) => Promise<typeof runtimeResult>
	>(async () => runtimeResult),
})

const directRequest = (body: unknown, authorization = 'Bearer machine_test') =>
	new Request('http://convex.test/api/machine/conversations/direct', {
		method: 'POST',
		headers: { authorization, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

const validDirectBody = {
	agentVersionId: 'version_1',
	conversationKey: '7f4b2c1a-9d3e-4f6a-8b1c-2e5d7a9c0b3d',
	provider: 'openai',
	channel: 'web',
	direction: 'inbound',
}

describe('machine HTTP boundary', () => {
	beforeEach(() => vi.clearAllMocks())

	test('rejects unauthorized requests before invoking Convex', async () => {
		const env = bindings()
		const response = await app.fetch(
			directRequest({}, 'Bearer wrong'),
			env as never,
		)
		expect(response.status).toBe(401)
		expect(env.runMutation).not.toHaveBeenCalled()
		expect(env.runQuery).not.toHaveBeenCalled()
	})

	test('each configured service token authenticates independently', async () => {
		for (const token of ['machine_test', 'outbound_test']) {
			const env = bindings()
			const response = await app.fetch(
				directRequest(validDirectBody, `Bearer ${token}`),
				env as never,
			)
			expect(response.status).toBe(200)
		}
	})

	test('both rotation-window tokens for one service authenticate', async () => {
		const env = bindings()
		const response = await app.fetch(
			directRequest(validDirectBody, 'Bearer machine_test_previous'),
			env as never,
		)
		expect(response.status).toBe(200)
	})

	test('tokens containing colons keep everything after the first separator', async () => {
		const env = bindings()
		const response = await app.fetch(
			directRequest(validDirectBody, 'Bearer office:token:with:colons'),
			env as never,
		)
		expect(response.status).toBe(200)
	})

	test('a token value duplicated across services is rejected without affecting others', async () => {
		const env = bindings()
		const duplicated = await app.fetch(
			directRequest(validDirectBody, 'Bearer dupe_value'),
			env as never,
		)
		expect(duplicated.status).toBe(401)
		expect(env.runMutation).not.toHaveBeenCalled()
		const unaffected = await app.fetch(
			directRequest(validDirectBody, 'Bearer machine_test'),
			env as never,
		)
		expect(unaffected.status).toBe(200)
	})

	test('rejects invalid bodies without dispatching a mutation', async () => {
		const env = bindings()
		const response = await app.fetch(directRequest({}), env as never)
		expect(response.status).toBe(400)
		expect(env.runMutation).not.toHaveBeenCalled()
	})

	test('dispatches a valid request and returns the runtime resolution', async () => {
		const env = bindings()
		const response = await app.fetch(
			directRequest({
				agentVersionId: 'version_1',
				conversationKey: '7f4b2c1a-9d3e-4f6a-8b1c-2e5d7a9c0b3d',
				provider: 'openai',
				channel: 'web',
				direction: 'inbound',
			}),
			env as never,
		)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual(runtimeResult)
		expect(env.runMutation).toHaveBeenCalledOnce()
		expect(env.runQuery).toHaveBeenCalledOnce()
	})

	test('maps allowlisted conflicts without exposing exception details', async () => {
		const env = bindings()
		env.runMutation.mockRejectedValueOnce(new Error('idempotency_conflict'))
		const response = await app.fetch(
			directRequest({
				agentVersionId: 'version_1',
				conversationKey: '7f4b2c1a-9d3e-4f6a-8b1c-2e5d7a9c0b3d',
				provider: 'openai',
				channel: 'web',
				direction: 'inbound',
			}),
			env as never,
		)
		expect(response.status).toBe(409)
		expect(await response.json()).toEqual({ error: 'idempotency_conflict' })
	})
})

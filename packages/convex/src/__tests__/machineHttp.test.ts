import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

process.env.AI_GATEWAY_API_KEY ??= 'ai_test'
process.env.CONVEX_SERVICE_TOKEN ??= 'machine_test'
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
				conversationKey: 'web-1',
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
				conversationKey: 'web-1',
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

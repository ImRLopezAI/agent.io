import { describe, expect, test } from 'vite-plus/test'
import { ZodError } from 'zod'

import {
	APPS,
	appEnvSchemas,
	envSchema,
	parseEnv,
	type AppName,
} from '../index.ts'

const baseProcess = {
	NODE_ENV: 'test',
} as const

const workOs = {
	WORKOS_CLIENT_ID: 'client_test',
	WORKOS_API_KEY: 'sk_test',
	WORKOS_COOKIE_PASSWORD: 'cookie-password-at-least-32-chars!!',
	WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
}

const redis = {
	REDIS_REST_URL: 'https://redis.example.com',
	REDIS_REST_TOKEN: 'redis_token',
}

const resend = {
	RESEND_API_KEY: 're_test',
	EMAIL_FROM: 'Agent <onboarding@example.com>',
}

const voice = {
	OPENAI_API_KEY: 'sk-openai',
	XAI_API_KEY: 'xai-key',
	COMPOSIO_API_KEY: 'composio-key',
}

const convexMachine = {
	CONVEX_URL: 'https://convex.example.com',
	CONVEX_SERVICE_TOKEN: 'svc_token',
}

const backOfficeRaw = {
	...baseProcess,
	...workOs,
	...redis,
	...resend,
	AI_GATEWAY_API_KEY: 'vck_test',
	CONVEX_URL: 'https://convex.example.com',
	BASE_URL: 'http://localhost:3000',
}

const vInboundRaw = {
	...baseProcess,
	...voice,
	...convexMachine,
}

const vOutboundRaw = {
	...vInboundRaw,
	TWILIO_ACCOUNT_SID: 'ACxxxx',
	TWILIO_AUTH_TOKEN: 'twilio_token',
}

const messagesRaw = {
	...baseProcess,
	...convexMachine,
	// Platform Meta app only — per-number tokens live on whatsappAccounts rows
	META_APP_SECRET: 'meta_app_secret',
	META_WEBHOOK_VERIFY_TOKEN: 'verify',
}

describe('APPS', () => {
	test('lists every process that uses this package', () => {
		expect([...APPS]).toEqual([
			'back-office',
			'v-inbound',
			'v-outbound',
			'messages',
		])
	})
})

describe('envSchema (discriminated union on APP)', () => {
	test.each([
		['back-office', backOfficeRaw],
		['v-inbound', vInboundRaw],
		['v-outbound', vOutboundRaw],
		['messages', messagesRaw],
	] as const)('accepts a complete %s env', (app, raw) => {
		const env = parseEnv(app, raw)
		expect(env.APP).toBe(app)
		expect(env.NODE_ENV).toBe('test')
	})

	test('rejects unknown APP values', () => {
		expect(() =>
			envSchema.parse({ ...backOfficeRaw, APP: 'not-an-app' }),
		).toThrow(ZodError)
	})

	test('injects APP via parseEnv — raw env need not set it', () => {
		const env = parseEnv('v-inbound', vInboundRaw)
		expect(env.APP).toBe('v-inbound')
		expect('APP' in vInboundRaw).toBe(false)
	})
})

describe('back-office env', () => {
	test('requires WorkOS + Redis + Resend + AI gateway + Convex URL', () => {
		expect(() => parseEnv('back-office', baseProcess)).toThrow(ZodError)
		expect(() =>
			parseEnv('back-office', {
				...baseProcess,
				...workOs,
				...redis,
				...resend,
				// missing AI_GATEWAY_API_KEY + CONVEX_URL
			}),
		).toThrow(ZodError)
	})

	test('does not require voice provider keys', () => {
		const env = parseEnv('back-office', backOfficeRaw)
		expect(env.APP).toBe('back-office')
		expect('OPENAI_API_KEY' in env).toBe(false)
		expect('CONVEX_SERVICE_TOKEN' in env).toBe(false)
		expect(env.WORKOS_CLIENT_ID).toBe(workOs.WORKOS_CLIENT_ID)
		expect(env.AI_GATEWAY_API_KEY).toBe('vck_test')
	})

	test('defaults BASE_URL when omitted', () => {
		const { BASE_URL: _drop, ...withoutBase } = backOfficeRaw
		const env = parseEnv('back-office', withoutBase)
		expect(env.BASE_URL).toBe('http://localhost:3000')
	})
})

describe('voice workers (v-inbound / v-outbound)', () => {
	test('require provider keys + machine Convex auth', () => {
		expect(() => parseEnv('v-inbound', { ...baseProcess, ...voice })).toThrow(
			ZodError,
		) // missing CONVEX_*
		expect(() =>
			parseEnv('v-inbound', { ...baseProcess, ...convexMachine }),
		).toThrow(ZodError) // missing provider keys
	})

	test('v-inbound narrows to voice + service token, not WorkOS cookies', () => {
		const env = parseEnv('v-inbound', vInboundRaw)
		expect(env.OPENAI_API_KEY).toBe(voice.OPENAI_API_KEY)
		expect(env.XAI_API_KEY).toBe(voice.XAI_API_KEY)
		expect(env.COMPOSIO_API_KEY).toBe(voice.COMPOSIO_API_KEY)
		expect(env.CONVEX_SERVICE_TOKEN).toBe(convexMachine.CONVEX_SERVICE_TOKEN)
		expect(env.PORT).toBe(3001)
		expect('WORKOS_COOKIE_PASSWORD' in env).toBe(false)
	})

	test('v-outbound defaults PORT to 3002 and accepts optional Twilio', () => {
		const env = parseEnv('v-outbound', {
			...baseProcess,
			...voice,
			...convexMachine,
		})
		expect(env.APP).toBe('v-outbound')
		expect(env.PORT).toBe(3002)
		expect(env.TWILIO_ACCOUNT_SID).toBeUndefined()

		const withTwilio = parseEnv('v-outbound', vOutboundRaw)
		expect(withTwilio.TWILIO_ACCOUNT_SID).toBe('ACxxxx')
	})

	test('optional webhook secrets parse when present', () => {
		const env = parseEnv('v-inbound', {
			...vInboundRaw,
			OPENAI_WEBHOOK_SECRET: 'whsec_openai',
			XAI_WEBHOOK_SECRET: 'whsec_xai',
		})
		expect(env.OPENAI_WEBHOOK_SECRET).toBe('whsec_openai')
		expect(env.XAI_WEBHOOK_SECRET).toBe('whsec_xai')
	})
})

describe('messages env', () => {
	test('requires machine Convex auth; Meta app secrets optional (platform webhook)', () => {
		const env = parseEnv('messages', {
			...baseProcess,
			...convexMachine,
		})
		expect(env.APP).toBe('messages')
		expect(env.PORT).toBe(3003)
		expect(env.META_APP_SECRET).toBeUndefined()

		const withMeta = parseEnv('messages', messagesRaw)
		expect(withMeta.META_WEBHOOK_VERIFY_TOKEN).toBe('verify')
	})

	test('does not carry per-number WhatsApp tokens (those are tenant table rows)', () => {
		const env = parseEnv('messages', messagesRaw)
		expect('OPENAI_API_KEY' in env).toBe(false)
		expect('WHATSAPP_ACCESS_TOKEN' in env).toBe(false)
		expect('WHATSAPP_PHONE_NUMBER_ID' in env).toBe(false)
	})
})

describe('cross-app isolation', () => {
	test('back-office raw cannot satisfy v-inbound schema', () => {
		expect(() => parseEnv('v-inbound', backOfficeRaw)).toThrow(ZodError)
	})

	test('v-inbound raw cannot satisfy back-office schema', () => {
		expect(() => parseEnv('back-office', vInboundRaw)).toThrow(ZodError)
	})

	test('every AppName has a dedicated schema export', () => {
		for (const app of APPS) {
			expect(appEnvSchemas[app as AppName]).toBeDefined()
		}
	})
})

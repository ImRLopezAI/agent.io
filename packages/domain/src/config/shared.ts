import { z } from 'zod'

/**
 * Env fragments shared across Bun/Hono apps (back-office + channel workers).
 *
 * Convex functions do **not** use this package — their env is declared in
 * `packages/convex/src/convex.config.ts` and consumed via the generated
 * `env` export. Keep the two surfaces in sync when adding platform keys
 * (AI gateway, WorkOS API, etc.).
 */

export const NODE_ENVS = ['development', 'production', 'test'] as const
export type NodeEnv = (typeof NODE_ENVS)[number]

/** Runtime always present on every process. */
export const processEnv = z.object({
	NODE_ENV: z.enum(NODE_ENVS).default('development'),
})

/** Vercel AI Gateway (chat, embeddings, multi-model routing). */
export const aiGatewayEnv = z.object({
	AI_GATEWAY_API_KEY: z.string().min(1),
})

/**
 * WorkOS AuthKit — user session path (ADR 0001). Cookie password + redirect
 * belong only to the app that hosts the AuthKit callback (back-office).
 */
export const workOsEnv = z.object({
	WORKOS_CLIENT_ID: z.string().min(1),
	WORKOS_API_KEY: z.string().min(1),
	WORKOS_COOKIE_PASSWORD: z.string().min(1),
	WORKOS_REDIRECT_URI: z.string().min(1),
})

/** Upstash Redis REST (session cache / rate limits on the ops surface). */
export const redisEnv = z.object({
	REDIS_REST_URL: z.string().min(1),
	REDIS_REST_TOKEN: z.string().min(1),
})

/** Resend transactional email (invites, notifications). */
export const resendEnv = z.object({
	RESEND_API_KEY: z.string().min(1),
	EMAIL_FROM: z.string().min(1),
})

/**
 * Convex HTTP client for apps that talk to the deployment as a **user-facing
 * client** (back-office). Machine workers use {@link convexMachineEnv}.
 */
export const convexUrlEnv = z.object({
	CONVEX_URL: z.string().min(1),
})

/**
 * Machine-path service auth (plan Key Decisions): workers never accept
 * `tenant` as input — they call authenticated Convex HTTP actions with a
 * service token; tenant is derived from the owning resource (ADR 0001).
 */
export const convexMachineEnv = z.object({
	CONVEX_URL: z.string().min(1),
	CONVEX_SERVICE_TOKEN: z.string().min(1),
})

/**
 * Raw realtime providers + Composio (voice-provider-adapter + agent package).
 * Platform holds keys; tenant identity is bound at the client level
 * (`composioClient(tenant)`), never passed as a free-form env per call.
 */
export const voiceRuntimeEnv = z.object({
	OPENAI_API_KEY: z.string().min(1),
	XAI_API_KEY: z.string().min(1),
	COMPOSIO_API_KEY: z.string().min(1),
})

/**
 * Optional webhook signature secrets for provider call-incoming hooks
 * (v-inbound). Required once webhook routes land; optional until then.
 */
export const voiceWebhookEnv = z.object({
	OPENAI_WEBHOOK_SECRET: z.string().min(1).optional(),
	XAI_WEBHOOK_SECRET: z.string().min(1).optional(),
})

/**
 * Telephony leg origination (v-outbound dialer / SMS via Twilio).
 * Plan defers the dialer — fields are optional so the worker boots without
 * them, but declared so env is the single checklist for GA.
 *
 * Per-tenant DIDs live in `phoneNumbers`, not here. These are platform
 * Twilio account credentials when the deployment owns the trunk.
 */
export const twilioEnv = z.object({
	TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
	TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
})

/**
 * Platform Meta app credentials for the **shared** WhatsApp webhook endpoint
 * on the messages worker (signature verify + hub challenge).
 *
 * Per-tenant / multi-number state is **not** env — see domain table
 * `whatsappAccounts` (access token secret refs, Meta phone_number_id,
 * assigned agent, N rows per tenant).
 */
export const metaAppEnv = z.object({
	META_APP_SECRET: z.string().min(1).optional(),
	META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
})

/**
 * Base process env every app inherits. Prefer composing the fragments above
 * per app rather than stuffing every secret into this object.
 */
export const shared = processEnv

/** @deprecated Prefer {@link shared} — kept for the early scaffold name. */
export const config = shared

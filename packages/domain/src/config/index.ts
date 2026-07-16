import { z } from 'zod'

import { backOfficeEnvSchema } from './back-office.ts'
import { messagesEnvSchema } from './messages.ts'
import { vInboundEnvSchema } from './v-inbound.ts'
import { vOutboundEnvSchema } from './v-outbound.ts'

export * from './shared.ts'
export { backOfficeEnvSchema } from './back-office.ts'
export { messagesEnvSchema } from './messages.ts'
export { vInboundEnvSchema } from './v-inbound.ts'
export { vOutboundEnvSchema } from './v-outbound.ts'

/**
 * App process names. Each Bun/Hono app calls {@link loadEnv} with its own
 * literal so the discriminated union narrows server-side env.
 *
 * Convex is intentionally absent — it uses `convex.config.ts` typed env.
 */
export const APPS = [
	'back-office',
	'v-inbound',
	'v-outbound',
	'messages',
] as const
export type AppName = (typeof APPS)[number]

/**
 * Per-app env schemas, keyed for lookup. Prefer {@link envSchema} +
 * {@link loadEnv} at boot.
 */
export const appEnvSchemas = {
	'back-office': backOfficeEnvSchema,
	'v-inbound': vInboundEnvSchema,
	'v-outbound': vOutboundEnvSchema,
	messages: messagesEnvSchema,
} as const

/**
 * Discriminated union on `APP`. The literal is injected by {@link loadEnv} —
 * apps do not set `APP` in `.env` files.
 */
export const envSchema = z.discriminatedUnion('APP', [
	backOfficeEnvSchema,
	vInboundEnvSchema,
	vOutboundEnvSchema,
	messagesEnvSchema,
])

export type Env = z.infer<typeof envSchema>

export type EnvFor<A extends AppName> = Extract<Env, { APP: A }>

/**
 * Validate a raw env record for a given app. Used by tests and by
 * {@link loadEnv}. Throws a ZodError with path-level messages on failure.
 */
export const parseEnv = <A extends AppName>(
	app: A,
	raw: NodeJS.ProcessEnv | Record<string, string | undefined>,
): EnvFor<A> => envSchema.parse({ ...raw, APP: app }) as EnvFor<A>

/**
 * Boot-time loader: injects `APP`, validates `process.env`, returns a
 * narrowed env object for that app only (voice keys never appear on
 * back-office's type, and vice versa).
 *
 * @example
 * ```ts
 * // apps/v-inbound/src/index.ts
 * import { loadEnv } from '@agent.io/domain/config'
 * const env = loadEnv('v-inbound')
 * // env.OPENAI_API_KEY, env.CONVEX_SERVICE_TOKEN, …
 * ```
 */
export const loadEnv = <A extends AppName>(app: A): EnvFor<A> =>
	parseEnv(app, process.env)

import { z } from 'zod'

import {
	aiGatewayEnv,
	convexUrlEnv,
	processEnv,
	redisEnv,
	resendEnv,
	workOsEnv,
} from './shared.ts'

/**
 * Ops console (TanStack Start / AuthKit). User-context only — no raw provider
 * API keys (mintClientSecret / live calls belong to channel workers).
 *
 * Client-only `VITE_*` vars stay in the app Vite layer; this schema is the
 * **server** process env (RPC, WorkOS SDK, Redis, Resend, Convex HTTP).
 */
export const backOfficeEnvSchema = processEnv
	.extend({
		APP: z.literal('back-office'),
		/** Public site origin (WorkOS redirects, absolute links). */
		BASE_URL: z.string().min(1).default('http://localhost:3000'),
		/** Optional theme tooling. */
		GOOGLE_FONTS_API_KEY: z.string().min(1).optional(),
	})
	.extend(workOsEnv.shape)
	.extend(redisEnv.shape)
	.extend(resendEnv.shape)
	.extend(aiGatewayEnv.shape)
	.extend(convexUrlEnv.shape)

export type BackOfficeEnv = z.infer<typeof backOfficeEnvSchema>

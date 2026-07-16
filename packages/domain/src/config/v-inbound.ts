import { z } from 'zod'

import {
	convexMachineEnv,
	processEnv,
	voiceRuntimeEnv,
	voiceWebhookEnv,
} from './shared.ts'

/**
 * Inbound voice worker (Hono / Bun).
 *
 * Flow (ERD runtime + plan): provider webhook `realtime.call.incoming` →
 * verify signature → phone number → agent version → expand → acceptCall →
 * transcript machine writes via `CONVEX_SERVICE_TOKEN`.
 *
 * Does **not** take WorkOS user sessions; tenant is derived from the phone
 * number row (ADR 0001).
 */
export const vInboundEnvSchema = processEnv
	.extend({
		APP: z.literal('v-inbound'),
		PORT: z.coerce.number().int().positive().default(3001),
	})
	.extend(voiceRuntimeEnv.shape)
	.extend(convexMachineEnv.shape)
	.extend(voiceWebhookEnv.shape)

export type VInboundEnv = z.infer<typeof vInboundEnvSchema>

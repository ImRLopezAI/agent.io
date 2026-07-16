import { z } from 'zod'

import {
	convexMachineEnv,
	processEnv,
	twilioEnv,
	voiceRuntimeEnv,
	voiceWebhookEnv,
} from './shared.ts'

/**
 * Outbound voice worker (Hono / Bun).
 *
 * Same realtime + Composio + machine-Convex surface as v-inbound, plus
 * telephony leg credentials for dial / batch (Twilio or SIP — dialer still
 * deferred in the domain plan; env is declared so the checklist is complete).
 *
 * Tenant for batch/recipient writes is derived from the batch job / agent
 * version row (ADR 0001) — never from request input.
 */
export const vOutboundEnvSchema = processEnv
	.extend({
		APP: z.literal('v-outbound'),
		PORT: z.coerce.number().int().positive().default(3002),
	})
	.extend(voiceRuntimeEnv.shape)
	.extend(convexMachineEnv.shape)
	.extend(voiceWebhookEnv.shape)
	.extend(twilioEnv.shape)

export type VOutboundEnv = z.infer<typeof vOutboundEnvSchema>

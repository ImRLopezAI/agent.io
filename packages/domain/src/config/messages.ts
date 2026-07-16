import { z } from 'zod'

import {
	convexMachineEnv,
	metaAppEnv,
	processEnv,
	twilioEnv,
} from './shared.ts'

/**
 * Messaging worker (WhatsApp / SMS — ERD §0 `messages` column).
 *
 * Writes conversation rows through the same machine-path Convex surface as
 * the voice workers. Channel **numbers and tokens** are tenant data
 * (`whatsappAccounts`, `phoneNumbers`) — not process env. Only the platform
 * Meta app secrets for the shared webhook live here (optional until the
 * messages plan lands). Convex service auth is required from day one.
 */
export const messagesEnvSchema = processEnv
	.extend({
		APP: z.literal('messages'),
		PORT: z.coerce.number().int().positive().default(3003),
	})
	.extend(convexMachineEnv.shape)
	.extend(metaAppEnv.shape)
	.extend(twilioEnv.shape)

export type MessagesEnv = z.infer<typeof messagesEnvSchema>

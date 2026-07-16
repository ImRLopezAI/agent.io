import { z } from 'zod'

import { tenantTable } from './helper.ts'
import { PHONE_PROVIDERS } from './phone-numbers.ts'

export const TELEPHONY_CONNECTION_STATUSES = [
	'pending_verification',
	'active',
	'disabled',
	'error',
	'archived',
] as const

export const telephonyConnections = tenantTable('telephonyConnections', () => ({
	provider: z.enum(PHONE_PROVIDERS),
	label: z.string().max(120).default(''),
	providerAccountId: z.string().min(1).max(255),
	credentialSecretRef: z.string().min(1).max(500),
	defaultRoutingRegion: z.string().min(1).max(120).optional(),
	status: z.enum(TELEPHONY_CONNECTION_STATUSES),
	lastSyncedAt: z.string().optional(),
	lastError: z.string().max(1_000).optional(),
}))

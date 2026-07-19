import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Phone numbers — the tenant-resolution anchor for inbound calls (ADR 0001:
 * machine writers derive tenant from the owning resource).
 */

export const PHONE_PROVIDERS = ['twilio', 'sip_trunk'] as const
export const PHONE_STATUSES = [
	'pending',
	'active',
	'disabled',
	'provider_missing',
	'archived',
] as const

export const phoneNumbers = tenantTable('phoneNumbers', (id) => ({
	telephonyConnectionId: id('telephonyConnections'),
	providerNumberId: z.string().min(1).max(255),
	number: z.string().regex(/^\+[1-9]\d{6,14}$/),
	provider: z.enum(PHONE_PROVIDERS),
	label: z.string().max(120).default(''),
	countryCode: z.string().regex(/^[A-Z]{2}$/),
	regionCode: z.string().min(1).max(120).optional(),
	locality: z.string().min(1).max(200).optional(),
	capabilities: z.object({
		inboundVoice: z.boolean(),
		outboundVoice: z.boolean(),
		inboundSms: z.boolean(),
		outboundSms: z.boolean(),
	}),
	assignedAgentId: id('agents').optional(),
	routingRegion: z.string().min(1).max(120).optional(),
	inboundSmsEnabled: z.boolean().default(false),
	status: z.enum(PHONE_STATUSES).default('pending'),
	lastSyncedAt: z.string().optional(),
	lastError: z.string().max(1_000).optional(),
	archivedAt: z.string().optional(),
}))

export const phoneNumberInput = phoneNumbers.insertSchema.superRefine(
	(value, ctx) => {
		if (value.inboundSmsEnabled && !value.capabilities.inboundSms) {
			ctx.addIssue({
				code: 'custom',
				path: ['inboundSmsEnabled'],
				message: 'inbound SMS cannot be enabled without provider capability',
			})
		}
	},
)

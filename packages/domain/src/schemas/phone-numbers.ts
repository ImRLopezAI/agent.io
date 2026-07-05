import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Phone numbers — the tenant-resolution anchor for inbound calls (ADR 0001:
 * machine writers derive tenant from the owning resource).
 */
export const PhoneNumbers = tenantTable('phoneNumbers', (id) => ({
	/** E.164 */
	number: z.string().regex(/^\+[1-9]\d{6,14}$/),
	provider: z.enum(['twilio', 'sip_trunk']),
	label: z.string().max(120).default(''),
	assignedAgentId: id('agents').optional(),
	status: z.enum(['active', 'disabled']).default('active'),
}))

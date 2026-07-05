import { z } from 'zod'

import { tenantTable } from './helper.ts'
import { dynamicVariables } from './shared.ts'

/** Outbound campaign tables (ERD diagram 3). The dialer is a follow-up plan. */

export const BatchCallJobs = tenantTable('batchCallJobs', (id) => ({
	name: z.string().min(1).max(200),
	agentId: id('agents'),
	agentVersionId: id('agentVersions').optional(),
	phoneNumberId: id('phoneNumbers'),
	status: z.enum([
		'pending',
		'in_progress',
		'completed',
		'failed',
		'cancelled',
	]),
	scheduledAt: z.string().optional(),
	timezone: z.string().optional(),
	ringingTimeoutSecs: z.number().int().positive().default(60),
	targetConcurrency: z.number().int().positive().optional(),
	// denormalized counters (maintained by Triggers)
	totalScheduled: z.number().int().nonnegative().default(0),
	totalDispatched: z.number().int().nonnegative().default(0),
	totalFinished: z.number().int().nonnegative().default(0),
}))

export const BatchCallRecipients = tenantTable(
	'batchCallRecipients',
	(id) => ({
		batchId: id('batchCallJobs'),
		phoneNumber: z.string(),
		status: z.enum([
			'pending',
			'dispatched',
			'initiated',
			'in_progress',
			'completed',
			'failed',
			'cancelled',
			'voicemail',
		]),
		conversationId: id('conversations').optional(),
		dynamicVariables: dynamicVariables.optional(),
	}),
	{ indexes: { by_batch: ['batchId'] } },
)

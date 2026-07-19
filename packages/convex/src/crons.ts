import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

/**
 * Retention runs daily in bounded, self-rescheduling batches (plan U8).
 * The window is passed as an argument so the tenantSettings-vs-platform
 * decision stays config-only.
 */
const crons = cronJobs()

crons.daily(
	'conversation retention purge',
	{ hourUTC: 4, minuteUTC: 0 },
	internal.api.internals.retention.purgeExpiredConversationData,
	{ retentionDays: 90 },
)

export default crons

import { crud } from 'convex-helpers/server/crud'

import schema from '../../schema'
import { internalQuery, triggeredInternalMutation } from '../../utils'

/**
 * Generated internal CRUD for `kbDocuments` — plumbing tier only (never public).
 * MUST receive the triggers-wrapped internal mutation builder so cascades
 * and denormalized counters fire on every write.
 */
export const { create, read, update, destroy, paginate } = crud(
	schema,
	'kbDocuments',
	internalQuery,
	triggeredInternalMutation,
)

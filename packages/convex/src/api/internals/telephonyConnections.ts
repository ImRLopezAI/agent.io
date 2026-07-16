import { crud } from 'convex-helpers/server/crud'

import schema from '../../schema'
import { internalQuery, triggeredInternalMutation } from '../../utils'

export const { create, read, update, destroy, paginate } = crud(
	schema,
	'telephonyConnections',
	internalQuery,
	triggeredInternalMutation,
)

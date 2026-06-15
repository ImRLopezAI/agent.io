import type { ErrorMap } from '@orpc/contract'

/**
 * Shared, type-safe error map applied to every contract procedure via
 * `base`. Defining errors on the contract (not the server builder) is what
 * makes them available on both the server middleware (`errors.UNAUTHORIZED()`)
 * and the typed client.
 */
export const baseErrors = {
	BAD_REQUEST: {
		message: 'The request payload is invalid.',
		status: 400,
	},
	UNAUTHORIZED: {
		message: 'You must be logged in to access this resource.',
		status: 401,
	},
	NOT_FOUND: {
		message: 'The requested resource was not found.',
		status: 404,
	},
	CONFLICT: {
		message: 'The requested action conflicts with current resource state.',
		status: 409,
	},
	FORBIDDEN: {
		message: 'You do not have permission to access this resource.',
		status: 403,
	},
	NO_ACTIVE_ORGANIZATION: {
		message:
			'No active organization on the session. Pick an organization first.',
		status: 403,
	},
	NO_ADMIN_ROLE: {
		message: 'You must be an admin to access this resource.',
		status: 403,
	},
	NO_ORGANIZATION: {
		message: 'Your organization is not configured to access this resource.',
		status: 403,
	},
} satisfies ErrorMap

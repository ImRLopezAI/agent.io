import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'

/**
 * Returns an async reconciliation fn to run after every session-changing org
 * action (switch / leave / delete / accept-invite).
 *
 * 1. `router.invalidate()` re-runs the root `beforeLoad` (which is NOT
 *    memoized), re-deriving the WorkOS auth snapshot — new active org, role,
 *    permissions — into the route context.
 * 2. `queryClient.invalidateQueries()` refetches every org-scoped query so the
 *    cache reflects the new active organization.
 *
 * Call it only AFTER the AuthKit action has resolved without `{ error }` —
 * `switchToOrganization`/`refreshAuth` resolve to `void | { error }` and do not
 * throw.
 */
export function useOnOrgChanged() {
	const router = useRouter()
	const queryClient = useQueryClient()

	return useCallback(async () => {
		await router.invalidate()
		await queryClient.invalidateQueries()
	}, [router, queryClient])
}

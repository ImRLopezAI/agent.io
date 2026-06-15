import { toast } from 'sonner'

import { $api } from '@/lib/rpc/client'

/**
 * The authkit `useAuth` action methods this landing flow needs.
 * Kept as a narrow structural type so it can be exercised with plain mocks in
 * tests without dragging in the whole `useAuth` surface.
 */
export type OrgLandingAuth = {
	switchToOrganization: (
		organizationId: string,
	) => Promise<void | { error: string }>
	signOut: (options?: { returnTo?: string }) => Promise<void>
}

/**
 * Decision 12 — where the user lands after leaving or deleting the ACTIVE org.
 *
 * The active org has just disappeared from under the session, so:
 *   1. reconcile first (`onOrgChanged` → router.invalidate + invalidateQueries)
 *      so the WorkOS auth snapshot reflects the removal;
 *   2. read the user's remaining memberships directly from the procedure;
 *   3. if any remain → switch into the first one and reconcile again;
 *      otherwise → sign out (no picker route).
 *
 * Shared by the leave and delete confirm dialogs so the landing behaviour stays
 * identical. The mutation itself (remove/leave) is awaited by the caller before
 * this runs.
 */
export async function landAfterLeavingActiveOrg(
	auth: OrgLandingAuth,
	onOrgChanged: () => Promise<void>,
	leavingOrgId?: string,
): Promise<void> {
	await onOrgChanged()

	// WorkOS Management API writes are eventually consistent, so the org we just
	// left/deleted can still appear in this read — exclude it explicitly, else we
	// could switch back into the just-left org (or into a now-deleted one).
	const all = await $api.workOs.organization.listMyMemberships.call()
	const remaining = leavingOrgId
		? all.filter((m) => m.organizationId !== leavingOrgId)
		: all

	if (remaining.length > 0) {
		const res = await auth.switchToOrganization(remaining[0].organizationId)
		if (res?.error) {
			toast.error(res.error)
			return
		}
		await onOrgChanged()
		return
	}

	await auth.signOut()
}

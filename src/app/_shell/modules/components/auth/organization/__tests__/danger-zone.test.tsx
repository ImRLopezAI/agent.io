import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit 7 — the danger-zone gate and the leave/delete landing logic (decision 12).
 *
 * Two surfaces are proven here:
 *   1. `OrganizationDangerZone` renders the Leave row for any member but only
 *      shows the Delete row for an `admin` (route-context gate).
 *   2. `landAfterLeavingActiveOrg` — the shared post-leave/post-delete landing —
 *      reconciles, then switches to the next remaining membership, or signs out
 *      when none remain. This is exercised directly (handler-level) since the
 *      dialogs that call it are dormant/unsurfaced.
 */

// --- mocks ---

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const routeContextMock = vi.hoisted(() => ({
	value: {
		auth: { organizationId: 'org_A', role: 'admin', user: { id: 'u1' } } as {
			organizationId?: string
			role?: string
			user: { id: string } | null
		},
	},
}))
const listMyMembershipsCallMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

vi.mock('@/lib/rpc/client', () => ({
	$api: {
		workOs: {
			organization: {
				listMyMemberships: { call: listMyMembershipsCallMock },
			},
		},
	},
}))

// Leave/Delete rows pull dialogs (which reach the live `$api`/`useAuth` chain);
// stub them so the danger-zone gate test stays focused on row visibility.
vi.mock('../delete-organization', () => ({
	DeleteOrganization: () => <div>delete-organization-row</div>,
}))
vi.mock('../leave-organization', () => ({
	LeaveOrganization: () => <div>leave-organization-row</div>,
}))

const { OrganizationDangerZone } = await import('../organization-danger-zone')
const { landAfterLeavingActiveOrg } = await import('../org-landing')

// --- helpers ---

beforeEach(() => {
	toastMock.error.mockReset()
	listMyMembershipsCallMock.mockReset()
	routeContextMock.value = {
		auth: { organizationId: 'org_A', role: 'admin', user: { id: 'u1' } },
	}
})

afterEach(() => cleanup())

describe('OrganizationDangerZone gate', () => {
	it('shows both leave and delete for an admin', () => {
		render(<OrganizationDangerZone />)

		expect(screen.getByText('leave-organization-row')).toBeDefined()
		expect(screen.getByText('delete-organization-row')).toBeDefined()
	})

	it('hides delete for a non-admin but keeps leave', () => {
		routeContextMock.value = {
			auth: { organizationId: 'org_A', role: 'member', user: { id: 'u1' } },
		}

		render(<OrganizationDangerZone />)

		expect(screen.getByText('leave-organization-row')).toBeDefined()
		expect(screen.queryByText('delete-organization-row')).toBeNull()
	})
})

describe('landAfterLeavingActiveOrg (decision 12)', () => {
	it('switches to the next remaining membership and reconciles', async () => {
		listMyMembershipsCallMock.mockResolvedValue([
			{ organizationId: 'org_B', organizationName: 'B', roleSlug: 'member' },
		])
		const switchToOrganization = vi.fn().mockResolvedValue(undefined)
		const signOut = vi.fn().mockResolvedValue(undefined)
		const onOrgChanged = vi.fn().mockResolvedValue(undefined)

		await landAfterLeavingActiveOrg(
			{ switchToOrganization, signOut },
			onOrgChanged,
		)

		// reconcile first, then switch into the next org, then reconcile again
		expect(onOrgChanged).toHaveBeenCalledTimes(2)
		expect(switchToOrganization).toHaveBeenCalledWith('org_B')
		expect(signOut).not.toHaveBeenCalled()
		expect(toastMock.error).not.toHaveBeenCalled()
	})

	it('signs out when no memberships remain', async () => {
		listMyMembershipsCallMock.mockResolvedValue([])
		const switchToOrganization = vi.fn()
		const signOut = vi.fn().mockResolvedValue(undefined)
		const onOrgChanged = vi.fn().mockResolvedValue(undefined)

		await landAfterLeavingActiveOrg(
			{ switchToOrganization, signOut },
			onOrgChanged,
		)

		expect(switchToOrganization).not.toHaveBeenCalled()
		expect(signOut).toHaveBeenCalledTimes(1)
		// only the initial reconcile runs before signOut
		expect(onOrgChanged).toHaveBeenCalledTimes(1)
	})

	it('toasts and skips the second reconcile when the switch errors', async () => {
		listMyMembershipsCallMock.mockResolvedValue([
			{ organizationId: 'org_B', organizationName: 'B', roleSlug: 'member' },
		])
		const switchToOrganization = vi
			.fn()
			.mockResolvedValue({ error: 'switch failed' })
		const signOut = vi.fn()
		const onOrgChanged = vi.fn().mockResolvedValue(undefined)

		await landAfterLeavingActiveOrg(
			{ switchToOrganization, signOut },
			onOrgChanged,
		)

		expect(toastMock.error).toHaveBeenCalledWith('switch failed')
		expect(signOut).not.toHaveBeenCalled()
		// reconcile ran once (before the failed switch), not a second time
		expect(onOrgChanged).toHaveBeenCalledTimes(1)
	})
})

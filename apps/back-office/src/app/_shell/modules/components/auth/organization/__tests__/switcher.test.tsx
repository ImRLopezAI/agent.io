import type { MyMembership } from '@server/rpc/contracts/work-os.contract'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Unit 4 reference slice — the session-changing switch flow.
 *
 * The switcher's dropdown is a base-ui portal that does not render cleanly in
 * jsdom, so the load-bearing switch flow (`switchToOrganization` →
 * `onOrgChanged`, error short-circuit, empty state) is proven against
 * `OrganizationRow` (a plain button driving the identical flow) and
 * `Organizations` (list/empty). The switcher composes the same hooks, so this
 * covers the contract every Unit-4 component shares.
 */

// --- spine + auth mocks ---

const switchToOrganizationMock = vi.hoisted(() => vi.fn())
const onOrgChangedMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const routeContextMock = vi.hoisted(() => ({
	value: {
		auth: { organizationId: 'org_active', role: 'admin', user: { id: 'u1' } },
	},
}))
const useQueryMock = vi.hoisted(() => ({
	value: { data: [] as MyMembership[], isPending: false },
}))
const dialogsDispatchMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@workos/authkit-tanstack-react-start/client', () => ({
	useAuth: () => ({ switchToOrganization: switchToOrganizationMock }),
}))

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

vi.mock('@tanstack/react-query', () => ({
	useQuery: () => useQueryMock.value,
}))

vi.mock('@/app/_shell/modules/utils/use-on-org-changed', () => ({
	useOnOrgChanged: () => onOrgChangedMock,
}))

vi.mock('@/app/_shell/modules/utils/use-org-opts', () => ({
	useOrgOpts: () => ({
		organization: { listMyMemberships: () => ({ queryKey: ['stub'] }) },
	}),
}))

vi.mock('@/app/_shell/modules/utils/org-dialogs.atoms', () => ({
	useOrgDialogs: () => [{ createOpen: false }, dialogsDispatchMock],
}))

// `CreateOrganizationDialog` is rendered (dormant) by `Organizations`. It is now
// WorkOS-native, but eagerly imports `$api` from `@/lib/rpc/client`, which pulls
// the server WorkOS client into the runner (it throws without real keys). Stub
// it so this slice tests the switch flow in isolation.
vi.mock(
	'@/app/_shell/modules/components/auth/organization/create-organization-dialog',
	() => ({ CreateOrganizationDialog: () => null }),
)

// Import AFTER mocks are registered.
const { OrganizationRow } = await import('../organization-row')
const { Organizations } = await import('../organizations')

function membership(over: Partial<MyMembership> = {}): MyMembership {
	return {
		organizationId: 'org_other',
		organizationName: 'Acme Inc',
		roleSlug: 'member',
		...over,
	}
}

beforeEach(() => {
	switchToOrganizationMock.mockReset()
	onOrgChangedMock.mockReset()
	toastMock.error.mockReset()
	dialogsDispatchMock.mockReset()
	routeContextMock.value = {
		auth: { organizationId: 'org_active', role: 'admin', user: { id: 'u1' } },
	}
	useQueryMock.value = { data: [], isPending: false }
})

afterEach(() => cleanup())

describe('OrganizationRow switch flow', () => {
	it('selecting an org calls switchToOrganization then onOrgChanged', async () => {
		switchToOrganizationMock.mockResolvedValue(undefined)

		render(<OrganizationRow membership={membership()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Manage' }))

		await waitFor(() =>
			expect(switchToOrganizationMock).toHaveBeenCalledWith('org_other'),
		)
		await waitFor(() => expect(onOrgChangedMock).toHaveBeenCalledTimes(1))
		expect(toastMock.error).not.toHaveBeenCalled()
	})

	it('error result toasts and skips onOrgChanged', async () => {
		switchToOrganizationMock.mockResolvedValue({ error: 'nope' })

		render(<OrganizationRow membership={membership()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Manage' }))

		await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('nope'))
		expect(onOrgChangedMock).not.toHaveBeenCalled()
	})

	it('renders the active org as Current with no switch affordance', () => {
		render(
			<OrganizationRow
				membership={membership({ organizationId: 'org_active' })}
			/>,
		)

		expect(screen.getByText('Current')).toBeDefined()
		expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull()
	})
})

describe('Organizations list/empty states', () => {
	it('renders the empty state when there are no memberships', () => {
		useQueryMock.value = { data: [], isPending: false }

		render(<Organizations />)

		expect(screen.getByText('No organizations')).toBeDefined()
	})

	it('renders a row per membership by organizationName', () => {
		useQueryMock.value = {
			data: [
				membership({
					organizationId: 'org_active',
					organizationName: 'Active Org',
				}),
				membership({
					organizationId: 'org_other',
					organizationName: 'Other Org',
				}),
			],
			isPending: false,
		}

		render(<Organizations />)

		expect(screen.getByText('Active Org')).toBeDefined()
		expect(screen.getByText('Other Org')).toBeDefined()
		// active org → Current, other → Manage
		expect(screen.getByText('Current')).toBeDefined()
		expect(screen.getByRole('button', { name: 'Manage' })).toBeDefined()
	})
})

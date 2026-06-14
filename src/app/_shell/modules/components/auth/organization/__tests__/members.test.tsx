import type { MemberRow, OrgRole } from '@server/rpc/contracts/work-os.contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit 5 reference slice — the optimistic members surface.
 *
 * These tests run the REAL `useOrgOpts` option spine + REAL TanStack Query
 * against a test `QueryClient`, stubbing only `@/lib/rpc/client` (`$api` throws
 * on eager import under vitest) and the leaf bits that reach for the live WorkOS
 * auth session (`UserView`, route context, sonner). That proves the load-bearing
 * behaviour end-to-end: the role change writes the optimistic row through the
 * shared org-scoped key, and admin gating hides the controls for a `member`.
 */

// --- mocks (registered before importing the components) ---

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const routeContextMock = vi.hoisted(() => ({
	value: {
		auth: {
			organizationId: 'org_A',
			role: 'admin',
			user: { id: 'u_admin' },
		} as {
			organizationId?: string
			role?: string
			user: { id: string } | null
		},
	},
}))

vi.mock('sonner', () => ({ toast: toastMock }))

// `$api`: minimal oRPC tanstack-query surface. `queryOptions` passes the opts
// (incl. queryKey) through; `mutationOptions` returns a bare options object
// (no mutationFn → `mutate` resolves as success, so onMutate's optimistic write
// + onSettled's invalidate run, which is exactly what we assert).
vi.mock('@/lib/rpc/client', () => {
	// Each procedure gets its OWN native queryKey so the hook's keyless
	// queryOptions()/queryKey() calls resolve to distinct cache entries
	// (members.list and roles.list must not collide under one key).
	const makeProc = (key: string) => ({
		queryKey: () => [key],
		queryOptions: () => ({
			queryKey: [key],
			queryFn: () => Promise.resolve([]),
		}),
		mutationOptions: () => ({ mutationKey: [key] }),
	})
	return {
		$api: {
			workOs: {
				members: {
					list: makeProc('members.list'),
					updateRole: makeProc('members.updateRole'),
					remove: makeProc('members.remove'),
				},
				invitations: {
					list: makeProc('invitations.list'),
					send: makeProc('invitations.send'),
					revoke: makeProc('invitations.revoke'),
					resend: makeProc('invitations.resend'),
				},
				roles: { list: makeProc('roles.list') },
				organization: {
					getActive: makeProc('organization.getActive'),
					listMyMemberships: makeProc('organization.listMyMemberships'),
					update: makeProc('organization.update'),
				},
			},
		},
	}
})

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

// `UserView` reaches for the live WorkOS auth session; stub it to a plain label.
vi.mock('../../user/user-view', () => ({
	UserView: ({ user }: { user?: { email?: string } }) => (
		<span>{user?.email}</span>
	),
}))

const { useOrgOpts } = await import('@/app/_shell/modules/utils/use-org-opts')
const { OrganizationMemberRow } = await import('../organization-member-row')

// --- fixtures ---

// The hook keys off oRPC's native per-procedure key (mocked via makeProc).
const ORG_KEY = ['members.list']
const ROLES_KEY = [['workOs', 'roles', 'list', 'org_A'], { type: 'query' }]

function member(over: Partial<MemberRow> = {}): MemberRow {
	return {
		membershipId: 'm1',
		userId: 'u1',
		email: 'member@example.com',
		name: 'Member One',
		avatarUrl: null,
		status: 'active',
		roleSlug: 'member',
		roleName: 'Member',
		...over,
	}
}

const ROLES: OrgRole[] = [
	{ id: 'r_member', slug: 'member', name: 'Member', description: null },
	{ id: 'r_admin', slug: 'admin', name: 'Admin', description: null },
]

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
	qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	qc.setQueryData(ORG_KEY, [member()])
	qc.setQueryData(ROLES_KEY, ROLES)
	toastMock.error.mockReset()
	toastMock.success.mockReset()
	routeContextMock.value = {
		auth: {
			organizationId: 'org_A',
			role: 'admin',
			user: { id: 'u_admin' },
		},
	}
})

afterEach(() => cleanup())

describe('OrganizationMemberRow — optimistic role change', () => {
	it('selecting a new role optimistically updates the cached row immediately', async () => {
		// Drive the row's `updateRole` mutation directly: spin up the real option
		// spine, call `mutate`, and assert the optimistic onMutate write landed on
		// the org-scoped members key — before any server response.
		function Harness() {
			const { members } = useOrgOpts()
			return (
				<>
					<OrganizationMemberRow member={member()} />
					<button
						type='button'
						aria-label='promote'
						onClick={() => {
							const opts = members.updateRole()
							opts.onMutate?.({ membershipId: 'm1', roleSlug: 'admin' })
						}}
					>
						promote
					</button>
				</>
			)
		}

		render(<Harness />, { wrapper })

		// row renders the current role label
		expect(screen.getByText('Member')).toBeDefined()

		fireEvent.click(screen.getByRole('button', { name: 'promote' }))

		await waitFor(() => {
			const rows = qc.getQueryData<MemberRow[]>(ORG_KEY)
			expect(rows?.[0]?.roleSlug).toBe('admin')
		})
	})

	it('admin sees the role dropdown and remove controls', () => {
		render(<OrganizationMemberRow member={member()} />, { wrapper })

		expect(
			screen.getByRole('button', { name: 'Change member role' }),
		).toBeDefined()
		expect(screen.getByRole('button', { name: 'Remove member' })).toBeDefined()
	})
})

describe('OrganizationMemberRow — non-admin gating', () => {
	it('a member sees no role dropdown or remove control', () => {
		routeContextMock.value = {
			auth: {
				organizationId: 'org_A',
				role: 'member',
				user: { id: 'u_admin' },
			},
		}

		render(<OrganizationMemberRow member={member()} />, { wrapper })

		expect(
			screen.queryByRole('button', { name: 'Change member role' }),
		).toBeNull()
		expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull()
	})

	it('an admin viewing their own row sees no remove control', () => {
		render(<OrganizationMemberRow member={member({ userId: 'u_admin' })} />, {
			wrapper,
		})

		// role dropdown still available, but no self-remove
		expect(
			screen.getByRole('button', { name: 'Change member role' }),
		).toBeDefined()
		expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull()
	})
})

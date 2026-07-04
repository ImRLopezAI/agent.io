import type { InvitationRow } from '@server/rpc/contracts/work-os.contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Unit 6 — the org-invitations surface.
 *
 * Runs the REAL `useOrgOpts` option spine + REAL TanStack Query against a test
 * `QueryClient`, stubbing only `@/lib/rpc/client` (`$api` throws on eager import
 * under vitest), route context, and sonner. That proves the load-bearing
 * behaviour: a pending invitation exposes revoke/resend, revoke optimistically
 * removes the row through the shared org-scoped key, and non-pending /
 * non-admin states hide the controls.
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
	// (invitations.list and roles.list must not collide under one key).
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

const { useOrgOpts } = await import('@/app/_shell/modules/utils/use-org-opts')
const { OrganizationInvitationRow } = await import(
	'../organization-invitation-row'
)

// --- fixtures ---

// The hook keys off oRPC's native per-procedure key (mocked via makeProc).
const ORG_KEY = ['invitations.list']

function invitation(over: Partial<InvitationRow> = {}): InvitationRow {
	return {
		id: 'inv1',
		email: 'invitee@example.com',
		state: 'pending',
		expiresAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
		roleSlug: 'member',
		...over,
	}
}

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function renderRow(inv: InvitationRow) {
	return render(
		<table>
			<tbody>
				<OrganizationInvitationRow invitation={inv} />
			</tbody>
		</table>,
		{ wrapper },
	)
}

beforeEach(() => {
	qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	qc.setQueryData(ORG_KEY, [invitation()])
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

describe('OrganizationInvitationRow — admin + pending', () => {
	it('a pending invitation shows revoke and resend controls', () => {
		renderRow(invitation())

		expect(
			screen.getByRole('button', { name: 'Revoke invitation' }),
		).toBeDefined()
		expect(
			screen.getByRole('button', { name: 'Resend invitation' }),
		).toBeDefined()
	})

	it('revoke optimistically removes the row from the org-scoped cache', async () => {
		// Drive the row's `revoke` mutation through the real option spine and assert
		// the optimistic onMutate write filtered the row out of the cache — before
		// any server response.
		function Harness() {
			const { invitations } = useOrgOpts()
			return (
				<button
					type='button'
					aria-label='do-revoke'
					onClick={() => {
						const opts = invitations.revoke()
						opts.onMutate?.({ invitationId: 'inv1' })
					}}
				>
					revoke
				</button>
			)
		}

		render(<Harness />, { wrapper })

		expect(qc.getQueryData<InvitationRow[]>(ORG_KEY)).toHaveLength(1)

		fireEvent.click(screen.getByRole('button', { name: 'do-revoke' }))

		await waitFor(() => {
			expect(qc.getQueryData<InvitationRow[]>(ORG_KEY)).toHaveLength(0)
		})
	})
})

describe('OrganizationInvitationRow — non-pending states hide controls', () => {
	it('an accepted invitation shows no revoke/resend controls', () => {
		renderRow(invitation({ state: 'accepted' }))

		expect(
			screen.queryByRole('button', { name: 'Revoke invitation' }),
		).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Resend invitation' }),
		).toBeNull()
	})

	it('an expired invitation shows no revoke/resend controls', () => {
		renderRow(invitation({ state: 'expired' }))

		expect(
			screen.queryByRole('button', { name: 'Revoke invitation' }),
		).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Resend invitation' }),
		).toBeNull()
	})
})

describe('OrganizationInvitationRow — non-admin gating', () => {
	it('a member sees no revoke/resend controls on a pending invitation', () => {
		routeContextMock.value = {
			auth: {
				organizationId: 'org_A',
				role: 'member',
				user: { id: 'u_admin' },
			},
		}

		renderRow(invitation())

		expect(
			screen.queryByRole('button', { name: 'Revoke invitation' }),
		).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'Resend invitation' }),
		).toBeNull()
	})
})

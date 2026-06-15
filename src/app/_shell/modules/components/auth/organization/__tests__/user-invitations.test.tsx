import type { MyInvitationRow } from '@server/rpc/contracts/work-os.contract'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Unit 8 — the user-facing "invitations to join" cards.
 *
 * `UserInvitations` is user-scoped (no org key): it reads
 * `invitations.listMine` directly via `useQuery($api…)`. The load-bearing
 * behaviour is: pending invitations render with an Accept action pointing at
 * `acceptUrl` (the WorkOS hosted accept flow), and an empty list renders the
 * empty state. `useQuery`, `$api`, and sonner are stubbed.
 */

// --- mocks (registered before importing the component) ---

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const useQueryMock = vi.hoisted(() => ({
	value: { data: [] as MyInvitationRow[], isPending: false },
}))

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@tanstack/react-query', () => ({
	useQuery: () => useQueryMock.value,
}))

// `$api`: only `listMine.queryOptions` is reached; return a bare options object.
vi.mock('@/lib/rpc/client', () => ({
	$api: {
		workOs: {
			invitations: { listMine: { queryOptions: () => ({}) } },
		},
	},
}))

const { UserInvitations } = await import('../user-invitations')

// --- fixtures ---

function invitation(over: Partial<MyInvitationRow> = {}): MyInvitationRow {
	return {
		id: 'inv1',
		organizationId: 'org_123',
		state: 'pending',
		expiresAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
		acceptUrl: 'https://auth.example.com/accept/inv1',
		...over,
	}
}

beforeEach(() => {
	toastMock.error.mockReset()
	toastMock.success.mockReset()
	useQueryMock.value = { data: [], isPending: false }
})

afterEach(() => cleanup())

describe('UserInvitations', () => {
	it('renders the empty state when there are no invitations', () => {
		useQueryMock.value = { data: [], isPending: false }

		render(<UserInvitations />)

		expect(screen.getByText('No invitations')).toBeDefined()
	})

	it('renders a skeleton while loading', () => {
		useQueryMock.value = { data: undefined as never, isPending: true }

		const { container } = render(<UserInvitations />)

		// no rows, no empty-state copy while pending
		expect(screen.queryByText('No invitations')).toBeNull()
		expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
	})

	it('a pending invitation renders an Accept action pointing at acceptUrl', () => {
		useQueryMock.value = { data: [invitation()], isPending: false }

		render(<UserInvitations />)

		const accept = screen.getByRole('link', { name: 'Accept' })
		expect(accept.getAttribute('href')).toBe(
			'https://auth.example.com/accept/inv1',
		)
		expect(accept.getAttribute('aria-disabled')).toBe('false')
		expect(screen.getByText('pending')).toBeDefined()
	})

	it('a non-pending invitation renders a disabled Accept action', () => {
		useQueryMock.value = {
			data: [invitation({ state: 'expired' })],
			isPending: false,
		}

		render(<UserInvitations />)

		const accept = screen.getByRole('link', { name: 'Accept' })
		expect(accept.getAttribute('aria-disabled')).toBe('true')
		expect(screen.getByText('expired')).toBeDefined()
	})

	it('renders a row per invitation', () => {
		useQueryMock.value = {
			data: [
				invitation({ id: 'inv1', organizationId: 'org_a' }),
				invitation({ id: 'inv2', organizationId: 'org_b' }),
			],
			isPending: false,
		}

		render(<UserInvitations />)

		expect(screen.getAllByRole('link', { name: 'Accept' })).toHaveLength(2)
		expect(screen.getByText('org_a')).toBeDefined()
		expect(screen.getByText('org_b')).toBeDefined()
	})
})

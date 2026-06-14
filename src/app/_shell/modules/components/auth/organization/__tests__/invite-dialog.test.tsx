import { ORPCError } from '@orpc/client'
import type { OrgRole } from '@server/rpc/contracts/work-os.contract'
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
 * Unit 5 — the canonical `useCreateForm` invite slice.
 *
 * The form runs for real (real `useCreateForm` + zod resolver + real TanStack
 * Query `useMutation`); we control only the network edge by stubbing
 * `useOrgOpts().invitations.send()` with a mutation whose `mutationFn` we own.
 * That proves the three load-bearing paths: a valid submit calls the send
 * mutation, a duplicate (`CONFLICT`) is routed onto the email field by
 * `mapOrpcError`, and an invalid email is blocked by the resolver before submit.
 */

// --- mocks (registered before importing the component) ---

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const dispatchMock = vi.hoisted(() => vi.fn())
const sendFnMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/app/_shell/modules/utils/org-dialogs.atoms', () => ({
	useOrgDialogs: () => [
		{ inviteOpen: true, removeMembershipId: null },
		dispatchMock,
	],
}))

const ROLES: OrgRole[] = [
	{ id: 'r_member', slug: 'member', name: 'Member', description: null },
	{ id: 'r_admin', slug: 'admin', name: 'Admin', description: null },
]

// `useOrgOpts`: `roles.list()` is a resolved query; `invitations.send()` is a
// mutation whose `mutationFn` is the controllable `sendFnMock` (success or a
// thrown `ORPCError` per test).
vi.mock('@/app/_shell/modules/utils/use-org-opts', () => ({
	useOrgOpts: () => ({
		roles: {
			list: () => ({
				queryKey: ['roles'],
				queryFn: () => Promise.resolve(ROLES),
			}),
		},
		invitations: {
			send: () => ({ mutationFn: sendFnMock }),
		},
	}),
}))

const { InviteMemberDialog } = await import('../invite-member-dialog')

// --- helpers ---

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function emailInput() {
	return screen.getByPlaceholderText('member@example.com') as HTMLInputElement
}

function submitButton() {
	return screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement
}

beforeEach(() => {
	qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	toastMock.error.mockReset()
	dispatchMock.mockReset()
	sendFnMock.mockReset()
})

afterEach(() => cleanup())

describe('InviteMemberDialog', () => {
	it('a valid submit calls invitations.send with the form values', async () => {
		sendFnMock.mockResolvedValue({ id: 'inv_1' })

		render(<InviteMemberDialog />, { wrapper })

		fireEvent.change(emailInput(), {
			target: { value: 'new@example.com' },
		})

		// resolver validates on change → submit enables
		await waitFor(() => expect(submitButton().disabled).toBe(false))
		fireEvent.click(submitButton())

		// TanStack Query v5 passes `(variables, mutationContext)` to mutationFn;
		// assert on the first arg (the form values) only.
		await waitFor(() => expect(sendFnMock).toHaveBeenCalled())
		expect(sendFnMock.mock.calls[0]?.[0]).toEqual({
			email: 'new@example.com',
			roleSlug: 'member',
		})
		// success → dialog closes via dispatch
		await waitFor(() =>
			expect(dispatchMock).toHaveBeenCalledWith({
				type: 'close',
				dialog: 'invite',
			}),
		)
	})

	it('a duplicate (CONFLICT) is surfaced on the email field, not a toast', async () => {
		sendFnMock.mockRejectedValue(
			new ORPCError('CONFLICT', {
				message: 'This person is already a member.',
			}),
		)

		render(<InviteMemberDialog />, { wrapper })

		fireEvent.change(emailInput(), {
			target: { value: 'dupe@example.com' },
		})
		await waitFor(() => expect(submitButton().disabled).toBe(false))
		fireEvent.click(submitButton())

		// CONFLICT → mapOrpcError routes to form.setError('email', …)
		await waitFor(() =>
			expect(
				screen.getByText('This person is already a member.'),
			).toBeDefined(),
		)
		expect(toastMock.error).not.toHaveBeenCalled()
		// not closed on failure
		expect(dispatchMock).not.toHaveBeenCalledWith({
			type: 'close',
			dialog: 'invite',
		})
	})

	it('an invalid email is blocked by the zod resolver before submit', async () => {
		render(<InviteMemberDialog />, { wrapper })

		fireEvent.change(emailInput(), { target: { value: 'not-an-email' } })

		// resolver rejects → submit stays disabled, send never fires
		await waitFor(() => expect(submitButton().disabled).toBe(true))
		fireEvent.click(submitButton())

		expect(sendFnMock).not.toHaveBeenCalled()
	})
})

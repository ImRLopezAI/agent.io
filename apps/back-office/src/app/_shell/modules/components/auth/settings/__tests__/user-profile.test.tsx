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
 * Unit 9 — the settings name-update surface.
 *
 * The form runs for real (real `useCreateForm` + zod resolver + real TanStack
 * Query `useMutation`); we control only the network edge by stubbing
 * `$api.workOs.user.updateProfile.mutationOptions()` with a mutation whose
 * `mutationFn` we own. That proves the two load-bearing paths: a valid submit
 * calls `updateProfile` with `{ firstName, lastName }`, and an empty name is
 * blocked by the resolver before submit.
 *
 * `@workos-inc/widgets` and the WorkOS `UserAvatar` (which needs an AuthKit
 * provider) are mocked so the test runner doesn't choke on missing context.
 */

// --- mocks (registered before importing the component) ---

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const updateFnMock = vi.hoisted(() => vi.fn())
const routeContextMock = vi.hoisted(() => ({
	value: {
		auth: {
			user: { id: 'u_1', firstName: 'Ada', lastName: 'Lovelace' },
		} as {
			user: { id: string; firstName?: string; lastName?: string } | null
		},
	},
}))

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

// `$api`: `workOs.user.updateProfile.mutationOptions()` returns a mutation whose
// `mutationFn` is the controllable `updateFnMock`.
vi.mock('@/lib/rpc/client', () => ({
	$api: {
		workOs: {
			user: {
				updateProfile: {
					mutationOptions: () => ({ mutationFn: updateFnMock }),
				},
			},
		},
	},
}))

// WorkOS Widgets / avatar need a token + provider — stub them out.
vi.mock('@workos-inc/widgets', () => ({}))
vi.mock('../../user/user-avatar', () => ({
	UserAvatar: () => null,
}))

const { UserProfile } = await import('../account/user-profile')

// --- helpers ---

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function firstNameInput() {
	return screen.getByPlaceholderText('Ada') as HTMLInputElement
}

function lastNameInput() {
	return screen.getByPlaceholderText('Lovelace') as HTMLInputElement
}

function submitButton() {
	return screen.getByRole('button', {
		name: 'Save changes',
	}) as HTMLButtonElement
}

beforeEach(() => {
	qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	toastMock.error.mockReset()
	toastMock.success.mockReset()
	updateFnMock.mockReset()
	routeContextMock.value = {
		auth: { user: { id: 'u_1', firstName: 'Ada', lastName: 'Lovelace' } },
	}
})

afterEach(() => cleanup())

describe('settings UserProfile', () => {
	it('editing the name and submitting calls updateProfile with the new name', async () => {
		updateFnMock.mockResolvedValue({
			id: 'u_1',
			firstName: 'Grace',
			lastName: 'Hopper',
		})

		render(<UserProfile />, { wrapper })

		// the form hydrates the current name from the route context
		await waitFor(() => expect(firstNameInput().value).toBe('Ada'))
		expect(lastNameInput().value).toBe('Lovelace')

		fireEvent.change(firstNameInput(), { target: { value: 'Grace' } })
		fireEvent.change(lastNameInput(), { target: { value: 'Hopper' } })

		await waitFor(() => expect(submitButton().disabled).toBe(false))
		fireEvent.click(submitButton())

		// TanStack Query v5 passes `(variables, mutationContext)` to mutationFn;
		// assert on the first arg (the form values) only.
		await waitFor(() => expect(updateFnMock).toHaveBeenCalled())
		expect(updateFnMock.mock.calls[0]?.[0]).toEqual({
			firstName: 'Grace',
			lastName: 'Hopper',
		})
		await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
		expect(toastMock.error).not.toHaveBeenCalled()
	})

	it('an empty name is blocked by the zod resolver before submit', async () => {
		render(<UserProfile />, { wrapper })

		await waitFor(() => expect(firstNameInput().value).toBe('Ada'))
		fireEvent.change(firstNameInput(), { target: { value: '' } })

		await waitFor(() => expect(submitButton().disabled).toBe(true))
		fireEvent.click(submitButton())

		expect(updateFnMock).not.toHaveBeenCalled()
	})
})

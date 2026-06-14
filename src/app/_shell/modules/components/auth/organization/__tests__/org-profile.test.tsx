import type { OrganizationDto } from '@server/rpc/contracts/work-os.contract'
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
 * Unit 7 — the org profile name-update surface.
 *
 * The form runs for real (real `useCreateForm` + zod resolver + real TanStack
 * Query `useMutation`); we control only the network edge by stubbing
 * `useOrgOpts().organization.update()` with a mutation whose `mutationFn` we own,
 * and `organization.getActive()` with a resolved active-org query. That proves
 * the load-bearing paths: a valid submit calls `update` with the form values,
 * and the whole card is hidden for a non-admin (route-context gate).
 */

// --- mocks (registered before importing the component) ---

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
const updateFnMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

const ACTIVE_ORG = { id: 'org_A', name: 'Acme Inc' } as OrganizationDto

// `useOrgOpts`: `organization.getActive()` is a resolved query; `update()` is a
// mutation whose `mutationFn` is the controllable `updateFnMock`.
vi.mock('@/app/_shell/modules/utils/use-org-opts', () => ({
	useOrgOpts: () => ({
		organization: {
			getActive: () => ({
				queryKey: ['org', 'getActive'],
				queryFn: () => Promise.resolve(ACTIVE_ORG),
			}),
			update: () => ({ mutationFn: updateFnMock }),
		},
	}),
}))

const { OrganizationProfile } = await import('../organization-profile')

// --- helpers ---

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function nameInput() {
	return screen.getByPlaceholderText('Acme Inc.') as HTMLInputElement
}

function submitButton() {
	return screen.getByRole('button', {
		name: 'Save changes',
	}) as HTMLButtonElement
}

beforeEach(() => {
	qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	toastMock.error.mockReset()
	updateFnMock.mockReset()
	routeContextMock.value = {
		auth: { organizationId: 'org_A', role: 'admin', user: { id: 'u_admin' } },
	}
})

afterEach(() => cleanup())

describe('OrganizationProfile', () => {
	it('editing the name and submitting calls organization.update with the new name', async () => {
		updateFnMock.mockResolvedValue({ ...ACTIVE_ORG, name: 'Renamed Inc' })

		render(<OrganizationProfile />, { wrapper })

		// the form hydrates the current name from the active-org query
		await waitFor(() => expect(nameInput().value).toBe('Acme Inc'))

		fireEvent.change(nameInput(), { target: { value: 'Renamed Inc' } })

		await waitFor(() => expect(submitButton().disabled).toBe(false))
		fireEvent.click(submitButton())

		await waitFor(() => expect(updateFnMock).toHaveBeenCalled())
		expect(updateFnMock.mock.calls[0]?.[0]).toEqual({ name: 'Renamed Inc' })
		expect(toastMock.error).not.toHaveBeenCalled()
	})

	it('a non-admin sees no profile card (route-context gate)', () => {
		routeContextMock.value = {
			auth: {
				organizationId: 'org_A',
				role: 'member',
				user: { id: 'u_member' },
			},
		}

		const { container } = render(<OrganizationProfile />, { wrapper })

		expect(container.firstChild).toBeNull()
		expect(screen.queryByText('Organization profile')).toBeNull()
		expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
	})

	it('an empty name is blocked by the zod resolver before submit', async () => {
		render(<OrganizationProfile />, { wrapper })

		await waitFor(() => expect(nameInput().value).toBe('Acme Inc'))
		fireEvent.change(nameInput(), { target: { value: '' } })

		await waitFor(() => expect(submitButton().disabled).toBe(true))
		fireEvent.click(submitButton())

		expect(updateFnMock).not.toHaveBeenCalled()
	})
})

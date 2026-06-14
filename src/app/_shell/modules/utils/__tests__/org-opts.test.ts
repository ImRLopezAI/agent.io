import type { MemberRow } from '@server/rpc/contracts/work-os.contract'
import { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { membersRemoveOpts, membersUpdateRoleOpts } from '../org.mut-opts'

const toastMock = vi.hoisted(() => ({
	error: vi.fn(),
	success: vi.fn(),
}))

vi.mock('sonner', () => ({
	toast: toastMock,
}))

// `@/lib/rpc/client` is isomorphic: importing it eagerly evaluates the SERVER
// branch (`@server/rpc` → WorkOS client construction), which throws without env
// in the test runner. Stub `$api` with the minimal oRPC tanstack-query surface
// the factories/hook use: `queryOptions(opts)` passes `opts` (incl. queryKey)
// through, `mutationOptions()` returns a base options object. This keeps the
// test in the client domain and exercises OUR optimistic + key logic.
const proc = {
	queryOptions: (opts: { queryKey?: unknown }) => ({ ...opts }),
	mutationOptions: () => ({ mutationKey: ['stub'] }),
}
const apiStub = {
	workOs: {
		members: { list: proc, updateRole: proc, remove: proc },
		invitations: { list: proc, send: proc, revoke: proc, resend: proc },
		roles: { list: proc },
		organization: {
			getActive: proc,
			listMyMemberships: proc,
			update: proc,
		},
	},
}

vi.mock('@/lib/rpc/client', () => ({ $api: apiStub }))

const $api = apiStub as unknown as typeof import('@/lib/rpc/client').$api

// Route context is the only external dependency of `useOrgOpts`; stub it so the
// hook can run under `renderHook` without a router. `useQueryClient` is provided
// by a real QueryClient via the hoisted mock below.
const routeContextMock = vi.hoisted(() => ({
	value: { auth: { organizationId: 'org_A' as string | undefined } },
}))

vi.mock('@tanstack/react-router', () => ({
	useRouteContext: () => routeContextMock.value,
}))

const qcMock = vi.hoisted(() => ({ client: null as QueryClient | null }))

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>()
	return {
		...actual,
		useQueryClient: () => qcMock.client,
	}
})

const membersKey = [['workOs', 'members', 'list', 'org_A'], { type: 'query' }]

function makeMembers(): MemberRow[] {
	return [
		{
			membershipId: 'm1',
			userId: 'u1',
			email: 'a@x.com',
			name: 'A',
			avatarUrl: null,
			status: 'active',
			roleSlug: 'member',
			roleName: 'Member',
		},
		{
			membershipId: 'm2',
			userId: 'u2',
			email: 'b@x.com',
			name: 'B',
			avatarUrl: null,
			status: 'active',
			roleSlug: 'member',
			roleName: 'Member',
		},
	]
}

describe('org.mut-opts optimistic factories', () => {
	let qc: QueryClient

	beforeEach(() => {
		qc = new QueryClient()
		qc.setQueryData(membersKey, makeMembers())
		toastMock.error.mockClear()
	})

	it('updateRole onMutate writes the optimistic row, onError rolls back', async () => {
		const opts = membersUpdateRoleOpts($api, qc, membersKey)
		const vars = { membershipId: 'm1', roleSlug: 'admin' }

		const ctx = (await opts.onMutate(vars)) as {
			previous: MemberRow[] | undefined
		}

		// optimistic write applied
		const optimistic = qc.getQueryData<MemberRow[]>(membersKey)
		expect(optimistic?.find((r) => r.membershipId === 'm1')?.roleSlug).toBe(
			'admin',
		)
		// snapshot captured the pre-mutation value
		expect(ctx.previous?.find((r) => r.membershipId === 'm1')?.roleSlug).toBe(
			'member',
		)

		// rollback restores the snapshot + surfaces a toast
		opts.onError(new Error('server rejected'), vars, ctx)
		const rolledBack = qc.getQueryData<MemberRow[]>(membersKey)
		expect(rolledBack?.find((r) => r.membershipId === 'm1')?.roleSlug).toBe(
			'member',
		)
		expect(toastMock.error).toHaveBeenCalledWith('Something went wrong')
	})

	it('remove onMutate filters the row, onError restores it', async () => {
		const opts = membersRemoveOpts($api, qc, membersKey)
		const vars = { membershipId: 'm2' }

		const ctx = (await opts.onMutate(vars)) as {
			previous: MemberRow[] | undefined
		}

		const optimistic = qc.getQueryData<MemberRow[]>(membersKey)
		expect(optimistic?.some((r) => r.membershipId === 'm2')).toBe(false)
		expect(optimistic).toHaveLength(1)

		opts.onError(new Error('server rejected'), vars, ctx)
		const rolledBack = qc.getQueryData<MemberRow[]>(membersKey)
		expect(rolledBack?.some((r) => r.membershipId === 'm2')).toBe(true)
		expect(rolledBack).toHaveLength(2)
	})

	it('onSettled invalidates the org-scoped members key', async () => {
		const opts = membersUpdateRoleOpts($api, qc, membersKey)
		const spy = vi.spyOn(qc, 'invalidateQueries')

		await opts.onSettled()

		expect(spy).toHaveBeenCalledWith({ queryKey: membersKey })
	})
})

describe('useOrgOpts org-aware query keys', () => {
	beforeEach(() => {
		qcMock.client = new QueryClient()
	})

	it('folds organizationId into the query KEY so org A and org B differ', async () => {
		const { useOrgOpts } = await import('../use-org-opts')

		routeContextMock.value = { auth: { organizationId: 'org_A' } }
		const { result: a } = renderHook(() => useOrgOpts())
		const keyA = a.current.members.list().queryKey

		routeContextMock.value = { auth: { organizationId: 'org_B' } }
		const { result: b } = renderHook(() => useOrgOpts())
		const keyB = b.current.members.list().queryKey

		expect(keyA).not.toEqual(keyB)
		expect(keyA).toEqual([
			['workOs', 'members', 'list', 'org_A'],
			{ type: 'query' },
		])
		expect(keyB).toEqual([
			['workOs', 'members', 'list', 'org_B'],
			{ type: 'query' },
		])
	})

	it('keeps listMyMemberships NON-org-scoped (spans every org)', async () => {
		const { useOrgOpts } = await import('../use-org-opts')

		routeContextMock.value = { auth: { organizationId: 'org_A' } }
		const { result } = renderHook(() => useOrgOpts())
		const key = result.current.organization.listMyMemberships().queryKey

		expect(key).toEqual([
			['workOs', 'organization', 'listMyMemberships'],
			{ type: 'query' },
		])
	})
})

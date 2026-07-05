import type { MemberRow } from '@server/rpc/contracts/work-os.contract'
import { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
// the factories/hook use. The active org is server-derived, so keys are the
// procedure-native `queryKey()` (org-INDEPENDENT): `queryKey()` returns the
// stable native key, `queryOptions()` passes opts through, `mutationOptions()`
// returns a base options object. This keeps the test in the client domain and
// exercises OUR optimistic + native-key logic.
function makeProc(path: string[]) {
	const queryKey = [path, { type: 'query' }]
	return {
		queryKey: () => queryKey,
		queryOptions: (opts?: { queryKey?: unknown }) => ({ queryKey, ...opts }),
		mutationOptions: (opts?: object) => ({ mutationKey: ['stub'], ...opts }),
	}
}

const apiStub = {
	workOs: {
		members: {
			list: makeProc(['workOs', 'members', 'list']),
			updateRole: makeProc(['workOs', 'members', 'updateRole']),
			remove: makeProc(['workOs', 'members', 'remove']),
		},
		invitations: {
			list: makeProc(['workOs', 'invitations', 'list']),
			send: makeProc(['workOs', 'invitations', 'send']),
			revoke: makeProc(['workOs', 'invitations', 'revoke']),
			resend: makeProc(['workOs', 'invitations', 'resend']),
		},
		roles: { list: makeProc(['workOs', 'roles', 'list']) },
		organization: {
			getActive: makeProc(['workOs', 'organization', 'getActive']),
			listMyMemberships: makeProc([
				'workOs',
				'organization',
				'listMyMemberships',
			]),
			update: makeProc(['workOs', 'organization', 'update']),
		},
	},
}

vi.mock('@/lib/rpc/client', () => ({ $api: apiStub }))

const $api = apiStub as unknown as typeof import('@/lib/rpc/client').$api

const qcMock = vi.hoisted(() => ({ client: null as QueryClient | null }))

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>()
	return {
		...actual,
		useQueryClient: () => qcMock.client,
	}
})

// The native members-list key the factories write to / invalidate.
const membersKey = $api.workOs.members.list.queryKey()

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

	it('onSettled invalidates the native members key', async () => {
		const opts = membersUpdateRoleOpts($api, qc, membersKey)
		const spy = vi.spyOn(qc, 'invalidateQueries')

		await opts.onSettled()

		expect(spy).toHaveBeenCalledWith({ queryKey: membersKey })
	})
})

describe('useOrgOpts native query keys', () => {
	beforeEach(() => {
		qcMock.client = new QueryClient()
	})

	it('writes optimistically + invalidates the SAME key oRPC queryKey() returns', async () => {
		const { useOrgOpts } = await import('../use-org-opts')
		const qc = qcMock.client as QueryClient

		// The native key the members.list query reads from.
		const nativeKey = $api.workOs.members.list.queryKey()
		qc.setQueryData(nativeKey, makeMembers())
		const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

		const { result } = renderHook(() => useOrgOpts())

		// The list query is keyed on the native procedure key.
		expect(result.current.members.list().queryKey).toEqual(nativeKey)

		const updateRole = result.current.members.updateRole()
		await updateRole.onMutate({ membershipId: 'm1', roleSlug: 'admin' })

		// setQueryData landed on the native key the query reads from.
		expect(
			qc
				.getQueryData<MemberRow[]>(nativeKey)
				?.find((r) => r.membershipId === 'm1')?.roleSlug,
		).toBe('admin')

		await updateRole.onSettled()

		// invalidate targets that same native key.
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: nativeKey })
	})

	it('keeps listMyMemberships on its own native key (spans every org)', async () => {
		const { useOrgOpts } = await import('../use-org-opts')

		const { result } = renderHook(() => useOrgOpts())
		const key = result.current.organization.listMyMemberships().queryKey

		expect(key).toEqual($api.workOs.organization.listMyMemberships.queryKey())
	})
})

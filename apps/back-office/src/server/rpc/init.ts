import { redis } from '@lib/redis'
import { implement, ORPCError } from '@orpc/server'
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins'
import type { getAuth } from '@workos/authkit-tanstack-react-start'

import { workOs } from '@/lib/work-os'

import { contract } from './contracts'
export type RpcContext = ResponseHeadersPluginContext & {
	headers: Headers
	session: Awaited<ReturnType<typeof getAuth>>
}

export interface RpcContextType {
	headers: Headers
	workOs: typeof workOs
	session: Awaited<ReturnType<typeof getAuth>>
}

/**
 * Builds the per-request RPC context. `getAuth()` reads the request's
 * AsyncLocalStorage, so this must run inside a request (the Hono handler and
 * the lazy server caller in `lib/rpc/client.ts` both do).
 */
export async function createRpcContext(
	input: RpcContext,
): Promise<RpcContextType> {
	return {
		headers: input.headers,
		session: input.session,
		workOs,
	}
}

/**
 * Contract-first implementer. `os` is the public base; the `*Os` variants layer
 * auth middleware on top. Implement a procedure by walking to its contract path
 * (e.g. `os.health`, `organizationOs.workOs.organization.getOrganization`) and
 * calling `defineHandler(implementer, handler)` from `./server-procedure`.
 * The router is assembled in `./index.ts`.
 */
export const os = implement(contract)
	.$context<RpcContextType>()
	.$config({
		initialInputValidationIndex: Number.NEGATIVE_INFINITY,
		initialOutputValidationIndex: Number.NEGATIVE_INFINITY,
	})
	.use(async ({ procedure, path, next }, input, output) => {
		if (!procedure['~orpc'].meta.cache) return await next()
		const key = `rpc:${path.join('.')}:${JSON.stringify(input)}`
		const cached = await redis.get(key)
		if (cached) return output(cached)

		const result = await next()
		await redis.set(key, result.output, {
			ex: 60 * 2,
		})
		return result
	})

/** Requires an authenticated session; adds `user` to context. */
export const auth = os.use(async ({ context, next, errors }) => {
	const session = context.session
	if (!session.user) throw errors.UNAUTHORIZED()
	try {
		return await next({
			context: { ...context, session, user: session.user },
		})
	} catch (error) {
		// Remap raw WorkOS SDK exceptions to the contract's typed errors so the
		// client gets CONFLICT/NOT_FOUND/... instead of an opaque 500. Already-typed
		// oRPC errors (our guards, auth gates) pass through unchanged.
		if (error instanceof ORPCError) throw error
		const status =
			typeof (error as { status?: unknown })?.status === 'number'
				? (error as { status: number }).status
				: undefined
		if (status === 404) throw errors.NOT_FOUND()
		if (status === 409 || status === 422) throw errors.CONFLICT()
		if (status === 401) throw errors.UNAUTHORIZED()
		if (status === 403) throw errors.FORBIDDEN()
		throw error
	}
})

/** Requires the authenticated user to be an admin. */
export const admin = auth.use(async ({ context, next, errors }) => {
	const role = context.session.role ?? ''
	if (role !== 'admin') throw errors.NO_ADMIN_ROLE()
	return next({})
})

/** Requires an active organization on the session; adds `organizationId`. */
export const org = auth.use(async ({ context, next, errors }) => {
	const organizationId = context.session.organizationId
	if (!organizationId) throw errors.NO_ACTIVE_ORGANIZATION()
	return next({ context: { ...context, organizationId } })
})

/**
 * Requires an admin acting on an active organization. Layers the admin role
 * gate onto `org`, so handlers get a guaranteed `organizationId` for
 * org-management mutations (update/delete org, change/remove member, invite).
 */
export const adminOrg = org.use(async ({ context, next, errors }) => {
	const role = context.session.role ?? ''
	if (role !== 'admin') throw errors.NO_ADMIN_ROLE()
	return next({})
})

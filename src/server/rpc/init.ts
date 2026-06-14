import { implement } from '@orpc/server'
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins'
import { env } from '@/lib/env'
import { contract } from './contracts'
import { cvx } from '@server/convex/service'
import { getAuth } from '@workos/authkit-tanstack-react-start'
import { WorkOS } from '@workos-inc/node'

const workOs = new WorkOS({
	apiKey: env.WORKOS_API_KEY,
	clientId: env.WORKOS_CLIENT_ID,
})

export type RpcContext = ResponseHeadersPluginContext & {
	headers: Headers
}

export interface RpcContextType {
	headers: Headers
	resHeaders: Headers
	session: Awaited<ReturnType<typeof getAuth>>
	cvx: typeof cvx
	workOs: WorkOS
}

/**
 * Builds the per-request RPC context. `getAuth()` reads the request's
 * AsyncLocalStorage, so this must run inside a request (the Hono handler and
 * the lazy server caller in `lib/rpc/client.ts` both do).
 */
export async function createRpcContext(input: {
	headers: Headers
	resHeaders?: Headers
}): Promise<RpcContextType> {
	const session = await getAuth()
	return {
		headers: input.headers,
		resHeaders: input.resHeaders ?? new Headers(),
		session,
		cvx,
		workOs,
	}
}

/**
 * Contract-first implementer. `os` is the public base; the `*Os` variants layer
 * auth middleware on top. Implement a procedure by walking to its contract path
 * (e.g. `os.health`, `organizationOs.workOs.organization.getOrganization`) and
 * calling `.handler(...)`. The router is assembled in `./index.ts`.
 */
export const os = implement(contract).$context<RpcContextType>()

/** Requires an authenticated session; adds `user` to context. */
export const auth = os.use(async ({ context, next, errors }) => {
	const session = context.session
	if (!session.user) throw errors.UNAUTHORIZED()
	return next({
		context: { ...context, session, user: session.user },
	})
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

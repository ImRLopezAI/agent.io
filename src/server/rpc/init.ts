import { type AnyRouter, os, type Route } from '@orpc/server'
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins'
import { cvx } from '@server/convex/service'
import { getAuth } from '@workos/authkit-tanstack-react-start'
export type RpcContext = ResponseHeadersPluginContext & {
	headers: Headers
}

export interface RpcContextType {
	headers: Headers
	resHeaders: Headers
	session: Awaited<ReturnType<typeof getAuth>>
	cvx: typeof cvx
}

/**
 * Sync builder for RPC context. The caller is responsible for resolving the
 * session via `getSessionFromRequest(request)` (from `@server/auth/native`)
 * and passing it in. Keeping this sync lets it run at module load with a
 * `null` session for the standalone `caller`, while per-request callers
 * (proxy middleware, Hono RPC handler) pass real sessions.
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
	}
}

const rpc = os.$context<RpcContextType>().errors({
	BAD_REQUEST: {
		message: 'The request payload is invalid.',
		status: 400,
	},
	UNAUTHORIZED: {
		message: 'You must be logged in to access this resource.',
		status: 401,
	},
	NOT_FOUND: {
		message: 'The requested resource was not found.',
		status: 404,
	},
	CONFLICT: {
		message: 'The requested action conflicts with current resource state.',
		status: 409,
	},
	FORBIDDEN: {
		message: 'You do not have permission to access this resource.',
		status: 403,
	},
	NO_ACTIVE_ORGANIZATION: {
		message:
			'No active organization on the session. Pick an organization first.',
		status: 403,
	},
	NO_ADMIN_ROLE: {
		message: 'You must be an admin to access this resource.',
		status: 403,
	},
	NO_ORGANIZATION: {
		message: 'Your organization is not configured to access this resource.',
		status: 403,
	},
})

export const publicProcedure = rpc

export const protectedProcedure = publicProcedure.use(
	async ({ context, next, errors }) => {
		const session = context.session
		if (!session.user) throw errors.UNAUTHORIZED()
		return await next({
			context: { ...context, session, user: session.user },
		})
	},
)

export const adminProcedure = protectedProcedure.use(
	async ({ context, next, errors }) => {
		const role = context.session.role ?? ''
		if (role !== 'admin') throw errors.NO_ADMIN_ROLE()
		return await next({ context: { ...context, user: context.user } })
	},
)

export const organizationProcedure = protectedProcedure.use(
	async ({ context, next, errors }) => {
		const organizationId = context.session.organizationId
		if (!organizationId) throw errors.NO_ACTIVE_ORGANIZATION()
		return await next({ context: { ...context, organizationId } })
	},
)

export function createRPCRouter<T extends AnyRouter>(
	routes: T,
	defaultOpenApi?: Omit<Partial<Route>, 'method' | 'path'>,
): T {
	// biome-ignore lint/suspicious/noExplicitAny: Allows any for flexible route definitions, but can be improved with better typing in the future
	const routesWithOpenApi: Record<string, any> = {}

	for (const [key, procedure] of Object.entries(routes)) {
		if (
			defaultOpenApi &&
			typeof procedure === 'object' &&
			'route' in procedure
		) {
			routesWithOpenApi[key] = procedure.route(defaultOpenApi)
		} else {
			routesWithOpenApi[key] = procedure
		}
	}

	return rpc.router(routesWithOpenApi) as T
}

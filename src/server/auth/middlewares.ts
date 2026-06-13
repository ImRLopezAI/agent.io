import { createMiddleware } from '@tanstack/react-start'
import { getAuth } from '@workos/authkit-tanstack-react-start'

/** Resolves session into `context` but never blocks. Pair with `requireAuthMiddleware` for gated routes. */
export const authMiddleware = createMiddleware({
	type: 'request',
}).server(async ({ next }) => {
	const session = await getAuth()
	return await next({
		context: { session },
	})
})

const SIGN_IN_PATH = '/auth/sign-in'

/**
 * HTTP redirect for unauthenticated users. Request middleware may return a
 * `Response` to short-circuit the chain.
 */
export const requireAuthMiddleware = createMiddleware({ type: 'request' })
	.middleware([authMiddleware])
	.server(async ({ request, context, next }) => {
		if (!context.session.user) {
			return Response.redirect(new URL(SIGN_IN_PATH, request.url), 302)
		}
		return next()
	})

export const alreadyAuthenticatedMiddleware = createMiddleware({
	type: 'request',
})
	.middleware([authMiddleware])
	.server(async ({ request, context, next }) => {
		if (request.url.includes('/logout')) {
			return next()
		}
		if (context.session.user) {
			return Response.redirect(new URL('/', request.url), 302)
		}
		return next()
	})

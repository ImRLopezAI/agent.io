import { createMiddleware } from '@tanstack/react-start'
import { getAuth } from '@workos/authkit-tanstack-react-start'

export const proxyMiddlewareRequest = createMiddleware({
	type: 'request',
}).server(async ({ request, next }) => {
	const session = await getAuth()

	return next({
		context: {
			$session: session,
		},
	})
})

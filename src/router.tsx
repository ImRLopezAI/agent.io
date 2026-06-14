import { ErrorComponent } from '@components/layout/errors/error'
import { NotFoundComponent } from '@components/layout/errors/not-found'
import { getContext } from '@lib/rpc/context'
// import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
	const context = getContext()

	const router = createTanStackRouter({
		routeTree,
		context: {
			...context,
			auth: { user: null },
		},
		scrollRestoration: true,
		defaultPreload: 'intent',
		defaultPreloadStaleTime: 0,
		defaultNotFoundComponent: () => <NotFoundComponent />,
		defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
	})

	// if (!router.isServer) {
	// 	Sentry.init({
	// 		dsn: import.meta.env.VITE_SENTRY_DSN,
	// 		sendDefaultPii: true,
	// 	})
	// }
	setupRouterSsrQueryIntegration({ router, queryClient: context.rpcClient })

	return router
}

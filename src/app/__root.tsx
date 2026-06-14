import { Providers } from '@components/provider'
import inter from '@fontsource-variable/inter/wght.css?url'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import { getAuth } from '@workos/authkit-tanstack-react-start'
import type { getContext } from '#/lib/rpc/context'
import { cn } from '#/lib/utils'
import appCss from './globals.css?url'

const fetchWorkosAuth = createServerFn({ method: 'GET' }).handler(async () => {
	const auth = await getAuth()
	return auth
})
interface RouterContext extends ReturnType<typeof getContext> {
	auth: Awaited<ReturnType<typeof fetchWorkosAuth>>
}

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const auth = await fetchWorkosAuth()
		if (!auth.user) return { auth: { user: null } }

		if (auth.accessToken) {
			context.cvx.serverHttpClient?.setAuth(auth.accessToken)
		}

		return {
			auth,
		}
	},
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, viewport-fit=cover',
			},
			{
				name: 'theme-color',
				content: '#ffffff',
				media: '(prefers-color-scheme: light)',
			},
			{
				name: 'theme-color',
				content: '#000000',
				media: '(prefers-color-scheme: dark)',
			},
			{
				name: 'color-scheme',
				content: 'light dark',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
			{
				rel: 'stylesheet',
				href: inter,
			},
		],
	}),
	shellComponent: RootDocument
})

function RootDocument({ children }: { children: React.ReactNode }) {
	const ctx = Route.useRouteContext()

	return (
		<html
			lang='en'
			suppressHydrationWarning
			className={cn('bg-background font-sans text-foreground antialiased')}
		>
			<head>
				<HeadContent />
			</head>
			<body>
				<Providers cvx={ctx.cvx} queryClient={ctx.queryClient} rpcClient={ctx.rpcClient}>
					{children}
					<TanStackDevtools
						config={{
							position: 'bottom-right',
						}}
						plugins={[
							{
								name: 'Tanstack Router',
								render: <TanStackRouterDevtoolsPanel />,
							},
							{
								name: 'Tanstack Query',
								render: <ReactQueryDevtoolsPanel />,
							},
						]}
					/>
				</Providers>
				<Scripts />
			</body>
		</html>
	)
}

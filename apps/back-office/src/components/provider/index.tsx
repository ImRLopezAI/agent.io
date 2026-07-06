'use client'
import type { getContext } from '@lib/rpc/context'
import { PostHogProvider } from '@posthog/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthKitProvider } from '@workos/authkit-tanstack-react-start/client'
import { NuqsAdapter } from 'nuqs/adapters/react'

import BaseProviders from './base'
import { ConvexProviderWithAuthKit } from './convex'

interface ProvidersProps extends React.PropsWithChildren {
	cvx: ReturnType<typeof getContext>['cvx']
	queryClient: ReturnType<typeof getContext>['queryClient']
	rpcClient: ReturnType<typeof getContext>['rpcClient']
}
export function Providers(props: ProvidersProps) {
	return (
		<BaseProviders>
			<AuthKitProvider>
				<QueryClientProvider client={props.rpcClient}>
					<NuqsAdapter>
						<ConvexProviderWithAuthKit {...props}>
							{import.meta.env.PROD ? (
								<PostHogProvider
									apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY || ''}
								>
									{props.children}
								</PostHogProvider>
							) : (
								props.children
							)}
						</ConvexProviderWithAuthKit>
					</NuqsAdapter>
				</QueryClientProvider>
			</AuthKitProvider>
		</BaseProviders>
	)
}

'use client'
import type { getContext } from '@lib/rpc/context'
import { PostHogProvider } from '@posthog/react'
import { AuthKitProvider } from '@workos/authkit-tanstack-react-start/client'
import { NuqsAdapter } from 'nuqs/adapters/react'
import BaseProviders from './base'
import { ConvexProviderWithAuthKit } from './convex'

interface ProvidersProps extends React.PropsWithChildren {
	cvx: ReturnType<typeof getContext>['cvx']
	queryClient: ReturnType<typeof getContext>['queryClient']
}
export function Providers(props: ProvidersProps) {
	return (
		<AuthKitProvider>
			<NuqsAdapter>
				<ConvexProviderWithAuthKit {...props}>
					<BaseProviders>
						{import.meta.env.PROD ? (
							<PostHogProvider apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}>
								{props.children}
							</PostHogProvider>
						) : (
							props.children
						)}
					</BaseProviders>
				</ConvexProviderWithAuthKit>
			</NuqsAdapter>
		</AuthKitProvider>
	)
}

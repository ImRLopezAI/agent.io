'use client'
import type { getContext } from '@lib/rpc/context'
import { QueryClientProvider } from '@tanstack/react-query'
import {
	useAccessToken,
	useAuth,
} from '@workos/authkit-tanstack-react-start/client'
import { ConvexProviderWithAuth } from 'convex/react'
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider'
import { useCallback, useMemo } from 'react'

interface ProvidersProps extends React.PropsWithChildren {
	cvx: ReturnType<typeof getContext>['cvx']
	queryClient: ReturnType<typeof getContext>['queryClient']
}
export function ConvexProviderWithAuthKit(props: ProvidersProps) {
	return (
		<ConvexProviderWithAuth
			client={props.cvx.convexClient}
			useAuth={useAuthFromAuthKit}
		>
			<QueryClientProvider client={props.queryClient}>
				<ConvexQueryCacheProvider>{props.children}</ConvexQueryCacheProvider>
			</QueryClientProvider>
		</ConvexProviderWithAuth>
	)
}

function useAuthFromAuthKit() {
	const { loading, user } = useAuth()
	const { getAccessToken, refresh } = useAccessToken()

	const fetchAccessToken = useCallback(
		async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
			if (!user) {
				return null
			}

			if (forceRefreshToken) {
				return (await refresh()) ?? null
			}

			return (await getAccessToken()) ?? null
		},
		[user, refresh, getAccessToken],
	)

	return useMemo(
		() => ({
			isLoading: loading,
			isAuthenticated: !!user,
			fetchAccessToken,
		}),
		[loading, user, fetchAccessToken],
	)
}

import { api } from '@convex/api'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { cache } from 'react'

import { $api } from './client'
import { queryClient } from './query'

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL
if (!CONVEX_URL) {
	throw new Error('VITE_CONVEX_URL is not defined')
}
export const getContext = cache(() => {
	const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

	const cvxQueryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				queryKeyHashFn: convexQueryClient.hashFn(),
				queryFn: convexQueryClient.queryFn(),
				gcTime: 5000,
			},
		},
	})
	convexQueryClient.connect(cvxQueryClient)

	return {
		$cvx: api,
		queryClient: cvxQueryClient,
		cvx: convexQueryClient,
		rpcClient: queryClient,
		$rpc: $api,
	} as const
})

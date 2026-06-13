import { createORPCClient, onError } from '@orpc/client'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import { StandardRPCJsonSerializer } from '@orpc/client/standard'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createRouterClient, type RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { type RPCRouter, rpcRouter } from '@server/rpc'
import { createRpcContext } from '@server/rpc/init'
import {
	defaultShouldDehydrateQuery,
	QueryCache,
	QueryClient,
} from '@tanstack/react-query'
import { createIsomorphicFn } from '@tanstack/react-start'

const serializer = new StandardRPCJsonSerializer({
	customJsonSerializers: [],
})
const isAbortError = (error: unknown) => {
	if (!error) {
		return false
	}

	if (
		typeof DOMException !== 'undefined' &&
		error instanceof DOMException &&
		error.name === 'AbortError'
	) {
		return true
	}

	if (error instanceof Error && error.name === 'AbortError') {
		return true
	}

	if (typeof error === 'object') {
		const maybeError = error as { name?: string; cause?: unknown }
		if (maybeError.name === 'AbortError') {
			return true
		}

		const maybeCause = maybeError.cause as { name?: string } | undefined
		if (maybeCause?.name === 'AbortError') {
			return true
		}
	}

	return false
}
export const queryClient = new QueryClient({
	queryCache: new QueryCache({}),
	defaultOptions: {
		queries: {
			queryKeyHashFn(queryKey) {
				const [json, meta] = serializer.serialize(queryKey)
				return JSON.stringify({ json, meta })
			},
			staleTime: 60 * 1000, // > 0 to prevent immediate refetching on mount
		},
		dehydrate: {
			serializeData: (data) => {
				const [json, meta] = serializer.serialize(data)
				return JSON.stringify({ json, meta })
			},
			shouldDehydrateQuery: (query) =>
				defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
		},
		hydrate: {
			deserializeData: (dataStr) =>
				serializer.deserialize(dataStr.json, dataStr.meta),
		},
	},
})

export const getRPCClient = createIsomorphicFn()
	.server(() =>
		createRouterClient(rpcRouter, {
			// Module-level server caller: no request, no session. Use only for
			// public procedures. Per-request callers (proxy middleware, Hono
			// `/api/rpc/*`) build their own context with a real session.
			context: createRpcContext({
				headers: new Headers(),
			}),
		}),
	)
	.client((): RouterClient<RPCRouter> => {
		const link = new OpenAPILink(rpcRouter, {
			url: `${window.location.origin}/api/rpc`,
			plugins: [
				new BatchLinkPlugin({
					groups: [
						{
							condition: () => true,
							context: {},
						},
					],
				}),
			],
			fetch: (url, options: RequestInit) => {
				const controller = new AbortController()
				if (options?.signal) {
					options.signal.addEventListener('abort', () => {
						controller.abort()
					})
				}
				return fetch(url, {
					...options,
					credentials: 'include',
					// Ensure we don't pass undefined signal which can cause issues
					signal: controller.signal,
				})
			},
			interceptors: [
				onError((error) => {
					if (isAbortError(error)) {
						return
					}
					console.error('RPC Error:', error)
				}),
			],
		})
		return createORPCClient(link)
	})

export const caller: JsonifiedClient<ContractRouterClient<RPCRouter>> =
	getRPCClient()

export const $api = createTanstackQueryUtils(caller)

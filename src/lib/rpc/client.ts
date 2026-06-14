import { createORPCClient, onError } from '@orpc/client'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createRouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import { contract } from '@server/rpc/contracts'
import { router } from '@server/rpc'
import { createRpcContext } from '@server/rpc/init'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getRPCClient = createIsomorphicFn()
	.server(() =>
		createRouterClient(router, {
			// Lazy: resolved per call inside the request's AsyncLocalStorage.
			// Eager evaluation at module load throws "No Start context found".
			context: () =>
				createRpcContext({
					headers: getRequestHeaders(),
				}),
		}),
	)
	.client((): ContractRouterClient<typeof contract> => {
		const link = new OpenAPILink(contract, {
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

export const caller: JsonifiedClient<ContractRouterClient<typeof contract>> =
	getRPCClient()

export const $api = createTanstackQueryUtils(caller)

function isAbortError(error: unknown): boolean {
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

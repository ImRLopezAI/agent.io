import { createORPCClient, onError } from '@orpc/client'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createRouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
// Pure contract (zod + types only). Importing this subpath does NOT evaluate
// `@server/rpc` (the handler/index), so no server code reaches the client.
import { contract } from '@server/rpc/contracts'
import { router } from '@server/rpc'
import { createRpcContext } from '@server/rpc/init'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

/**
 * Isomorphic RPC client.
 *
 * - server: a direct in-process caller over the implemented `router` (no HTTP),
 *   with a lazy context resolved per request.
 * - client: an `OpenAPILink` bound to the pure `contract`. Because the browser
 *   branch references only the contract (never the implementation `router`),
 *   the bundler strips `router`/`createRpcContext` from the client bundle — so
 *   no server code (convex/redis/authkit) ships to the browser, while OpenAPI
 *   semantics and end-to-end types are preserved.
 */
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

import { type CacheOptions, cache, resolveTTL } from '@lib/cache'
import type { FunctionReference } from 'convex/server'

import { api, convex } from './server'

type Api = typeof api.funcs
type ModuleName = keyof Api

type ArgsOf<F> = F extends FunctionReference<any, any, infer A, any> ? A : never
type ReturnOf<F> =
	F extends FunctionReference<any, any, any, infer R> ? R : never

type ExtractQueries<M> = {
	[K in keyof M as M[K] extends FunctionReference<'query', any, any, any>
		? K
		: never]: M[K]
}

type ExtractMutations<M> = {
	[K in keyof M as M[K] extends FunctionReference<'mutation', any, any, any>
		? K
		: never]: M[K]
}

type QueryFn<Args, Result> = {
	(args: Args, cacheOptions?: CacheOptions): Promise<Result>
	nocache: (args: Args) => Promise<Result>
}

type QueryProxy<M> = {
	[K in keyof ExtractQueries<M>]: QueryFn<
		ArgsOf<ExtractQueries<M>[K]>,
		ReturnOf<ExtractQueries<M>[K]>
	>
}

type MutationProxy<M> = {
	[K in keyof ExtractMutations<M>]: (
		args: ArgsOf<ExtractMutations<M>[K]>,
	) => Promise<ReturnOf<ExtractMutations<M>[K]>>
}

type ConvexModule<T extends ModuleName> = {
	query: QueryProxy<Api[T]>
	mutation: MutationProxy<Api[T]>
	invalidateCache: () => Promise<void>
}

function createQueryProxy<T extends ModuleName>(
	moduleName: T,
): QueryProxy<Api[T]> {
	const moduleApi = api.funcs[moduleName]

	return new Proxy({} as QueryProxy<Api[T]>, {
		get(_, method: string) {
			const fn = (moduleApi as Record<string, unknown>)[method] as
				| FunctionReference<'query', any, any, any>
				| undefined
			if (!fn) {
				throw new Error(`Query "${method}" not found in module "${moduleName}"`)
			}

			const queryFn = async (args: unknown, cacheOptions?: CacheOptions) => {
				const ttl = resolveTTL(cacheOptions?.ttl)
				const skip = cacheOptions?.skip ?? false

				if (!skip) {
					const cached = await cache.get(moduleName, method, args)
					if (cached !== null) return cached
				}

				const result = await convex.query(fn, args ?? {})

				if (!skip) {
					await cache.set(moduleName, method, args, result, ttl)
				}

				return result
			}

			queryFn.nocache = async (args: unknown) => {
				return await convex.query(fn, args ?? {})
			}

			return queryFn
		},
	})
}

function createMutationProxy<T extends ModuleName>(
	moduleName: T,
): MutationProxy<Api[T]> {
	const moduleApi = api.funcs[moduleName]

	return new Proxy({} as MutationProxy<Api[T]>, {
		get(_, method: string) {
			const fn = (moduleApi as Record<string, unknown>)[method] as
				| FunctionReference<'mutation', any, any, any>
				| undefined
			if (!fn) {
				throw new Error(
					`Mutation "${method}" not found in module "${moduleName}"`,
				)
			}

			return async (args: unknown) => {
				const result = await convex.mutation(fn, args ?? {})
				return result
			}
		},
	})
}

export function cvx<T extends ModuleName>(moduleName: T): ConvexModule<T> {
	return {
		query: createQueryProxy(moduleName),
		mutation: createMutationProxy(moduleName),
		invalidateCache: () => cache.invalidate(moduleName),
	}
}

export const cacheUtils = {
	flush: cache.flush,
	getStats: cache.getStats,
}

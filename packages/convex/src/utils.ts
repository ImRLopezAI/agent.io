import { NoOp } from 'convex-helpers/server/customFunctions'
import {
	type ZCustomCtx,
	zCustomAction,
	zCustomMutation,
	zCustomQuery,
} from 'convex-helpers/server/zod4'
import type {
	DocumentByInfo,
	GenericActionCtx,
	GenericMutationCtx,
	GenericQueryCtx,
	GenericTableInfo,
	IndexNames,
	IndexRange,
	IndexRangeBuilder,
	NamedIndex,
	QueryInitializer,
} from 'convex/server'

import type { DataModel } from './_generated/dataModel'
import {
	action as convexAction,
	mutation as convexMutation,
	query as convexQuery,
} from './_generated/server'
import { authKit } from './auth'

type WithMatching<T extends GenericTableInfo> = QueryInitializer<T> & {
	matching<IndexName extends IndexNames<T>>(
		indexName: IndexName,
		indexRange?: (
			q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>>,
		) => IndexRange,
		shouldMatch?: boolean,
	): WithMatching<T>
	execute<Result = Awaited<ReturnType<QueryInitializer<T>['collect']>>>(
		transform?: (
			data: Awaited<ReturnType<QueryInitializer<T>['collect']>>,
		) => Result | Promise<Result>,
	): Promise<Result>
}

/**
 * This utility function extends a Convex query with a `matching` and `execute` method
 * `matching` conditionally applies index filters based on a boolean flag.
 * `execute` runs the query and collects the results.
 * @param query - The initial Convex query to extend.
 * @returns The extended query with the `matching` method.
 * @example
 * import { includes } from 'path/to/utils'
 *
 * const results = await includes(db.query('cases'))
 *   .matching(
 *     'public_cases',
 *     (q) => q.eq('verification.verifiedAt', undefined),
 *     isPublicOnly
 *   )
 *   .execute((data) => data.map(item => ({ id: item._id, ...item })));
 */
export function includes<T extends GenericTableInfo>(
	query: QueryInitializer<T>,
): WithMatching<T> {
	const attach = (current: QueryInitializer<T>): WithMatching<T> => {
		const matching = <IndexName extends IndexNames<T>>(
			indexName: IndexName,
			indexRange?: (
				q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>>,
			) => IndexRange,
			shouldMatch = true,
		): WithMatching<T> => {
			if (!shouldMatch) {
				return attach(current)
			}

			return attach(
				current.withIndex(indexName, indexRange) as QueryInitializer<T>,
			)
		}

		const execute = async <
			Result = Awaited<ReturnType<QueryInitializer<T>['collect']>>,
		>(
			transform?: (
				data: Awaited<ReturnType<QueryInitializer<T>['collect']>>,
			) => Result | Promise<Result>,
		): Promise<Result> => {
			const data = await current.collect()
			if (!transform) return data as Result

			return transform(data)
		}

		return Object.assign(Object.create(current), {
			matching,
			execute,
		}) as WithMatching<T>
	}

	return attach(query)
}

export const query = zCustomQuery(convexQuery, NoOp)
export const mutation = zCustomMutation(convexMutation, NoOp)

export const authQuery = zCustomQuery(convexQuery, {
	args: {},
	input: async (ctx) => {
		const user = await getAuthUser(ctx)
		return {
			ctx: {
				...ctx,
				...user,
			},
			args: {},
		}
	},
})

export const authMutation = zCustomMutation(convexMutation, {
	args: {},
	input: async (ctx) => {
		const user = await getAuthUser(ctx)
		return {
			ctx: {
				...ctx,
				...user,
			},
			args: {},
		}
	},
})

export const action = zCustomAction(convexAction, NoOp)
export const authAction = zCustomAction(convexAction, {
	args: {},
	input: async (ctx) => {
		const user = await getAuthUser(ctx)
		return {
			ctx: {
				...ctx,
				...user,
			},
			args: {},
		}
	},
})

export type AuthCtx<T extends 'query' | 'mutation' = 'query'> =
	T extends 'query'
		? ZCustomCtx<typeof authQuery>
		: ZCustomCtx<typeof authMutation>

/** Claims from the WorkOS JWT template (Authentication → JWT Template). */
type JwtOrganizationClaims = {
	organizationId: string
	name?: string
	role?: string
	roles?: string[] | string
}

async function getAuthUser(
	ctx:
		| GenericQueryCtx<DataModel>
		| GenericMutationCtx<DataModel>
		| GenericActionCtx<DataModel>,
) {
	const identity = await ctx.auth.getUserIdentity()
	if (!identity) {
		throw new Error(
			'Unauthorized: Convex did not receive a valid WorkOS access token. Ensure ConvexProviderWithAuth is wired and SSR calls setAuth in the root beforeLoad.',
		)
	}

	const user = await authKit.getAuthUser(ctx)

	if (!user) {
		throw new Error(
			`Unauthorized: WorkOS user ${identity.subject} is not synced to Convex. Configure the WorkOS webhook to https://<deployment>.convex.site/workos/webhook and run \`bunx convex run auth:backfillUsers\`.`,
		)
	}

	return {
		user,
		org: getOrgFromJwt(identity),
	}
}

function getOrgFromJwt(
	identity: NonNullable<
		Awaited<ReturnType<GenericQueryCtx<DataModel>['auth']['getUserIdentity']>>
	>,
) {
	const organization = identity.organization as
		| JwtOrganizationClaims
		| undefined
	const organizationId =
		organization?.organizationId ??
		(typeof identity.org_id === 'string' ? identity.org_id : undefined)

	if (!organizationId) {
		throw new Error(
			'Unauthorized: access token is missing organization claims. Sign in with an active organization, confirm the WorkOS JWT template includes organization.organizationId, then sign out and back in so a fresh token is issued.',
		)
	}

	return {
		organizationId,
		name: organization?.name,
		role:
			organization?.role ??
			(typeof identity.role === 'string' ? identity.role : undefined),
		roles: organization?.roles ?? identity.roles,
	}
}

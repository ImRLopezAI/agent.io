import {
	customCtx,
	customMutation,
	NoOp,
} from 'convex-helpers/server/customFunctions'
import {
	type Rules,
	wrapDatabaseReader,
	wrapDatabaseWriter,
} from 'convex-helpers/server/rowLevelSecurity'
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
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import {
	action as convexAction,
	internalMutation as convexInternalMutation,
	internalQuery as convexInternalQuery,
	mutation as convexMutation,
	query as convexQuery,
} from './_generated/server'
import { authKit } from './auth'
import { TENANT_TABLES, type TenantTableName } from './schema'
import { triggers } from './triggers'

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
/** Public mutation builder — triggers-wrapped so cascades/counters always fire. */
export const mutation = zCustomMutation(
	convexMutation,
	customCtx(triggers.wrapDB),
)

// ---------------------------------------------------------------------------
// Internal builders (the crud tier + machine paths receive THESE)
// ---------------------------------------------------------------------------

/** Plain internal query builder for the generated crud tier. */
export const internalQuery = convexInternalQuery
/**
 * Triggers-wrapped internal mutation builder. Every `crud(schema, table,
 * internalQuery, triggeredInternalMutation)` call MUST use this — the helper
 * defaults to the raw builder, which would bypass cascades/denormalization.
 */
export const triggeredInternalMutation = customMutation(
	convexInternalMutation,
	customCtx(triggers.wrapDB),
)

// ---------------------------------------------------------------------------
// Tenant scoping (ADR 0001): RLS-wrapped db — isolation at the db layer
// ---------------------------------------------------------------------------

type Ctx = Record<string, unknown>

/** Per-document tenant rules for every tenant table. */
const tenantRules = (tenant: string): Rules<Ctx, DataModel> =>
	Object.fromEntries(
		TENANT_TABLES.map((table) => [
			table,
			{
				read: async (_ctx: Ctx, doc: { tenant?: string }) =>
					doc.tenant === tenant,
				insert: async (_ctx: Ctx, doc: { tenant?: string }) =>
					doc.tenant === tenant,
				modify: async (_ctx: Ctx, doc: { tenant?: string }) =>
					doc.tenant === tenant,
			},
		]),
	) as Rules<Ctx, DataModel>

/**
 * User-path query: `ctx.tenant` from the JWT org claim; `ctx.db` is
 * RLS-wrapped — reads of another tenant's rows return null/empty.
 */
export const tenantQuery = zCustomQuery(convexQuery, {
	args: {},
	input: async (ctx) => {
		const auth = await getAuthUser(ctx)
		const tenant = auth.org.organizationId
		return {
			ctx: {
				...ctx,
				...auth,
				tenant,
				db: wrapDatabaseReader({}, ctx.db, tenantRules(tenant)),
			},
			args: {},
		}
	},
})

/**
 * User-path mutation: triggers-wrapped THEN RLS-wrapped — every write fires
 * triggers and is tenant-checked per document. Inserts must spread
 * `{ tenant: ctx.tenant }` (RLS rejects mismatches).
 */
export const tenantMutation = zCustomMutation(convexMutation, {
	args: {},
	input: async (ctx) => {
		const auth = await getAuthUser(ctx)
		const tenant = auth.org.organizationId
		const { db: triggeredDb } = triggers.wrapDB(ctx)
		return {
			ctx: {
				...ctx,
				...auth,
				tenant,
				db: wrapDatabaseWriter({}, triggeredDb, tenantRules(tenant)),
			},
			args: {},
		}
	},
})

/**
 * Machine-path factory (ADR 0001): callers never pass `tenant` — they pass
 * the OWNING resource id; the builder loads it and copies its tenant.
 * Integrity convention, not authorization: these are internal functions,
 * reachable only through the authenticated HTTP surface.
 */
export const machineMutation = <Table extends TenantTableName>(
	ownerTable: Table,
) =>
	zCustomMutation(convexInternalMutation, {
		args: { ownerId: v.id(ownerTable) },
		input: async (ctx, { ownerId }) => {
			const { db } = triggers.wrapDB(ctx)
			const owner = await db.get(ownerId)
			if (!owner) {
				throw new Error(
					`machineMutation(${ownerTable}): owner row ${ownerId} not found`,
				)
			}
			const tenant = (owner as { tenant?: string }).tenant
			if (!tenant) {
				throw new Error(
					`machineMutation(${ownerTable}): owner row has no tenant`,
				)
			}
			return { ctx: { ...ctx, db, tenant, owner }, args: {} }
		},
	})

export { assertSameTenant } from './tenancy'

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

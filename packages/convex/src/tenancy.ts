/**
 * Pure tenancy helpers — no AuthKit/module-load side effects, safe to import
 * from tests and non-Convex contexts.
 */

/**
 * Guard for machine mutations receiving multiple resource ids: every loaded
 * row must belong to the derived tenant or nothing is written (ADR 0001).
 */
export const assertSameTenant = (
	tenant: string,
	rows: ({ tenant?: string } | null)[],
) => {
	for (const row of rows) {
		if (!row || row.tenant !== tenant) {
			throw new Error('tenant mismatch across referenced resources')
		}
	}
}

type TenantReadContext = {
	tenant: string
	db: {
		normalizeId<Table extends TenantTableName>(
			table: Table,
			id: string,
		): Id<Table> | null
		get<Table extends TenantTableName>(
			id: Id<Table>,
		): Promise<({ tenant?: string } & Record<string, unknown>) | null>
	}
}

/** Resolve a caller-supplied id without revealing malformed/cross-tenant rows. */
export const resolveTenantId = async <Table extends TenantTableName>(
	ctx: TenantReadContext,
	table: Table,
	rawId: string,
	resourceName: string,
): Promise<Id<Table>> => {
	const id = ctx.db.normalizeId(table, rawId)
	const row = id ? await ctx.db.get(id) : null
	if (!id || !row || row.tenant !== ctx.tenant) {
		throw new Error(`${resourceName} not found`)
	}
	return id
}

export type PermissionContext = {
	role?: string
	roles?: unknown
	permissions?: unknown
}

const stringValues = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: typeof value === 'string'
			? [value]
			: []

export const hasTenantRole = (
	org: PermissionContext,
	acceptedRoles: readonly string[],
) =>
	[...stringValues(org.role), ...stringValues(org.roles)].some((role) =>
		acceptedRoles.includes(role),
	)

export const requirePermission = (
	org: PermissionContext,
	permission: PermissionSlug,
) => {
	if (
		hasTenantRole(org, ['admin', 'owner']) ||
		stringValues(org.permissions).includes(permission)
	) {
		return
	}
	throw new Error(`Forbidden: ${permission} permission required`)
}
import type { PermissionSlug } from '@agent.io/domain/work-os'

import type { Id } from './_generated/dataModel'
import type { TenantTableName } from './schema'

import { convexToZod } from 'convex-helpers/server/zod4'
import { paginationOptsValidator } from 'convex/server'
import { z } from 'zod'

/** ISO timestamp for createdAt/updatedAt (zodTable convention). */
export const now = () => new Date().toISOString()

export const MAX_PUBLIC_PAGE_SIZE = 100

const officialPaginationOpts = convexToZod(paginationOptsValidator)
const publicPageSize = officialPaginationOpts.shape.numItems
	.int()
	.min(1)
	.max(MAX_PUBLIC_PAGE_SIZE)

/** Native Convex pagination. Optional stream-only controls are not public. */
export const nativePaginationOpts = z
	.object({
		cursor: officialPaginationOpts.shape.cursor,
		numItems: publicPageSize,
	})
	.strict()

/** QueryStream pagination; `endCursor` is supplied by convex-helpers/react. */
export const queryStreamPaginationOpts = nativePaginationOpts.extend({
	endCursor: officialPaginationOpts.shape.endCursor,
})

/**
 * Row-stamping helpers — the single place where tenant/createdAt/updatedAt
 * boilerplate lives. Business mutations compose these with their validations
 * instead of repeating the spread in every module.
 *
 * Tier rule: the generated crud internals (api/internals/*) are for ACTIONS and
 * machine callers (which reach them via ctx.runMutation). Convex mutations
 * cannot invoke registered mutations, so public business mutations do their
 * own db writes through the RLS-wrapped ctx.db — via these helpers.
 */
export const stampCreate = <T extends object>(tenant: string, args: T) => ({
	...args,
	tenant,
	createdAt: now(),
})

export const stampUpdate = <T extends object>(patch: T) => ({
	...patch,
	updatedAt: now(),
})

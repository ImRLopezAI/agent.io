/** ISO timestamp for createdAt/updatedAt (zodTable convention). */
export const now = () => new Date().toISOString()

/**
 * Row-stamping helpers — the single place where tenant/createdAt/updatedAt
 * boilerplate lives. Business mutations compose these with their validations
 * instead of repeating the spread in every module.
 *
 * Tier rule: the generated crud internals (api/crud/*) are for ACTIONS and
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

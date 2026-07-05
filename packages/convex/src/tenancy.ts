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

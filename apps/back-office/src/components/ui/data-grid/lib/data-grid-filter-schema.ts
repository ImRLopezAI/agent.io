import { z } from 'zod'

/**
 * Single source of truth for `FilterValue` shapes.
 *
 * The discriminated union below mirrors the operators wired through the
 * data-grid filter editor (`data-grid-filter-menu.tsx`), the runtime
 * filter function (`getFilterFn` in `data-grid-filters.ts`), and the
 * server URL parser / commit-state builder (`server/use-data-filters.ts`,
 * `server/server-filters.ts`).
 *
 * Keep this list aligned with `OP_TO_SHORT` (URL serialization) and the
 * per-variant operator arrays in `data-grid-filters.ts`.
 */

// ---- Operator groupings ----------------------------------------------------

const stringValueOperators = [
	'contains',
	'notContains',
	'equals',
	'notEquals',
	'startsWith',
	'endsWith',
] as const

const comparisonOperators = [
	'lessThan',
	'lessThanOrEqual',
	'greaterThan',
	'greaterThanOrEqual',
] as const

const dateRangeOperators = [
	'before',
	'after',
	'onOrBefore',
	'onOrAfter',
] as const

const selectSingleOperators = ['is', 'isNot'] as const

const selectMultiOperators = ['isAnyOf', 'isNoneOf'] as const

const valuelessOperators = [
	'isEmpty',
	'isNotEmpty',
	'isTrue',
	'isFalse',
] as const

export const ALL_FILTER_OPERATORS = [
	...stringValueOperators,
	...comparisonOperators,
	...dateRangeOperators,
	...selectSingleOperators,
	...selectMultiOperators,
	...valuelessOperators,
	'isBetween',
] as const

export const filterOperatorSchema = z.enum(ALL_FILTER_OPERATORS)

export type FilterOperatorFromSchema = z.infer<typeof filterOperatorSchema>

// ---- Branch schemas --------------------------------------------------------

const scalarValueSchema = z.union([z.string(), z.number()])

// Non-isBetween branches accept an optional `endValue` for forward-compat
// with the editor's working state (when an operator switches from
// isBetween to e.g. equals, the stale endValue may briefly survive in
// state). It is simply ignored downstream.
const optionalScalarEndValue = scalarValueSchema.optional()

const stringValueBranch = z.object({
	operator: z.enum(stringValueOperators),
	value: z.union([z.string(), z.number()]).optional(),
	endValue: optionalScalarEndValue,
})

const comparisonBranch = z.object({
	operator: z.enum(comparisonOperators),
	value: scalarValueSchema.optional(),
	endValue: optionalScalarEndValue,
})

const dateRangeBranch = z.object({
	operator: z.enum(dateRangeOperators),
	value: z.string().optional(),
	endValue: optionalScalarEndValue,
})

const isBetweenBranch = z.object({
	operator: z.literal('isBetween'),
	value: scalarValueSchema.optional(),
	endValue: scalarValueSchema.optional(),
})

const selectSingleBranch = z.object({
	operator: z.enum(selectSingleOperators),
	value: z.union([z.string(), z.number()]).optional(),
	endValue: optionalScalarEndValue,
})

const selectMultiBranch = z.object({
	operator: z.enum(selectMultiOperators),
	value: z.array(z.string()).optional(),
	endValue: optionalScalarEndValue,
})

const valuelessBranch = z.object({
	operator: z.enum(valuelessOperators),
	value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
	endValue: optionalScalarEndValue,
})

// ---- Public schema ---------------------------------------------------------

export const filterValueSchema = z.discriminatedUnion('operator', [
	stringValueBranch,
	comparisonBranch,
	dateRangeBranch,
	isBetweenBranch,
	selectSingleBranch,
	selectMultiBranch,
	valuelessBranch,
])

export type FilterValue = z.infer<typeof filterValueSchema>

/**
 * Validate an unknown payload as a `FilterValue`. Returns the parsed value
 * on success, `null` on failure. In development a `console.warn` is emitted
 * to make malformed filter payloads visible during local work.
 */
export function safeParseFilterValue(input: unknown): FilterValue | null {
	const result = filterValueSchema.safeParse(input)
	if (result.success) {
		return result.data
	}

	if (
		typeof process !== 'undefined' &&
		process.env?.NODE_ENV !== 'production'
	) {
		console.warn(
			'[data-grid] Dropping malformed filter value',
			result.error.issues,
			input,
		)
	}

	return null
}

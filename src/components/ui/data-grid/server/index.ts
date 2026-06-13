/**
 * Server helpers grouped under a single namespace.
 *
 * Re-export the URL serialization / deserialization helpers used by consumers
 * that wire the data-grid to a server-driven backend (filters / sorting /
 * order-by). Importing the namespace narrows the public surface of
 * `@ui/data-grid`:
 *
 * ```ts
 * import { serverFilters } from '@ui/data-grid'
 *
 * const sorting = serverFilters.parseSorting(searchParams.get('sort') ?? '')
 * const filters = serverFilters.parseFilters(searchParams.get('filters') ?? '')
 * ```
 */
export {
	getServerReadyFilters,
	parseFilters,
	serializeFilters,
} from './use-data-filters'
export {
	getServerOrderBy,
	normalizeSorting,
	parseSorting,
	serializeSorting,
} from './use-data-sorting'

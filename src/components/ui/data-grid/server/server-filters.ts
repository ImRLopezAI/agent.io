import { safeParseFilterValue } from '../lib/data-grid-filter-schema'
import type {
	DataGridServerFilterCommitState,
	DataGridServerFilterState,
	DataGridServerFiltersOptions,
	DataGridServerFilterUrlParams,
} from '../types/data-grid'
import {
	getServerReadyFilters,
	parseFilters,
	serializeFilters,
} from './use-data-filters'
import {
	getServerOrderBy,
	normalizeSorting,
	parseSorting,
	serializeSorting,
} from './use-data-sorting'

const DEFAULT_SERVER_FILTER_URL_PARAMS: DataGridServerFilterUrlParams = {
	search: 'q',
	filters: 'filters',
	sorting: 'sort',
}

const DEFAULT_SERVER_FILTER_DEBOUNCE_MS = 250

export interface ResolvedDataGridServerFiltersOptions {
	debounceMs: number
	syncUrl: boolean
	history: 'replace' | 'push'
	params: DataGridServerFilterUrlParams
	defaultOrderBy?: DataGridServerFiltersOptions['defaultOrderBy']
	onChange?: DataGridServerFiltersOptions['onChange']
	onCommit?: DataGridServerFiltersOptions['onCommit']
	historyAdapter?: DataGridServerFiltersOptions['historyAdapter']
}

function isBrowser() {
	return typeof window !== 'undefined'
}

function getUrlSearchParams() {
	if (!isBrowser()) {
		return new URLSearchParams()
	}

	return new URLSearchParams(window.location.search)
}

export function resolveServerFiltersOptions(
	serverFilters: boolean | DataGridServerFiltersOptions | undefined,
): ResolvedDataGridServerFiltersOptions | undefined {
	if (!serverFilters) {
		return undefined
	}

	if (serverFilters === true) {
		return {
			debounceMs: DEFAULT_SERVER_FILTER_DEBOUNCE_MS,
			syncUrl: true,
			history: 'replace',
			params: DEFAULT_SERVER_FILTER_URL_PARAMS,
		}
	}

	if (serverFilters.enabled === false) {
		return undefined
	}

	return {
		debounceMs: serverFilters.debounceMs ?? DEFAULT_SERVER_FILTER_DEBOUNCE_MS,
		syncUrl: serverFilters.syncUrl ?? true,
		history: serverFilters.history ?? 'replace',
		params: {
			...DEFAULT_SERVER_FILTER_URL_PARAMS,
			...serverFilters.params,
		},
		defaultOrderBy: serverFilters.defaultOrderBy,
		onChange: serverFilters.onChange,
		onCommit: serverFilters.onCommit,
		historyAdapter: serverFilters.historyAdapter,
	}
}

type ReadServerFilterStateOptions = {
	params: DataGridServerFilterUrlParams
	fallbackState: DataGridServerFilterState
}

export function readServerFilterStateFromUrl({
	params,
	fallbackState,
}: ReadServerFilterStateOptions): DataGridServerFilterState {
	const searchParams = getUrlSearchParams()

	const hasSearch = searchParams.has(params.search)
	const hasFilters = searchParams.has(params.filters)
	const hasSorting = searchParams.has(params.sorting)

	return {
		globalFilter: hasSearch
			? (searchParams.get(params.search) ?? '')
			: fallbackState.globalFilter,
		columnFilters: hasFilters
			? parseFilters(searchParams.get(params.filters) ?? '')
			: fallbackState.columnFilters,
		sorting: hasSorting
			? parseSorting(searchParams.get(params.sorting) ?? '')
			: fallbackState.sorting,
	}
}

export function buildServerFilterCommitState(
	state: DataGridServerFilterState,
	defaultOrderBy?: DataGridServerFiltersOptions['defaultOrderBy'],
): DataGridServerFilterCommitState {
	const normalizedSorting = normalizeSorting(state.sorting)
	const readyFilters = getServerReadyFilters(state.columnFilters)

	const structuredFilters = readyFilters.flatMap((filter) => {
		const parsed = safeParseFilterValue(filter.value)
		if (!parsed) return []
		return [{ id: filter.id, value: parsed }]
	})

	return {
		...state,
		sorting: normalizedSorting,
		search: state.globalFilter || undefined,
		structuredFilters:
			structuredFilters.length > 0 ? structuredFilters : undefined,
		orderBy: getServerOrderBy(normalizedSorting, defaultOrderBy),
	}
}

export function getServerFilterUrlSignature(state: DataGridServerFilterState) {
	return [
		state.globalFilter,
		serializeFilters(state.columnFilters),
		serializeSorting(state.sorting),
	].join('\u0000')
}

type SyncServerFilterUrlOptions = {
	params: DataGridServerFilterUrlParams
	history: 'replace' | 'push'
	state: DataGridServerFilterState
	/**
	 * Optional URL-update adapter. When supplied, the next URL is delivered
	 * to this callback (typical Next.js: `router.replace`) instead of
	 * mutating `window.history` directly. Without it, the function falls
	 * back to `window.history.replaceState` / `pushState`, which bypasses
	 * the Next.js App Router and leaves `useSearchParams()` stale.
	 */
	historyAdapter?: (url: string) => void
}

export function syncServerFilterUrl({
	params,
	history,
	state,
	historyAdapter,
}: SyncServerFilterUrlOptions) {
	if (!isBrowser()) {
		return
	}

	const url = new URL(window.location.href)
	const nextSearchParams = new URLSearchParams(url.search)

	if (state.globalFilter) {
		nextSearchParams.set(params.search, state.globalFilter)
	} else {
		nextSearchParams.delete(params.search)
	}

	const serializedFilters = serializeFilters(state.columnFilters)
	if (serializedFilters) {
		nextSearchParams.set(params.filters, serializedFilters)
	} else {
		nextSearchParams.delete(params.filters)
	}

	const serializedSorting = serializeSorting(state.sorting)
	if (serializedSorting) {
		nextSearchParams.set(params.sorting, serializedSorting)
	} else {
		nextSearchParams.delete(params.sorting)
	}

	const nextSearch = nextSearchParams.toString()
	const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
	const currentUrl = `${url.pathname}${url.search}${url.hash}`

	if (nextUrl === currentUrl) {
		return
	}

	if (historyAdapter) {
		historyAdapter(nextUrl)
		return
	}

	const historyMethod =
		history === 'push' ? window.history.pushState : window.history.replaceState
	historyMethod.call(window.history, window.history.state, '', nextUrl)
}

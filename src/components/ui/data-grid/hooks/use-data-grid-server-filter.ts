import type {
	ColumnFiltersState,
	SortingState,
	Updater,
} from '@tanstack/react-table'
import * as React from 'react'
import {
	getEffectiveColumnFilters,
	getEffectiveGlobalFilter,
	getEffectiveSorting,
} from '../lib/data-grid-controlled-state'
import {
	buildServerFilterCommitState,
	getServerFilterUrlSignature,
	type ResolvedDataGridServerFiltersOptions,
	readServerFilterStateFromUrl,
	resolveServerFiltersOptions,
	syncServerFilterUrl,
} from '../server/server-filters'
import type {
	DataGridServerFilterCommitState,
	DataGridServerFiltersOptions,
} from '../types/data-grid'
import type { DataGridStore } from './use-data-grid-store'
import { useStore } from './use-data-grid-store'

/**
 * Shape of the props bag the sub-hook reads through the parent's `propsRef`.
 * Only the keys actually consumed here are listed so callers (the parent
 * `useDataGrid` hook) can pass any superset ref through `as` widening.
 */
export interface UseDataGridServerFilterPropsRef {
	onGlobalFilterChange?: (value: string) => void
	onSortingChange?: (sorting: SortingState) => void
	onColumnFiltersChange?: (filters: ColumnFiltersState) => void
}

export interface UseDataGridServerFilterParams {
	store: DataGridStore
	propsRef: React.RefObject<UseDataGridServerFilterPropsRef>
	/**
	 * Raw `serverFilters` prop passed by the consumer. Read directly (not
	 * through `propsRef`) so memo dependencies stay accurate across renders.
	 */
	serverFilters?: boolean | DataGridServerFiltersOptions
	/** Controlled `state.globalFilter` (TanStack option). */
	controlledGlobalFilter?: string
	/** Controlled `state.sorting` (TanStack option). */
	controlledSorting?: SortingState
	/** Controlled `state.columnFilters` (TanStack option). */
	controlledColumnFilters?: ColumnFiltersState
}

export interface UseDataGridServerFilterResult {
	resolvedServerFilters: ResolvedDataGridServerFiltersOptions | undefined
	resolvedSorting: SortingState
	resolvedColumnFilters: ColumnFiltersState
	resolvedGlobalFilter: string
	onSortingChange: (updater: Updater<SortingState>) => void
	onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
	onGlobalFilterChange: (updater: Updater<unknown>) => void
}

/**
 * Encapsulates the dual-mode (client vs server) wiring for the global
 * filter / sorting / column-filters triplet.
 *
 * In **client mode** (no `serverFilters` option):
 * - The store is the source of truth, but the parent may still pass
 *   controlled `state.{globalFilter,sorting,columnFilters}` props which are
 *   mirrored into the store via effect.
 * - Resolved values fall back to controlled props through the
 *   `getEffective*` helpers.
 *
 * In **server mode** (`serverFilters` truthy):
 * - The store is the sole source of truth; controlled-state mirroring is
 *   skipped to keep the URL / commit cycle authoritative.
 * - A `popstate` listener restores filter state on browser navigation.
 * - The hook exposes a debounced commit pipeline that:
 *   1. aborts the previous in-flight `AbortController`,
 *   2. allocates a new controller and increments `generationRef`,
 *   3. invokes `propsRef.current.serverFilters.onCommit(state, ctx)` where
 *      `ctx = { signal, generation }`. Consumers MUST check
 *      `signal.aborted` after each `await` and `generation` before applying
 *      results to discard stale responses.
 *
 * **Next.js consumers** that want URL changes to flow through the App
 * Router (so `useSearchParams()` stays in sync) should pass
 * `historyAdapter: router.replace` (or `router.push`) on the
 * `serverFilters` config. When supplied, the adapter receives the next URL
 * as a string and is invoked instead of `window.history.replaceState`.
 */
export function useDataGridServerFilter({
	store,
	propsRef,
	serverFilters,
	controlledGlobalFilter,
	controlledSorting,
	controlledColumnFilters,
}: UseDataGridServerFilterParams): UseDataGridServerFilterResult {
	const resolvedServerFilters = React.useMemo(
		() => resolveServerFiltersOptions(serverFilters),
		[serverFilters],
	)

	const globalFilter = useStore(store, (state) => state.globalFilter)
	const sorting = useStore(store, (state) => state.sorting)
	const columnFilters = useStore(store, (state) => state.columnFilters)

	const resolvedGlobalFilter = React.useMemo(
		() =>
			resolvedServerFilters
				? globalFilter
				: getEffectiveGlobalFilter(controlledGlobalFilter, globalFilter),
		[resolvedServerFilters, controlledGlobalFilter, globalFilter],
	)
	const resolvedSorting = React.useMemo(
		() =>
			resolvedServerFilters
				? sorting
				: getEffectiveSorting(controlledSorting, sorting),
		[resolvedServerFilters, controlledSorting, sorting],
	)
	const resolvedColumnFilters = React.useMemo(
		() =>
			resolvedServerFilters
				? columnFilters
				: getEffectiveColumnFilters(controlledColumnFilters, columnFilters),
		[resolvedServerFilters, controlledColumnFilters, columnFilters],
	)

	// Mirror controlled props into the store (client mode only). In server
	// mode the store is authoritative.
	React.useEffect(() => {
		if (resolvedServerFilters) return
		if (typeof controlledGlobalFilter !== 'string') return
		store.setState('globalFilter', controlledGlobalFilter)
	}, [resolvedServerFilters, controlledGlobalFilter, store])

	React.useEffect(() => {
		if (resolvedServerFilters) return
		if (controlledSorting === undefined) return
		store.setState('sorting', controlledSorting)
	}, [resolvedServerFilters, controlledSorting, store])

	React.useEffect(() => {
		if (resolvedServerFilters) return
		if (controlledColumnFilters === undefined) return
		store.setState('columnFilters', controlledColumnFilters)
	}, [resolvedServerFilters, controlledColumnFilters, store])

	// Server-mode commit pipeline -------------------------------------------------
	const serverFilterState = React.useMemo(
		() => ({ globalFilter, columnFilters, sorting }),
		[globalFilter, columnFilters, sorting],
	)
	const serverFilterCommitState =
		React.useMemo<DataGridServerFilterCommitState | null>(
			() =>
				resolvedServerFilters
					? buildServerFilterCommitState(
							serverFilterState,
							resolvedServerFilters.defaultOrderBy,
						)
					: null,
			[resolvedServerFilters, serverFilterState],
		)
	const serverFilterSignature = React.useMemo(
		() =>
			resolvedServerFilters
				? getServerFilterUrlSignature(serverFilterState)
				: null,
		[resolvedServerFilters, serverFilterState],
	)

	const hasCommittedServerFiltersRef = React.useRef(false)
	const serverFilterCommitTimerRef = React.useRef<number | null>(null)
	const generationRef = React.useRef(0)
	const abortRef = React.useRef<AbortController | null>(null)

	// Restore filter state on browser back/forward navigation.
	React.useEffect(() => {
		if (!resolvedServerFilters?.syncUrl) return
		const serverFilterParams = resolvedServerFilters.params

		function handlePopState() {
			store.batch(() => {
				const nextState = readServerFilterStateFromUrl({
					params: serverFilterParams,
					fallbackState: {
						globalFilter: '',
						columnFilters: [],
						sorting: [],
					},
				})

				store.setState('globalFilter', nextState.globalFilter)
				store.setState('columnFilters', nextState.columnFilters)
				store.setState('sorting', nextState.sorting)
			})
		}

		window.addEventListener('popstate', handlePopState)
		return () => {
			window.removeEventListener('popstate', handlePopState)
		}
	}, [resolvedServerFilters, store])

	// Synchronous "live" change broadcast — fires on every state change.
	React.useEffect(() => {
		if (!resolvedServerFilters || !serverFilterCommitState) return
		resolvedServerFilters.onChange?.(serverFilterCommitState)
	}, [resolvedServerFilters, serverFilterCommitState, serverFilterSignature])

	// Debounced commit — fires onCommit with race-safe ctx, syncs URL.
	React.useEffect(() => {
		if (!resolvedServerFilters || !serverFilterCommitState) return

		if (serverFilterCommitTimerRef.current !== null) {
			window.clearTimeout(serverFilterCommitTimerRef.current)
			serverFilterCommitTimerRef.current = null
		}

		const commit = () => {
			if (resolvedServerFilters.syncUrl) {
				syncServerFilterUrl({
					params: resolvedServerFilters.params,
					history: resolvedServerFilters.history,
					state: serverFilterState,
					historyAdapter: resolvedServerFilters.historyAdapter,
				})
			}

			abortRef.current?.abort()
			const ctrl = new AbortController()
			abortRef.current = ctrl
			generationRef.current += 1
			const generation = generationRef.current

			resolvedServerFilters.onCommit?.(serverFilterCommitState, {
				signal: ctrl.signal,
				generation,
			})
		}

		if (!hasCommittedServerFiltersRef.current) {
			hasCommittedServerFiltersRef.current = true
			commit()
			return
		}

		serverFilterCommitTimerRef.current = window.setTimeout(
			commit,
			resolvedServerFilters.debounceMs,
		)

		return () => {
			if (serverFilterCommitTimerRef.current !== null) {
				window.clearTimeout(serverFilterCommitTimerRef.current)
				serverFilterCommitTimerRef.current = null
			}
		}
	}, [
		resolvedServerFilters,
		serverFilterCommitState,
		serverFilterSignature,
		serverFilterState,
	])

	// Change handlers — work identically in client and server modes. They
	// write the new value into the store and surface it to the optional
	// consumer callback. Server-mode commit is driven separately by the
	// debounce effect above (which observes the store).
	const onGlobalFilterChange = React.useCallback(
		(updater: Updater<unknown>) => {
			const currentState = store.getState()
			const currentGlobalFilter = currentState.globalFilter
			const nextValue =
				typeof updater === 'function' ? updater(currentGlobalFilter) : updater
			const newGlobalFilter =
				typeof nextValue === 'string'
					? nextValue
					: nextValue == null
						? ''
						: String(nextValue)

			store.setState('globalFilter', newGlobalFilter)
			propsRef.current.onGlobalFilterChange?.(newGlobalFilter)
		},
		[store, propsRef],
	)

	const onSortingChange = React.useCallback(
		(updater: Updater<SortingState>) => {
			const currentState = store.getState()
			const newSorting =
				typeof updater === 'function' ? updater(currentState.sorting) : updater
			store.setState('sorting', newSorting)
			propsRef.current.onSortingChange?.(newSorting)
		},
		[store, propsRef],
	)

	const onColumnFiltersChange = React.useCallback(
		(updater: Updater<ColumnFiltersState>) => {
			const currentState = store.getState()
			const newColumnFilters =
				typeof updater === 'function'
					? updater(currentState.columnFilters)
					: updater
			store.setState('columnFilters', newColumnFilters)
			propsRef.current.onColumnFiltersChange?.(newColumnFilters)
		},
		[store, propsRef],
	)

	return {
		resolvedServerFilters,
		resolvedSorting,
		resolvedColumnFilters,
		resolvedGlobalFilter,
		onSortingChange,
		onColumnFiltersChange,
		onGlobalFilterChange,
	}
}

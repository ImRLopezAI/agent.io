import { act, renderHook } from '@testing-library/react'
import type * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type {
	DataGridServerFilterCommitCtx,
	DataGridServerFilterCommitState,
	DataGridServerFiltersOptions,
} from '../../types/data-grid'
import {
	type UseDataGridServerFilterPropsRef,
	useDataGridServerFilter,
} from '../use-data-grid-server-filter'
import {
	createDataGridStore,
	type DataGridState,
	type DataGridStore,
} from '../use-data-grid-store'

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

function createSyntheticStore(): DataGridStore {
	const initialState: DataGridState = {
		globalFilter: '',
		sorting: [],
		columnFilters: [],
		columnOrder: [],
		rowHeight: 'short',
		rowSelection: {},
		expanded: {},
		selectionState: {
			selectedCells: new Set(),
			selectionRange: null,
			isSelecting: false,
		},
		focusedCell: null,
		editingCell: null,
		cutCells: new Set(),
		contextMenu: { open: false, x: 0, y: 0 },
		searchQuery: '',
		replaceQuery: '',
		searchCaseSensitive: false,
		searchWholeWord: false,
		searchRegex: false,
		searchRegexError: null,
		searchInSelection: false,
		searchMatches: [],
		matchIndex: -1,
		searchOpen: false,
		lastClickedRowIndex: null,
		pasteDialog: { open: false, rowsNeeded: 0, clipboardText: '' },
		liveAnnouncement: '',
	}
	return createDataGridStore(initialState)
}

type CommitCall = {
	state: DataGridServerFilterCommitState
	ctx: DataGridServerFilterCommitCtx
}

type RenderArgs = {
	serverFilters: DataGridServerFiltersOptions
}

function renderServerFilterHook({ serverFilters }: RenderArgs) {
	const store = createSyntheticStore()
	const propsRef: React.RefObject<UseDataGridServerFilterPropsRef> = {
		current: {},
	}
	const hook = renderHook(() =>
		useDataGridServerFilter({
			store,
			propsRef,
			serverFilters,
		}),
	)
	return { store, propsRef, hook }
}

describe('useDataGridServerFilter — race-safe onCommit', () => {
	it('fires onCommit on first commit with non-aborted signal and generation = 1', () => {
		const calls: CommitCall[] = []
		const onCommit = vi.fn(
			(
				state: DataGridServerFilterCommitState,
				ctx: DataGridServerFilterCommitCtx,
			) => {
				calls.push({ state, ctx })
			},
		)

		renderServerFilterHook({
			serverFilters: { enabled: true, syncUrl: false, onCommit },
		})

		expect(onCommit).toHaveBeenCalledTimes(1)
		expect(calls[0]?.ctx.generation).toBe(1)
		expect(calls[0]?.ctx.signal).toBeInstanceOf(AbortSignal)
		expect(calls[0]?.ctx.signal.aborted).toBe(false)
	})

	it('aborts previous signals and increments generation on rapid sequential commits', async () => {
		const calls: CommitCall[] = []
		const onCommit = vi.fn(
			(
				state: DataGridServerFilterCommitState,
				ctx: DataGridServerFilterCommitCtx,
			) => {
				calls.push({ state, ctx })
			},
		)

		const { store } = renderServerFilterHook({
			serverFilters: {
				enabled: true,
				syncUrl: false,
				debounceMs: 5,
				onCommit,
			},
		})

		// First commit fires synchronously at mount.
		expect(calls).toHaveLength(1)
		expect(calls[0]?.ctx.generation).toBe(1)

		// A → B → C: each store mutation triggers a debounced commit. Each
		// new commit should abort the previous controller before allocating
		// a fresh one and bumping generation.
		await act(async () => {
			store.setState('globalFilter', 'A')
			await new Promise((r) => setTimeout(r, 20))
		})

		await act(async () => {
			store.setState('globalFilter', 'B')
			await new Promise((r) => setTimeout(r, 20))
		})

		await act(async () => {
			store.setState('globalFilter', 'C')
			await new Promise((r) => setTimeout(r, 20))
		})

		expect(calls.length).toBeGreaterThanOrEqual(4)

		// Generation strictly increases.
		const generations = calls.map((c) => c.ctx.generation)
		for (let i = 1; i < generations.length; i++) {
			const prev = generations[i - 1] as number
			const curr = generations[i] as number
			expect(curr).toBeGreaterThan(prev)
		}

		// Every signal except the last is aborted by the time the next
		// commit lands.
		for (let i = 0; i < calls.length - 1; i++) {
			expect(calls[i]?.ctx.signal.aborted).toBe(true)
		}
		expect(calls.at(-1)?.ctx.signal.aborted).toBe(false)
	})

	it('routes URL updates through historyAdapter when supplied', () => {
		const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
		const pushStateSpy = vi.spyOn(window.history, 'pushState')
		const historyAdapter = vi.fn()

		const { store } = renderServerFilterHook({
			serverFilters: {
				enabled: true,
				syncUrl: true,
				debounceMs: 0,
				historyAdapter,
				onCommit: () => {},
			},
		})

		// Mutate filter state so the URL signature changes — this guarantees
		// the adapter is invoked (no-op when nextUrl === currentUrl).
		act(() => {
			store.setState('globalFilter', 'hello-world')
		})

		// Wait one tick for the queueMicrotask + the 0ms debounce.
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(historyAdapter).toHaveBeenCalled()
				const lastCall =
					historyAdapter.mock.calls[historyAdapter.mock.calls.length - 1]
				expect(typeof lastCall?.[0]).toBe('string')
				expect(lastCall?.[0]).toContain('hello-world')
				expect(replaceStateSpy).not.toHaveBeenCalled()
				expect(pushStateSpy).not.toHaveBeenCalled()
				resolve()
			}, 20)
		})
	})
})

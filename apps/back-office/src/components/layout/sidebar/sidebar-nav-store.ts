'use client'

import { useSyncExternalStore } from 'react'

import type { NavGroup } from './items'
import type { NavStackFrame } from './nav-utils'
import { findWrappedStackForPathname, getWrappedStackKey } from './nav-utils'

const EMPTY_STACK: NavStackFrame[] = []

type SyncContext = {
	groups: NavGroup[]
	pathname: string
	collapsed: boolean
}

function stacksEqual(a: NavStackFrame[], b: NavStackFrame[]): boolean {
	if (a.length !== b.length) return false
	return a.every((frame, index) => frame.id === b[index]?.id)
}

function createSidebarNavStore() {
	const listeners = new Set<() => void>()
	let syncContext: SyncContext = { groups: [], pathname: '/', collapsed: false }
	let manualStack: NavStackFrame[] | null = null
	let dismissedScopeKey: string | null = null
	let cachedSnapshot: NavStackFrame[] = EMPTY_STACK

	function emit() {
		for (const listener of listeners) {
			listener()
		}
	}

	function getAutoStack(): NavStackFrame[] {
		return findWrappedStackForPathname(syncContext.groups, syncContext.pathname)
	}

	function getScopeKey(): string {
		return getWrappedStackKey(syncContext.groups, syncContext.pathname)
	}

	function computeSnapshot(): NavStackFrame[] {
		const { collapsed } = syncContext

		if (collapsed) return EMPTY_STACK

		const scopeKey = getScopeKey()
		if (dismissedScopeKey && dismissedScopeKey === scopeKey) {
			return manualStack ?? EMPTY_STACK
		}

		if (manualStack !== null) {
			return manualStack
		}

		return getAutoStack()
	}

	function getSnapshot(): NavStackFrame[] {
		const next = computeSnapshot()
		if (!stacksEqual(cachedSnapshot, next)) {
			cachedSnapshot = next.length === 0 ? EMPTY_STACK : next
		}
		return cachedSnapshot
	}

	function getServerSnapshot(): NavStackFrame[] {
		return EMPTY_STACK
	}

	function subscribe(listener: () => void) {
		listeners.add(listener)
		return () => listeners.delete(listener)
	}

	function setSyncContext(context: SyncContext) {
		const pathnameChanged = context.pathname !== syncContext.pathname

		if (context.collapsed) {
			manualStack = null
			dismissedScopeKey = null
		} else if (pathnameChanged) {
			const previousScope = getWrappedStackKey(
				syncContext.groups,
				syncContext.pathname,
			)
			const nextScope = getWrappedStackKey(context.groups, context.pathname)

			if (previousScope !== nextScope) {
				manualStack = null
				dismissedScopeKey = null
			}
		}

		syncContext = context
	}

	function push(frame: NavStackFrame) {
		if (syncContext.collapsed) return

		const current = computeSnapshot()
		dismissedScopeKey = null
		manualStack = [...current, frame]
		emit()
	}

	function pop() {
		if (syncContext.collapsed) return

		const current = computeSnapshot()

		if (current.length > 0) {
			manualStack = current.slice(0, -1)
			if (manualStack.length === 0) {
				dismissedScopeKey = getScopeKey()
			}
		} else {
			manualStack = EMPTY_STACK
			dismissedScopeKey = getScopeKey()
		}

		emit()
	}

	function reset() {
		manualStack = null
		dismissedScopeKey = null
		emit()
	}

	return {
		subscribe,
		getSnapshot,
		getServerSnapshot,
		setSyncContext,
		push,
		pop,
		reset,
	}
}

export const sidebarNavStore = createSidebarNavStore()

export function useSidebarNavStack(
	groups: NavGroup[],
	pathname: string,
	collapsed: boolean,
) {
	sidebarNavStore.setSyncContext({ groups, pathname, collapsed })

	return useSyncExternalStore(
		sidebarNavStore.subscribe,
		sidebarNavStore.getSnapshot,
		sidebarNavStore.getServerSnapshot,
	)
}

export function useSidebarNavActions() {
	return {
		push: sidebarNavStore.push,
		pop: sidebarNavStore.pop,
		reset: sidebarNavStore.reset,
	}
}

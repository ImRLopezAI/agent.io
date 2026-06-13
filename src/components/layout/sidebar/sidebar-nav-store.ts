'use client'

import { useSyncExternalStore } from 'react'
import type { NavGroup } from './items'
import type { NavStackFrame } from './nav-utils'
import { findWrappedStackForPathname } from './nav-utils'

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
	let manualPathname: string | null = null
	let cachedSnapshot: NavStackFrame[] = EMPTY_STACK

	function emit() {
		for (const listener of listeners) {
			listener()
		}
	}

	function computeSnapshot(): NavStackFrame[] {
		const { groups, pathname, collapsed } = syncContext

		if (collapsed) return EMPTY_STACK

		if (manualStack !== null && manualPathname === pathname) {
			return manualStack
		}

		return findWrappedStackForPathname(groups, pathname)
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
		if (context.pathname !== syncContext.pathname || context.collapsed) {
			manualStack = null
			manualPathname = null
		}
		syncContext = context
	}

	function push(frame: NavStackFrame) {
		if (syncContext.collapsed) return

		const current = computeSnapshot()
		manualStack = [...current, frame]
		manualPathname = syncContext.pathname
		emit()
	}

	function pop() {
		if (syncContext.collapsed) return

		const current = computeSnapshot()
		if (current.length === 0) return

		manualStack = current.slice(0, -1)
		manualPathname = syncContext.pathname
		emit()
	}

	function reset() {
		manualStack = null
		manualPathname = null
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

import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1200

function createMediaQueryStore(maxWidth: number) {
	const query = `(max-width: ${maxWidth - 1}px)`

	return {
		getServerSnapshot: () => false,
		getSnapshot: () => {
			if (typeof window === 'undefined') return false
			return window.matchMedia(query).matches
		},
		subscribe: (callback: () => void) => {
			if (typeof window === 'undefined') return () => {}

			const mql = window.matchMedia(query)
			mql.addEventListener('change', callback)
			return () => mql.removeEventListener('change', callback)
		},
	}
}

const mobileStore = createMediaQueryStore(MOBILE_BREAKPOINT)
const tabletStore = createMediaQueryStore(TABLET_BREAKPOINT)

export function useIsMobile() {
	return React.useSyncExternalStore(
		mobileStore.subscribe,
		mobileStore.getSnapshot,
		mobileStore.getServerSnapshot,
	)
}

export function useIsTablet() {
	return React.useSyncExternalStore(
		tabletStore.subscribe,
		tabletStore.getSnapshot,
		tabletStore.getServerSnapshot,
	)
}

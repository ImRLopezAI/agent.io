import '@testing-library/jest-dom/vitest'

import { ResizeObserver as ResizeObserverPolyfill } from '@juggle/resize-observer'
import { compute as computeScrollIntoView } from 'compute-scroll-into-view'

// Node-environment tests (e.g. live gateway) load this file too — skip DOM APIs there.
if (typeof Element !== 'undefined') {
	if (typeof globalThis.ResizeObserver === 'undefined') {
		globalThis.ResizeObserver =
			ResizeObserverPolyfill as unknown as typeof ResizeObserver
	}

	if (typeof Element.prototype.scrollIntoView !== 'function') {
		Element.prototype.scrollIntoView = function scrollIntoView(
			this: Element,
			arg?: boolean | ScrollIntoViewOptions,
		) {
			const options =
				typeof arg === 'object'
					? arg
					: { block: arg ? 'start' : 'end' } satisfies ScrollIntoViewOptions

			for (const { el, top, left } of computeScrollIntoView(this, {
				block: 'nearest',
				inline: 'nearest',
				scrollMode: 'if-needed',
				...options,
			})) {
				el.scrollTop = top
				el.scrollLeft = left
			}
		}
	}
}

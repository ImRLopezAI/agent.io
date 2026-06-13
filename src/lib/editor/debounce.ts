export type DebouncedFn<TArgs extends unknown[]> = ((
	...args: TArgs
) => void) & {
	cancel: () => void
	flush: () => void
}

export function debounce<TArgs extends unknown[]>(
	fn: (...args: TArgs) => void,
	waitMs: number,
): DebouncedFn<TArgs> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null
	let lastArgs: TArgs | null = null

	const run = () => {
		if (lastArgs) {
			const args = lastArgs
			lastArgs = null
			fn(...args)
		}
	}

	const debounced = ((...args: TArgs) => {
		lastArgs = args
		if (timeoutId !== null) clearTimeout(timeoutId)
		timeoutId = setTimeout(() => {
			timeoutId = null
			run()
		}, waitMs)
	}) as DebouncedFn<TArgs>

	debounced.cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
		lastArgs = null
	}

	debounced.flush = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
		run()
	}

	return debounced
}

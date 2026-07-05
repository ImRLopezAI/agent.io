import type { SortingState } from '@tanstack/react-table'

type OrderByInput = {
	field: string
	direction: 'asc' | 'desc'
}

function encodeSortToken(value: string) {
	return encodeURIComponent(value).replaceAll('.', '%2E')
}

function decodeSortToken(value: string) {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

export function normalizeSorting(sorting: SortingState): SortingState {
	const [firstSort] = sorting

	return firstSort ? [firstSort] : []
}

export function parseSorting(raw: string): SortingState {
	if (!raw) return []

	const sorts: SortingState = []

	for (const segment of raw.split('~')) {
		const lastDotIndex = segment.lastIndexOf('.')
		if (lastDotIndex <= 0) continue

		const id = decodeSortToken(segment.slice(0, lastDotIndex))
		const direction = segment.slice(lastDotIndex + 1)

		if (!id || (direction !== 'asc' && direction !== 'desc')) {
			continue
		}

		sorts.push({ id, desc: direction === 'desc' })
	}

	return normalizeSorting(sorts)
}

export function serializeSorting(sorting: SortingState): string {
	const normalizedSorting = normalizeSorting(sorting)

	if (normalizedSorting.length === 0) return ''

	return normalizedSorting
		.map((sort) => `${encodeSortToken(sort.id)}.${sort.desc ? 'desc' : 'asc'}`)
		.join('~')
}

export function getServerOrderBy(
	sorting: SortingState,
	fallbackOrderBy?: OrderByInput,
) {
	const [firstSort] = normalizeSorting(sorting)

	if (!firstSort) {
		return fallbackOrderBy
	}

	return {
		field: firstSort.id,
		direction: firstSort.desc ? 'desc' : 'asc',
	} satisfies OrderByInput
}

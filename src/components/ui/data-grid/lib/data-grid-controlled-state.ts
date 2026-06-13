import type { ColumnFiltersState, SortingState } from '@tanstack/react-table'

export function getInitialSorting(
	controlledSorting: SortingState | undefined,
	initialSorting: SortingState | undefined,
) {
	return controlledSorting ?? initialSorting ?? []
}

export function getEffectiveSorting(
	controlledSorting: SortingState | undefined,
	internalSorting: SortingState,
) {
	return controlledSorting ?? internalSorting
}

export function getInitialGlobalFilter(
	controlledGlobalFilter: string | undefined,
	initialGlobalFilter: string | undefined,
) {
	return controlledGlobalFilter ?? initialGlobalFilter ?? ''
}

export function getEffectiveGlobalFilter(
	controlledGlobalFilter: string | undefined,
	internalGlobalFilter: string,
) {
	return controlledGlobalFilter ?? internalGlobalFilter
}

export function getInitialColumnFilters(
	controlledColumnFilters: ColumnFiltersState | undefined,
	initialColumnFilters: ColumnFiltersState | undefined,
) {
	return controlledColumnFilters ?? initialColumnFilters ?? []
}

export function getEffectiveColumnFilters(
	controlledColumnFilters: ColumnFiltersState | undefined,
	internalColumnFilters: ColumnFiltersState,
) {
	return controlledColumnFilters ?? internalColumnFilters
}

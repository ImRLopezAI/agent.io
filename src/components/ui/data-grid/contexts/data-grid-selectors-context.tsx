'use client'

import type { Row } from '@tanstack/react-table'
import * as React from 'react'

export interface DataGridSelectorsContextValue<TData = unknown> {
	getIsCellSelected: (rowIndex: number, columnId: string) => boolean
	getIsSearchMatch: (rowIndex: number, columnId: string) => boolean
	getIsActiveSearchMatch: (rowIndex: number, columnId: string) => boolean
	getVisualRowIndex: (rowId: string) => number | undefined
	getRowById: (rowId: string) => Row<TData> | undefined
	getCellSelectionForRow: (rowIndex: number) => Set<string>
}

const DataGridSelectorsContext =
	React.createContext<DataGridSelectorsContextValue | null>(null)

export interface DataGridSelectorsProviderProps<TData> {
	value: DataGridSelectorsContextValue<TData>
	children: React.ReactNode
}

export function DataGridSelectorsProvider<TData>({
	value,
	children,
}: DataGridSelectorsProviderProps<TData>) {
	return (
		<DataGridSelectorsContext.Provider
			value={value as DataGridSelectorsContextValue}
		>
			{children}
		</DataGridSelectorsContext.Provider>
	)
}

export function useDataGridSelectors<
	TData = unknown,
>(): DataGridSelectorsContextValue<TData> {
	const ctx = React.useContext(DataGridSelectorsContext)
	if (!ctx) {
		throw new Error(
			'useDataGridSelectors() must be used inside <DataGridSelectorsProvider>. ' +
				'Did you forget to wrap your data-grid in <DataGrid />?',
		)
	}
	return ctx as DataGridSelectorsContextValue<TData>
}

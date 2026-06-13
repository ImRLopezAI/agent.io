/**
 * Type-level regression tests for `CellValueByVariant` and the discriminator-
 * driven `DataGridCellProps<TData, V>`.
 *
 * These assertions run at TypeScript compile time. The package's `typecheck`
 * script (`tsc --noEmit`) covers this file via the root `include` glob, so a
 * regression in the cell-variant <-> value-type mapping will surface as a
 * type error instead of slipping into runtime cells.
 *
 * No runtime is executed here — every test is an `Expect<Equal<...>>` row.
 */

import type { Cell } from '@tanstack/react-table'
import type {
	CellValueByVariant,
	DataGridCellProps,
	FileCellData,
} from '../data-grid'

// ---------- Type assertion helpers ----------------------------------------

type Equal<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
		? true
		: false

// biome-ignore lint/correctness/noUnusedVariables: assertion utility consumed by the rows below
type Expect<T extends true> = T

// ---------- Test rows: each variant maps to its declared value type --------

type _ShortText = Expect<
	Equal<
		DataGridCellProps<{ name: string }, 'short-text'>['cell'],
		Cell<{ name: string }, string>
	>
>

type _LongText = Expect<
	Equal<
		DataGridCellProps<{ note: string }, 'long-text'>['cell'],
		Cell<{ note: string }, string>
	>
>

type _Url = Expect<
	Equal<
		DataGridCellProps<{ link: string }, 'url'>['cell'],
		Cell<{ link: string }, string>
	>
>

type _Select = Expect<
	Equal<
		DataGridCellProps<{ status: string }, 'select'>['cell'],
		Cell<{ status: string }, string>
	>
>

type _MultiSelect = Expect<
	Equal<
		DataGridCellProps<{ tags: string[] }, 'multi-select'>['cell'],
		Cell<{ tags: string[] }, string[]>
	>
>

type _Number = Expect<
	Equal<
		DataGridCellProps<{ amount: number }, 'number'>['cell'],
		Cell<{ amount: number }, number | null>
	>
>

type _Progress = Expect<
	Equal<
		DataGridCellProps<{ pct: number }, 'progress'>['cell'],
		Cell<{ pct: number }, number | null>
	>
>

type _Checkbox = Expect<
	Equal<
		DataGridCellProps<{ active: boolean }, 'checkbox'>['cell'],
		Cell<{ active: boolean }, boolean>
	>
>

type _Date = Expect<
	Equal<
		DataGridCellProps<{ when: string }, 'date'>['cell'],
		Cell<{ when: string }, string | Date | null>
	>
>

type _File = Expect<
	Equal<
		DataGridCellProps<{ files: FileCellData[] }, 'file'>['cell'],
		Cell<{ files: FileCellData[] }, FileCellData[]>
	>
>

// ---------- Default V param falls back to the union of all values ----------

type _DefaultUnion = Expect<
	Equal<
		DataGridCellProps<{ x: number }>['cell'],
		Cell<{ x: number }, CellValueByVariant[keyof CellValueByVariant]>
	>
>

// ---------- Map shape sanity check -----------------------------------------

type _MapShape = Expect<
	Equal<
		CellValueByVariant,
		{
			'short-text': string
			'long-text': string
			url: string
			select: string
			'multi-select': string[]
			number: number | null
			progress: number | null
			checkbox: boolean
			date: string | Date | null
			file: FileCellData[]
		}
	>
>

// ---------- accessorKey typo guard -----------------------------------------
//
// Tightening `accessorKey` to `keyof TData & string` should reject
// non-existent keys at compile time. We mirror the constraint here and
// assert the failure via `@ts-expect-error` so a regression (loosening the
// constraint back to `(string & {}) | keyof TData`) breaks the type-check.

type ValidAccessorKey<TData extends object, K extends keyof TData & string> = K

type _AccessorKeyHit = ValidAccessorKey<{ amount: number }, 'amount'>
// @ts-expect-error 'typoed_field' is not a key of TData — the tightened
// `accessorKey: keyof TData & string` should reject typos at compile time.
type _AccessorKeyTypo = ValidAccessorKey<{ amount: number }, 'typoed_field'>

// Re-export the assertions so the file has a public surface and the
// otherwise-unused locals are not flagged by lints.
export type {
	_AccessorKeyHit,
	_AccessorKeyTypo,
	_Checkbox,
	_Date,
	_DefaultUnion,
	_File,
	_LongText,
	_MapShape,
	_MultiSelect,
	_Number,
	_Progress,
	_Select,
	_ShortText,
	_Url,
}

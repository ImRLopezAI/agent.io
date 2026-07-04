import type {
	Cell,
	ColumnFiltersState,
	SortingState,
} from '@tanstack/react-table'

import type { DataGridPreviewRenderer } from '../data-grid-preview'
import type { FilterValue } from '../lib/data-grid-filter-schema'
import type { TableVariant } from '../lib/data-grid-variants'

export type { FilterValue, TableVariant }

type Formatters = typeof import('@ui/data-grid/lib/data-grid-utils').formatters

export type Direction = 'ltr' | 'rtl'

export type RowHeightValue = 'short' | 'medium' | 'tall' | 'extra-tall'

export interface CellSelectOption {
	label: string
	value: string
	icon?: React.FC<React.SVGProps<SVGSVGElement>>
	count?: number
}

export type CellOpts =
	| {
			variant: 'short-text'
	  }
	| {
			variant: 'long-text'
	  }
	| {
			variant: 'number'
			min?: number
			max?: number
			step?: number
	  }
	| {
			variant: 'select'
			options: CellSelectOption[]
	  }
	| {
			variant: 'multi-select'
			options: CellSelectOption[]
	  }
	| {
			variant: 'checkbox'
	  }
	| {
			variant: 'date'
	  }
	| {
			variant: 'url'
	  }
	| {
			variant: 'file'
			maxFileSize?: number
			maxFiles?: number
			accept?: string
			multiple?: boolean
	  }
	| {
			variant: 'progress'
			max?: number
			getVariant?: (value: number) => string
	  }

/**
 * Map from `cellVariant` discriminator to the value type produced by
 * `cell.getValue()` for that variant. Used to give each cell renderer a
 * typed `cell` prop without `as` casts.
 */
export type CellValueByVariant = {
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

export interface CellUpdate {
	rowIndex: number
	columnId: string
	value: unknown
}

export interface CellPosition {
	rowIndex: number
	columnId: string
}

export interface CellRange {
	start: CellPosition
	end: CellPosition
}

export interface SelectionState {
	selectedCells: Set<string>
	selectionRange: CellRange | null
	isSelecting: boolean
}

export interface ContextMenuState {
	open: boolean
	x: number
	y: number
}

export interface PasteDialogState {
	open: boolean
	rowsNeeded: number
	clipboardText: string
}

export interface InfiniteScrollOptions {
	loadMore: () => void | Promise<void>
	hasMore?: boolean
	isLoading?: boolean
	threshold?: number
}

export interface DataGridServerOrderBy {
	field: string
	direction: 'asc' | 'desc'
}

export interface DataGridServerFilterUrlParams {
	search: string
	filters: string
	sorting: string
}

export interface DataGridServerFilterState {
	globalFilter: string
	columnFilters: ColumnFiltersState
	sorting: SortingState
}

export type NavigationDirection =
	| 'up'
	| 'down'
	| 'left'
	| 'right'
	| 'home'
	| 'end'
	| 'ctrl+up'
	| 'ctrl+down'
	| 'ctrl+home'
	| 'ctrl+end'
	| 'pageup'
	| 'pagedown'
	| 'pageleft'
	| 'pageright'

declare module '@tanstack/react-table' {
	// biome-ignore lint/correctness/noUnusedVariables: TData and TValue are used in the ColumnMeta interface
	interface ColumnMeta<TData, TValue> {
		label?: string
		cell?: CellOpts
		customCell?: boolean
		formatter?: (row: TData, formatters: Formatters) => React.ReactNode
		expandedContent?: (row: TData) => React.ReactNode
		handleEdit?: (row: TData) => void
		preview?: DataGridPreviewRenderer<TData>
	}

	// biome-ignore lint/correctness/noUnusedVariables: TData is used in the TableMeta interface
	interface TableMeta<TData> {
		/**
		 * Snapshot of the current cell selection state. Read by compound
		 * primitives that need to react to multi-cell selection without
		 * subscribing to the data-grid context directly.
		 */
		selectionState?: SelectionState
		/**
		 * External-store style snapshot of `selectionState` for `useSyncExternalStore`.
		 */
		selectionStateStore?: {
			subscribe: (listener: () => void) => () => void
			getSnapshot: () => SelectionState
		}
		/**
		 * Current row-height token. Surfaced for menu primitives such as
		 * `data-grid-row-height-menu` that read & write through TanStack.
		 */
		rowHeight?: RowHeightValue
		onRowHeightChange?: (value: RowHeightValue) => void
		/**
		 * Invoked by `data-grid-column-header` when the user clicks the
		 * column header chrome (selecting the whole column).
		 */
		onColumnClick?: (columnId: string) => void
		/**
		 * Clears the current cell/row selection. Used by compound primitives
		 * (e.g. row-action popovers) that need to drop the grid selection
		 * before performing their own action.
		 */
		onSelectionClear?: () => void
	}
}

export interface SearchState {
	searchMatches: CellPosition[]
	matchIndex: number
	searchOpen: boolean
	onSearchOpenChange: (open: boolean) => void
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	onSearch: (query: string) => void
	replaceQuery: string
	onReplaceQueryChange: (query: string) => void
	onReplaceNext: () => void
	onReplaceAll: () => void
	replaceEnabled: boolean
	searchCaseSensitive: boolean
	searchWholeWord: boolean
	searchRegex: boolean
	searchRegexError: string | null
	searchInSelection: boolean
	onSearchCaseSensitiveChange: (enabled: boolean) => void
	onSearchWholeWordChange: (enabled: boolean) => void
	onSearchRegexChange: (enabled: boolean) => void
	onSearchInSelectionChange: (enabled: boolean) => void
	onNavigateToNextMatch: () => void
	onNavigateToPrevMatch: () => void
}

export interface DataGridCellProps<
	TData,
	V extends keyof CellValueByVariant = keyof CellValueByVariant,
> {
	cell: Cell<TData, CellValueByVariant[V]>
	rowIndex: number
	columnId: string
	rowHeight: RowHeightValue
	isEditing: boolean
	isFocused: boolean
	isSelected: boolean
	isSearchMatch: boolean
	isActiveSearchMatch: boolean
	readOnly: boolean
	tableVariant?: TableVariant
}

export interface FileCellData {
	id: string
	name: string
	size: number
	type: string
	url?: string
}

export type TextFilterOperator =
	| 'contains'
	| 'notContains'
	| 'equals'
	| 'notEquals'
	| 'startsWith'
	| 'endsWith'
	| 'isEmpty'
	| 'isNotEmpty'

export type NumberFilterOperator =
	| 'equals'
	| 'notEquals'
	| 'lessThan'
	| 'lessThanOrEqual'
	| 'greaterThan'
	| 'greaterThanOrEqual'
	| 'isBetween'
	| 'isEmpty'
	| 'isNotEmpty'

export type DateFilterOperator =
	| 'equals'
	| 'notEquals'
	| 'before'
	| 'after'
	| 'onOrBefore'
	| 'onOrAfter'
	| 'isBetween'
	| 'isEmpty'
	| 'isNotEmpty'

export type SelectFilterOperator =
	| 'is'
	| 'isNot'
	| 'isAnyOf'
	| 'isNoneOf'
	| 'isEmpty'
	| 'isNotEmpty'

export type BooleanFilterOperator = 'isTrue' | 'isFalse'

export type FilterOperator =
	| TextFilterOperator
	| NumberFilterOperator
	| DateFilterOperator
	| SelectFilterOperator
	| BooleanFilterOperator

export interface DataGridServerStructuredFilter {
	id: string
	value: FilterValue
}

export interface DataGridServerFilterCommitState
	extends DataGridServerFilterState {
	search?: string
	structuredFilters?: DataGridServerStructuredFilter[]
	orderBy?: DataGridServerOrderBy
}

/**
 * Context passed to `serverFilters.onCommit` so consumers can discard
 * stale responses safely.
 *
 * - `signal`: aborted by the data-grid before the next commit fires.
 *   Async consumers should `if (signal.aborted) return` after each
 *   `await`.
 * - `generation`: monotonic counter (1-based, increments on every commit).
 *   Consumers should compare against the latest generation they have seen
 *   before applying results.
 */
export interface DataGridServerFilterCommitCtx {
	signal: AbortSignal
	generation: number
}

export interface DataGridServerFiltersOptions {
	enabled?: boolean
	debounceMs?: number
	syncUrl?: boolean
	history?: 'replace' | 'push'
	params?: Partial<DataGridServerFilterUrlParams>
	defaultOrderBy?: DataGridServerOrderBy
	onChange?: (state: DataGridServerFilterCommitState) => void
	/**
	 * Fired after the debounce window with the latest commit state. The
	 * `ctx` arg is additive — callbacks that take only the first argument
	 * remain compatible.
	 */
	onCommit?: (
		state: DataGridServerFilterCommitState,
		ctx: DataGridServerFilterCommitCtx,
	) => void | Promise<void>
	/**
	 * Optional URL-update adapter. When supplied, the data-grid invokes
	 * this with the next URL string instead of calling
	 * `window.history.replaceState` / `pushState` directly.
	 *
	 * Next.js consumers should pass `router.replace` (or `router.push`)
	 * here so `useSearchParams()` stays in sync — `window.history.*`
	 * mutations bypass the App Router and leave its hooks stale.
	 */
	historyAdapter?: (url: string) => void
}

export interface ColumnFilter<T> {
	columnId: string
	label: string
	value?: string | number | string[] | Date | null
	operator?: FilterOperator
	dataType?: string
	options?: T[]
	color?: string
	icon?: React.ReactNode
}

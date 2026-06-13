// Lightweight typed catalog of every keyboard shortcut the data grid will own
// once `onDataGridKeyDown` and the global keydown listener migrate to the
// `@tanstack/react-hotkeys` registry. The hook (`use-data-grid-keyboard.ts`)
// will iterate this list to register handlers; the help dialog reads live
// registrations from `useHotkeyRegistrations()` instead of a static array.

type GridShortcutGroup =
	| 'Navigation'
	| 'Selection'
	| 'Editing'
	| 'Clipboard'
	| 'Search'
	| 'History'
	| 'Misc'

type GridShortcutId =
	| 'navigateUp'
	| 'navigateDown'
	| 'navigateLeft'
	| 'navigateRight'
	| 'navigateHome'
	| 'navigateEnd'
	| 'navigatePageUp'
	| 'navigatePageDown'
	| 'navigateRowStart'
	| 'navigateRowEnd'
	| 'navigateColumnStart'
	| 'navigateColumnEnd'
	| 'extendUp'
	| 'extendDown'
	| 'extendLeft'
	| 'extendRight'
	| 'extendBlockUp'
	| 'extendBlockDown'
	| 'extendBlockLeft'
	| 'extendBlockRight'
	| 'selectAll'
	| 'editStartF2'
	| 'editStartEnter'
	| 'editCancel'
	| 'clipboardCopy'
	| 'clipboardCut'
	| 'clipboardPaste'
	| 'historyUndo'
	| 'historyRedo'
	| 'searchOpen'
	| 'searchOpenReplace'
	| 'searchNext'
	| 'searchPrevious'
	| 'addRow'
	| 'deleteSelected'

interface GridShortcutDef {
	id: GridShortcutId
	hotkey: string
	group: GridShortcutGroup
	description: string
	/**
	 * Optional predicate evaluated by the keyboard hook to decide whether this
	 * registration should currently be enabled (e.g. only when not editing).
	 */
	when?: string
	/**
	 * Whether to suppress the hotkey when focus is inside an input,
	 * textarea, or contenteditable. Defaults to `true` for grid hotkeys.
	 */
	ignoreInputs?: boolean
}

const GRID_SHORTCUTS: ReadonlyArray<GridShortcutDef> = [
	// Navigation
	{
		id: 'navigateUp',
		hotkey: 'ArrowUp',
		group: 'Navigation',
		description: 'Move focus up',
	},
	{
		id: 'navigateDown',
		hotkey: 'ArrowDown',
		group: 'Navigation',
		description: 'Move focus down',
	},
	{
		id: 'navigateLeft',
		hotkey: 'ArrowLeft',
		group: 'Navigation',
		description: 'Move focus left',
	},
	{
		id: 'navigateRight',
		hotkey: 'ArrowRight',
		group: 'Navigation',
		description: 'Move focus right',
	},
	{
		id: 'navigateHome',
		hotkey: 'Home',
		group: 'Navigation',
		description: 'Move to the first column in the row',
	},
	{
		id: 'navigateEnd',
		hotkey: 'End',
		group: 'Navigation',
		description: 'Move to the last column in the row',
	},
	{
		id: 'navigatePageUp',
		hotkey: 'PageUp',
		group: 'Navigation',
		description: 'Move up one page',
	},
	{
		id: 'navigatePageDown',
		hotkey: 'PageDown',
		group: 'Navigation',
		description: 'Move down one page',
	},
	{
		id: 'navigateColumnStart',
		hotkey: 'Mod+ArrowUp',
		group: 'Navigation',
		description: 'Move to the first row (same column)',
	},
	{
		id: 'navigateColumnEnd',
		hotkey: 'Mod+ArrowDown',
		group: 'Navigation',
		description: 'Move to the last row (same column)',
	},
	{
		id: 'navigateRowStart',
		hotkey: 'Mod+ArrowLeft',
		group: 'Navigation',
		description: 'Move to the first column (same row)',
	},
	{
		id: 'navigateRowEnd',
		hotkey: 'Mod+ArrowRight',
		group: 'Navigation',
		description: 'Move to the last column (same row)',
	},

	// Selection
	{
		id: 'extendUp',
		hotkey: 'Shift+ArrowUp',
		group: 'Selection',
		description: 'Extend selection up',
	},
	{
		id: 'extendDown',
		hotkey: 'Shift+ArrowDown',
		group: 'Selection',
		description: 'Extend selection down',
	},
	{
		id: 'extendLeft',
		hotkey: 'Shift+ArrowLeft',
		group: 'Selection',
		description: 'Extend selection left',
	},
	{
		id: 'extendRight',
		hotkey: 'Shift+ArrowRight',
		group: 'Selection',
		description: 'Extend selection right',
	},
	{
		id: 'extendBlockUp',
		hotkey: 'Mod+Shift+ArrowUp',
		group: 'Selection',
		description: 'Select to top of table',
	},
	{
		id: 'extendBlockDown',
		hotkey: 'Mod+Shift+ArrowDown',
		group: 'Selection',
		description: 'Select to bottom of table',
	},
	{
		id: 'extendBlockLeft',
		hotkey: 'Mod+Shift+ArrowLeft',
		group: 'Selection',
		description: 'Select to first column',
	},
	{
		id: 'extendBlockRight',
		hotkey: 'Mod+Shift+ArrowRight',
		group: 'Selection',
		description: 'Select to last column',
	},
	{
		id: 'selectAll',
		hotkey: 'Mod+A',
		group: 'Selection',
		description: 'Select all cells',
	},

	// Editing
	{
		id: 'editStartF2',
		hotkey: 'F2',
		group: 'Editing',
		description: 'Start editing the focused cell',
	},
	{
		id: 'editStartEnter',
		hotkey: 'Enter',
		group: 'Editing',
		description: 'Start editing the focused cell',
	},
	{
		id: 'editCancel',
		hotkey: 'Escape',
		group: 'Editing',
		description: 'Cancel editing or clear selection',
	},

	// Clipboard
	{
		id: 'clipboardCopy',
		hotkey: 'Mod+C',
		group: 'Clipboard',
		description: 'Copy selected cells',
	},
	{
		id: 'clipboardCut',
		hotkey: 'Mod+X',
		group: 'Clipboard',
		description: 'Cut selected cells',
	},
	{
		id: 'clipboardPaste',
		hotkey: 'Mod+V',
		group: 'Clipboard',
		description: 'Paste cells',
	},

	// History
	{
		id: 'historyUndo',
		hotkey: 'Mod+Z',
		group: 'History',
		description: 'Undo last action',
	},
	{
		id: 'historyRedo',
		hotkey: 'Mod+Shift+Z',
		group: 'History',
		description: 'Redo last undone action',
	},

	// Search
	{
		id: 'searchOpen',
		hotkey: 'Mod+F',
		group: 'Search',
		description: 'Open search',
	},
	{
		id: 'searchOpenReplace',
		hotkey: 'Mod+Shift+F',
		group: 'Search',
		description: 'Open search and replace',
	},
	{
		id: 'searchNext',
		hotkey: 'F3',
		group: 'Search',
		description: 'Jump to next match',
	},
	{
		id: 'searchPrevious',
		hotkey: 'Shift+F3',
		group: 'Search',
		description: 'Jump to previous match',
	},

	// Misc
	{
		id: 'addRow',
		hotkey: 'Shift+Enter',
		group: 'Misc',
		description: 'Insert a new row below',
	},
	{
		id: 'deleteSelected',
		hotkey: 'Delete',
		group: 'Misc',
		description: 'Delete selected rows or cells',
	},
] as const

export {
	GRID_SHORTCUTS,
	type GridShortcutDef,
	type GridShortcutGroup,
	type GridShortcutId,
}

export type KanbanShortcutId =
	| 'pickUp'
	| 'drop'
	| 'cancel'
	| 'moveUp'
	| 'moveDown'
	| 'moveLeft'
	| 'moveRight'

export interface KanbanShortcutDef {
	id: KanbanShortcutId
	hotkey: string
	description: string
	/** Only active while a drag is in progress. */
	whenDragging?: boolean
}

export const KANBAN_SHORTCUTS: ReadonlyArray<KanbanShortcutDef> = [
	{
		id: 'pickUp',
		hotkey: 'Space',
		description: 'Pick up the focused card or column',
	},
	{
		id: 'pickUp',
		hotkey: 'Enter',
		description: 'Pick up the focused card or column',
	},
	{
		id: 'drop',
		hotkey: 'Space',
		description: 'Drop the item in its new position',
		whenDragging: true,
	},
	{
		id: 'drop',
		hotkey: 'Enter',
		description: 'Drop the item in its new position',
		whenDragging: true,
	},
	{
		id: 'cancel',
		hotkey: 'Escape',
		description: 'Cancel the current drag',
		whenDragging: true,
	},
	{
		id: 'moveUp',
		hotkey: 'ArrowUp',
		description: 'Move the dragged item up',
		whenDragging: true,
	},
	{
		id: 'moveDown',
		hotkey: 'ArrowDown',
		description: 'Move the dragged item down',
		whenDragging: true,
	},
	{
		id: 'moveLeft',
		hotkey: 'ArrowLeft',
		description: 'Move the dragged item left',
		whenDragging: true,
	},
	{
		id: 'moveRight',
		hotkey: 'ArrowRight',
		description: 'Move the dragged item right',
		whenDragging: true,
	},
]

const HOTKEY_TO_KEYBOARD_CODE: Record<string, string> = {
	ArrowUp: 'ArrowUp',
	ArrowDown: 'ArrowDown',
	ArrowLeft: 'ArrowLeft',
	ArrowRight: 'ArrowRight',
	Space: 'Space',
	Enter: 'Enter',
	Escape: 'Escape',
}

export function hotkeyToKeyboardCode(hotkey: string): string {
	return HOTKEY_TO_KEYBOARD_CODE[hotkey] ?? hotkey
}

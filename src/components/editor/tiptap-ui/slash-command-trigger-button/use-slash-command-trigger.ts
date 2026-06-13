'use client'

import type { Hotkey } from '@tanstack/hotkeys'
import { useHotkey } from '@tanstack/react-hotkeys'
import type { Node } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { type RefObject, useCallback } from 'react'
// --- Icons ---
import { PlusIcon } from '#/components/editor/tiptap-icons/plus-icon'
// --- Hooks ---
import { useTiptapEditor } from '#/components/editor/hooks/use-tiptap-editor'

export interface UseSlashCommandTriggerConfig {
	/**
	 * The Tiptap editor instance.
	 */
	editor?: Editor | null
	/**
	 * The node to apply trigger to.
	 */
	node?: Node | null
	/**
	 * The position of the node in the document.
	 */
	nodePos?: number | null
	/**
	 * The trigger text to insert.
	 * @default "/"
	 */
	trigger?: string
	/**
	 * Whether the button should hide when trigger insertion is not available.
	 * @default false
	 */
	hideWhenUnavailable?: boolean
	/**
	 * Callback function called after a successful trigger insertion.
	 */
	onTriggered?: (trigger: string) => void
	/**
	 * DOM scope for the keyboard shortcut. When provided, the hotkey only
	 * fires while focus is inside this element.
	 */
	hotkeyTargetRef?: RefObject<HTMLElement | null>
	/**
	 * Whether to register the keyboard shortcut. Disable on toolbar buttons
	 * when the editor surface registers the hotkey once with `hotkeyTargetRef`.
	 * @default true
	 */
	registerHotkey?: boolean
}

export const SLASH_COMMAND_TRIGGER_SHORTCUT_KEYS = 'Mod+/' as Hotkey

export function canInsertSlashCommand(
	editor: Editor | null,
	node?: Node | null,
	nodePos?: number | null,
	trigger = '/',
): boolean {
	if (!editor?.isEditable) return false

	if (typeof nodePos === 'number' && node) {
		const insertPos = node.isTextblock ? nodePos + 1 : nodePos
		return editor.can().insertContentAt(insertPos, trigger)
	}

	return editor.can().insertContent(trigger)
}

export function insertSlashCommand(
	editor: Editor | null,
	trigger = '/',
	node?: Node | null,
	nodePos?: number | null,
): boolean {
	if (!editor?.isEditable) return false
	if (!canInsertSlashCommand(editor, node, nodePos, trigger)) return false

	if (typeof nodePos === 'number' && node) {
		const insertPos = node.isTextblock ? nodePos + 1 : nodePos
		return editor.chain().focus().insertContentAt(insertPos, trigger).run()
	}

	return editor.chain().focus().insertContent(trigger).run()
}

export function shouldShowSlashCommandTriggerButton(props: {
	editor: Editor | null
	node?: Node | null
	nodePos?: number | null
	trigger: string
	hideWhenUnavailable: boolean
}): boolean {
	const { editor, node, nodePos, trigger, hideWhenUnavailable } = props

	if (!editor) return false
	if (!hideWhenUnavailable) return true

	return canInsertSlashCommand(editor, node, nodePos, trigger)
}

export function useSlashCommandTrigger(
	config: UseSlashCommandTriggerConfig = {},
) {
	const {
		editor: providedEditor,
		node,
		nodePos,
		trigger = '/',
		hideWhenUnavailable = false,
		onTriggered,
		hotkeyTargetRef,
		registerHotkey = true,
	} = config
	const { editor } = useTiptapEditor(providedEditor)
	const canInsert = canInsertSlashCommand(editor, node, nodePos, trigger)

	const isVisible = shouldShowSlashCommandTriggerButton({
		editor,
		node,
		nodePos,
		trigger,
		hideWhenUnavailable,
	})

	const handleSlashCommand = useCallback(() => {
		if (!editor) return false

		const success = insertSlashCommand(editor, trigger, node, nodePos)
		if (success) {
			onTriggered?.(trigger)
		}
		return success
	}, [editor, node, nodePos, onTriggered, trigger])

	useHotkey(
		SLASH_COMMAND_TRIGGER_SHORTCUT_KEYS,
		(event) => {
			event.preventDefault()
			handleSlashCommand()
		},
		{
			enabled: registerHotkey && Boolean(editor?.isEditable),
			target: hotkeyTargetRef,
			ignoreInputs: hotkeyTargetRef ? false : undefined,
			preventDefault: true,
			conflictBehavior: 'allow',
		},
	)

	return {
		isVisible,
		canInsert,
		handleSlashCommand,
		label: 'Slash command',
		shortcutKeys: SLASH_COMMAND_TRIGGER_SHORTCUT_KEYS,
		trigger,
		Icon: PlusIcon,
	}
}

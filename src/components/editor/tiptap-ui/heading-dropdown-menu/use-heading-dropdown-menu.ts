'use client'

import type { Editor } from '@tiptap/react'

// --- Hooks ---
import { useTiptapEditor } from '#/components/editor/hooks/use-tiptap-editor'
// --- Icons ---
import { HeadingIcon } from '#/components/editor/tiptap-icons/heading-icon'
// --- Tiptap UI ---
import {
	canToggle,
	headingIcons,
	isHeadingActive,
	type Level,
	shouldShowButton,
} from '#/components/editor/tiptap-ui/heading-button'

const DEFAULT_HEADING_LEVELS: Level[] = [1, 2, 3, 4, 5, 6]

/**
 * Configuration for the heading dropdown menu functionality
 */
export interface UseHeadingDropdownMenuConfig {
	/**
	 * The Tiptap editor instance.
	 */
	editor?: Editor | null
	/**
	 * Available heading levels to show in the dropdown
	 * @default [1, 2, 3, 4, 5, 6]
	 */
	levels?: Level[]
	/**
	 * Whether the dropdown should hide when headings are not available.
	 * @default false
	 */
	hideWhenUnavailable?: boolean
}

/**
 * Gets the currently active heading level from the available levels
 */
export function getActiveHeadingLevel(
	editor: Editor | null,
	levels: Level[] = DEFAULT_HEADING_LEVELS,
): Level | undefined {
	if (!editor?.isEditable) return undefined
	return levels.find((level) => isHeadingActive(editor, level))
}

/**
 * Custom hook that provides heading dropdown menu functionality for Tiptap editor
 */
export function useHeadingDropdownMenu(config?: UseHeadingDropdownMenuConfig) {
	const { editor: providedEditor, hideWhenUnavailable = false } = config || {}

	const levels = config?.levels ?? DEFAULT_HEADING_LEVELS

	const { editor } = useTiptapEditor(providedEditor)

	const isVisible = editor
		? shouldShowButton({
				editor,
				level: levels,
				hideWhenUnavailable,
			})
		: false

	const activeLevel = getActiveHeadingLevel(editor, levels)
	const isActive = isHeadingActive(editor)
	const canToggleState = canToggle(editor)

	return {
		isVisible,
		activeLevel,
		isActive,
		canToggle: canToggleState,
		levels,
		label: 'Heading',
		Icon: activeLevel ? headingIcons[activeLevel] : HeadingIcon,
	}
}

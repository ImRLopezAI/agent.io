'use client'

import { forwardRef, useCallback } from 'react'
// --- Tiptap UI ---
import type { UseSlashCommandTriggerConfig } from '#/components/editor/tiptap-ui/slash-command-trigger-button'
import {
	SLASH_COMMAND_TRIGGER_SHORTCUT_KEYS,
	useSlashCommandTrigger,
} from '#/components/editor/tiptap-ui/slash-command-trigger-button'
import { Badge } from '#/components/editor/tiptap-ui-primitive/badge'

// --- UI Primitives ---
import type { ButtonProps } from '#/components/editor/tiptap-ui-primitive/button'
import { Button } from '#/components/editor/tiptap-ui-primitive/button'
// --- Lib ---
import { parseShortcutKeys } from '#/lib/tiptap-utils'

export interface SlashCommandTriggerButtonProps
	extends ButtonProps,
		UseSlashCommandTriggerConfig {
	/**
	 * Optional text to display alongside the icon.
	 */
	text?: string
	/**
	 * Optional show shortcut keys in the button.
	 * @default false
	 */
	showShortcut?: boolean
}

export function SlashCommandTriggerShortcutBadge({
	shortcutKeys = SLASH_COMMAND_TRIGGER_SHORTCUT_KEYS,
}: {
	shortcutKeys?: string
}) {
	return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>
}

export const SlashCommandTriggerButton = forwardRef<
	HTMLButtonElement,
	SlashCommandTriggerButtonProps
>(
	(
		{
			editor,
			node,
			nodePos,
			trigger,
			text,
			hideWhenUnavailable = false,
			onTriggered,
			showShortcut = false,
			registerHotkey,
			onClick,
			children,
			...buttonProps
		},
		ref,
	) => {
		const {
			isVisible,
			canInsert,
			handleSlashCommand,
			label,
			shortcutKeys,
			Icon,
		} = useSlashCommandTrigger({
			editor,
			node,
			nodePos,
			trigger,
			hideWhenUnavailable,
			onTriggered,
			registerHotkey,
		})

		const handleClick = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				onClick?.(event)
				if (event.defaultPrevented) return
				handleSlashCommand()
			},
			[handleSlashCommand, onClick],
		)

		if (!isVisible) {
			return null
		}

		return (
			<Button
				type='button'
				disabled={!canInsert}
				variant='ghost'
				data-disabled={!canInsert}
				role='button'
				tabIndex={-1}
				aria-label={label}
				tooltip={label}
				shortcutKeys={shortcutKeys}
				onClick={handleClick}
				{...buttonProps}
				ref={ref}
			>
				{children ?? (
					<>
						<Icon className='tiptap-button-icon' />
						{text && <span className='tiptap-button-text'>{text}</span>}
						{showShortcut && (
							<SlashCommandTriggerShortcutBadge shortcutKeys={shortcutKeys} />
						)}
					</>
				)}
			</Button>
		)
	},
)

SlashCommandTriggerButton.displayName = 'SlashCommandTriggerButton'

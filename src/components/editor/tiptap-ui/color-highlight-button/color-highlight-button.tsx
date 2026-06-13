'use client'

import { forwardRef, useCallback, useMemo } from 'react'
// --- Tiptap UI ---
import type { UseColorHighlightConfig } from '#/components/editor/tiptap-ui/color-highlight-button'
import {
	COLOR_HIGHLIGHT_SHORTCUT_KEY,
	useColorHighlight,
} from '#/components/editor/tiptap-ui/color-highlight-button'
import { Badge } from '#/components/editor/tiptap-ui-primitive/badge'
// --- UI Primitives ---
import type { ButtonProps } from '#/components/editor/tiptap-ui-primitive/button'
import { Button } from '#/components/editor/tiptap-ui-primitive/button'
// --- Hooks ---
import { useTiptapEditor } from '#/components/editor/hooks/use-tiptap-editor'
// --- Lib ---
import { parseShortcutKeys } from '#/lib/tiptap-utils'

export interface ColorHighlightButtonProps
	extends Omit<ButtonProps, 'type'>,
		UseColorHighlightConfig {
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

export function ColorHighlightShortcutBadge({
	shortcutKeys = COLOR_HIGHLIGHT_SHORTCUT_KEY,
}: {
	shortcutKeys?: string
}) {
	return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>
}

/**
 * Button component for applying color highlights in a Tiptap editor.
 *
 * Supports two highlighting modes:
 * - "mark": Uses the highlight mark extension (default)
 * - "node": Uses the node background extension
 *
 * For custom button implementations, use the `useColorHighlight` hook instead.
 *
 * @example
 * ```tsx
 * // Mark-based highlighting (default)
 * <ColorHighlightButton highlightColor="yellow" />
 *
 * // Node-based background coloring
 * <ColorHighlightButton
 *   highlightColor="var(--tt-color-highlight-blue)"
 *   mode="node"
 * />
 *
 * // With custom callback
 * <ColorHighlightButton
 *   highlightColor="red"
 *   mode="mark"
 *   onApplied={({ color, mode }) => console.log(`Applied ${color} in ${mode} mode`)}
 * />
 * ```
 */
export const ColorHighlightButton = forwardRef<
	HTMLButtonElement,
	ColorHighlightButtonProps
>(
	(
		{
			editor: providedEditor,
			highlightColor,
			text,
			hideWhenUnavailable = false,
			mode = 'mark',
			onApplied,
			showShortcut = false,
			onClick,
			children,
			style,
			useColorValue = false,
			...buttonProps
		},
		ref,
	) => {
		const { editor } = useTiptapEditor(providedEditor)
		const {
			isVisible,
			canColorHighlight,
			isActive,
			handleColorHighlight,
			label,
			shortcutKeys,
		} = useColorHighlight({
			editor,
			highlightColor,
			useColorValue,
			label: text || `Toggle highlight (${highlightColor})`,
			hideWhenUnavailable,
			mode,
			onApplied,
		})

		const handleClick = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				onClick?.(event)
				if (event.defaultPrevented) return
				handleColorHighlight()
			},
			[handleColorHighlight, onClick],
		)

		const buttonStyle = useMemo(
			() =>
				({
					...style,
					'--highlight-color': highlightColor,
				}) as React.CSSProperties,
			[highlightColor, style],
		)

		if (!isVisible) {
			return null
		}

		return (
			<Button
				type='button'
				variant='ghost'
				data-active-state={isActive ? 'on' : 'off'}
				role='button'
				tabIndex={-1}
				disabled={!canColorHighlight}
				data-disabled={!canColorHighlight}
				aria-label={label}
				aria-pressed={isActive}
				tooltip={label}
				onClick={handleClick}
				style={buttonStyle}
				{...buttonProps}
				ref={ref}
			>
				{children ?? (
					<>
						<span
							className='tiptap-button-highlight relative -mx-[0.175rem] size-5 rounded-xl bg-(--highlight-color) transition-transform after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--highlight-color) after:mix-blend-multiply after:brightness-95 group-data-[active-state=on]/tiptap-button:after:brightness-75'
							style={
								{ '--highlight-color': highlightColor } as React.CSSProperties
							}
						/>
						{text && <span className='tiptap-button-text'>{text}</span>}
						{showShortcut && (
							<ColorHighlightShortcutBadge shortcutKeys={shortcutKeys} />
						)}
					</>
				)}
			</Button>
		)
	},
)

ColorHighlightButton.displayName = 'ColorHighlightButton'

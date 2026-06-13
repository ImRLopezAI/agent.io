'use client'

import { KeyboardCode } from '@dnd-kit/core'
import {
	type Hotkey,
	type UseHotkeyDefinition,
	useHotkeys,
} from '@tanstack/react-hotkeys'
import { useAtomValue } from 'jotai'
import * as React from 'react'

import { hotkeyToKeyboardCode, KANBAN_SHORTCUTS } from './kanban-shortcuts'
import { kanbanActiveIdAtom } from './store'

function dispatchKeyboardEvent(code: string, target: EventTarget | null) {
	if (!target) return

	const event = new KeyboardEvent('keydown', {
		code,
		key: code,
		bubbles: true,
		cancelable: true,
	})

	target.dispatchEvent(event)
}

interface UseKanbanHotkeysOptions {
	target?: React.RefObject<HTMLElement | null>
}

/**
 * Declarative keyboard layer for kanban drag-and-drop.
 *
 * Drop/cancel/move keys are forwarded as native keyboard events so
 * `@dnd-kit` `KeyboardSensor` keeps owning drag lifecycle and collision logic.
 * Pick-up remains on dnd-kit activators (Space/Enter on the focused handle).
 */
export function useKanbanHotkeys({ target }: UseKanbanHotkeysOptions = {}) {
	const activeId = useAtomValue(kanbanActiveIdAtom)
	const isDragging = activeId != null

	const forwardToDndKit = React.useCallback(
		(hotkey: string) => {
			const code = hotkeyToKeyboardCode(hotkey)
			const node = target?.current
			dispatchKeyboardEvent(code, node ?? document)
		},
		[target],
	)

	const registrations = React.useMemo(() => {
		const defs: UseHotkeyDefinition[] = []

		for (const shortcut of KANBAN_SHORTCUTS) {
			if (!shortcut.whenDragging) {
				// Pick-up is handled by dnd-kit KeyboardSensor activators.
				continue
			}

			defs.push({
				hotkey: shortcut.hotkey as Hotkey,
				callback: (event) => {
					if (!isDragging) return
					event.preventDefault()
					forwardToDndKit(shortcut.hotkey)
				},
				options: {
					enabled: isDragging,
					target,
					ignoreInputs: false,
				},
			})
		}

		return defs
	}, [forwardToDndKit, isDragging, target])

	useHotkeys(registrations, {
		target,
		ignoreInputs: false,
	})
}

export const kanbanDirectionCodes = [
	KeyboardCode.Down,
	KeyboardCode.Right,
	KeyboardCode.Up,
	KeyboardCode.Left,
] as const

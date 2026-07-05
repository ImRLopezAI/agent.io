'use client'

import type { Editor } from '@tiptap/react'
import { useCurrentEditor } from '@tiptap/react'
import { useEffect, useState } from 'react'

function getActivePageEditor(editor: Editor): Editor | null {
	const storage = editor.storage as unknown as Record<string, unknown>
	const pages = storage.pages as { activeEditor?: Editor | null } | undefined
	if (!pages || !('activeEditor' in pages)) return null
	return pages.activeEditor ?? null
}

/**
 * Resolve the editor instance for TipTap UI controls.
 *
 * Re-render when selection or document changes is handled by
 * `EditorTransactionSync` in the  editor shell — this hook
 * intentionally does not subscribe to `editor.state` to avoid dozens of
 * redundant `useEditorState` listeners per toolbar control.
 */
export function useTiptapEditor(providedEditor?: Editor | null): {
	editor: Editor | null
} {
	const { editor: coreEditor } = useCurrentEditor()
	const mainEditor = providedEditor ?? coreEditor

	const [storageEditor, setStorageEditor] = useState<Editor | null>(null)

	useEffect(() => {
		if (!mainEditor) {
			setStorageEditor(null)
			return
		}

		const updateHandler = () =>
			setStorageEditor(getActivePageEditor(mainEditor))

		updateHandler()

		mainEditor.on('update', updateHandler)
		mainEditor.on('selectionUpdate', updateHandler)

		return () => {
			mainEditor.off('update', updateHandler)
			mainEditor.off('selectionUpdate', updateHandler)
		}
	}, [mainEditor])

	useEffect(() => {
		if (!storageEditor) return

		const handleDestroy = () => setStorageEditor(null)

		storageEditor.on('destroy', handleDestroy)
		return () => {
			storageEditor.off('destroy', handleDestroy)
		}
	}, [storageEditor])

	return { editor: storageEditor ?? mainEditor }
}

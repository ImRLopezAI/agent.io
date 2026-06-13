'use client'

import { useCurrentEditor, useEditorState } from '@tiptap/react'
import type { ReactNode } from 'react'

import { isEditorReady } from './editor-utils'

/**
 * Re-render toolbar/menu children when editor selection or document changes.
 * Required because the editor surface uses shouldRerenderOnTransaction: false.
 */
export function EditorTransactionSync({ children }: { children: ReactNode }) {
	const { editor } = useCurrentEditor()

	useEditorState({
		editor: isEditorReady(editor) ? editor : null,
		selector: ({ editor: activeEditor }) => {
			if (!activeEditor) {
				return { from: 0, to: 0, size: 0 }
			}
			const { from, to } = activeEditor.state.selection
			return {
				from,
				to,
				size: activeEditor.state.doc.content.size,
			}
		},
	})

	return children
}

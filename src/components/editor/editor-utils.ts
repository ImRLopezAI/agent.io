import type { Editor } from '@tiptap/react'

export function isEditorReady(editor: Editor | null): editor is Editor {
	return Boolean(
		editor &&
			!editor.isDestroyed &&
			editor.view &&
			typeof editor.can === 'function',
	)
}

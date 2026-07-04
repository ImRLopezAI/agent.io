'use client'

import DragHandle from '@tiptap/extension-drag-handle-react'
import { useCurrentEditor } from '@tiptap/react'
import { cn } from 'cnfast'
import { GripVertical } from 'lucide-react'

import { isEditorReady } from './editor-utils'

const NESTED_DRAG_HANDLE_CONFIG = { edgeDetection: { threshold: -16 } } as const

export function EditorDragHandle() {
	const { editor } = useCurrentEditor()

	if (!isEditorReady(editor) || !editor.isEditable) return null

	return (
		<DragHandle
			editor={editor}
			nested={NESTED_DRAG_HANDLE_CONFIG}
			className='editor-drag-handle'
			computePositionConfig={{
				placement: 'left-start',
				strategy: 'absolute',
			}}
		>
			<button
				type='button'
				className={cn(
					'inline-flex size-5 items-center justify-center rounded border-0 bg-transparent p-0',
					'text-muted-foreground hover:bg-muted hover:text-foreground',
					'cursor-grab active:cursor-grabbing',
				)}
				aria-label='Drag to reorder'
			>
				<GripVertical className='size-3.5' aria-hidden />
			</button>
		</DragHandle>
	)
}

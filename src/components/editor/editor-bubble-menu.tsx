'use client'

import { isTextSelection } from '@tiptap/core'
import { useCurrentEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

import {
	Toolbar,
	ToolbarGroup,
	ToolbarSeparator,
} from '#/components/editor/tiptap-ui-primitive/toolbar'
import { ColorHighlightPopover } from '#/components/editor/tiptap-ui/color-highlight-popover'
import { LinkPopover } from '#/components/editor/tiptap-ui/link-popover'
import { MarkButton } from '#/components/editor/tiptap-ui/mark-button'
import { cn } from '#/lib/utils'

import { isEditorReady } from './editor-utils'

export function EditorBubbleMenu() {
	const { editor } = useCurrentEditor()

	if (!isEditorReady(editor)) return null

	return (
		<BubbleMenu
			editor={editor}
			shouldShow={({ editor: activeEditor, state }) => {
				if (!activeEditor.isEditable) return false
				const { selection } = state
				const { empty } = selection
				if (empty || !isTextSelection(selection)) return false
				if (selection.from === selection.to) return false
				return true
			}}
			options={{
				placement: 'top',
				offset: 8,
			}}
		>
			<Toolbar
				variant='floating'
				className={cn(
					'editor-bubble border border-border bg-foreground text-background shadow-md',
				)}
			>
				<ToolbarGroup>
					<MarkButton editor={editor} type='bold' />
					<MarkButton editor={editor} type='italic' />
					<MarkButton editor={editor} type='strike' />
					<MarkButton editor={editor} type='code' />
				</ToolbarGroup>

				<ToolbarSeparator />

				<ToolbarGroup>
					<ColorHighlightPopover editor={editor} />
					<LinkPopover editor={editor} />
				</ToolbarGroup>
			</Toolbar>
		</BubbleMenu>
	)
}

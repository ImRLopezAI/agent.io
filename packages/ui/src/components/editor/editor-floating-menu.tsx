'use client'

import { useCurrentEditor } from '@tiptap/react'
import { FloatingMenu } from '@tiptap/react/menus'
import { cn } from 'cnfast'

import {
	Toolbar,
	ToolbarGroup,
} from '#/components/editor/tiptap-ui-primitive/toolbar'
import { BlockquoteButton } from '#/components/editor/tiptap-ui/blockquote-button'
import { CodeBlockButton } from '#/components/editor/tiptap-ui/code-block-button'
import { HeadingButton } from '#/components/editor/tiptap-ui/heading-button'
import { ListButton } from '#/components/editor/tiptap-ui/list-button'
import { SlashCommandTriggerButton } from '#/components/editor/tiptap-ui/slash-command-trigger-button'

import { isEditorReady } from './editor-utils'

export function EditorFloatingMenu() {
	const { editor } = useCurrentEditor()

	if (!isEditorReady(editor)) return null

	return (
		<FloatingMenu
			editor={editor}
			shouldShow={({ editor: activeEditor, state }) => {
				if (!activeEditor.isEditable) return false

				const { $from, empty } = state.selection
				if (!empty) return false

				const isEmptyTextBlock =
					$from.parent.isTextblock &&
					$from.parent.content.size === 0 &&
					$from.parentOffset === 0

				return isEmptyTextBlock
			}}
			options={{
				placement: 'left-start',
				offset: 8,
			}}
		>
			<Toolbar
				variant='floating'
				className={cn(
					'editor-floating border border-border bg-background text-foreground shadow-sm',
				)}
			>
				<ToolbarGroup>
					<HeadingButton editor={editor} level={1} hideWhenUnavailable />
					<HeadingButton editor={editor} level={2} hideWhenUnavailable />
					<ListButton editor={editor} type='bulletList' hideWhenUnavailable />
					<ListButton editor={editor} type='orderedList' hideWhenUnavailable />
					<ListButton editor={editor} type='taskList' hideWhenUnavailable />
					<BlockquoteButton editor={editor} hideWhenUnavailable />
					<CodeBlockButton editor={editor} hideWhenUnavailable />
					<SlashCommandTriggerButton
						editor={editor}
						trigger='/'
						hideWhenUnavailable
						registerHotkey={false}
					/>
				</ToolbarGroup>
			</Toolbar>
		</FloatingMenu>
	)
}

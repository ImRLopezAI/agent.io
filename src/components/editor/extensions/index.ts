import type { Extensions } from '@tiptap/core'
import { Audio } from '@tiptap/extension-audio'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Color } from '@tiptap/extension-color'
import {
	Details,
	DetailsContent,
	DetailsSummary,
} from '@tiptap/extension-details'
import { Emoji, gitHubEmojis } from '@tiptap/extension-emoji'
import { FontFamily } from '@tiptap/extension-font-family'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { InvisibleCharacters } from '@tiptap/extension-invisible-characters'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableOfContents } from '@tiptap/extension-table-of-contents'
import { TableRow } from '@tiptap/extension-table-row'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Twitch } from '@tiptap/extension-twitch'
import { Typography } from '@tiptap/extension-typography'
import { UniqueID } from '@tiptap/extension-unique-id'
import { Youtube } from '@tiptap/extension-youtube'
import { CharacterCount, Focus, Selection } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'

import { NodeBackground } from '#/components/editor/tiptap-extension/node-background-extension'
import { HorizontalRule } from '#/components/editor/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension'
import { ImageUploadNode } from '#/components/editor/tiptap-node/image-upload-node/image-upload-node-extension'
import { handleImageUpload, MAX_FILE_SIZE } from '#/lib/tiptap-utils'

import type { EditorMember } from '../types'
import { createFileHandler } from './file-handler'
import { createMention, type MentionSuggestionContext } from './mention-config'
import {
	createSlashCommandsExtension,
	type SlashCommandSuggestionContext,
} from './slash-commands'

import 'katex/dist/katex.min.css'

const lowlight = createLowlight(common)

export type EditorVariant = 'composer' | 'document'

export type CreateEditorExtensionsOptions = {
	placeholder: string
	getMembers?: () => EditorMember[]
	variant?: EditorVariant
	showSlashPlaceholder?: boolean
	onSlashContextChange?: (context: SlashCommandSuggestionContext | null) => void
	onMentionContextChange?: (context: MentionSuggestionContext | null) => void
}

export function createEditorExtensions({
	placeholder,
	getMembers,
	variant = 'composer',
	showSlashPlaceholder = true,
	onSlashContextChange,
	onMentionContextChange,
}: CreateEditorExtensionsOptions): Extensions {
	const extensions: Extensions = [
		StarterKit.configure({
			horizontalRule: false,
			codeBlock: false,
			link: {
				openOnClick: false,
				enableClickSelection: true,
			},
			blockquote: {
				HTMLAttributes: {
					class:
						'border-l-4 border-foreground py-1.5 pl-4 text-muted-foreground',
				},
			},
			code: {
				HTMLAttributes: {
					class:
						'rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-muted-foreground',
				},
			},
			bulletList: {
				HTMLAttributes: {
					class: 'my-6 list-outside list-disc pl-6',
				},
			},
			orderedList: {
				HTMLAttributes: {
					class: 'my-6 list-outside list-decimal pl-6',
				},
			},
			heading: {},
			underline: {
				HTMLAttributes: {
					class: 'underline',
				},
			},
			paragraph: {
				HTMLAttributes: {
					class: 'leading-[1.6]',
				},
			},
			bold: {
				HTMLAttributes: {
					class: 'font-bold',
				},
			},
		}),
		HorizontalRule,
		TextAlign.configure({ types: ['heading', 'paragraph'] }),
		Placeholder.configure({
			placeholder,
			emptyEditorClass: 'is-editor-empty',
			emptyNodeClass: showSlashPlaceholder ? 'is-empty with-slash' : 'is-empty',
			includeChildren: true,
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		Highlight.configure({ multicolor: true }),
		Image,
		Typography,
		Superscript,
		Subscript,
		Selection,
		ImageUploadNode.configure({
			accept: 'image/*',
			maxSize: MAX_FILE_SIZE,
			limit: 3,
			upload: handleImageUpload,
			onError: (error) => console.error('Upload failed:', error),
		}),
		NodeBackground,
		CharacterCount,
		Focus,
		Table.configure({
			resizable: true,
			HTMLAttributes: {
				class: 'my-5 w-full table-fixed border-collapse overflow-hidden',
			},
		}),
		TableRow,
		TableHeader.configure({
			HTMLAttributes: {
				class:
					'border border-border bg-muted px-3 py-2.5 text-left align-top font-semibold',
			},
		}),
		TableCell.configure({
			HTMLAttributes: {
				class: 'border border-border bg-background px-3 py-2.5 align-top',
			},
		}),
		TextStyle,
		Color,
		CodeBlockLowlight.configure({
			lowlight,
			HTMLAttributes: {
				class:
					'my-6 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-sm text-foreground',
			},
		}),
		Details,
		DetailsSummary,
		DetailsContent,
		createMention({
			getMembers,
			onMentionContextChange,
		}),
		createSlashCommandsExtension({
			onContextChange: onSlashContextChange,
		}),
		createFileHandler(),
		Youtube.configure({ controls: true, nocookie: true }),
		Twitch,
		Audio,
		Emoji.configure({
			emojis: gitHubEmojis,
			enableEmoticons: true,
		}),
		Mathematics.configure({
			katexOptions: {
				throwOnError: false,
			},
		}),
		FontFamily,
		InvisibleCharacters.configure({
			visible: false,
		}),
		UniqueID.configure({
			types: [
				'paragraph',
				'heading',
				'blockquote',
				'codeBlock',
				'details',
				'table',
			],
		}),
		Markdown,
	]

	if (variant === 'document') {
		extensions.push(TableOfContents)
	}

	return extensions
}

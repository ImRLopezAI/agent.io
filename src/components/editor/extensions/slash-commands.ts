import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'

export interface SlashCommandItem {
	id: string
	label: string
	description?: string
	keywords?: string[]
	command: (props: {
		editor: SuggestionOptions['editor']
		range: { from: number; to: number }
	}) => void
}

export const slashCommandPluginKey = new PluginKey('slashCommand')

export const DEFAULT_SLASH_COMMANDS: SlashCommandItem[] = [
	{
		id: 'heading-1',
		label: 'Heading 1',
		description: 'Large section heading',
		keywords: ['h1', 'title'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
		},
	},
	{
		id: 'heading-2',
		label: 'Heading 2',
		description: 'Medium section heading',
		keywords: ['h2', 'subtitle'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
		},
	},
	{
		id: 'heading-3',
		label: 'Heading 3',
		description: 'Small section heading',
		keywords: ['h3'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
		},
	},
	{
		id: 'bullet-list',
		label: 'Bullet list',
		description: 'Create a simple list',
		keywords: ['ul', 'unordered'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBulletList().run()
		},
	},
	{
		id: 'ordered-list',
		label: 'Numbered list',
		description: 'Create a numbered list',
		keywords: ['ol', 'ordered'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleOrderedList().run()
		},
	},
	{
		id: 'task-list',
		label: 'Checklist',
		description: 'Track tasks with checkboxes',
		keywords: ['todo', 'checkbox'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleTaskList().run()
		},
	},
	{
		id: 'blockquote',
		label: 'Quote',
		description: 'Capture a quote',
		keywords: ['quote'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBlockquote().run()
		},
	},
	{
		id: 'code-block',
		label: 'Code block',
		description: 'Display code with syntax highlighting',
		keywords: ['code', 'pre'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
		},
	},
	{
		id: 'divider',
		label: 'Divider',
		description: 'Visually divide blocks',
		keywords: ['hr', 'horizontal', 'rule'],
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHorizontalRule().run()
		},
	},
]

function filterSlashCommands(query: string, items = DEFAULT_SLASH_COMMANDS) {
	const normalized = query.trim().toLowerCase()
	if (!normalized) return items

	return items.filter((item) => {
		const haystack = [item.label, item.description, ...(item.keywords ?? [])]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
		return haystack.includes(normalized)
	})
}

export interface SlashCommandSuggestionContext {
	query: string
	items: SlashCommandItem[]
	command: (item: SlashCommandItem) => void
	clientRect: (() => DOMRect | null) | null
}

export interface SlashCommandsExtensionOptions {
	onContextChange?: (context: SlashCommandSuggestionContext | null) => void
	items?: SlashCommandItem[]
}

export function createSlashCommandsExtension({
	onContextChange,
	items = DEFAULT_SLASH_COMMANDS,
}: SlashCommandsExtensionOptions = {}) {
	return Extension.create({
		name: 'slashCommands',
		addProseMirrorPlugins() {
			return [
				Suggestion({
					editor: this.editor,
					char: '/',
					pluginKey: slashCommandPluginKey,
					allow: ({ state, range }) => {
						const $from = state.doc.resolve(range.from)
						return $from.parent.type.name !== 'codeBlock'
					},
					items: ({ query }) => filterSlashCommands(query, items),
					command: ({ editor, range, props }) => {
						const item = props as SlashCommandItem
						item.command({ editor, range })
					},
					render: () => ({
						onStart: (props) => {
							onContextChange?.({
								query: props.query,
								items: props.items as SlashCommandItem[],
								command: (item) => props.command(item),
								clientRect: props.clientRect ?? null,
							})
						},
						onUpdate: (props) => {
							onContextChange?.({
								query: props.query,
								items: props.items as SlashCommandItem[],
								command: (item) => props.command(item),
								clientRect: props.clientRect ?? null,
							})
						},
						onExit: () => {
							onContextChange?.(null)
						},
					}),
				}),
			]
		},
	})
}

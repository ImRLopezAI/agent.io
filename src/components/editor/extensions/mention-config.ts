import Mention from '@tiptap/extension-mention'
import type { SuggestionOptions } from '@tiptap/suggestion'

import type { EditorMember } from '../types'

export type MentionSuggestionItem = {
	id: string
	label: string
}

export type MentionSuggestionContext = {
	query: string
	items: MentionSuggestionItem[]
	command: (item: MentionSuggestionItem) => void
	clientRect: (() => DOMRect | null) | null
}

export type CreateMentionOptions = {
	getMembers?: () => EditorMember[]
	onMentionContextChange?: (context: MentionSuggestionContext | null) => void
}

export function createMention({
	getMembers = () => [],
	onMentionContextChange,
}: CreateMentionOptions = {}) {
	return Mention.configure({
		HTMLAttributes: {
			class:
				'mention rounded bg-[#f2f2f4] px-1 py-0.5 font-medium text-[#303236] no-underline',
		},
		renderHTML({ options, node }) {
			return [
				'span',
				{
					'data-type': 'mention',
					'data-id': node.attrs.id,
					'data-label': node.attrs.label,
					class: 'mention',
				},
				`${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
			]
		},
		renderText({ options, node }) {
			return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`
		},
		suggestion: {
			char: '@',
			items: ({ query }) => {
				const members = getMembers()
				return members
					.filter(
						(member) =>
							member.name.toLowerCase().includes(query.toLowerCase()) ||
							member.email.toLowerCase().includes(query.toLowerCase()),
					)
					.slice(0, 8)
					.map((member) => ({
						id: member.id,
						label: member.name,
					}))
			},
			render: () => ({
				onStart: (props) => {
					onMentionContextChange?.({
						query: props.query,
						items: props.items as MentionSuggestionItem[],
						command: (item) => props.command(item),
						clientRect: props.clientRect ?? null,
					})
				},
				onUpdate: (props) => {
					onMentionContextChange?.({
						query: props.query,
						items: props.items as MentionSuggestionItem[],
						command: (item) => props.command(item),
						clientRect: props.clientRect ?? null,
					})
				},
				onExit: () => {
					onMentionContextChange?.(null)
				},
			}),
		} satisfies Omit<SuggestionOptions, 'editor'>,
	})
}

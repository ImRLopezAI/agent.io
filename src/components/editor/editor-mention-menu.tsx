'use client'

import { useAtomValue } from 'jotai'
import { mentionContextAtomFamily } from './editor-atoms'
import { useEditorChrome } from './editor-context'
import type { MentionSuggestionItem } from './extensions/mention-config'
import { SuggestionMenu } from './suggestion-menu'

export function EditorMentionMenu() {
	const { instanceId } = useEditorChrome()
	const mentionContext = useAtomValue(mentionContextAtomFamily(instanceId))

	return (
		<SuggestionMenu
			active={mentionContext !== null}
			items={mentionContext?.items ?? []}
			clientRect={mentionContext?.clientRect ?? null}
			emptyLabel='No members found'
			onSelect={(item) => mentionContext?.command(item)}
			renderItem={(item: MentionSuggestionItem) => (
				<>
					<span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-medium text-[10px] text-white'>
						{item.label
							.split(/[\s@._-]+/)
							.filter(Boolean)
							.slice(0, 2)
							.map((part) => part[0]?.toUpperCase())
							.join('')
							.slice(0, 2) || 'U'}
					</span>
					<span className='min-w-0 truncate font-medium text-foreground text-sm'>
						{item.label}
					</span>
				</>
			)}
		/>
	)
}

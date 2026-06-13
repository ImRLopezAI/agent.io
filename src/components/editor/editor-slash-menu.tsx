'use client'

import { useAtomValue } from 'jotai'
import { slashContextAtomFamily } from './editor-atoms'
import { useEditorChrome } from './editor-context'
import type { SlashCommandItem } from './extensions/slash-commands'
import { SuggestionMenu } from './suggestion-menu'

export function EditorSlashMenu() {
	const { instanceId } = useEditorChrome()
	const slashContext = useAtomValue(slashContextAtomFamily(instanceId))

	return (
		<SuggestionMenu
			active={slashContext !== null}
			items={slashContext?.items ?? []}
			clientRect={slashContext?.clientRect ?? null}
			emptyLabel='No results'
			onSelect={(item) => slashContext?.command(item)}
			renderItem={(item: SlashCommandItem) => (
				<div className='flex flex-col items-start'>
					<span className='font-medium text-foreground text-sm'>
						{item.label}
					</span>
					{item.description ? (
						<span className='text-muted-foreground text-xs'>{item.description}</span>
					) : null}
				</div>
			)}
		/>
	)
}

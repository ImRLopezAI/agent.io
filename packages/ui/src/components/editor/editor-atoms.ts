import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'

import type { MentionSuggestionContext } from './extensions/mention-config'
import type { SlashCommandSuggestionContext } from './extensions/slash-commands'

export type ToolbarMode = 'always' | 'focus' | 'never'
export type MobilePanel = 'main' | 'highlighter' | 'link'

export const toolbarModeAtomFamily = atomFamily((_instanceId: string) =>
	atom<ToolbarMode>('always'),
)

export const mentionContextAtomFamily = atomFamily((_instanceId: string) =>
	atom<MentionSuggestionContext | null>(null),
)

export const slashContextAtomFamily = atomFamily((_instanceId: string) =>
	atom<SlashCommandSuggestionContext | null>(null),
)

export const mobilePanelAtomFamily = atomFamily((_instanceId: string) =>
	atom<MobilePanel>('main'),
)

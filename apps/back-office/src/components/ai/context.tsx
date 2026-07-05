'use client'

import { PromptInputProvider } from '@ui/ai-elements/prompt-input'
import type { useAi } from '@ui/ai/use-ai'
import { createContext, use } from 'react'

type AiChatHandler = ReturnType<typeof useAi>

const AiChatContext = createContext<AiChatHandler | null>(null)

export function AiChatProvider({
	handler,
	children,
	withPromptInputProvider = true,
}: {
	handler: AiChatHandler
	children: React.ReactNode
	/** Set false when a parent already wraps the tree in PromptInputProvider. */
	withPromptInputProvider?: boolean
}) {
	const tree = (
		<AiChatContext.Provider value={handler}>{children}</AiChatContext.Provider>
	)

	if (!withPromptInputProvider) {
		return tree
	}

	return <PromptInputProvider>{tree}</PromptInputProvider>
}

export function useAiChat() {
	const handler = use(AiChatContext)
	if (!handler) {
		throw new Error('useAiChat must be used within AiChatProvider')
	}
	return handler
}

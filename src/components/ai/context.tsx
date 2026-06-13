'use client'

import type { useAi } from '@ui/ai/use-ai'
import { PromptInputProvider } from '@ui/ai-elements/prompt-input'
import { createContext, use } from 'react'

type AiChatHandler = ReturnType<typeof useAi>

const AiChatContext = createContext<AiChatHandler | null>(null)

export function AiChatProvider({
	handler,
	children,
}: {
	handler: AiChatHandler
	children: React.ReactNode
}) {
	return (
		<AiChatContext.Provider value={handler}>
			<PromptInputProvider>{children}</PromptInputProvider>
		</AiChatContext.Provider>
	)
}

export function useAiChat() {
	const handler = use(AiChatContext)
	if (!handler) {
		throw new Error('useAiChat must be used within AiChatProvider')
	}
	return handler
}

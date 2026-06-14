'use client'

import { MODELS } from '@server/ai/constants'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAi } from '@ui/ai/use-ai'
import { AiChatProvider } from './context'
import { ChatPrompt } from './chat'
import { ChatMessages } from './messages'
const CHAT_URL = `${import.meta.env.VITE_CONVEX_SITE_URL}/api/chat`
if (!CHAT_URL) {
	throw new Error('VITE_CONVEX_SITE_URL is not defined')
}

export function Ai() {
	const handler = useAi({
		chat: {
			connection: fetchServerSentEvents(CHAT_URL),
		},
		initialState: {
			model: 'anthropic/claude-haiku-4.5',
			models: MODELS,
		},
	})

	return (
		<AiChatProvider handler={handler}>
			<div className='flex flex-1 flex-col overflow-hidden'>
				{handler.messages.length === 0 ? (
					<div className='flex flex-1 flex-col items-center justify-center'>
						<ChatPrompt />
					</div>
				) : (
					<>
						<div className='flex min-h-0 flex-1 flex-col'>
							<ChatMessages />
						</div>
						<div className='mx-auto w-full max-w-3xl shrink-0'>
							<ChatPrompt />
						</div>
					</>
				)}
			</div>
		</AiChatProvider>
	)
}

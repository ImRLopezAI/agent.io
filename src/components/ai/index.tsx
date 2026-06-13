'use client'

import { MODELS } from '@server/ai/constants'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAi } from '@ui/ai/use-ai'
import { ChatPrompt } from './chat'
import { ChatMessages } from './messages'
export function Ai() {
	const handler = useAi({
		chat: {
			connection: fetchServerSentEvents('/api/chat'),
		},
		initialState: {
			model: 'anthropic/claude-haiku-4.5',
			models: MODELS,
		},
	})

	return (
		<div className='flex flex-1 flex-col overflow-hidden'>
			{handler.messages.length === 0 ? (
				<div className='flex flex-1 flex-col items-center justify-center'>
					<ChatPrompt {...handler} />
				</div>
			) : (
				<>
					<div className='flex min-h-0 flex-1 flex-col'>
						<ChatMessages {...handler} />
					</div>
					<div className='mx-auto w-full max-w-3xl shrink-0'>
						<ChatPrompt {...handler} />
					</div>
				</>
			)}
		</div>
	)
}

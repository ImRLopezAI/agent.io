import type { UIMessage } from '@tanstack/ai-react'
import { CopyIcon, RefreshCcwIcon } from 'lucide-react'
import { useMemo } from 'react'

import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '../ai-elements/conversation'
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
	MessageResponse,
} from '../ai-elements/message'
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '../ai-elements/reasoning'
import { Spinner } from '../spinner'

interface ChatConversationProps {
	messages: UIMessage[]
	isLoading: boolean
	error?: Error
	reload: () => Promise<void>
}

export function ChatConversation({
	messages,
	isLoading,
	error,
	reload,
}: ChatConversationProps) {
	const visibleMessages = useMemo(
		() => messages.filter((message) => message.role !== 'system'),
		[messages],
	)

	return (
		<Conversation className='flex min-h-0 flex-1 flex-col'>
			<ConversationContent>
				{visibleMessages.map(({ id, parts, role }) => (
					<div className='flex flex-col gap-3' key={id}>
						{parts.map((part, partIndex) => {
							switch (part.type) {
								case 'text':
									return (
										<Message key={`${id}-text-${partIndex}`} from={role}>
											<MessageContent>
												<MessageResponse>{part.content}</MessageResponse>
											</MessageContent>
											{role === 'assistant' &&
												partIndex === parts.length - 1 && (
													<MessageActions>
														<MessageAction label='Retry'>
															<RefreshCcwIcon className='size-3' />
														</MessageAction>
														<MessageAction
															onClick={() =>
																navigator.clipboard.writeText(part.content)
															}
															label='Copy'
														>
															<CopyIcon className='size-3' />
														</MessageAction>
													</MessageActions>
												)}
										</Message>
									)
								case 'thinking':
									return (
										<Reasoning
											key={`${id}-thinking-${partIndex}`}
											className='w-full'
											isStreaming={
												isLoading &&
												partIndex === parts.length - 1 &&
												id === visibleMessages.at(-1)?.id
											}
										>
											<ReasoningTrigger />
											<ReasoningContent>{part.content}</ReasoningContent>
										</Reasoning>
									)
								default:
									return null
							}
						})}
					</div>
				))}
				{isLoading && visibleMessages.at(-1)?.role !== 'assistant' && (
					<Message from='assistant'>
						<MessageContent variant='flat' className='items-start'>
							<Spinner />
						</MessageContent>
					</Message>
				)}
				{error && (
					<Message from='system'>
						<MessageContent variant='error'>
							<MessageResponse>{error.message}</MessageResponse>
							<MessageActions>
								<MessageAction label='Retry' onClick={() => reload()}>
									<RefreshCcwIcon className='size-3' />
								</MessageAction>
							</MessageActions>
						</MessageContent>
					</Message>
				)}
			</ConversationContent>
			<ConversationScrollButton className='right-5' />
		</Conversation>
	)
}

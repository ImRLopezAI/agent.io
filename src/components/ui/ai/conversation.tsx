import type { ChatRequestOptions, ChatStatus, UIMessage } from 'ai'
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
	MessageBranch,
	MessageBranchContent,
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
	status: ChatStatus
	error?: Error
	regenerate: (
		props?:
			| ({
					messageId?: string | undefined
			  } & ChatRequestOptions)
			| undefined,
	) => Promise<void>
}

export function ChatConversation({
	messages,
	status,
	error,
	regenerate,
}: ChatConversationProps) {
	const visibleMessages = useMemo(
		() => messages.filter((message) => message.role !== 'system'),
		[messages],
	)
	return (
		<Conversation className='overflow-y-hidden'>
			<ConversationContent>
				{visibleMessages.map(({ id, parts, role }) => (
					<MessageBranch defaultBranch={0} key={id}>
						<MessageBranchContent>
							<div className='flex flex-col gap-3'>
								{parts.map((part, partIndex) => {
									switch (part.type) {
										case 'text':
											return (
												<Message key={`${id}-${part.type}`} from={role}>
													<MessageContent>
														<MessageResponse>{part.text}</MessageResponse>
													</MessageContent>
													{role === 'assistant' &&
														partIndex === parts.length - 1 && (
															<MessageActions>
																<MessageAction label='Retry'>
																	<RefreshCcwIcon className='size-3' />
																</MessageAction>
																<MessageAction
																	onClick={() =>
																		navigator.clipboard.writeText(part.text)
																	}
																	label='Copy'
																>
																	<CopyIcon className='size-3' />
																</MessageAction>
															</MessageActions>
														)}
												</Message>
											)
										case 'reasoning':
											return (
												<Reasoning
													key={`${id}-${part.type}`}
													className='w-full'
													isStreaming={
														status === 'streaming' &&
														partIndex === parts.length - 1 &&
														id === visibleMessages.at(-1)?.id
													}
												>
													<ReasoningTrigger />
													<ReasoningContent>{part.text}</ReasoningContent>
												</Reasoning>
											)
										default:
											return null
									}
								})}
							</div>
						</MessageBranchContent>
					</MessageBranch>
				))}
				{status === 'streaming' && (
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
								<MessageAction label='Retry' onClick={() => regenerate()}>
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

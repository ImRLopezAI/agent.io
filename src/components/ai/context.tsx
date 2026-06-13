import { Conversation } from '@ui/ai-elements/conversation'
import { PromptInputProvider } from '@ui/ai-elements/prompt-input'

export function Context(props: React.ComponentProps<typeof Conversation>) {
	return (
		<Conversation {...props}>
			<PromptInputProvider>
				{props.children as React.ReactNode}
			</PromptInputProvider>
		</Conversation>
	)
}

import { BrainCircuit, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import { ShimmerButton } from '../shimmer-button'
import { AiChatDrawer } from './drawer'
import { AiChatSheet } from './sheet'
import { useAgent } from './use-agent'

// Agent key and context types - adjust as needed for your agent system
type AgentKey = string
type AgentContext = Record<string, unknown>

interface AgentDrawerProps<T extends object>
	extends Omit<React.ComponentProps<typeof AiChatDrawer>, 'handler'> {
	data: T
	agent: AgentKey
	label?: string
	buildContext: (data: T) => AgentContext
	ai?: Omit<Parameters<typeof useAgent>[0], 'transport'>
}
export function AgentDrawer<T extends object = {}>({
	buildContext,
	data,
	agent,
	ai,
	label = 'Specialist',
	...props
}: AgentDrawerProps<T>) {
	const caseContext = useMemo(
		() => buildContext(data),
		[Object.values(data).join('-')],
	)
	const transport = useMemo(
		() => ({
			body: {
				agent: agent,
				context: caseContext,
			},
		}),
		[caseContext],
	)
	const { handler } = useAgent({
		transport,
		initialState: {
			model: 'anthropic/claude-haiku-4.5',
		},
		...ai,
	})
	return (
		<AiChatDrawer handler={handler} direction='bottom' {...props}>
			{props.children ?? (
				<ShimmerButton>
					<Sparkles className='size-3' />
					<span>{label}</span>
				</ShimmerButton>
			)}
		</AiChatDrawer>
	)
}
interface SpecialistDrawerProps
	extends Omit<React.ComponentProps<typeof AiChatDrawer>, 'handler'> {
	specialist: string
	buttonLabel?: string
	ai?: Omit<Parameters<typeof useAgent>[0], 'transport'>
}
export function SpecialistDrawer({
	specialist,
	ai,
	buttonLabel = 'Specialist',

	...props
}: SpecialistDrawerProps) {
	const transport = useMemo(
		() => ({
			api: '/api/specialist',
			body: {
				agent: specialist,
			},
		}),
		[],
	)
	const { handler } = useAgent({
		transport,
		initialState: {
			model: 'anthropic/claude-haiku-4.5',
		},
		...ai,
	})
	return (
		<AiChatDrawer handler={handler} direction='bottom' {...props}>
			{props.children ?? (
				<ShimmerButton>
					<Sparkles className='size-4' />
					<span>{buttonLabel}</span>
				</ShimmerButton>
			)}
		</AiChatDrawer>
	)
}

interface AgentSheetProps<T extends object>
	extends Omit<React.ComponentProps<typeof AiChatSheet>, 'handler'> {
	data: T
	agent: AgentKey
	label?: string
	buildContext: (data: T) => AgentContext
	ai?: Omit<Parameters<typeof useAgent>[0], 'transport'>
}

export function AgentSheet<T extends object = {}>({
	buildContext,
	data,
	agent,
	ai,
	label,
	...props
}: AgentSheetProps<T>) {
	const caseContext = useMemo(
		() => buildContext(data),
		[Object.values(data).join('-')],
	)
	const transport = useMemo(
		() => ({
			body: {
				agent: agent,
				context: caseContext,
			},
		}),
		[caseContext],
	)
	const { handler } = useAgent({
		transport,
		initialState: {
			model: 'anthropic/claude-sonnet-4.5',
		},
		...ai,
	})
	return (
		<AiChatSheet handler={handler} {...props}>
			{props.children ?? (
				<ShimmerButton size='icon' className='size-5 py-2.5'>
					<BrainCircuit className='size-3' />
					{label}
				</ShimmerButton>
			)}
		</AiChatSheet>
	)
}

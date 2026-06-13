import { SpinnerVerbsShimmer, StreamingFooterIndicator } from '@ui/ai/loading'
import type { useAi } from '@ui/ai/use-ai'
import {
	Confirmation,
	ConfirmationAccepted,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRejected,
	ConfirmationRequest,
	ConfirmationTitle,
} from '@ui/ai-elements/confirmation'
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '@ui/ai-elements/conversation'
import {
	Message,
	MessageAction,
	MessageActions,
	MessageBranch,
	MessageBranchContent,
	MessageContent,
	MessageResponse,
} from '@ui/ai-elements/message'
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@ui/ai-elements/reasoning'
import { Shimmer } from '@ui/ai-elements/shimmer'
import { Badge } from '@ui/badge'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@ui/collapsible'
import JsonViewer from '@ui/json-viewer'
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ChevronDownIcon,
	ClockIcon,
	CopyIcon,
	FileTextIcon,
	LoaderIcon,
	RefreshCcwIcon,
	SearchIcon,
} from 'lucide-react'
import {
	createContext,
	memo,
	useContext,
	useDeferredValue,
	useMemo,
	useState,
} from 'react'
import { cn } from '#/lib/utils'

import { AGENTS, MENTION_CONFIGS, MENTION_TRIGGERS } from './mentions'
import {
	type AgentStepPart,
	isCacheHitStep,
	segmentParts,
} from './segment-parts'

type ChatConversationProps = ReturnType<typeof useAi>

type MessagePart = ChatConversationProps['messages'][number]['parts'][number]
type MessageRole = ChatConversationProps['messages'][number]['role']

/**
 * Lets deeply-memoized parts (AgentToolStep, sub-tool rows) respond to an
 * approval request without prop-drilling addToolApprovalResponse through
 * every memo boundary.
 *
 * `addToolApprovalResponse` is already a stable arrow function bound to the
 * `Chat` instance held in `useChat`'s `chatRef` — verified at
 * `@ai-sdk/react/dist/index.mjs:242` (`chatRef.current.addToolApprovalResponse`)
 * and `ai/dist/index.mjs:13108` (defined once on the Chat instance via
 * `this.addToolApprovalResponse = async (...) => ...`). Since `chatRef.current`
 * is stable for the lifetime of the chat, no `useCallback` wrap is needed.
 */
type ApprovalResponder = ChatConversationProps['addToolApprovalResponse']
const ApprovalContext = createContext<ApprovalResponder | null>(null)
const useApprovalResponder = () => useContext(ApprovalContext)

/** Streamdown components override: renders `@Agent` inline code as badges */
const mentionComponents = {
	inlineCode: ({ children }: { children?: React.ReactNode }) => {
		const text = String(children ?? '')
		const trigger = text[0] ?? ''
		if (text.length > 1 && MENTION_TRIGGERS.has(trigger)) {
			const config = MENTION_CONFIGS.find((c) => c.trigger === trigger)
			const Icon = config?.icon
			return (
				<Badge
					variant='secondary'
					className={cn(
						'relative -top-[1px] mx-0.5 inline-flex h-[1.4em] items-center gap-1 rounded-[4px] px-1 py-[4px] align-middle font-bold text-xs leading-none',
						config?.className,
					)}
				>
					{Icon && <Icon className='size-3 shrink-0 opacity-70' />}
					{text.slice(1)}
				</Badge>
			)
		}
		return <code>{children}</code>
	},
}

export function ChatMessages({
	messages,
	status,
	error,
	reload,
	addToolApprovalResponse,
}: ChatConversationProps) {
	const visibleMessages = useMemo(
		() => messages.filter((message) => message.role !== 'system'),
		[messages],
	)
	// Last assistant message id — only this one is considered "actively streaming".
	// Passing a falsy flag to every other MessageItem lets React.memo skip them
	// entirely on every streamed chunk.
	const streamingId =
		status === 'streaming' ? (visibleMessages.at(-1)?.id ?? null) : null

	/* ─── In-flight indicator ────────────────────────────────────────────
	 *
	 * The shimmer should stay visible for the ENTIRE duration of an
	 * assistant turn, not just the orchestrator's first-byte dead-air.
	 * The AI SDK status union is `'submitted' | 'streaming' | 'ready' |
	 * 'error'` (verified at `ai/dist/index.d.ts` — `type ChatStatus`).
	 *
	 * Reasons to keep the shimmer up while `status === 'streaming'`:
	 *   - We haven't received any visible segments yet (dead-air before
	 *     the first chunk / agent boundary).
	 *   - There is an OPEN agent boundary (a sub-agent is still running:
	 *     `started: true && ended: false`).
	 *   - Any agent step is mid-flight (`input-streaming`,
	 *     `input-available`, or `approval-requested`) — sub-tool calls
	 *     are still in progress.
	 *   - The orchestrator just closed a sub-agent and is choosing the
	 *     next one (dead-air between agents): we conservatively keep the
	 *     shimmer up while the SDK still reports `streaming`.
	 *
	 * The shimmer only goes away when `status` flips to `'ready'`
	 * (success) or `'error'`.
	 */
	const lastMessage = visibleMessages.at(-1)
	const lastAssistantSegments = useMemo(() => {
		if (lastMessage?.role !== 'assistant') return []
		return segmentParts(
			lastMessage.parts as unknown as Parameters<typeof segmentParts>[0],
		)
	}, [lastMessage])

	const showPendingShimmer = status === 'submitted' || status === 'streaming'
	// When the last assistant message already has rendered segments we
	// show a small inline "thinking…" footer instead of a duplicate empty
	// bubble below it. When there's nothing rendered yet, we show the full
	// shimmer bubble as a sibling so the chat surface isn't blank.
	const lastIsStreamingAssistant =
		status === 'streaming' &&
		lastMessage?.role === 'assistant' &&
		lastAssistantSegments.length > 0
	const showShimmerAsBubble = showPendingShimmer && !lastIsStreamingAssistant
	const showShimmerAsFooter = showPendingShimmer && lastIsStreamingAssistant

	return (
		<ApprovalContext.Provider value={addToolApprovalResponse}>
			<Conversation className='overflow-y-hidden'>
				<ConversationContent className='mx-auto w-full max-w-3xl'>
					{visibleMessages.map((message) => (
						<MessageItem
							key={message.id}
							id={message.id}
							role={message.role as MessageRole}
							parts={message.parts as MessagePart[]}
							isStreaming={message.id === streamingId}
						/>
					))}
					{showShimmerAsBubble && (
						<Message from='assistant'>
							<MessageContent variant='flat' className='items-start'>
								<SpinnerVerbsShimmer />
							</MessageContent>
						</Message>
					)}
					{showShimmerAsFooter && <StreamingFooterIndicator />}
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
		</ApprovalContext.Provider>
	)
}

/**
 * Renders a file part attached to a message. Images get an inline thumbnail
 * (clickable to open at full size); everything else collapses to a small
 * download chip with filename + MIME type. Works with both http(s) URLs and
 * base64 data URLs (the AI SDK produces the latter when files are uploaded
 * through the prompt input).
 */
function FileAttachment({
	url,
	mediaType,
	filename,
}: {
	url: string
	mediaType: string
	filename?: string
}) {
	const isImage = mediaType.startsWith('image/')
	if (isImage) {
		return (
			<a
				href={url}
				target='_blank'
				rel='noreferrer'
				className='block overflow-hidden rounded-md border bg-muted/30'
			>
				{/* biome-ignore lint/performance/noImgElement: data URLs cannot use next/image */}
				<img
					src={url}
					alt={filename ?? 'attachment'}
					className='block max-h-80 max-w-full object-contain'
				/>
			</a>
		)
	}
	const label = filename ?? mediaType
	return (
		<a
			href={url}
			target='_blank'
			rel='noreferrer'
			download={filename}
			className='inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-foreground text-xs hover:bg-muted/60'
		>
			<FileTextIcon className='size-3.5 shrink-0 text-muted-foreground' />
			<span className='max-w-[14rem] truncate'>{label}</span>
		</a>
	)
}

interface MessageItemProps {
	id: string
	role: MessageRole
	parts: MessagePart[]
	isStreaming: boolean
}

/* ─── New top-level part shapes (Unit 2 produces these) ──────────────────
 *
 * These types live in `./segment-parts.ts` so the pure segmentation logic
 * can be unit-tested without pulling in React, markdown, and shadcn.
 */

/**
 * Streaming-time markdown renderer. `useDeferredValue` lets React mark the
 * text update as low-priority, which means rapidly arriving tokens from
 * `useChat` are coalesced — only the most recent value is actually committed
 * to streamdown, instead of re-parsing the full markdown/table on every
 * single chunk. When the stream finishes, `MessageItem` switches back to the
 * plain non-animated `MessageResponse`, which is cheap to render and yields
 * a static DOM that subsequent parent re-renders will skip via memo.
 */
const StreamedMarkdown = memo(function StreamedMarkdown({
	text,
}: {
	text: string
}) {
	const deferred = useDeferredValue(text)
	return <MessageResponse animated>{deferred}</MessageResponse>
})

/**
 * Memoized per-message renderer. Only the actively streaming message
 * re-renders on each chunk; finished messages skip — their markdown,
 * tables and agent steps keep their DOM untouched.
 */
const MessageItem = memo(function MessageItem({
	id,
	role,
	parts,
	isStreaming,
}: MessageItemProps) {
	const segments = useMemo(
		() => segmentParts(parts as unknown as Parameters<typeof segmentParts>[0]),
		[parts],
	)

	return (
		<MessageBranch defaultBranch={0}>
			<MessageBranchContent>
				<div className='flex flex-col gap-3'>
					{segments.map((segment, segIdx) => {
						const isLastSegment = segIdx === segments.length - 1
						switch (segment.kind) {
							case 'text':
								return (
									<Message key={`${id}-${segment.key}`} from={role}>
										<MessageContent
											variant={role === 'assistant' ? 'flat' : 'contained'}
										>
											{isStreaming && role === 'assistant' && isLastSegment ? (
												<StreamedMarkdown text={segment.text} />
											) : (
												<MessageResponse
													{...(role === 'user'
														? { components: mentionComponents }
														: {})}
												>
													{segment.text}
												</MessageResponse>
											)}
											{role === 'assistant' && isLastSegment && (
												<MessageActions>
													<MessageAction label='Retry'>
														<RefreshCcwIcon className='size-3' />
													</MessageAction>
													<MessageAction
														onClick={() =>
															navigator.clipboard.writeText(segment.text)
														}
														label='Copy'
													>
														<CopyIcon className='size-3' />
													</MessageAction>
												</MessageActions>
											)}
										</MessageContent>
									</Message>
								)
							case 'reasoning':
								return (
									<Reasoning
										key={`${id}-${segment.key}`}
										className='w-full'
										isStreaming={isStreaming && isLastSegment}
									>
										<ReasoningTrigger />
										<ReasoningContent>{segment.text}</ReasoningContent>
									</Reasoning>
								)
							case 'file':
								return (
									<Message key={`${id}-${segment.key}`} from={role}>
										<MessageContent
											variant={role === 'assistant' ? 'flat' : 'contained'}
											className='p-2'
										>
											<FileAttachment
												url={segment.url}
												mediaType={segment.mediaType}
												filename={segment.filename}
											/>
										</MessageContent>
									</Message>
								)
							case 'agent':
								return (
									<AgentToolStep
										key={`${id}-${segment.key}`}
										agent={segment.agent}
										steps={segment.steps}
										text={segment.text}
										started={segment.started}
										ended={segment.ended}
										isActive={isStreaming && isLastSegment && !segment.ended}
									/>
								)
							default:
								return null
						}
					})}
				</div>
			</MessageBranchContent>
		</MessageBranch>
	)
})

/* ─── Agent group: collapsible "Ontology-renderer" header + sub-tool rows ─ */

const AgentToolStep = memo(function AgentToolStep({
	agent,
	steps,
	text,
	started,
	ended,
	isActive,
}: {
	agent: string
	steps: AgentStepPart[]
	/**
	 * Markdown narration streamed inside the agent boundary. Rendered as a
	 * small muted prose block above the tool rows. Empty string when nothing
	 * was streamed inside the boundary.
	 */
	text: string
	started: boolean
	ended: boolean
	isActive: boolean
}) {
	const agentMeta = AGENTS.find((a) => a.id === agent)
	const displayName =
		agentMeta?.label ??
		agent
			.split(/[-_]/)
			.map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s))
			.join(' ')
	const AgentIcon = agentMeta?.icon

	const isComplete = ended && !isActive
	const isInterrupted = started && !ended && !isActive
	const [open, setOpen] = useState(false)

	const pendingApproval = steps.find(
		(s) => s.data.state === 'approval-requested',
	)
	const hasCacheHit = steps.some(isCacheHitStep)
	// Non-cache steps drive the visible "N calls" count so a cache-hit
	// marker doesn't inflate it (the marker is rendered separately as the
	// "Returned from cache" pill).
	const callCount = steps.filter((s) => !isCacheHitStep(s)).length

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className='group/agent not-prose w-full'
		>
			<CollapsibleTrigger className='flex w-full items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground'>
				{isActive ? (
					<LoaderIcon className='size-3 animate-spin' />
				) : isInterrupted ? (
					<AlertTriangleIcon className='size-3 text-amber-600' />
				) : isComplete ? (
					<CheckCircle2Icon className='size-3 text-green-600' />
				) : (
					<LoaderIcon className='size-3 animate-pulse' />
				)}
				{AgentIcon && (
					<AgentIcon className='size-3 shrink-0 text-muted-foreground/70' />
				)}
				<span className='flex-1 truncate text-left'>
					{isActive ? (
						<Shimmer duration={1}>{`${displayName}…`}</Shimmer>
					) : (
						displayName
					)}
				</span>
				{hasCacheHit && (
					<span className='inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 font-medium text-[10px] text-sky-700 dark:text-sky-300'>
						<ClockIcon className='size-2.5' />
						cached
					</span>
				)}
				{isInterrupted && (
					<span className='rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300'>
						(interrupted)
					</span>
				)}
				{callCount > 0 && (
					<span className='text-muted-foreground/70'>
						{callCount} {callCount === 1 ? 'call' : 'calls'}
					</span>
				)}
				{pendingApproval && (
					<span className='rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300'>
						needs approval
					</span>
				)}
				<ChevronDownIcon className='size-3 transition-transform group-data-[state=open]/agent:rotate-180' />
			</CollapsibleTrigger>

			<CollapsibleContent className='data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 mt-1.5 ml-[6px] space-y-1 border-border border-l pl-3 text-xs data-[state=closed]:animate-out data-[state=open]:animate-in'>
				{text && (
					<div className='pb-1 text-muted-foreground text-xs'>
						<MessageResponse>{text}</MessageResponse>
					</div>
				)}
				{steps.map((step) => (
					<SubToolRow key={step.data.toolCallId} step={step} />
				))}
			</CollapsibleContent>
		</Collapsible>
	)
})

/**
 * Renders one row inside an agent run. `React.memo` keyed on the step's
 * stable identity (`toolCallId`, `state`, and the input/output references)
 * lets rows skip re-rendering when an adjacent step's state changes — the
 * parent `segments` array is recomputed on each chunk, but unchanged
 * `AgentStepPart` references propagate through and this memo short-circuits.
 */
const SubToolRow = memo(
	function SubToolRow({ step }: { step: AgentStepPart }) {
		const { toolName, state, input, approval } = step.data

		// Cache-hit synthetic marker: rendered as a compact "Returned from
		// cache" pill instead of a regular tool-call row. Emitted by
		// `dbDoctorRoutingTool` when the per-request `DbDoctorCache` hits, so
		// the operator can tell at a glance "this response was replayed".
		if (isCacheHitStep(step)) {
			return <CacheHitRow step={step} />
		}

		const isDone = state === 'output-available'
		const isPending = state === 'approval-requested'
		const isDenied = state === 'output-denied'

		return (
			<div className='space-y-1'>
				<Collapsible className='group/subtool'>
					<CollapsibleTrigger className='flex w-full items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground'>
						{isDenied ? (
							<span className='inline-block size-2 shrink-0 rounded-full bg-red-500' />
						) : isDone ? (
							<CheckCircle2Icon className='size-3 shrink-0 text-green-600' />
						) : isPending ? (
							<span className='inline-block size-2 shrink-0 rounded-full bg-amber-500' />
						) : (
							<SearchIcon className='size-3 shrink-0 animate-pulse' />
						)}
						<span className='font-medium font-mono text-[11px]'>
							{toolName}
						</span>
						{input && (
							<code className='flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-left text-[10px]'>
								{JSON.stringify(input)}
							</code>
						)}
					</CollapsibleTrigger>
					{input && (
						<CollapsibleContent className='mt-1 ml-4 space-y-2'>
							<JsonViewer
								data={input as Record<string, never>}
								defaultExpanded={false}
								showLineNumbers={false}
								title='Input'
							/>
							{approval?.id && <SubToolApproval step={step} />}
						</CollapsibleContent>
					)}
				</Collapsible>
				{/*
				 * If there is no `input` (no CollapsibleContent above), the approval
				 * still needs a home — render it as the row's immediate sibling at
				 * the same indent.
				 */}
				{!input && approval?.id && <SubToolApproval step={step} />}
			</div>
		)
	},
	(prev, next) =>
		prev.step.data.toolCallId === next.step.data.toolCallId &&
		prev.step.data.state === next.step.data.state &&
		prev.step.data.input === next.step.data.input &&
		prev.step.data.output === next.step.data.output &&
		prev.step.data.approval?.id === next.step.data.approval?.id &&
		prev.step.data.approval?.approved === next.step.data.approval?.approved &&
		prev.step.data.cached === next.step.data.cached,
)

/**
 * Compact "Returned from cache" row rendered in place of the standard
 * tool-call row when a `data-agent-step` carries the `__cache_hit` sentinel
 * (or `cached: true`). The clock icon + muted styling communicates that the
 * sub-agent response was replayed from the per-request `DbDoctorCache`
 * rather than freshly streamed.
 */
function CacheHitRow({ step }: { step: AgentStepPart }) {
	const hits = step.data.input?.hits as number | undefined
	return (
		<div className='flex items-center gap-1.5 text-muted-foreground'>
			<ClockIcon className='size-3 shrink-0 text-sky-600 dark:text-sky-400' />
			<span className='text-[11px] italic'>Returned from cache</span>
			{typeof hits === 'number' && hits > 0 && (
				<span className='rounded bg-sky-500/10 px-1.5 py-0.5 font-medium text-[10px] text-sky-700 dark:text-sky-300'>
					{hits} {hits === 1 ? 'chunk' : 'chunks'}
				</span>
			)}
		</div>
	)
}

/**
 * Renders the AI-elements Confirmation compound for a sub-agent tool whose
 * state is currently in any approval-related phase. Approve/Deny call back
 * to `addToolApprovalResponse` from the surrounding chat handler.
 */
function SubToolApproval({ step }: { step: AgentStepPart }) {
	const respond = useApprovalResponder()
	const { toolName, state, approval } = step.data

	if (!approval?.id) return null

	const handleApprove = () => {
		if (!respond) return
		respond({ id: approval.id, approved: true })
	}
	const handleDeny = () => {
		if (!respond) return
		respond({ id: approval.id, approved: false })
	}

	return (
		<Confirmation
			approval={
				approval as unknown as Parameters<typeof Confirmation>[0]['approval']
			}
			state={state as ToolUIPartState}
			className='gap-1 px-2.5 py-2 text-xs'
		>
			<ConfirmationRequest>
				<ConfirmationTitle className='text-xs'>
					Approve <span className='font-mono'>{toolName}</span>?
				</ConfirmationTitle>
				<ConfirmationActions>
					<ConfirmationAction
						variant='outline'
						className='h-6 px-2 text-xs'
						onClick={handleDeny}
					>
						Deny
					</ConfirmationAction>
					<ConfirmationAction
						className='h-6 px-2 text-xs'
						onClick={handleApprove}
					>
						Approve
					</ConfirmationAction>
				</ConfirmationActions>
			</ConfirmationRequest>
			<ConfirmationAccepted>
				<ConfirmationTitle className='text-[11px] text-muted-foreground'>
					Approved <span className='font-mono'>{toolName}</span>
				</ConfirmationTitle>
			</ConfirmationAccepted>
			<ConfirmationRejected>
				<ConfirmationTitle className='text-[11px] text-muted-foreground'>
					Denied <span className='font-mono'>{toolName}</span>
				</ConfirmationTitle>
			</ConfirmationRejected>
		</Confirmation>
	)
}

type ToolUIPartState = NonNullable<Parameters<typeof Confirmation>[0]['state']>

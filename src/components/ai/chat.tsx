'use client'

import {
	Attachment,
	AttachmentPreview,
	AttachmentRemove,
	Attachments,
} from '@ui/ai-elements/attachments'
import {
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionAddScreenshot,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputButton,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTools,
} from '@ui/ai-elements/prompt-input'
import { Suggestion } from '@ui/ai-elements/suggestion'
import { Button } from '@ui/button'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@ui/dropdown-menu'
import { ArrowUp, ChevronDown, LayoutPanelLeft, Mic } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '#/lib/utils'
import { useAiChat } from './context'
import { useChatPromptStore } from './chat-prompt-store'
import {
	MentionEditor,
	type MentionEditorHandle,
	transformWithMentions,
} from './mentions'

export type { PromptInputMessage } from '@ui/ai-elements/prompt-input'

/* ─── Constants ─── */

const FILE_ACCEPT =
	'image/*,.pdf,.txt,.md,.csv,.json,.xml,.js,.ts,.tsx,.jsx,.py,.html,.css'

const MULTILINE_THRESHOLD_PX = 28
const CONTROLS_RESERVED_WIDTH_PX = 240
const MIN_MEASUREMENT_WIDTH_PX = 100

/* ─── Types ─── */

/* ─── Main Component ─── */

export function ChatPrompt() {
	const {
		attachments,
		messages,
		handleSubmit,
		input,
		artifact,
		toggleArtifact,
		model,
		changeModel,
		models,
	} = useAiChat()
	const HAS_MESSAGES = messages.length > 0
	const HAS_FILE = attachments.files.length > 0

	const {
		state: { maxMode, isMultiline, hasEditorContent },
		dispatch,
	} = useChatPromptStore()

	const hiddenRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const editorRef = useRef<MentionEditorHandle>(null)

	/* ─── Refs for transient values read inside callbacks (no subscriptions) ─── */
	const hasMessagesRef = useRef(HAS_MESSAGES)
	hasMessagesRef.current = HAS_MESSAGES
	const setInputRef = useRef(input.setInput)
	setInputRef.current = input.setInput

	const EFFECTIVE_MULTILINE = isMultiline || HAS_FILE

	/* ─── Multiline detection — event-driven, not effect-driven ─── */

	const measureMultiline = useCallback(() => {
		if (!hasMessagesRef.current) return
		const hidden = hiddenRef.current
		const container = containerRef.current
		if (!hidden || !container) return
		const availableWidth = container.clientWidth - CONTROLS_RESERVED_WIDTH_PX
		hidden.style.width = `${Math.max(availableWidth, MIN_MEASUREMENT_WIDTH_PX)}px`
		hidden.textContent = editorRef.current?.getText() || ' '
		dispatch({
			type: 'setMultiline',
			value: hidden.scrollHeight > MULTILINE_THRESHOLD_PX,
		})
	}, [dispatch])

	// Measure once on mount / whenever the collapsed↔expanded layout flips
	// (HAS_MESSAGES is the only input that actually changes the measurement
	// surface). Layout-effect timing avoids a flash of the wrong variant.
	useLayoutEffect(() => {
		measureMultiline()
	}, [measureMultiline, HAS_MESSAGES])

	// A single ResizeObserver, attached once per container lifetime. No
	// dependency on unstable parent-prop identities.
	useEffect(() => {
		if (!HAS_MESSAGES) return
		const container = containerRef.current
		if (!container) return
		const ro = new ResizeObserver(() => measureMultiline())
		ro.observe(container)
		return () => ro.disconnect()
	}, [HAS_MESSAGES, measureMultiline])

	/* ─── Submit with mentions ─── */
	const handleSubmitWithMentions = useCallback(
		(message: PromptInputMessage) => {
			const editor = editorRef.current
			if (!editor) {
				handleSubmit(message)
				return
			}
			const text = editor.getText()
			const mentions = editor.getMentions()
			const transformed = transformWithMentions(text, mentions)
			handleSubmit({ ...message, text: transformed })
			editor.clear()
			dispatch({ type: 'resetInputLayout' })
		},
		[handleSubmit, dispatch],
	)

	const handleEditorTextChange = useCallback(
		(text: string) => {
			setInputRef.current(text)
			const hasContent =
				text.trim().length > 0 || !!editorRef.current?.getMentions().length
			dispatch({ type: 'setHasEditorContent', value: hasContent })
			// Measure in the same event turn — no effect cascade needed.
			measureMultiline()
		},
		[dispatch, measureMultiline],
	)

	const HAS_VALUE = hasEditorContent || HAS_FILE

	/* ─── Shared UI pieces ─── */

	const filePreviews = HAS_FILE ? (
		<Attachments variant='grid' className='flex-wrap gap-2 px-4 pt-3'>
			{attachments.files.map((file) => (
				<Attachment
					key={file.id}
					data={file}
					onRemove={() => attachments.remove(file.id)}
				>
					<AttachmentPreview />
					<AttachmentRemove />
				</Attachment>
			))}
		</Attachments>
	) : null

	const plusMenu = (
		<PromptInputActionMenu>
			<PromptInputActionMenuTrigger />
			<PromptInputActionMenuContent>
				<PromptInputActionAddAttachments />
				<PromptInputActionAddScreenshot />
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={artifact}
					onCheckedChange={toggleArtifact}
				>
					<LayoutPanelLeft className='size-4' />
					Artifact view
				</DropdownMenuCheckboxItem>
			</PromptInputActionMenuContent>
		</PromptInputActionMenu>
	)

	const modelSelectorTrigger = (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant='ghost'
						size='xs'
						className='gap-0.5 px-1.5 text-muted-foreground text-xs'
					/>
				}
			>
				{models.find((m) => m.id === model)?.name ?? 'Auto'}
				<ChevronDown className='h-3 w-3' />
			</DropdownMenuTrigger>
			<DropdownMenuContent side='top' align='end' className='w-[220px]'>
				<DropdownMenuCheckboxItem
					checked={maxMode}
					onCheckedChange={(checked) =>
						dispatch({ type: 'setMaxMode', value: checked })
					}
					className='font-medium'
				>
					MAX Mode
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup value={model} onValueChange={changeModel}>
					<DropdownMenuRadioItem value='auto'>
						Auto <span className='text-muted-foreground'>Efficiency</span>
					</DropdownMenuRadioItem>
					{models.map((model) => (
						<DropdownMenuRadioItem key={model.id} value={model.id}>
							{model.name}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)

	const micButton = (
		<PromptInputButton aria-label='Voice input'>
			<Mic className='size-4' />
		</PromptInputButton>
	)

	const submitButton = (
		<PromptInputSubmit
			disabled={!HAS_VALUE}
			className={cn(
				'rounded-full transition-colors',
				HAS_VALUE
					? 'bg-foreground text-background hover:bg-foreground/80 hover:text-background'
					: 'pointer-events-none opacity-0',
			)}
		>
			<ArrowUp className='size-4' />
		</PromptInputSubmit>
	)

	const inputGroupBase =
		'[&_[data-slot=input-group]]:border-border [&_[data-slot=input-group]]:bg-card'

	const inputGroupExpanded =
		'[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:flex-col [&_[data-slot=input-group]]:items-stretch'

	if (!HAS_MESSAGES) {
		return (
			<div className='flex w-full flex-col items-center justify-end gap-4 px-4 pb-8'>
				<div className='w-full max-w-[620px]'>
					<PromptInput
						accept={FILE_ACCEPT}
						multiple
						onSubmit={handleSubmitWithMentions}
						className={cn(
							inputGroupBase,
							inputGroupExpanded,
							'[&_[data-slot=input-group]]:rounded-2xl',
						)}
					>
						{HAS_FILE && (
							<PromptInputHeader className='p-0'>
								{filePreviews}
							</PromptInputHeader>
						)}
						<MentionEditor
							ref={editorRef}
							mentionPopoverSideOffset={26}
							placeholder='Plan, Build, @ for agents, $ for skills and # for tools'
							className='min-h-[80px] px-5 pt-5 pb-4 text-sm leading-relaxed'
							onTextChange={handleEditorTextChange}
						/>
						<PromptInputFooter className='px-3 pb-3'>
							<PromptInputTools>
								{plusMenu}
								{modelSelectorTrigger}
							</PromptInputTools>
							<PromptInputTools>
								{micButton}
								{submitButton}
							</PromptInputTools>
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		)
	}

	return (
		<div className='flex flex-col pb-3'>
			{/* Changes bar */}
			{artifact && (
				<div className='flex items-center gap-2 px-4 py-2'>
					<Suggestion
						suggestion='Review'
						variant='outline'
						size='xs'
						className='rounded-full bg-card/80 backdrop-blur-sm'
					>
						Review <span className='text-green-500'>+9145</span>{' '}
						<span className='text-red-500'>-15786</span>
					</Suggestion>
					<div className='flex items-center gap-0.5'>
						<Suggestion
							suggestion='Commit & Push'
							variant='outline'
							size='xs'
							className='rounded-md bg-card/80 backdrop-blur-sm'
						>
							Commit & Push
						</Suggestion>
					</div>
					<Button
						variant='outline'
						size='icon-xs'
						className='rounded-md bg-card/80 text-muted-foreground backdrop-blur-sm'
					>
						<ChevronDown className='h-3.5 w-3.5' />
					</Button>
				</div>
			)}

			<div className='' ref={containerRef}>
				<PromptInput
					accept={FILE_ACCEPT}
					multiple
					onSubmit={handleSubmitWithMentions}
					className={cn(
						inputGroupBase,
						EFFECTIVE_MULTILINE
							? cn(
									inputGroupExpanded,
									'[&_[data-slot=input-group]]:rounded-2xl',
								)
							: '[&_[data-slot=input-group]]:rounded-full',
					)}
				>
					{EFFECTIVE_MULTILINE ? (
						<>
							{filePreviews && (
								<PromptInputHeader className='p-0'>
									{filePreviews}
								</PromptInputHeader>
							)}
							<MentionEditor
								ref={editorRef}
								placeholder='Send follow-up'
								className='min-h-0 px-4 pt-3 pb-1 text-sm'
								onTextChange={handleEditorTextChange}
							/>
							<PromptInputFooter className='px-2 pb-2'>
								<PromptInputTools>
									{plusMenu}
									{modelSelectorTrigger}
								</PromptInputTools>
								<PromptInputTools>
									{micButton}
									{submitButton}
								</PromptInputTools>
							</PromptInputFooter>
						</>
					) : (
						<>
							{plusMenu}
							<MentionEditor
								ref={editorRef}
								placeholder='Send follow-up'
								className='max-h-7 min-h-0 overflow-hidden py-1 text-sm'
								onTextChange={handleEditorTextChange}
							/>
							<PromptInputTools>
								{modelSelectorTrigger}
								{micButton}
								{submitButton}
							</PromptInputTools>
						</>
					)}
				</PromptInput>
			</div>

			{/* Hidden measurement node. Content is written imperatively in
			    measureMultiline() so it does not participate in React rendering. */}
			<div
				ref={hiddenRef}
				aria-hidden
				className='pointer-events-none invisible fixed top-0 left-0 whitespace-pre-wrap break-words text-sm leading-normal'
				style={{ padding: '0' }}
			/>
		</div>
	)
}

/* ─── Inner Component (reads provider state) ─── */

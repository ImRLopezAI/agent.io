'use client'

import { useChat } from '@tanstack/ai-react'
import React from 'react'
import { toast } from 'sonner'

import {
	type PromptInputMessage,
	usePromptInputController,
} from '../ai-elements/prompt-input'
import {
	type AiUiInitialState,
	type ModelId,
	useAiUiStore,
} from './ai-ui-store'

interface AIChatInterfaceProps extends React.PropsWithChildren {
	/**
	 * Forwarded to `useChat`. `UseChatOptions` accepts either a `ChatInit`
	 * (`{ id, transport, … }`) **or** a shared `Chat` instance
	 * (`{ chat: chatInstance }`) — the spread below preserves both shapes,
	 * so callers can pass `{ chat: new Chat({ id }) }` to share state with
	 * another `useChat` consumer (e.g. the active-voice overlay) without
	 * disturbing existing call sites.
	 * See https://ai-sdk.dev/cookbook/next/use-shared-chat-context.
	 */
	chat: Parameters<typeof useChat>[0]
	initialState?: AiUiInitialState
	suggestions?: {
		suggestion: string
		onClick?: (
			suggestion: string,
			state: {
				model: ModelId
				webSearch: boolean
				artifact: boolean
				modelSelectorOpen: boolean
			},
		) => void
		icon?: React.ReactNode
	}[]
	extraActions?: React.ReactNode
	download?: 'pdf' | 'docx'
}

export function useAi({
	children,
	suggestions,
	chat,
	initialState,
	extraActions,
	download = 'pdf',
}: AIChatInterfaceProps) {
	const { attachments, textInput: input } = usePromptInputController()
	const { state: ui, dispatch } = useAiUiStore(initialState)
	const { model, webSearch, artifact, modelSelectorOpen, models } = ui

	// Per-request body (model / webSearch) flows through the `body` option;
	// `@tanstack/ai-react` re-reads it when it changes, so each send carries the
	// current selection. TanStack auto-resumes the agent loop after
	// `addToolApprovalResponse`, so no `sendAutomaticallyWhen` equivalent is
	// needed.
	const body = React.useMemo(() => ({ model, webSearch }), [model, webSearch])
	const { sendMessage, isLoading, ...ai } = useChat({ ...chat, body })

	const reset = React.useCallback(() => {
		dispatch({ type: 'reset' })
	}, [dispatch])

	const handleSubmit = React.useCallback(
		async (message: PromptInputMessage) => {
			const hasText = Boolean(message.text)
			const hasAttachments = Boolean(message.files?.length)

			if (!(hasText || hasAttachments)) {
				toast.error('Please enter a message or attach files before sending.')
				return
			}

			if (isLoading) {
				toast.error('Wait for the current response to finish.')
				return
			}

			// Text path migrated. Attachment file -> ContentPart mapping is a
			// follow-up (needs the upload/source format); body (model/webSearch)
			// rides the useChat `body` option.
			await sendMessage(message.text || 'Sent with attachments')
			input.clear()
			reset()
		},
		[sendMessage, reset, isLoading, input],
	)

	const changeModel = React.useCallback(
		(next: ModelId) => dispatch({ type: 'setModel', model: next }),
		[dispatch],
	)
	const toggleWebSearch = React.useCallback(
		() => dispatch({ type: 'toggleWebSearch' }),
		[dispatch],
	)
	const toggleArtifact = React.useCallback(
		() => dispatch({ type: 'toggleArtifact' }),
		[dispatch],
	)
	const setArtifact = React.useCallback(
		(next: boolean) => dispatch({ type: 'setArtifact', artifact: next }),
		[dispatch],
	)
	const setModelSelectorOpen = React.useCallback(
		(next: boolean) => dispatch({ type: 'setModelSelectorOpen', open: next }),
		[dispatch],
	)

	return {
		input,
		isLoading,
		model,
		webSearch,
		artifact,
		modelSelectorOpen,
		models,
		attachments,
		handleSubmit,
		changeModel,
		toggleWebSearch,
		toggleArtifact,
		setArtifact,
		setModelSelectorOpen,
		reset,
		children,
		suggestions,
		extraActions,
		download,
		...ai,
	}
}

export type { AiUiInitialState, AiUiState, ModelId } from './ai-ui-store'

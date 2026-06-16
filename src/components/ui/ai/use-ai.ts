'use client'

import { useChat } from '@ai-sdk/react'
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
	 * Forwarded to `@ai-sdk/react` `useChat` — `{ transport, id, … }`. Callers
	 * pass a `DefaultChatTransport` (see `useAgent` and `Ai`).
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

	const { sendMessage, status, regenerate, ...ai } = useChat(chat)
	// v7 exposes `status`; derive the boolean the UI consumes.
	const isLoading = status === 'submitted' || status === 'streaming'

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

			const text = message.text?.trim() ? message.text : 'Sent with attachments'

			// Clear immediately so the user can draft the next message while the
			// assistant streams. sendMessage resolves only after the full turn.
			input.clear()
			attachments.clear()
			reset()

			try {
				// Per-request model / webSearch ride the send `body` (v7).
				await sendMessage({ text }, { body: { model, webSearch } })
			} catch (error) {
				if (message.text?.trim()) {
					input.setInput(message.text)
				}
				toast.error(
					error instanceof Error ? error.message : 'Failed to send message',
				)
			}
		},
		[sendMessage, reset, isLoading, input, attachments, model, webSearch],
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
		status,
		regenerate,
		// v7 renamed `reload` -> `regenerate`; keep `reload` for existing consumers
		// (ChatConversation, drawer, sheet, messages).
		reload: async () => {
			await regenerate()
		},
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

'use client'

import { useChat } from '@ai-sdk/react'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { type Atom, atom, useAtom, useAtomValue } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import React from 'react'
import { toast } from 'sonner'
import {
	type PromptInputMessage,
	usePromptInputController,
} from '../ai-elements/prompt-input'
import { MODELS } from './models'

type ModelId = (typeof MODELS)[number]['id']

type ModelInfo = {
	readonly id: string
	readonly name: string
	readonly chef: string
	readonly cost: string
	readonly chefSlug: string
	providers: ReadonlyArray<string>
}

/* ─── Atoms ─── */

const modelAtom = atom<ModelId>(MODELS[2].id)
const webSearchAtom = atom<boolean>(false)
const modelSelectorOpenAtom = atom<boolean>(false)
const artifactAtom = atom<boolean>(false)
const modelsAtom = atom<ReadonlyArray<ModelInfo>>(MODELS)

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
	initialState?: Partial<{
		model: ModelId
		webSearch: boolean
		modelSelectorOpen: boolean
		artifact: boolean
		models: ReadonlyArray<ModelInfo>
	}>
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

	// Hydrate atoms synchronously BEFORE reading them so SSR and the client's
	// first render see the same values. Without this, the module-global default
	// store on the server can hold a value left over from a prior render that
	// differs from the client bundle's fresh atom defaults — producing a
	// hydration mismatch on the model name (and any other seeded atom).
	// useHydrateAtoms is a no-op on subsequent renders, so the memoized empty
	// dependency list is intentional.
	const hydrationMap = React.useMemo(() => {
		const map = new Map<Atom<unknown>, unknown>()
		if (initialState?.model !== undefined)
			map.set(modelAtom, initialState.model)
		if (initialState?.webSearch !== undefined)
			map.set(webSearchAtom, initialState.webSearch)
		if (initialState?.modelSelectorOpen !== undefined)
			map.set(modelSelectorOpenAtom, initialState.modelSelectorOpen)
		if (initialState?.artifact !== undefined)
			map.set(artifactAtom, initialState.artifact)
		if (initialState?.models !== undefined)
			map.set(modelsAtom, initialState.models)
		return map
	}, [])
	useHydrateAtoms(hydrationMap as never)

	const [model, setModelAtom] = useAtom(modelAtom)
	const [webSearch, setWebSearchAtom] = useAtom(webSearchAtom)
	const [modelSelectorOpen, setModelSelectorOpenAtom] = useAtom(
		modelSelectorOpenAtom,
	)
	const [artifact, setArtifactAtom] = useAtom(artifactAtom)
	const models = useAtomValue(modelsAtom)

	// `sendAutomaticallyWhen` resumes the agent loop once the user has
	// responded to a tool-approval-request (Approve / Deny). Without it the
	// AI SDK collects the response but never POSTs again, so the tool never
	// runs. See https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#tool-execution-approval.
	const { sendMessage, ...ai } = useChat({
		...chat,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
	})

	const reset = React.useCallback(() => {
		// Artifact is a layout preference and stays open across sends.
		setWebSearchAtom(false)
		setModelSelectorOpenAtom(false)
	}, [setWebSearchAtom, setModelSelectorOpenAtom])

	const handleSubmit = React.useCallback(
		(message: PromptInputMessage) => {
			const hasText = Boolean(message.text)
			const hasAttachments = Boolean(message.files?.length)

			if (!(hasText || hasAttachments)) {
				toast.error('Please enter a message or attach files before sending.')
				return
			}

			sendMessage(
				{
					text: message.text || 'Sent with attachments',
					files: message.files,
				},
				{
					body: {
						model,
						webSearch,
					},
				},
			)
			reset()
		},
		[sendMessage, model, webSearch, reset],
	)

	const changeModel = React.useCallback(
		(next: ModelId) => setModelAtom(next),
		[setModelAtom],
	)
	const toggleWebSearch = React.useCallback(
		() => setWebSearchAtom((prev) => !prev),
		[setWebSearchAtom],
	)
	const toggleArtifact = React.useCallback(
		() => setArtifactAtom((prev) => !prev),
		[setArtifactAtom],
	)
	const setArtifact = React.useCallback(
		(next: boolean) => setArtifactAtom(next),
		[setArtifactAtom],
	)
	const setModelSelectorOpen = React.useCallback(
		(next: boolean) => setModelSelectorOpenAtom(next),
		[setModelSelectorOpenAtom],
	)

	return {
		input,
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

export { artifactAtom, modelAtom, modelSelectorOpenAtom, webSearchAtom }

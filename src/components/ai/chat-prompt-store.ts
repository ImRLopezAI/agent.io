'use client'

import React, { useSyncExternalStore } from 'react'

export type ChatPromptState = {
	maxMode: boolean
	isMultiline: boolean
	hasEditorContent: boolean
}

export type ChatPromptAction =
	| { type: 'toggleMaxMode' }
	| { type: 'setMaxMode'; value: boolean }
	| { type: 'setMultiline'; value: boolean }
	| { type: 'setHasEditorContent'; value: boolean }
	| { type: 'resetInputLayout' }

export function createDefaultChatPromptState(): ChatPromptState {
	return {
		maxMode: false,
		isMultiline: false,
		hasEditorContent: false,
	}
}

export function chatPromptReducer(
	state: ChatPromptState,
	action: ChatPromptAction,
): ChatPromptState {
	switch (action.type) {
		case 'toggleMaxMode':
			return { ...state, maxMode: !state.maxMode }
		case 'setMaxMode':
			return { ...state, maxMode: action.value }
		case 'setMultiline':
			return { ...state, isMultiline: action.value }
		case 'setHasEditorContent':
			return { ...state, hasEditorContent: action.value }
		case 'resetInputLayout':
			return { ...state, isMultiline: false, hasEditorContent: false }
		default:
			return state
	}
}

export function createChatPromptStore() {
	const serverSnapshot = createDefaultChatPromptState()
	let snapshot = serverSnapshot
	const listeners = new Set<() => void>()

	function emit() {
		for (const listener of listeners) {
			listener()
		}
	}

	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getSnapshot() {
			return snapshot
		},
		getServerSnapshot() {
			return serverSnapshot
		},
		dispatch(action: ChatPromptAction) {
			const next = chatPromptReducer(snapshot, action)
			if (next !== snapshot) {
				snapshot = next
				emit()
			}
		},
	}
}

export type ChatPromptStore = ReturnType<typeof createChatPromptStore>

export function useChatPromptStore() {
	const storeRef = React.useRef<ChatPromptStore | null>(null)
	storeRef.current ??= createChatPromptStore()
	const store = storeRef.current

	const state = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getServerSnapshot,
	)

	return { state, dispatch: store.dispatch }
}

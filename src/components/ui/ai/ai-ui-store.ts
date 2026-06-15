'use client'

import React, { useSyncExternalStore } from 'react'

import { MODELS } from './models'

export type ModelId = (typeof MODELS)[number]['id']

export type ModelInfo = {
	readonly id: string
	readonly name: string
	readonly chef: string
	readonly cost: string
	readonly chefSlug: string
	providers: ReadonlyArray<string>
}

export type AiUiState = {
	model: ModelId
	webSearch: boolean
	modelSelectorOpen: boolean
	artifact: boolean
	models: ReadonlyArray<ModelInfo>
}

export type AiUiInitialState = Partial<AiUiState>

export type AiUiAction =
	| { type: 'setModel'; model: ModelId }
	| { type: 'toggleWebSearch' }
	| { type: 'toggleArtifact' }
	| { type: 'setArtifact'; artifact: boolean }
	| { type: 'setModelSelectorOpen'; open: boolean }
	| { type: 'reset' }

export function createDefaultAiUiState(
	overrides?: AiUiInitialState,
): AiUiState {
	return {
		model: overrides?.model ?? MODELS[2].id,
		webSearch: overrides?.webSearch ?? false,
		modelSelectorOpen: overrides?.modelSelectorOpen ?? false,
		artifact: overrides?.artifact ?? false,
		models: overrides?.models ?? MODELS,
	}
}

export function aiUiReducer(state: AiUiState, action: AiUiAction): AiUiState {
	switch (action.type) {
		case 'setModel':
			return { ...state, model: action.model }
		case 'toggleWebSearch':
			return { ...state, webSearch: !state.webSearch }
		case 'toggleArtifact':
			return { ...state, artifact: !state.artifact }
		case 'setArtifact':
			return { ...state, artifact: action.artifact }
		case 'setModelSelectorOpen':
			return { ...state, modelSelectorOpen: action.open }
		case 'reset':
			// Artifact is a layout preference and stays open across sends.
			return { ...state, webSearch: false, modelSelectorOpen: false }
		default:
			return state
	}
}

export function createAiUiStore(initialState?: AiUiInitialState) {
	const serverSnapshot = createDefaultAiUiState(initialState)
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
		dispatch(action: AiUiAction) {
			const next = aiUiReducer(snapshot, action)
			if (next !== snapshot) {
				snapshot = next
				emit()
			}
		},
	}
}

export type AiUiStore = ReturnType<typeof createAiUiStore>

export function useAiUiStore(initialState?: AiUiInitialState) {
	const storeRef = React.useRef<AiUiStore | null>(null)
	storeRef.current ??= createAiUiStore(initialState)
	const store = storeRef.current

	const state = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getServerSnapshot,
	)

	return { state, dispatch: store.dispatch }
}

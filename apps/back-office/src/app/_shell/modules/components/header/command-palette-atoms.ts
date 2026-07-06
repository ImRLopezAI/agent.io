'use client'

import {
	atom,
	type Getter,
	type PrimitiveAtom,
	type SetStateAction,
	type Setter,
	useAtom,
	useSetAtom,
} from 'jotai'
import { atomWithReducer } from 'jotai/utils'
import { useCallback, useEffect } from 'react'

type CommandPaletteUiState = {
	query: string
	active: number
}

export type CommandPaletteUiAction =
	| { type: 'query/set'; query: string }
	| { type: 'active/set'; active: number }
	| { type: 'active/next'; max: number }
	| { type: 'active/prev' }
	| { type: 'reset' }

const initialCommandPaletteUiState: CommandPaletteUiState = {
	query: '',
	active: 0,
}

function commandPaletteUiReducer(
	state: CommandPaletteUiState,
	action: CommandPaletteUiAction,
): CommandPaletteUiState {
	switch (action.type) {
		case 'query/set':
			return { query: action.query, active: 0 }
		case 'active/set':
			return { ...state, active: action.active }
		case 'active/next':
			return {
				...state,
				active: Math.min(action.max, state.active + 1),
			}
		case 'active/prev':
			return { ...state, active: Math.max(0, state.active - 1) }
		case 'reset':
			return initialCommandPaletteUiState
		default:
			return state
	}
}

export const commandPaletteUiAtom = atomWithReducer(
	initialCommandPaletteUiState,
	commandPaletteUiReducer,
)

type OpenListenerCallback = (
	get: Getter,
	set: Setter,
	newOpen: boolean,
	prevOpen: boolean,
) => void

function atomWithOpenListeners(initialOpen: boolean) {
	const baseAtom = atom(initialOpen)
	const listenersAtom = atom<OpenListenerCallback[]>([])

	const openAtom = atom(
		(get) => get(baseAtom),
		(get, set, arg: SetStateAction<boolean>) => {
			const prevOpen = get(baseAtom)
			set(baseAtom, arg)
			const newOpen = get(baseAtom)

			if (prevOpen === newOpen) return

			for (const callback of get(listenersAtom)) {
				callback(get, set, newOpen, prevOpen)
			}
		},
	)

	const useOpenListener = (callback: OpenListenerCallback) => {
		const setListeners = useSetAtom(listenersAtom)

		useEffect(() => {
			setListeners((prev) => [...prev, callback])
			return () =>
				setListeners((prev) => {
					const index = prev.indexOf(callback)
					if (index === -1) return prev
					return [...prev.slice(0, index), ...prev.slice(index + 1)]
				})
		}, [setListeners, callback])
	}

	return [openAtom, useOpenListener] as const
}

export const [commandPaletteOpenAtom, useCommandPaletteOpenListener] =
	atomWithOpenListeners(false)

/** Applies a reducer to a primitive atom — useful outside atomWithReducer. */
export function useReducerAtom<Value, Action>(
	anAtom: PrimitiveAtom<Value>,
	reducer: (value: Value, action: Action) => Value,
) {
	const [state, setState] = useAtom(anAtom)
	const dispatch = useCallback(
		(action: Action) => setState((prev) => reducer(prev, action)),
		[setState, reducer],
	)

	return [state, dispatch] as const
}

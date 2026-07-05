'use client'

import type { Atom } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { createContext, type ReactNode, useContext, useMemo } from 'react'

import { type ToolbarMode, toolbarModeAtomFamily } from './editor-atoms'

type EditorContextValue = {
	instanceId: string
	toolbarMode: ToolbarMode
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({
	children,
	instanceId,
	toolbarMode = 'always',
}: {
	children: ReactNode
	instanceId: string
	toolbarMode?: ToolbarMode
}) {
	const hydrationMap = useMemo(() => {
		const map = new Map<Atom<unknown>, unknown>()
		map.set(toolbarModeAtomFamily(instanceId), toolbarMode)
		return map
	}, [instanceId, toolbarMode])

	useHydrateAtoms(hydrationMap as never)

	const value = useMemo(
		() => ({ instanceId, toolbarMode }),
		[instanceId, toolbarMode],
	)

	return (
		<EditorContext.Provider value={value}>{children}</EditorContext.Provider>
	)
}

export function useEditorChrome() {
	const context = useContext(EditorContext)
	if (!context) {
		return {
			instanceId: 'editor-fallback',
			toolbarMode: 'always' as const,
		}
	}
	return context
}

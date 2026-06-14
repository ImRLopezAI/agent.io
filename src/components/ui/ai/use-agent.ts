import type { FetchConnectionOptions } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import type React from 'react'
import { useMemo, useRef } from 'react'
import { useAi } from './use-ai'

interface UseAgentProps extends Omit<Parameters<typeof useAi>[0], 'chat'> {
	/**
	 * Per-request fetch options (headers/body) passed to
	 * `fetchServerSentEvents('/api/agent', …)`, or a function that derives them
	 * from the context ref.
	 */
	transport?:
		| FetchConnectionOptions
		| ((
				contextRef: React.MutableRefObject<any | null>,
		  ) => FetchConnectionOptions)
}

export function useAgent({ transport, ...rest }: UseAgentProps) {
	const contextRef = useRef<any | null>(null)

	const resolvedOptions = useMemo(() => {
		return typeof transport === 'function' ? transport(contextRef) : transport
	}, [transport, contextRef])

	const connection = useMemo(
		() => fetchServerSentEvents('/api/agents', resolvedOptions),
		[resolvedOptions],
	)

	const handler = useAi({
		chat: { connection },
		...rest,
	})
	const handlerRef = useRef(handler)
	handlerRef.current = handler

	return { handler, handlerRef, contextRef }
}

import { DefaultChatTransport } from 'ai'
import type React from 'react'
import { useMemo, useRef } from 'react'
import { useAi } from './use-ai'

interface UseAgentProps extends Omit<Parameters<typeof useAi>[0], 'chat'> {
	transport:
		| ConstructorParameters<typeof DefaultChatTransport>[0]
		| ((
				contextRef: React.MutableRefObject<any | null>,
		  ) => ConstructorParameters<typeof DefaultChatTransport>[0])
}

export function useAgent({ transport, ...rest }: UseAgentProps) {
	const contextRef = useRef<any | null>(null)

	const resolvedTransport = useMemo(() => {
		return typeof transport === 'function' ? transport(contextRef) : transport
	}, [transport, contextRef])

	const chatTransport = useMemo(
		() =>
			new DefaultChatTransport({
				api: `/api/agent`,
				...resolvedTransport,
			}),
		[resolvedTransport],
	)

	const handler = useAi({
		chat: {
			transport: chatTransport,
		},
		...rest,
	})
	const handlerRef = useRef(handler)
	handlerRef.current = handler

	return { handler, handlerRef, contextRef }
}

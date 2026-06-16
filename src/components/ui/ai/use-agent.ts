import { DefaultChatTransport } from 'ai'
import { useMemo, useRef } from 'react'

import { useAi } from './use-ai'

const AGENTS_URL = `${import.meta.env.VITE_CONVEX_SITE_URL}/api/agents`
if (!AGENTS_URL) {
	throw new Error('VITE_CONVEX_SITE_URL is not defined')
}

interface UseAgentProps extends Omit<Parameters<typeof useAi>[0], 'chat'> {
	/**
	 * Extra `DefaultChatTransport` options (e.g. `headers`, `body`,
	 * `prepareSendMessagesRequest`) merged onto the `/api/agents` endpoint.
	 */
	transport?: Omit<ConstructorParameters<typeof DefaultChatTransport>[0], 'api'>
}

export function useAgent({ transport, ...rest }: UseAgentProps) {
	const contextRef = useRef<unknown | null>(null)

	const chatTransport = useMemo(
		() => new DefaultChatTransport({ api: AGENTS_URL, ...transport }),
		[transport],
	)

	const handler = useAi({
		chat: { transport: chatTransport },
		...rest,
	})
	const handlerRef = useRef(handler)
	handlerRef.current = handler

	return { handler, handlerRef, contextRef }
}

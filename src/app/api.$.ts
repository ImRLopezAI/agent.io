import { handler } from '@server/index'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/$')({
	server: {
		handlers: {
			ANY: async ({ request }) => handler(request),
		},
	},
})

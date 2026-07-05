import { createFileRoute } from '@tanstack/react-router'
import { signOut } from '@workos/authkit-tanstack-react-start'

export const Route = createFileRoute('/auth/logout')({
	preload: false,
	loader: async () => {
		await signOut()
	},
})

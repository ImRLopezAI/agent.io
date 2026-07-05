import { alreadyAuthenticatedMiddleware } from '@server/auth/middlewares'
import { createFileRoute, Outlet } from '@tanstack/react-router'
export const Route = createFileRoute('/auth')({
	component: Outlet,
	server: {
		middleware: [alreadyAuthenticatedMiddleware],
	},
})

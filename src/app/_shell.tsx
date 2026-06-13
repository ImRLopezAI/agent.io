import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { requireAuthMiddleware } from '#/server/auth/middlewares'

export const Route = createFileRoute('/_shell')({
	component: Outlet,
	server: {
		middleware: [requireAuthMiddleware],
	},
	beforeLoad: async ({ context }) => {
		const { auth } = context
		if (!auth.user) throw redirect({ to: '/auth/sign-in' })
		const { accessToken, user } = auth
		return {
			userId: user.id,
			token: accessToken,
			auth,
		}
	},
	head: (opts) => {
		const title = `${opts.match.fullPath.split('/').join(' ').toUpperCase() || 'Greenfield CRM'} - Greenfield CRM`
		return {
			meta: [
				{
					title,
					description: 'Greenfield CRM is an operator-first sales workspace for managing accounts, contacts, deals, conversations, email, tasks, calendars, reports, automation, and team workflows.',
				},
				{
					property: 'og:title',
					content: title,
				},
				{
					property: 'og:description',
					content: 'Greenfield CRM is an operator-first sales workspace for managing accounts, contacts, deals, conversations, email, tasks, calendars, reports, automation, and team workflows.',
				},
			],
		}
	}
})
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { requireAuthMiddleware } from '#/server/auth/middlewares'
import { createHead } from './_shell/modules/utils/metadata'

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
	head: createHead({
		title: {
			template: '%s - Agent.io',
			default: 'Agent.io',
		},
		description: 'Agent.io is a platform for building and managing AI agents for your business this agent could be used to automate tasks, customer service, and managing your business.',
		authors: [
			{
				name: 'AI Robotix ',
				url: 'https://airobotix.net',
			},
			{
				name: 'Angel Lopez',
				url: 'https://imrlopez.dev',
			}
		],
		robots: 'index, follow',
	}),
})
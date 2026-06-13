import { env } from '@lib/env'
import { resend } from '@lib/resend'
import type { ReactElement } from 'react'

interface SendArgs {
	to: string
	subject: string
	react: ReactElement
}

/**
 * Generic Resend wrapper. WorkOS AuthKit owns verification, password reset,
 * email change, and account-deletion mail. Use this only for app-owned
 * transactional emails (org invites, notifications, etc.).
 */
export async function send({ to, subject, react }: SendArgs) {
	const { data, error } = await resend.emails.send({
		from: env.EMAIL_FROM,
		to: [to],
		subject,
		react,
	})
	if (error) {
		throw new Error(error.message ?? `Failed to send: ${subject}`)
	}
	return { id: data?.id }
}

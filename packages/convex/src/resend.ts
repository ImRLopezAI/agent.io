import { Resend, type ResendOptions } from '@convex-dev/resend'
import { components, internal } from '@convex/api'

export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	onEmailEvent: internal.api.internals.email.handleEmailEvent as NonNullable<
		ResendOptions['onEmailEvent']
	>,
})

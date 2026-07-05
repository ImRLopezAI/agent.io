import { Resend, vOnEmailEventArgs } from '@convex-dev/resend'

import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'
export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	onEmailEvent: internal.resend.handleEmailEvent,
})

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (_ctx, args) => {
		console.log('handleEmailEvent', args)
	},
})

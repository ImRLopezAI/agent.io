import { Resend, vOnEmailEventArgs } from '@convex-dev/resend'
import { components } from './_generated/api'
import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	onEmailEvent: internal.resend.handleEmailEvent,
})

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (ctx, args) => {
		console.log('handleEmailEvent', args)
	},
})

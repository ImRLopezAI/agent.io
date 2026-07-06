import { vOnEmailEventArgs } from '@convex-dev/resend'
import { internalMutation } from '@convex/server'

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (_ctx, args) => {
		console.log('handleEmailEvent', args)
	},
})

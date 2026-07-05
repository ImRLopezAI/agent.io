import { Resend, vOnEmailEventArgs } from '@convex-dev/resend'

import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'
// EmailId branded-type drift between @convex-dev/resend and the generated
// component api (surfaced by codegen refresh) — runtime shape is identical.
export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	onEmailEvent: internal.resend.handleEmailEvent as never,
})

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (_ctx, args) => {
		console.log('handleEmailEvent', args)
	},
})

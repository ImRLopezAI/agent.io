import { Resend, vOnEmailEventArgs } from '@convex-dev/resend'
import { components, internal } from '@convex/api'
import { internalMutation } from '@convex/server'
// EmailId branded-type drift between @convex-dev/resend and the generated
// component api (surfaced by codegen refresh) — runtime shape is identical.

export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	handler: async (_ctx, args) => {
		console.log('handleEmailEvent', args)
	},
})

export const resend: Resend = new Resend(components.resend, {
	testMode: false,
	// EmailId branded-type drift vs generated component api — same runtime shape
	onEmailEvent: internal.resend.handleEmailEvent as never,
})

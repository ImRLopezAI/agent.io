import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { authKit } from './auth'
import { resend } from './resend'

const http = httpRouter()
authKit.registerRoutes(http)

http.route({
	path: '/resend/events',
	method: 'POST',
	handler: httpAction(async (ctx, req) => {
		return await resend.handleResendEventWebhook(ctx, req)
	}),
})

export default http
